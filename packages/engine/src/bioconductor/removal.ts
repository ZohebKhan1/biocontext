import { promises as fs } from 'node:fs';
import type { Dirent } from 'node:fs';
import path from 'node:path';

import { z } from 'zod';

import { metricsError, metricsInfo } from '../metrics/index.ts';
import { ResourceError, resourceNameToKey } from '../resources/helpers.ts';
import { readCranResourceMetadataFile, type CranResourceMetadata } from '../cran/metadata.ts';
import {
	formatBioconductorMetadataIssues,
	readBioconductorResourceMetadataFile,
	type BioconductorResourceMetadata
} from './metadata.ts';
import { withBioconductorPackageMutation } from './package-mutation.ts';

const PACKAGE_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9.]*$/u;
const REMOVAL_STATE_VERSION = 1;
export const REMOVED_BIOCONDUCTOR_PACKAGES_FILE = 'removed-packages.json';

const RemovalStateSchema = z.object({
	version: z.literal(REMOVAL_STATE_VERSION),
	packages: z.array(z.string().regex(PACKAGE_NAME_PATTERN))
});

type RemovalState = z.infer<typeof RemovalStateSchema>;

export type BioconductorConfigRemovalReceipt = {
	readonly removedNames: readonly string[];
};

export type RemoveInstalledBioconductorPackageOptions<TReceipt extends BioconductorConfigRemovalReceipt> = {
	readonly package: string;
	readonly resourcesDirectory: string;
	readonly dataDirectory: string;
	readonly removeConfigResources: (packageName: string) => Promise<TReceipt>;
	readonly restoreConfigResources: (receipt: TReceipt) => Promise<void>;
};

export type BioconductorPackageRemovalResult = {
	readonly package: string;
	readonly removedConfigResources: readonly string[];
	readonly cleanupPending: boolean;
};

type ManagedPackageDirectory = {
	readonly directory: string;
	readonly kind: 'bioconductor' | 'cran';
	readonly metadata: BioconductorResourceMetadata | CranResourceMetadata;
};

type ManagedPackageMetadata =
	| { kind: 'bioconductor'; metadata: BioconductorResourceMetadata }
	| { kind: 'cran'; metadata: CranResourceMetadata }
	| {
			kind: 'ambiguous';
			bioconductor: BioconductorResourceMetadata;
			cran: CranResourceMetadata;
		};

const compareAscii = (left: string, right: string): number =>
	left === right ? 0 : left < right ? -1 : 1;

const comparePackageNames = (left: string, right: string): number => {
	const insensitive = compareAscii(normalizePackageKey(left), normalizePackageKey(right));
	return insensitive === 0 ? compareAscii(left, right) : insensitive;
};

const readManagedPackageMetadata = async (
	directory: string
): Promise<ManagedPackageMetadata | null> => {
	const [bioconductor, cran] = await Promise.all([
		readBioconductorResourceMetadataFile(directory),
		readCranResourceMetadataFile(directory)
	]);
	if (bioconductor.success && cran.success) {
		return { kind: 'ambiguous', bioconductor: bioconductor.data, cran: cran.data };
	}
	if (bioconductor.success) return { kind: 'bioconductor', metadata: bioconductor.data };
	return cran.success ? { kind: 'cran', metadata: cran.data } : null;
};

const removalStatePath = (dataDirectory: string): string =>
	path.join(dataDirectory, 'bioconductor', REMOVED_BIOCONDUCTOR_PACKAGES_FILE);

const normalizePackageKey = (packageName: string): string => packageName.trim().toLowerCase();

const assertPackageName = (packageName: string): string => {
	const trimmed = packageName.trim();
	if (!PACKAGE_NAME_PATTERN.test(trimmed)) {
		throw new ResourceError({
			message: `Invalid managed package name: "${packageName}"`,
			hint: 'Use /remove <Package> --yes with a package name such as DESeq2.'
		});
	}
	return trimmed;
};

