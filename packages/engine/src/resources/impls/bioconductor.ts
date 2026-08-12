import { promises as fs } from 'node:fs';
import path from 'node:path';

import {
	BioconductorCatalogError,
	findPackage,
	loadCatalog,
	suggestPackageNames
} from '../../bioconductor/catalog.ts';
import { findCorpusPackage, findCorpusRoot, REPO_CORPUS_PATH } from '../../bioconductor/corpus.ts';
import { isDefaultBioconductorPackage } from '../../bioconductor/default-package-list.ts';

import {
	BIOCONDUCTOR_CORPUS_DIR,
	BIOCONDUCTOR_METADATA_FILE,
	BIOCONDUCTOR_MANUAL_FILE,
	BIOCONDUCTOR_SOURCE_DIR,
	isCompleteBioconductorResourceCache,
	readBioconductorResourceMetadata,
	materializeBioconductorPackage,
	type BioconductorResourceMetadata,
	type MaterializeResult
} from '../../bioconductor/materialize.ts';
import { CommonHints } from '../../errors.ts';
import { isBioconductorGitSourceMetadata } from '../../bioconductor/metadata.ts';
import { ResourceError, resourceNameToKey } from '../helpers.ts';
import { findCachedBioconductorPackageName } from '../selection.ts';
import type { BioconductorResourceArgs, FsResource } from '../types.ts';

export const DEFAULT_BIOCONDUCTOR_RELEASE = 'release';

/**
 * Refuse to write into a directory that belongs to another resource.
 *
 * Package folders are named after the package, so they share a namespace with
 * every other cloned resource. A directory without `.bioconductor-meta.json` was not
 * created here and must not be overwritten.
 */
const assertDirectoryAvailable = async (directory: string, packageName: string): Promise<void> => {
	try {
		const entries = await fs.readdir(directory);
		if (entries.length === 0) return;
		if (entries.includes(BIOCONDUCTOR_METADATA_FILE)) {
			const metadata = await readBioconductorResourceMetadata(directory);
			if (metadata?.package === packageName) return;
		}
		throw new ResourceError({
			message: `Cannot store Bioconductor package "${packageName}": "${directory}" already belongs to another resource.`,
			hint: 'Rename or remove the conflicting resource, then try again.'
		});
	} catch (cause) {
		if (cause instanceof ResourceError) throw cause;
		if ((cause as NodeJS.ErrnoException).code !== 'ENOENT') throw cause;
		// Missing directory is the normal case.
	}
};

const describePackage = (packageName: string, suggestions: readonly string[]): string =>
	suggestions.length > 0
		? `"${packageName}" is not a Bioconductor package. Did you mean ${suggestions.map((name) => `"${name}"`).join(', ')}?`
		: `"${packageName}" is not a Bioconductor package.`;

const toBioconductorFsResource = (args: {
	metadata: BioconductorResourceMetadata;
	directory: string;
	name: string;
	specialAgentInstructions?: string;
}): FsResource => {
	const { metadata } = args;
	const ok = metadata.documents.filter((document) => document.status === 'ok');
	const failed = metadata.documents.filter((document) => document.status === 'failed');
	const skipped = metadata.documents.filter((document) => document.status === 'skipped');
	const hasCurated = ok.some((document) => document.sourceType === 'curated');
	const hasManual = ok.some((document) => document.originType === 'reference_manual');
	const hasScripts = ok.some((document) => document.originType === 'vignette_script');
	const hasVignettes = ok.some((document) => document.originType === 'vignette');
	const sourceDescription = isBioconductorGitSourceMetadata(metadata.repository)
		? `The mandatory filtered package source snapshot is under ${BIOCONDUCTOR_SOURCE_DIR}/. ${BIOCONDUCTOR_SOURCE_DIR}/DIRECTORY.md records its inventory and filtering policy. The explicit Git source is ${metadata.repository.url} at commit ${metadata.repository.commit}.`
		: `The mandatory filtered package source snapshot is under ${BIOCONDUCTOR_SOURCE_DIR}/. ${BIOCONDUCTOR_SOURCE_DIR}/DIRECTORY.md records its inventory and filtering policy. It comes from the exact Bioconductor source archive ${metadata.repository.url}, verified by SHA-256 ${metadata.repository.sha256}.`;
	const instructions = [
		args.specialAgentInstructions ?? '',
		`This resource is the documentation for the Bioconductor package ${metadata.package} ${metadata.bioconductor.packageVersion} (Bioconductor ${metadata.bioconductor.release}).`,
		'README.md records the package summary, available documents, and any pending retries.',
		hasCurated
			? `${BIOCONDUCTOR_CORPUS_DIR}/ holds distinct hand-curated papers, books, tutorials, or workflows; redundant reference and vignette copies are omitted from the query. vignettes/ holds canonical documents published on bioconductor.org.`
			: hasVignettes
				? 'Published vignettes are under vignettes/.'
				: '',
		hasManual
			? `${BIOCONDUCTOR_MANUAL_FILE} is the reference manual: argument names and defaults there are authoritative, though its spacing and tables are imperfect because it is extracted from a PDF.`
			: '',
		hasScripts
			? `A published vignettes/*.R script remains searchable only when no matching rendered or authored vignette is the canonical representation.`
			: '',
		sourceDescription,
		failed.length > 0
			? `${failed.length} published document(s) are pending retry. Do not claim they were available; use the successful documents listed in README.md.`
			: '',
		skipped.length > 0 && ok.length === 0 && !hasCurated
			? 'No published documents were available for this resource. README.md records the unavailable document types; do not infer package behavior from this resource.'
			: '',
		'State the package version when behavior is version-specific.'
	]
		.filter((line) => line.trim().length > 0)
		.join(' ');

	return {
		_tag: 'fs-based',
		name: args.name,
		fsName: resourceNameToKey(args.name),
		type: 'bioconductor',
		repoSubPaths: [],
		specialAgentInstructions: instructions,
		getAbsoluteDirectoryPath: async () => args.directory
	};
};

