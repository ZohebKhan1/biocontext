import { createHash } from 'node:crypto';

import { Effect } from 'effect';

import type { ConfigService as ConfigServiceShape } from '../config/index.ts';
import { validateGitUrl } from '../validation/index.ts';
import { CommonHints } from '../errors.ts';

import { parseManagedBioconductorCacheReference, ResourceError, resourceNameToKey } from './helpers.ts';
import { loadCachedBioconductorResource, loadInstalledBioconductorResource } from './impls/bioconductor.ts';
import { loadInstalledCranResource } from './impls/cran.ts';
import { loadGitResource } from './impls/git.ts';
import {
	isBioconductorPackageName,
	isBioconductorResource,
	isCranResource,
	isGitResource,
	type BioconductorResource,
	type CranResource,
	type ResourceDefinition,
	type GitResource,
	type LocalResource
} from './schema.ts';
import type {
	BioconductorResourceArgs,
	CranResourceArgs,
	FsResource,
	GitResourceArgs,
	LocalResourceArgs
} from './types.ts';

const ANON_PREFIX = 'anonymous:';
const ANON_DIRECTORY_PREFIX = 'anonymous-';
const DEFAULT_ANON_BRANCH = 'main';
/** Explicit prefix for a Bioconductor package reference, e.g. `bioconductor:DESeq2`. */
export const BIOCONDUCTOR_REFERENCE_PREFIX = 'bioconductor:';

export const createAnonymousDirectoryKey = (reference: string): string => {
	const hash = createHash('sha256').update(reference).digest('hex').slice(0, 12);
	return `${ANON_DIRECTORY_PREFIX}${hash}`;
};

const isAnonymousResource = (name: string): boolean => name.startsWith(ANON_PREFIX);

export type ResourcesService = {
	load: (
		name: string,
		options?: {
			quiet?: boolean;
		}
	) => Effect.Effect<FsResource, ResourceError, never>;
	loadPromise: (
		name: string,
		options?: {
			quiet?: boolean;
		}
	) => Promise<FsResource>;
};

const normalizeSearchPaths = (definition: GitResource): string[] => {
	const paths = [
		...(definition.searchPaths ?? []),
		...(definition.searchPath ? [definition.searchPath] : [])
	];
	return paths.filter((path) => path.trim().length > 0);
};

const definitionToGitArgs = (
	definition: GitResource,
	resourcesDirectory: string,
	quiet: boolean
): GitResourceArgs => ({
	type: 'git',
	name: definition.name,
	url: definition.url,
	branch: definition.branch,
	repoSubPaths: normalizeSearchPaths(definition),
	resourcesDirectoryPath: resourcesDirectory,
	specialAgentInstructions: definition.specialNotes ?? '',
	quiet,
	ephemeral: isAnonymousResource(definition.name),
	localDirectoryKey: isAnonymousResource(definition.name)
		? createAnonymousDirectoryKey(definition.url)
		: undefined
});

const definitionToLocalArgs = (definition: LocalResource): LocalResourceArgs => ({
	type: 'local',
	name: definition.name,
	path: definition.path,
	specialAgentInstructions: definition.specialNotes ?? ''
});

const definitionToBioconductorArgs = (
	definition: BioconductorResource,
	config: Pick<ConfigServiceShape, 'resourcesDirectory' | 'dataDirectory'>,
	quiet: boolean,
	anonymous: boolean
): BioconductorResourceArgs => ({
	type: 'bioconductor',
	name: definition.name,
	package: definition.package,
	anonymous,
	...(definition.release ? { release: definition.release } : {}),
	...(definition.documents ? { documents: definition.documents } : {}),
	...(definition.includeCurated === undefined ? {} : { includeCurated: definition.includeCurated }),
	...(definition.source === undefined ? {} : { source: definition.source }),
	...(definition.sourceBranch ? { sourceBranch: definition.sourceBranch } : {}),
	...(definition.sourceCommit ? { sourceCommit: definition.sourceCommit } : {}),
	resourcesDirectoryPath: config.resourcesDirectory,
	dataDirectoryPath: config.dataDirectory,
	specialAgentInstructions: definition.specialNotes ?? '',
	quiet
});