const readRemovalState = async (dataDirectory: string): Promise<RemovalState> => {
	const file = removalStatePath(dataDirectory);
	let raw: string;
	try {
		raw = await fs.readFile(file, 'utf8');
	} catch (cause) {
		if ((cause as NodeJS.ErrnoException).code === 'ENOENT') {
			return { version: REMOVAL_STATE_VERSION, packages: [] };
		}
		throw new ResourceError({
			message: 'Could not read the Bioconductor package-removal state',
			hint: `Check permissions for "${file}". No package cache was changed.`,
			cause
		});
	}

	let value: unknown;
	try {
		value = JSON.parse(raw);
	} catch (cause) {
		throw new ResourceError({
			message: 'The Bioconductor package-removal state is malformed',
			hint: `Repair or remove "${file}" before installing or removing packages.`,
			cause
		});
	}
	const parsed = RemovalStateSchema.safeParse(value);
	if (!parsed.success) {
		throw new ResourceError({
			message: 'The Bioconductor package-removal state is invalid',
			hint: `Repair or remove "${file}" before installing or removing packages.`,
			cause: parsed.error
		});
	}
	return {
		version: REMOVAL_STATE_VERSION,
		packages: Array.from(
			new Map(parsed.data.packages.map((name) => [normalizePackageKey(name), name])).values()
		).sort(comparePackageNames)
	};
};

const writeRemovalState = async (dataDirectory: string, state: RemovalState): Promise<void> => {
	const file = removalStatePath(dataDirectory);
	const directory = path.dirname(file);
	const staging = `${file}.partial-${crypto.randomUUID()}`;
	try {
		await fs.mkdir(directory, { recursive: true });
		await fs.writeFile(staging, `${JSON.stringify(state, null, '\t')}\n`, 'utf8');
		await fs.rename(staging, file);
	} catch (cause) {
		throw new ResourceError({
			message: 'Could not update the Bioconductor package-removal state',
			hint: `Check permissions and free space for "${directory}".`,
			cause
		});
	} finally {
		await fs.rm(staging, { force: true }).catch(() => undefined);
	}
};

export const readRemovedBioconductorPackageNames = async (dataDirectory: string): Promise<string[]> =>
	(await readRemovalState(dataDirectory)).packages;

/** Persist or clear a package-removal marker. Returns whether the state changed. */
export const setBioconductorPackageRemoved = async (
	dataDirectory: string,
	packageName: string,
	removed: boolean
): Promise<boolean> =>
	withBioconductorPackageMutation(removalStatePath(dataDirectory), async () => {
		const canonical = assertPackageName(packageName);
		const state = await readRemovalState(dataDirectory);
		const target = normalizePackageKey(canonical);
		const alreadyRemoved = state.packages.some((name) => normalizePackageKey(name) === target);
		if (alreadyRemoved === removed) return false;
		const packages = removed
			? [...state.packages, canonical]
			: state.packages.filter((name) => normalizePackageKey(name) !== target);
		await writeRemovalState(dataDirectory, {
			version: REMOVAL_STATE_VERSION,
			packages: packages.sort(comparePackageNames)
		});
		return true;
	});

const isConfinedDirectory = async (root: string, candidate: string): Promise<boolean> => {
	try {
		const [rootRealPath, candidateRealPath, stats] = await Promise.all([
			fs.realpath(root),
			fs.realpath(candidate),
			fs.lstat(candidate)
		]);
		const relative = path.relative(rootRealPath, candidateRealPath);
		return (
			stats.isDirectory() &&
			!stats.isSymbolicLink() &&
			relative.length > 0 &&
			!relative.startsWith('..') &&
			!path.isAbsolute(relative)
		);
	} catch {
		return false;
	}
};

