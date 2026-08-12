import { promises as fs } from 'node:fs';
import path from 'node:path';

import {
	isCompleteBioconductorResourceCache,
	readBioconductorResourceMetadata
} from '../bioconductor/materialize.ts';
import {
	findCorpusRoot,
	listCorpusPackageNames,
	REPO_CORPUS_PATH
} from '../bioconductor/corpus.ts';
import { isDefaultBioconductorPackage } from '../bioconductor/default-package-list.ts';
import { isBioconductorPackageName, type ResourceDefinition } from './schema.ts';
import { ResourceError, managedBioconductorCacheReference, resourceNameToKey } from './helpers.ts';

export const BIOCONDUCTOR_SCOPE_REFERENCE = 'Bioconductor';
/**
 * Broad scope is intentionally larger than the explicit request limit because
 * the bundled corpus plus installed package caches commonly exceeds 20
 * resources. It is still bounded so a corrupt or unusually large cache cannot
 * expand one `@Bioconductor` request without limit.
 */
export const MAX_BROAD_RESOURCES = 64;

export type ResourceSelection = {
	mode: 'broad' | 'focused';
	resourceNames: string[];
};

const uniqueCaseInsensitive = (values: readonly string[]): string[] => {
	const seen = new Set<string>();
	return values.filter((value) => {
		const key = value.toLowerCase();
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
};

/** Discover only package caches created by biocontext itself. */
export const discoverCachedBioconductorPackageNames = async (
	resourcesDirectory: string
): Promise<string[]> => {
	let entries: Array<{ name: string; isDirectory: () => boolean }>;
	try {
		entries = await fs.readdir(resourcesDirectory, { withFileTypes: true });
	} catch {
		return [];
	}

	const packages: string[] = [];
	for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
		if (!entry.isDirectory() || entry.name.endsWith('.partial')) continue;
		try {
			const directory = path.join(resourcesDirectory, entry.name);
			const metadata = await readBioconductorResourceMetadata(directory);
			if (!metadata || !isBioconductorPackageName(metadata.package)) continue;
			// A mismatched marker is not a managed canonical package cache.
			if (entry.name !== resourceNameToKey(metadata.package)) continue;
			if (!(await isCompleteBioconductorResourceCache(directory, metadata))) continue;
			packages.push(metadata.package);
		} catch {
			continue;
		}
	}
	return uniqueCaseInsensitive(packages);
};

/** Return the canonical name of a complete managed cache, matched case-insensitively. */
export const findCachedBioconductorPackageName = async (
	resourcesDirectory: string,
	packageName: string
): Promise<string | null> => {
	const target = packageName.trim().toLowerCase();
	if (!target) return null;
	return (
		(await discoverCachedBioconductorPackageNames(resourcesDirectory)).find(
			(candidate) => candidate.toLowerCase() === target
		) ?? null
	);
};

/** Unique Bioconductor packages whose documentation is already available on disk. */
export const discoverLocalBioconductorPackageNames = async (
	resourcesDirectory: string
): Promise<string[]> => {
	const [cachedPackages, discoveredCorpus] = await Promise.all([
		discoverCachedBioconductorPackageNames(resourcesDirectory),
		findCorpusRoot(resourcesDirectory)
	]);
	const corpusRoot =
		discoveredCorpus ?? (await findCorpusRoot(resourcesDirectory, [REPO_CORPUS_PATH]));
	const corpusPackages = corpusRoot
		? (await listCorpusPackageNames(corpusRoot)).filter(isDefaultBioconductorPackage)
		: [];
	return uniqueCaseInsensitive([...corpusPackages, ...cachedPackages]).sort((left, right) =>
		left.localeCompare(right)
	);
};

export const isBroadResourceReference = (reference: string): boolean =>
	reference.trim().toLowerCase() === BIOCONDUCTOR_SCOPE_REFERENCE.toLowerCase();

/**
 * Resolve the public scope selector into concrete resources for both HTTP
 * routes. Broad mode includes configured resources and valid managed package
 * caches, so its generated inventory updates without hand-maintained indexes.
 */
export const resolveResourceSelection = async (args: {
	requested?: readonly string[];
	configuredResources: readonly ResourceDefinition[];
	resourcesDirectory: string;
}): Promise<ResourceSelection> => {
	const requested = uniqueCaseInsensitive(args.requested ?? []);
	const broad = requested.length === 0 || requested.some(isBroadResourceReference);
	if (!broad) return { mode: 'focused', resourceNames: requested };

	const configured = args.configuredResources.map((resource) => resource.name);
	const configuredIdentities = new Set(
		args.configuredResources.flatMap((resource) => [
			resource.name.toLowerCase(),
			...(resource.type === 'bioconductor' || resource.type === 'cran'
				? [resource.package.toLowerCase()]
				: [])
		])
	);
	const cachedPackages = (await discoverCachedBioconductorPackageNames(args.resourcesDirectory)).filter(
		(packageName) => !configuredIdentities.has(packageName.toLowerCase())
	);
	const resourceNames = uniqueCaseInsensitive([
		...configured,
		...cachedPackages.map(managedBioconductorCacheReference)
	]);
	if (resourceNames.length > MAX_BROAD_RESOURCES) {
		throw new ResourceError({
			message: `The broad Bioconductor scope contains ${resourceNames.length} local resources (maximum ${MAX_BROAD_RESOURCES}).`,
			hint: 'Use an explicit @Package mention or remove unused configured/package caches before retrying.'
		});
	}
	return {
		mode: 'broad',
		resourceNames
	};
};
