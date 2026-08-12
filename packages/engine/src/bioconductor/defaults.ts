import path from 'node:path';

import { metricsError, metricsInfo } from '../metrics/index.ts';
import type { ConfigService } from '../config/index.ts';
import {
	isCompleteBioconductorResourceCache,
	readBioconductorResourceMetadata,
	materializeBioconductorPackage
} from './materialize.ts';
import { loadCatalog, type BioconductorCatalog, type BioconductorPackage } from './catalog.ts';
import { resourceNameToKey } from '../resources/helpers.ts';
import { DEFAULT_BIOCONDUCTOR_PACKAGE_COUNT, DEFAULT_BIOCONDUCTOR_PACKAGE_NAMES } from './default-package-list.ts';
import { discoverLegacyBioconductorPackageNames } from './migration.ts';
import { readRemovedBioconductorPackageNames } from './removal.ts';

export const DEFAULT_BIOCONDUCTOR_BOOTSTRAP_CONCURRENCY = 2;

export type DefaultBioconductorBootstrapState = 'idle' | 'running' | 'complete' | 'partial';

export type DefaultBioconductorBootstrapStatus = {
	readonly state: DefaultBioconductorBootstrapState;
	readonly total: number;
	readonly ready: number;
	readonly failed: readonly string[];
};

type DefaultBioconductorConfig = Pick<ConfigService, 'resourcesDirectory' | 'dataDirectory'>;

export type DefaultBioconductorBootstrapDependencies = {
	readonly packageReady?: (packageName: string, release: string) => Promise<boolean>;
	readonly installPackage?: (pkg: BioconductorPackage, release: string) => Promise<void>;
	readonly loadPackageCatalog?: () => Promise<BioconductorCatalog>;
	readonly loadRemovedPackageNames?: () => Promise<readonly string[]>;
	readonly loadLegacyPackageNames?: () => Promise<readonly string[]>;
	readonly concurrency?: number;
};

const statuses = new Map<string, DefaultBioconductorBootstrapStatus>();
const inFlight = new Map<string, Promise<DefaultBioconductorBootstrapStatus>>();

const statusKey = (config: DefaultBioconductorConfig) => path.resolve(config.resourcesDirectory);

const idleStatus = (): DefaultBioconductorBootstrapStatus => ({
	state: 'idle',
	total: DEFAULT_BIOCONDUCTOR_PACKAGE_COUNT,
	ready: 0,
	failed: []
});

export const getDefaultBioconductorBootstrapStatus = (
	config: DefaultBioconductorConfig
): DefaultBioconductorBootstrapStatus => statuses.get(statusKey(config)) ?? idleStatus();

const updateStatus = (
	config: DefaultBioconductorConfig,
	update: Partial<DefaultBioconductorBootstrapStatus>
): DefaultBioconductorBootstrapStatus => {
	const next = { ...getDefaultBioconductorBootstrapStatus(config), ...update };
	statuses.set(statusKey(config), next);
	return next;
};

const defaultPackageReady = async (
	config: DefaultBioconductorConfig,
	packageName: string,
	release: string
) => {
	const directory = path.join(config.resourcesDirectory, resourceNameToKey(packageName));
	const metadata = await readBioconductorResourceMetadata(directory);
	return metadata
		? metadata.bioconductor.release === release &&
				(await isCompleteBioconductorResourceCache(directory, metadata))
		: false;
};

const installPackageFromCatalog = async (
	config: DefaultBioconductorConfig,
	pkg: BioconductorPackage,
	release: string
): Promise<void> => {
	const directory = path.join(config.resourcesDirectory, resourceNameToKey(pkg.name));
	await materializeBioconductorPackage({
		pkg,
		release,
		directory,
		resourcesDirectory: config.resourcesDirectory,
		quiet: true
	});
};

const loadDefaultCatalog = async (config: DefaultBioconductorConfig): Promise<BioconductorCatalog> =>
	loadCatalog({ dataDirectory: config.dataDirectory, release: 'release' });

/**
 * Install missing defaults and upgrade recognized legacy managed resources
 * with bounded concurrency. Failures are isolated per package.
 */