const findManagedPackageDirectory = async (
	resourcesDirectory: string,
	packageName: string
): Promise<ManagedPackageDirectory> => {
	const target = normalizePackageKey(assertPackageName(packageName));
	let entries: Dirent<string>[];
	try {
		entries = await fs.readdir(resourcesDirectory, { withFileTypes: true });
	} catch (cause) {
		throw new ResourceError({
			message: `No installed managed package matches "${packageName}"`,
			hint: 'Use /add to review packages that are installed locally.',
			cause
		});
	}

	const matches: ManagedPackageDirectory[] = [];
	for (const entry of entries.sort((left, right) => compareAscii(left.name, right.name))) {
		if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
		const directory = path.join(resourcesDirectory, entry.name);
		const parsed = await readManagedPackageMetadata(directory);
		if (!parsed) continue;
		if (parsed.kind === 'ambiguous') {
			if (
				[parsed.bioconductor.package, parsed.cran.package].some(
					(candidate) => normalizePackageKey(candidate) === target
				)
			) {
				throw new ResourceError({
					message: `Refusing to remove "${packageName}": its directory has both Bioconductor and CRAN metadata`,
					hint: `Inspect "${directory}" manually; no package data was changed.`
				});
			}
			continue;
		}
		if (normalizePackageKey(parsed.metadata.package) !== target) continue;
		if (entry.name !== resourceNameToKey(parsed.metadata.package)) {
			throw new ResourceError({
				message: `Refusing to remove ${parsed.metadata.package}: its managed directory identity conflicts with its metadata`,
				hint: 'Inspect the package metadata and directory path; no package data was changed.'
			});
		}
		if (!(await isConfinedDirectory(resourcesDirectory, directory))) {
			throw new ResourceError({
				message: `Refusing to remove ${parsed.metadata.package}: its directory is unsafe`,
				hint: 'The package path must be a real directory contained by the managed resources directory.'
			});
		}
		matches.push({ directory, kind: parsed.kind, metadata: parsed.metadata });
	}

	if (matches.length > 1) {
		throw new ResourceError({
			message: `Refusing to remove "${packageName}": multiple managed directories claim that package identity`,
			hint: `Inspect ${matches.map((match) => `"${match.directory}"`).join(' and ')}; no package data was changed.`
		});
	}
	if (matches[0]) return matches[0];

	const directDirectory = path.join(resourcesDirectory, resourceNameToKey(packageName));
	try {
		const stats = await fs.lstat(directDirectory);
		if (stats.isSymbolicLink()) {
			throw new ResourceError({
				message: `Refusing to remove "${packageName}": the matching resource path is a symbolic link`,
				hint: `Inspect "${directDirectory}" manually; no package data was changed.`
			});
		}
		if (!stats.isDirectory()) {
			throw new ResourceError({
				message: `No removable managed package matches "${packageName}".`,
				hint: `"${directDirectory}" exists but is not a managed package directory. No data was changed.`
			});
		}
	} catch (cause) {
		if (cause instanceof ResourceError) throw cause;
		if ((cause as NodeJS.ErrnoException).code !== 'ENOENT') {
			throw new ResourceError({
				message: `Could not inspect the managed package path for "${packageName}"`,
				hint: `Check permissions for "${directDirectory}". No package data was changed.`,
				cause
			});
		}
	}
	const directBioconductorMetadata = await readBioconductorResourceMetadataFile(directDirectory);
	const directCranMetadata = await readCranResourceMetadataFile(directDirectory);
	const details =
		directBioconductorMetadata.success && directCranMetadata.success
			? ' Both Bioconductor and CRAN metadata files are present.'
			: directBioconductorMetadata.success
				? ` Bioconductor metadata identifies package "${directBioconductorMetadata.data.package}".`
				: directCranMetadata.success
					? ` CRAN metadata identifies package "${directCranMetadata.data.package}".`
					: ` Metadata: Bioconductor ${directBioconductorMetadata.kind} (${formatBioconductorMetadataIssues(directBioconductorMetadata.issues)}); CRAN ${directCranMetadata.kind}.`;
	throw new ResourceError({
		message: `No removable managed package matches "${packageName}".`,
		hint: `Only package directories with valid biocontext metadata can be removed.${details}`
	});
};

const previousDirectory = (directory: string): string => `${directory}.previous`;

const removeStalePreviousDirectory = async (
	resourcesDirectory: string,
	directory: string,
	packageName: string,
	kind: 'bioconductor' | 'cran'
): Promise<void> => {
	const previous = previousDirectory(directory);
	try {
		const stats = await fs.lstat(previous);
		if (stats.isSymbolicLink() || !stats.isDirectory()) {
			throw new ResourceError({
				message: `Refusing to replace unsafe recovery path for ${packageName}`,
				hint: `Inspect "${previous}" manually; no package cache was changed.`
			});
		}
	} catch (cause) {
		if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return;
		throw cause;
	}
	if (!(await isConfinedDirectory(resourcesDirectory, previous))) {
		throw new ResourceError({
			message: `Refusing to replace an escaping recovery path for ${packageName}`,
			hint: `Inspect "${previous}" manually; no package cache was changed.`
		});
	}
	const metadata = await readManagedPackageMetadata(previous);
	if (
		!metadata ||
		metadata.kind === 'ambiguous' ||
		metadata.kind !== kind ||
		normalizePackageKey(metadata.metadata.package) !== normalizePackageKey(packageName)
	) {
		throw new ResourceError({
			message: `Refusing to replace unrecognized recovery data for ${packageName}`,
			hint: `Inspect "${previous}" manually; no package cache was changed.`
		});
	}
	await fs.rm(previous, { recursive: true, force: true });
};

/**
 * Remove exactly one schema-valid managed package cache.
 *
 * Config and persistent removal state are updated before the canonical package
 * directory is atomically renamed out of discovery. Any failure before that
 * rename restores both state changes. Cleanup failure is reported but does not
 * make a successfully removed package visible again.
 */