/** Mount an already validated managed package cache without changing its contents. */
export const loadCachedBioconductorResource = async (args: {
	package: string;
	resourcesDirectoryPath: string;
	name?: string;
	specialAgentInstructions?: string;
}): Promise<FsResource> => {
	const directory = path.join(args.resourcesDirectoryPath, resourceNameToKey(args.package));
	const metadata = await readBioconductorResourceMetadata(directory);
	if (
		!metadata ||
		metadata.package !== args.package ||
		!(await isCompleteBioconductorResourceCache(directory, metadata))
	) {
		throw new ResourceError({
			message: `Cached Bioconductor package "${args.package}" is incomplete`,
			hint: `Run /add and reinstall ${args.package} to refresh its local documentation.`
		});
	}
	return toBioconductorFsResource({
		metadata,
		directory,
		name: args.name ?? metadata.package,
		specialAgentInstructions: args.specialAgentInstructions
	});
};

/**
 * Load package documentation that is already on disk without consulting the
 * remote catalog or mutating the cache. Managed package folders take priority;
 * packages in the bundled curated corpus remain usable before they are
 * explicitly installed through /add.
 */
export const loadInstalledBioconductorResource = async (args: BioconductorResourceArgs): Promise<FsResource> => {
	const cachedPackage = await findCachedBioconductorPackageName(args.resourcesDirectoryPath, args.package);
	if (cachedPackage) {
		return loadCachedBioconductorResource({
			package: cachedPackage,
			resourcesDirectoryPath: args.resourcesDirectoryPath,
			name: args.anonymous ? cachedPackage : args.name,
			specialAgentInstructions: args.specialAgentInstructions
		});
	}

	const discoveredCorpus = await findCorpusRoot(args.resourcesDirectoryPath);
	const corpusRoot =
		discoveredCorpus ?? (await findCorpusRoot(args.resourcesDirectoryPath, [REPO_CORPUS_PATH]));
	const corpusPackage =
		corpusRoot && isDefaultBioconductorPackage(args.package)
			? await findCorpusPackage(corpusRoot, args.package)
			: null;
	if (corpusPackage) {
		const canonicalName = path.basename(corpusPackage.directory);
		const resourceName = args.anonymous ? canonicalName : args.name;
		return {
			_tag: 'fs-based',
			name: resourceName,
			fsName: resourceNameToKey(resourceName),
			type: 'bioconductor',
			repoSubPaths: [],
			specialAgentInstructions: [
				args.specialAgentInstructions ?? '',
				`This is the locally bundled curated documentation for the Bioconductor package ${canonicalName}.`,
				'List this package directory first, then read the documents relevant to the question. The package has not been expanded with published documentation or source unless those files are present here.'
			]
				.filter((line) => line.trim().length > 0)
				.join(' '),
			getAbsoluteDirectoryPath: async () => corpusPackage.directory
		};
	}

	throw new ResourceError({
		message: `Bioconductor package documentation for "${args.package}" is not installed locally.`,
		hint: `Run /add, choose bioconductor, search for ${args.package}, and press Enter to install its documentation.`
	});
};

/**
 * Install or refresh a Bioconductor package as a searchable local directory.
 *
 * This network-capable path is used by /add resource mutations. Question-time
 * @mention loading uses loadInstalledBioconductorResource instead.
 */
export const loadBioconductorResource = async (args: BioconductorResourceArgs): Promise<FsResource> => {
	const release = args.release ?? DEFAULT_BIOCONDUCTOR_RELEASE;

	const catalog = await loadCatalog({
		dataDirectory: args.dataDirectoryPath,
		release,
		...(args.refresh ? { refresh: true } : {})
	});

	const pkg = findPackage(catalog, args.package);
	if (!pkg) {
		throw new ResourceError({
			message: describePackage(args.package, suggestPackageNames(catalog, args.package)),
			hint: 'Run /add and choose bioconductor to search the Bioconductor package index.'
		});
	}

	const directory = path.join(args.resourcesDirectoryPath, resourceNameToKey(pkg.name));
	await assertDirectoryAvailable(directory, pkg.name);

	let result: MaterializeResult;
	try {
		result = await materializeBioconductorPackage({
			pkg,
			release: catalog.release,
			directory,
			resourcesDirectory: args.resourcesDirectoryPath,
			corpusCandidates: [...(args.corpusCandidates ?? []), REPO_CORPUS_PATH],
			includeCurated: args.includeCurated ?? false,
			...(args.documents ? { documents: args.documents } : {}),
			...(typeof args.source === 'string' ? { source: args.source } : {}),
			...(args.sourceBranch ? { sourceBranch: args.sourceBranch } : {}),
			...(args.sourceCommit ? { sourceCommit: args.sourceCommit } : {}),
			...(args.refresh === undefined ? {} : { refresh: args.refresh }),
			quiet: args.quiet
		});
	} catch (cause) {
		if (cause instanceof BioconductorCatalogError) {
			throw new ResourceError({ message: cause.message, hint: cause.hint, cause });
		}
		throw new ResourceError({
			message: `Failed to download Bioconductor package "${pkg.name}"`,
			hint: CommonHints.CLEAR_CACHE,
			cause
		});
	}

	return toBioconductorFsResource({
		metadata: result.metadata,
		directory,
		name: args.anonymous ? pkg.name : args.name,
		specialAgentInstructions: args.specialAgentInstructions
	});
};