export const runDefaultBioconductorBootstrap = async (
	config: DefaultBioconductorConfig,
	dependencies: DefaultBioconductorBootstrapDependencies = {}
): Promise<DefaultBioconductorBootstrapStatus> => {
	const removedPackageNames = dependencies.loadRemovedPackageNames
		? await dependencies.loadRemovedPackageNames()
		: await readRemovedBioconductorPackageNames(config.dataDirectory);
	const removedKeys = new Set(removedPackageNames.map((name) => name.trim().toLowerCase()));
	const legacyPackageNames = dependencies.loadLegacyPackageNames
		? await dependencies.loadLegacyPackageNames()
		: await discoverLegacyBioconductorPackageNames(config.resourcesDirectory);
	const packageNames = [...DEFAULT_BIOCONDUCTOR_PACKAGE_NAMES, ...legacyPackageNames]
		.filter(
			(packageName, index, all) =>
				all.findIndex((candidate) => candidate.toLowerCase() === packageName.toLowerCase()) ===
				index
		)
		.filter((packageName) => !removedKeys.has(packageName.toLowerCase()));
	const total = packageNames.length;
	const catalog = dependencies.loadPackageCatalog
		? await dependencies.loadPackageCatalog()
		: await loadDefaultCatalog(config);
	const release = catalog.release;
	const packageReady =
		dependencies.packageReady ??
		((name, numberedRelease) => defaultPackageReady(config, name, numberedRelease));
	const failed: string[] = [];
	const readyFlags = await Promise.all(
		packageNames.map((packageName) => packageReady(packageName, release))
	);
	let ready = readyFlags.filter(Boolean).length;
	updateStatus(config, { state: 'running', total, ready, failed });
	if (ready === total) {
		return {
			state: 'complete',
			total,
			ready,
			failed
		};
	}

	const catalogByName = new Map(catalog.packages.map((pkg) => [pkg.name.toLowerCase(), pkg]));
	const installPackage =
		dependencies.installPackage ??
		((pkg: BioconductorPackage, numberedRelease: string) =>
			installPackageFromCatalog(config, pkg, numberedRelease));
	let cursor = 0;
	const concurrency = Math.max(
		1,
		Math.min(dependencies.concurrency ?? DEFAULT_BIOCONDUCTOR_BOOTSTRAP_CONCURRENCY, Math.max(1, total))
	);

	const worker = async () => {
		while (true) {
			const index = cursor++;
			const packageName = packageNames[index];
			if (!packageName) return;
			if (readyFlags[index]) continue;
			try {
				if (await packageReady(packageName, release)) {
					ready += 1;
					updateStatus(config, { ready, failed: [...failed] });
					continue;
				}
				const pkg = catalogByName.get(packageName.toLowerCase());
				if (!pkg)
					throw new Error(`Package ${packageName} was not found in the Bioconductor catalog.`);
				await installPackage(pkg, release);
				if (!(await packageReady(packageName, release))) {
					throw new Error(`Package ${packageName} did not produce a complete local cache.`);
				}
				ready += 1;
				updateStatus(config, { ready, failed: [...failed] });
			} catch (cause) {
				failed.push(packageName);
				updateStatus(config, { ready, failed: [...failed] });
				metricsError(`Bioconductor package bootstrap failed for ${packageName}`, {
					error: cause instanceof Error ? cause.message : String(cause)
				});
			}
		}
	};

	await Promise.all(Array.from({ length: concurrency }, () => worker()));
	return {
		state: failed.length === 0 ? 'complete' : 'partial',
		total,
		ready,
		failed: [...failed].sort((left, right) => left.localeCompare(right))
	};
};

/** Start default installation and any one-time legacy-cache upgrades in the background. */
export const startDefaultBioconductorBootstrap = (config: DefaultBioconductorConfig): void => {
	const key = statusKey(config);
	if (inFlight.has(key)) return;

	updateStatus(config, {
		state: 'running',
		total: DEFAULT_BIOCONDUCTOR_PACKAGE_COUNT,
		ready: 0,
		failed: []
	});
	metricsInfo('bioconductor.defaults.start', {
		packages: DEFAULT_BIOCONDUCTOR_PACKAGE_NAMES,
		concurrency: DEFAULT_BIOCONDUCTOR_BOOTSTRAP_CONCURRENCY
	});

	const task = runDefaultBioconductorBootstrap(config)
		.then((status) => {
			statuses.set(key, status);
			metricsInfo('bioconductor.defaults.done', status);
			return status;
		})
		.catch((cause) => {
			const status: DefaultBioconductorBootstrapStatus = {
				state: 'partial',
				total: DEFAULT_BIOCONDUCTOR_PACKAGE_COUNT,
				ready: 0,
				failed: [...DEFAULT_BIOCONDUCTOR_PACKAGE_NAMES]
			};
			statuses.set(key, status);
			metricsError('bioconductor.defaults.failed', {
				error: cause instanceof Error ? cause.message : String(cause)
			});
			return status;
		});

	inFlight.set(key, task);
	void task.finally(() => {
		if (inFlight.get(key) === task) inFlight.delete(key);
	});
};