export const removeInstalledBioconductorPackage = async <TReceipt extends BioconductorConfigRemovalReceipt>(
	options: RemoveInstalledBioconductorPackageOptions<TReceipt>
): Promise<BioconductorPackageRemovalResult> => {
	const initial = await findManagedPackageDirectory(options.resourcesDirectory, options.package);
	return withBioconductorPackageMutation(initial.directory, async () => {
		const managed = await findManagedPackageDirectory(
			options.resourcesDirectory,
			initial.metadata.package
		);
		const canonical = managed.metadata.package;
		const previous = previousDirectory(managed.directory);
		await removeStalePreviousDirectory(
			options.resourcesDirectory,
			managed.directory,
			canonical,
			managed.kind
		);

		const receipt = await options.removeConfigResources(canonical);
		let removalMarkerChanged = false;
		try {
			removalMarkerChanged =
				managed.kind === 'bioconductor'
					? await setBioconductorPackageRemoved(options.dataDirectory, canonical, true)
					: false;
			await fs.rename(managed.directory, previous);
		} catch (cause) {
			const rollbackFailures: unknown[] = [];
			if (removalMarkerChanged && managed.kind === 'bioconductor') {
				await setBioconductorPackageRemoved(options.dataDirectory, canonical, false).catch(
					(rollbackCause) => {
						rollbackFailures.push(rollbackCause);
					}
				);
			}
			await options.restoreConfigResources(receipt).catch((rollbackCause) => {
				rollbackFailures.push(rollbackCause);
			});
			if (rollbackFailures.length > 0) {
				throw new ResourceError({
					message: `Removal of ${canonical} stopped before its package directory changed, but state rollback was incomplete`,
					hint: `The package data remains at "${managed.directory}". Inspect the config and package-removal state before retrying.`,
					cause: new AggregateError([cause, ...rollbackFailures], 'Package removal rollback failed')
				});
			}
			throw new ResourceError({
				message: `Could not remove managed ${managed.kind === 'bioconductor' ? 'Bioconductor' : 'CRAN'} package ${canonical}`,
				hint: 'The package directory was left in place. Check permissions and try again.',
				cause
			});
		}

		let cleanupPending = false;
		try {
			await fs.rm(previous, { recursive: true, force: true });
		} catch (cause) {
			if (managed.kind === 'cran') {
				try {
					await fs.rename(previous, managed.directory);
					await options.restoreConfigResources(receipt);
				} catch (restoreCause) {
					throw new ResourceError({
						message: `Could not finalize or fully roll back removal of CRAN package ${canonical}`,
						hint: `The package data was not deleted. Inspect "${managed.directory}" and its config entry before retrying.`,
						cause: restoreCause
					});
				}
				throw new ResourceError({
					message: `Could not remove managed CRAN package ${canonical}`,
					hint: 'The package directory and config entry were restored. Check permissions and try again.',
					cause
				});
			}
			cleanupPending = true;
			metricsError('bioconductor.package.remove.cleanup_failed', {
				package: canonical,
				error: cause instanceof Error ? cause.message : String(cause)
			});
		}
		metricsInfo('bioconductor.package.removed', {
			package: canonical,
			configuredResources: receipt.removedNames,
			cleanupPending
		});
		return {
			package: canonical,
			removedConfigResources: receipt.removedNames,
			cleanupPending
		};
	});
};

/** Remove internal recovery directories left by an interrupted successful removal. */
export const cleanupRemovedBioconductorPackageArtifacts = async (args: {
	readonly dataDirectory: string;
	readonly resourcesDirectory: string;
}): Promise<void> => {
	for (const packageName of await readRemovedBioconductorPackageNames(args.dataDirectory)) {
		const previous = `${path.join(args.resourcesDirectory, resourceNameToKey(packageName))}.previous`;
		try {
			const stats = await fs.lstat(previous);
			const metadata = await readBioconductorResourceMetadataFile(previous);
			if (
				stats.isDirectory() &&
				!stats.isSymbolicLink() &&
				(await isConfinedDirectory(args.resourcesDirectory, previous)) &&
				metadata.success &&
				normalizePackageKey(metadata.data.package) === normalizePackageKey(packageName)
			) {
				await fs.rm(previous, { recursive: true, force: true });
			} else {
				metricsError('bioconductor.package.remove.cleanup_retry_refused', {
					package: packageName,
					path: previous
				});
			}
		} catch (cause) {
			if ((cause as NodeJS.ErrnoException).code !== 'ENOENT') {
				metricsError('bioconductor.package.remove.cleanup_retry_failed', {
					package: packageName,
					error: cause instanceof Error ? cause.message : String(cause)
				});
			}
		}
	}
};