const definitionToCranArgs = (
	definition: CranResource,
	config: Pick<ConfigServiceShape, 'resourcesDirectory' | 'dataDirectory'>,
	quiet: boolean
): CranResourceArgs => ({
	type: 'cran',
	name: definition.name,
	package: definition.package,
	resourcesDirectoryPath: config.resourcesDirectory,
	dataDirectoryPath: config.dataDirectory,
	specialAgentInstructions: definition.specialNotes ?? '',
	quiet
});

const loadLocalResource = (args: LocalResourceArgs): FsResource => ({
	_tag: 'fs-based',
	name: args.name,
	fsName: resourceNameToKey(args.name),
	type: 'local',
	repoSubPaths: [],
	specialAgentInstructions: args.specialAgentInstructions,
	getAbsoluteDirectoryPath: async () => args.path
});

/**
 * Build a definition for a reference that is not a configured resource name.
 *
 * A bare token that looks like an R package name is treated as a Bioconductor
 * package reference. Loading is local-only: /add is the installation path for
 * package documentation that is not already in a managed cache or the bundled
 * curated corpus.
 */
export const createAnonymousResource = (reference: string): ResourceDefinition | null => {
	const trimmed = reference.trim();

	if (trimmed.toLowerCase().startsWith(BIOCONDUCTOR_REFERENCE_PREFIX)) {
		const packageName = trimmed.slice(BIOCONDUCTOR_REFERENCE_PREFIX.length).trim();
		if (!isBioconductorPackageName(packageName)) return null;
		return { type: 'bioconductor', name: packageName, package: packageName };
	}

	const gitUrlResult = validateGitUrl(trimmed);
	if (gitUrlResult.valid) {
		const normalizedUrl = gitUrlResult.value;
		return {
			type: 'git',
			name: `${ANON_PREFIX}${normalizedUrl}`,
			url: normalizedUrl,
			branch: DEFAULT_ANON_BRANCH
		};
	}

	if (isBioconductorPackageName(trimmed)) {
		return { type: 'bioconductor', name: trimmed, package: trimmed };
	}

	return null;
};

export const resolveResourceDefinition = (
	reference: string,
	getResource: ConfigServiceShape['getResource']
): ResourceDefinition => {
	const definition = getResource(reference);
	if (definition) return definition;

	const anonymousDefinition = createAnonymousResource(reference);
	if (anonymousDefinition) return anonymousDefinition;

	throw new ResourceError({
		message: `Resource "${reference}" not found in config`,
		hint: `${CommonHints.LIST_RESOURCES} ${CommonHints.ADD_RESOURCE}`
	});
};

export const createResourcesService = (config: ConfigServiceShape): ResourcesService => {
	const loadPromise: ResourcesService['loadPromise'] = async (name, options) => {
		const quiet = options?.quiet ?? false;
		const cachedPackage = parseManagedBioconductorCacheReference(name);
		if (cachedPackage) {
			return await loadCachedBioconductorResource({
				package: cachedPackage,
				resourcesDirectoryPath: config.resourcesDirectory
			});
		}
		const configuredDefinition = config.getResource(name);
		const definition = resolveResourceDefinition(name, config.getResource);

		if (isBioconductorResource(definition)) {
			return await loadInstalledBioconductorResource(
				definitionToBioconductorArgs(definition, config, quiet, configuredDefinition === undefined)
			);
		}

		if (isCranResource(definition)) {
			return await loadInstalledCranResource(definitionToCranArgs(definition, config, quiet));
		}

		if (isGitResource(definition)) {
			try {
				return await loadGitResource(
					definitionToGitArgs(definition, config.resourcesDirectory, quiet)
				);
			} catch (cause) {
				if (cause instanceof ResourceError) throw cause;
				throw new ResourceError({
					message: `Failed to load git resource "${name}"`,
					hint: CommonHints.CLEAR_CACHE,
					cause
				});
			}
		}

		return loadLocalResource(definitionToLocalArgs(definition));
	};

	const load: ResourcesService['load'] = (name, options) =>
		Effect.tryPromise({
			try: () => loadPromise(name, options),
			catch: (cause) =>
				cause instanceof ResourceError
					? cause
					: new ResourceError({
							message: `Failed to resolve resource "${name}"`,
							hint: `${CommonHints.LIST_RESOURCES} ${CommonHints.ADD_RESOURCE}`,
							cause
						})
		});

	return {
		load,
		loadPromise
	};
};
