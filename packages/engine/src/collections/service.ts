import { promises as fs } from 'node:fs';
import path from 'node:path';

import { Effect } from 'effect';

import type { ConfigService as ConfigServiceShape } from '../config/index.ts';
import { runTransaction } from '../context/transaction.ts';
import { CommonHints, getErrorHint, getErrorMessage } from '../errors.ts';
import { metricsInfo } from '../metrics/index.ts';
import type { ResourcesService } from '../resources/service.ts';
import { isGitResource } from '../resources/schema.ts';
import {
	isBioconductorGitSourceMetadata,
	readBioconductorResourceMetadata,
	type BioconductorResourceMetadata
} from '../bioconductor/metadata.ts';
import { findCorpusPackage, findCorpusRootWithinResource } from '../bioconductor/corpus.ts';
import {
	additionalManagedBioconductorIgnoredPaths,
	isRedundantCuratedDocument,
	shouldIgnoreManagedBioconductorSearchPath
} from '../bioconductor/search-policy.ts';
import { readCranResourceMetadata } from '../cran/metadata.ts';
import { FS_RESOURCE_SYSTEM_NOTE, type FsResource } from '../resources/types.ts';
import { CollectionError, getCollectionKey, type CollectionResult } from './types.ts';
import {
	createVirtualFs,
	disposeVirtualFs,
	importDirectoryIntoVirtualFs,
	importPathsIntoVirtualFs,
	mkdirVirtualFs,
	rmVirtualFs,
	existsInVirtualFs,
	writeVirtualFsFile
} from '../vfs/virtual-fs.ts';
import {
	clearVirtualCollectionMetadata,
	createQueryEvidenceTrace,
	setVirtualCollectionMetadata,
	type VirtualResourceMetadata
} from './virtual-metadata.ts';
import { clearQueryFileCache } from '../tools/query-cache.ts';

export type CollectionsService = {
	load: (args: {
		resourceNames: readonly string[];
		quiet?: boolean;
		scope?: 'broad' | 'focused';
	}) => Effect.Effect<CollectionResult, CollectionError, never>;
	loadPromise: (args: {
		resourceNames: readonly string[];
		quiet?: boolean;
		scope?: 'broad' | 'focused';
	}) => Promise<CollectionResult>;
};

const escapeXml = (value: string) =>
	value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&apos;');

const getResourceTypeLabel = (resource: FsResource) => {
	if (resource.type === 'git') return 'git repo';
	if (resource.type === 'bioconductor') return 'Bioconductor package documentation';
	if (resource.type === 'cran') return 'CRAN package source';
	return 'local directory';
};

const trimGitSuffix = (url: string) => url.replace(/\.git$/u, '').replace(/\/+$/u, '');

const xmlLine = (tag: string, value?: string) =>
	value ? `\t\t<${tag}>${escapeXml(value)}</${tag}>` : '';

const xmlPathBlock = (tag: string, values: readonly string[]) =>
	values.length === 0
		? ''
		: [
				`\t\t<${tag}>`,
				...values.map((value) => `\t\t\t<path>${escapeXml(value)}</path>`),
				`\t\t</${tag}>`
			].join('\n');

const createCollectionInstructionBlock = (
	resource: FsResource,
	metadata: VirtualResourceMetadata | undefined,
	collectionPath: string
) => {
	const virtualResourceRoot = path.posix.join('/', resource.fsName);
	const relativeResourceRoot = path.posix.relative(collectionPath, virtualResourceRoot) || '.';
	const displayResourceRoot =
		relativeResourceRoot === '.' ? '.' : `./${relativeResourceRoot.replace(/^\.\//u, '')}`;
	// Managed package evidence is rendered package-by-package, so its human-facing
	// citation path is resource-relative even when the internal multi-resource
	// mount uses an encoded @Package directory.
	const citationPathPrefix =
		resource.type === 'bioconductor' || resource.type === 'cran' || relativeResourceRoot === '.'
			? ''
			: `${relativeResourceRoot}/`;
	const focusPaths = resource.repoSubPaths.map((subPath) => {
		const absolute = path.posix.join(virtualResourceRoot, subPath);
		const relative = path.posix.relative(collectionPath, absolute) || '.';
		return relative === '.' ? '.' : `./${relative}`;
	});
	const repoUrl =
		resource.type === 'git' && metadata?.url ? trimGitSuffix(metadata.url) : undefined;
	const gitRef = metadata?.branch ?? metadata?.commit;
	const githubBlobPrefix =
		repoUrl && gitRef ? `${repoUrl}/blob/${encodeURIComponent(gitRef)}` : undefined;
	const isBioconductor = resource.type === 'bioconductor';
	const isCran = resource.type === 'cran';
	const bioconductorLandingUrl = isBioconductor ? metadata?.url : undefined;
	const bioconductorSourceUrl = isBioconductor ? metadata?.sourceRepositoryUrl : undefined;
	const bioconductorSourceRule = bioconductorSourceUrl
		? [
				`Files under ${displayResourceRoot}/source/ are the package source.`,
				`Cite the shortest unambiguous local file name and inclusive line range, such as ${citationPathPrefix}source/<file>:<start>-<end>. Do not emit GitHub or Bioconductor URLs, commit hashes, or a manual Sources section; the runtime appends compact package/version citations.`,
				'Source files and published or curated documents have separate provenance.'
			].join(' ')
		: undefined;

	return [
		'\t<resource>',
		`\t\t<name>${escapeXml(resource.name)}</name>`,
		`\t\t<type>${getResourceTypeLabel(resource)}</type>`,
		`\t\t<system_note>${escapeXml(FS_RESOURCE_SYSTEM_NOTE)}</system_note>`,
		`\t\t<path>${escapeXml(displayResourceRoot)}</path>`,
		xmlLine('repo_url', repoUrl),
		xmlLine('repo_branch', resource.type === 'git' ? metadata?.branch : undefined),
		xmlLine('repo_commit', resource.type === 'git' ? metadata?.commit : undefined),
		xmlLine('github_blob_prefix', githubBlobPrefix),
		xmlLine('bioconductor_package', isBioconductor ? metadata?.package : undefined),
		xmlLine('bioconductor_version', isBioconductor ? metadata?.version : undefined),
		xmlLine('bioc_release', isBioconductor ? metadata?.bioconductorRelease : undefined),
		xmlLine('bioconductor_landing_url', bioconductorLandingUrl),
		xmlLine('bioconductor_curated_from', isBioconductor ? metadata?.curatedFrom : undefined),
		xmlLine(
			'bioconductor_curated_rule',
				isBioconductor && metadata?.curatedFrom
				? `Files under ${displayResourceRoot}/curated/ are distinct hand-curated documents such as method papers, books, tutorials, and workflows. Cite them as ${citationPathPrefix}curated/<file>. Redundant reference and vignette copies are omitted from this query.`
				: undefined
		),
		xmlLine('bioconductor_source_repository', isBioconductor ? metadata?.sourceRepositoryUrl : undefined),
		xmlLine('bioconductor_source_repository_kind', isBioconductor ? metadata?.sourceRepositoryKind : undefined),
		xmlLine('bioconductor_source_branch', isBioconductor ? metadata?.sourceBranch : undefined),
		xmlLine('bioconductor_source_commit', isBioconductor ? metadata?.sourceCommit : undefined),
		xmlLine('bioconductor_source_rule', bioconductorSourceRule),
		xmlLine('cran_package', isCran ? metadata?.package : undefined),
		xmlLine('cran_version', isCran ? metadata?.version : undefined),
		xmlLine('cran_landing_url', isCran ? metadata?.url : undefined),
		xmlLine('cran_source_archive', isCran ? metadata?.sourceRepositoryUrl : undefined),
		xmlLine(
			'cran_source_rule',
			isCran
				? `Files under ${displayResourceRoot}/source/ come from the exact CRAN source archive. Cite them as ${citationPathPrefix}source/<path> and use the recorded CRAN source archive URL; do not infer a GitHub or Bioconductor identity.`
				: undefined
		),
		xmlLine(
			'citation_rule',
			githubBlobPrefix
				? `Convert virtual paths under ${displayResourceRoot}/ to repo-relative paths, then encode each path segment for GitHub URLs.`
				: isBioconductor
					? `Cite the shortest unambiguous local file name and inclusive line range under ${displayResourceRoot}/. Do not emit GitHub or bioconductor.org URLs, commit hashes, or a manual Sources section; the runtime appends compact package/version citations. Curated and source files have separate provenance. State the package version and Bioconductor release when behavior is version-specific.`
					: isCran
						? `Cite the shortest unambiguous local file name and inclusive line range under ${displayResourceRoot}/source/. Do not emit archive URLs, commit hashes, or a manual Sources section; the runtime appends compact package/version citations. State the CRAN package version when behavior is version-specific.`
						: 'Cite local file paths only for this resource.'
		),
		xmlLine(
			'citation_example',
			isBioconductor
				? `${citationPathPrefix}reference-manual.md:335-343 (<Package> <version>)`
				: undefined
		),
		xmlPathBlock('focus_paths', focusPaths),
		xmlLine('special_notes', resource.specialAgentInstructions),
		'\t</resource>'
	]
		.filter(Boolean)
		.join('\n');
};

const createCollectionInstructions = (
	resources: readonly FsResource[],
	metadataResources: readonly VirtualResourceMetadata[],
	collectionPath: string,
	scope: 'single_package' | 'broad' | 'multi_resource' | 'single_resource',
	unavailableResources: readonly UnavailableResource[] = []
) => {
	const metadataByName = new Map(metadataResources.map((resource) => [resource.name, resource]));
	const scopeRule =
		scope === 'single_package'
			? 'The tools are rooted inside one package directory. Search it directly; the sandbox prevents searching sibling resources.'
			: scope === 'broad'
				? 'This is the broad Bioconductor scope. Search named packages directly when known; consult the generated root DIRECTORY.md only when resource identity is unclear.'
				: scope === 'multi_resource'
					? 'This question explicitly selected multiple authoritative resources. Search those resources directly; consult the generated root DIRECTORY.md only if a mounted name or path is unclear.'
					: 'This question selected one resource. Search it directly; use its focus paths or routing files only when navigation is unclear.';

	return [
		`<query_scope mode="${scope}">`,
		`\t<tool_root>${escapeXml(collectionPath)}</tool_root>`,
		`\t<scope_rule>${escapeXml(scopeRule)}</scope_rule>`,
		'</query_scope>',
		'<available_resources>',
		...resources.map((resource) =>
			createCollectionInstructionBlock(resource, metadataByName.get(resource.name), collectionPath)
		),
		'</available_resources>',
		...(unavailableResources.length > 0
			? [
					'<unavailable_resources>',
					...unavailableResources.map(
						(resource) =>
							`\t<resource name="${escapeXml(resource.name)}">${escapeXml(resource.error)}</resource>`
					),
					'</unavailable_resources>'
				]
			: [])
	].join('\n');
};

const COLLECTION_DIRECTORY_FILE = '/DIRECTORY.md';

type UnavailableResource = { name: string; error: string };

const findRoutingFiles = async (resource: FsResource, vfsId: string): Promise<string[]> => {
	const resourceRoot = path.posix.join('/', resource.fsName);
	const candidates = [
		...resource.repoSubPaths.flatMap((subPath) => [
			path.posix.join(resourceRoot, subPath, 'DIRECTORY.md'),
			path.posix.join(resourceRoot, subPath, 'README.md')
		]),
		path.posix.join(resourceRoot, 'DIRECTORY.md'),
		path.posix.join(resourceRoot, 'README.md')
	];
	const found: string[] = [];
	for (const candidate of candidates) {
		if ((await existsInVirtualFs(candidate, vfsId)) && !found.includes(candidate)) {
			found.push(candidate.replace(/^\//u, ''));
		}
	}
	return found;
};

const writeCollectionDirectory = async (args: {
	resources: readonly FsResource[];
	metadataResources: readonly VirtualResourceMetadata[];
	vfsId: string;
	scope: 'broad' | 'multi_resource' | 'single_resource';
	unavailableResources?: readonly UnavailableResource[];
}) => {
	const metadataByName = new Map(
		args.metadataResources.map((resource) => [resource.name, resource])
	);
	const lines = [
		'# Resource directory',
		'',
		args.scope === 'broad'
			? 'This routing index is generated for the current broad query from configured resources and valid managed Bioconductor package caches.'
			: 'This routing index is generated from the resources mounted for the current query.',
		`Scope: ${args.scope}. Resources: ${args.resources.length}.`,
		'',
		'Search named resources directly. Use this index and a resource README.md or DIRECTORY.md only when its identity, focus, or path is unclear.',
		''
	];

	for (const resource of args.resources) {
		const metadata = metadataByName.get(resource.name);
		const routingFiles = await findRoutingFiles(resource, args.vfsId);
		lines.push(
			`## ${resource.name}`,
			'',
			`- Type: ${getResourceTypeLabel(resource)}`,
			`- Tool path: \`${resource.fsName}/\``,
			...(metadata?.package ? [`- Package: ${metadata.package}`] : []),
			...(metadata?.version ? [`- Version: ${metadata.version}`] : []),
			...(resource.repoSubPaths.length > 0
				? [
						`- Focus paths: ${resource.repoSubPaths.map((item) => `\`${resource.fsName}/${item}\``).join(', ')}`
					]
				: []),
			...(routingFiles.length > 0
				? [`- Start here: ${routingFiles.map((item) => `[\`${item}\`](${item})`).join(', ')}`]
				: []),
			''
		);
	}

	if (args.unavailableResources && args.unavailableResources.length > 0) {
		lines.push(
			'## Unavailable resources',
			'',
			'These resources could not be mounted for this query. Do not rely on them as evidence.',
			'',
			...args.unavailableResources.map((resource) => `- \`${resource.name}\`: ${resource.error}`),
			''
		);
	}

	await writeVirtualFsFile(COLLECTION_DIRECTORY_FILE, `${lines.join('\n').trim()}\n`, args.vfsId);
};

const ignoreErrors = async (action: () => Promise<unknown>) => {
	try {
		await action();
	} catch {
		return;
	}
};

const LOCAL_RESOURCE_IGNORED_DIRECTORIES = new Set([
	'.git',
	'.turbo',
	'.cache',
	'coverage',
	'dist',
	'build',
	'out',
	'node_modules',
	// R / Bioconductor build and check artifacts
	'.Rproj.user',
	'.Rcheck',
	'src-i386',
	'src-x64',
	'renv'
]);

const normalizeRelativePath = (value: string) => value.split(path.sep).join('/');

const shouldIgnoreImportedPath = (args: {
	resource: FsResource;
	relativePath: string;
	bioconductorMetadata?: BioconductorResourceMetadata;
	ignoredPaths?: ReadonlySet<string>;
}) => {
	const normalized = normalizeRelativePath(args.relativePath);
	if (!normalized || normalized === '.') return false;
	const segments = normalized.split('/');
	if (segments.includes('.git')) return true;
	if (args.ignoredPaths?.has(normalized)) return true;
	if (
		args.resource.type === 'bioconductor' &&
		args.bioconductorMetadata &&
		shouldIgnoreManagedBioconductorSearchPath(args.bioconductorMetadata, normalized)
	)
		return true;
	if (args.resource.type !== 'local') return false;
	return segments.some((segment) => LOCAL_RESOURCE_IGNORED_DIRECTORIES.has(segment));
};

type ManagedBioconductorSearchContext = {
	readonly metadata: BioconductorResourceMetadata;
	readonly sourceFiles: readonly string[];
};

const buildCorpusIgnoredPaths = async (args: {
	resourcePath: string;
	managedPackages: ReadonlyMap<string, ManagedBioconductorSearchContext>;
}): Promise<Set<string>> => {
	const ignored = new Set<string>();
	if (args.managedPackages.size === 0) return ignored;
	const corpusRoot = await findCorpusRootWithinResource(args.resourcePath);
	if (!corpusRoot) return ignored;

	for (const { metadata, sourceFiles } of args.managedPackages.values()) {
		const corpusPackage = await findCorpusPackage(corpusRoot, metadata.package);
		if (!corpusPackage) continue;
		for (const document of corpusPackage.documents) {
			const provenance = corpusPackage.provenance.get(document);
			if (!provenance || !isRedundantCuratedDocument(metadata, document, provenance, sourceFiles))
				continue;
			ignored.add(
				normalizeRelativePath(
					path.relative(args.resourcePath, path.join(corpusPackage.directory, document))
				)
			);
		}
	}
	return ignored;
};

const readManagedSourceFiles = async (resourcePath: string): Promise<readonly string[]> => {
	try {
		const value: unknown = JSON.parse(
			await fs.readFile(path.join(resourcePath, 'source', 'MANIFEST.json'), 'utf8')
		);
		const files =
			value && typeof value === 'object' && Array.isArray((value as { files?: unknown }).files)
				? (value as { files: unknown[] }).files
				: [];
		if (!files.every((file): file is string => typeof file === 'string')) return [];
		return files;
	} catch {
		return [];
	}
};

const listGitVisiblePaths = async (resourcePath: string) => {
	try {
		const proc = Bun.spawn(
			['git', 'ls-files', '-z', '--cached', '--others', '--exclude-standard'],
			{
				cwd: resourcePath,
				stdout: 'pipe',
				stderr: 'ignore'
			}
		);
		const stdout = await new Response(proc.stdout).text();
		const exitCode = await proc.exited;
		if (exitCode !== 0) return null;
		return stdout
			.split('\0')
			.map((entry) => entry.trim())
			.filter((entry) => entry.length > 0);
	} catch {
		return null;
	}
};

const initVirtualRoot = async (collectionPath: string, vfsId: string) => {
	try {
		await mkdirVirtualFs(collectionPath, { recursive: true }, vfsId);
	} catch (cause) {
		throw new CollectionError({
			message: `Failed to initialize virtual collection root: "${collectionPath}"`,
			hint: 'Check that the virtual filesystem is available.',
			cause
		});
	}
};

const loadResource = async (resources: ResourcesService, name: string, quiet: boolean) => {
	try {
		return await resources.loadPromise(name, { quiet });
	} catch (cause) {
		const underlyingHint = getErrorHint(cause);
		const underlyingMessage = getErrorMessage(cause);
		throw new CollectionError({
			message: `Failed to load resource "${name}": ${underlyingMessage}`,
			hint:
				underlyingHint ??
				`${CommonHints.CLEAR_CACHE} Check that the resource "${name}" is correctly configured.`,
			cause
		});
	}
};

const resolveResourcePath = async (resource: FsResource) => {
	try {
		return await resource.getAbsoluteDirectoryPath();
	} catch (cause) {
		throw new CollectionError({
			message: `Failed to get path for resource "${resource.name}"`,
			hint: CommonHints.CLEAR_CACHE,
			cause
		});
	}
};

const assertUniqueResourceMounts = (resources: readonly FsResource[]) => {
	const owners = new Map<string, string>();
	for (const resource of resources) {
		const existing = owners.get(resource.fsName);
		if (existing) {
			throw new CollectionError({
				message: `Resources "${existing}" and "${resource.name}" resolve to the same collection path "${resource.fsName}".`,
				hint: 'Select only one of the conflicting configured or explicit package references.'
			});
		}
		owners.set(resource.fsName, resource.name);
	}
};

const virtualizeResource = async (args: {
	resource: FsResource;
	resourcePath: string;
	virtualResourcePath: string;
	vfsId: string;
	bioconductorMetadata?: BioconductorResourceMetadata;
	ignoredPaths?: ReadonlySet<string>;
}) => {
	try {
		if (args.resource.type === 'local') {
			const gitVisiblePaths = await listGitVisiblePaths(args.resourcePath);
			if (gitVisiblePaths) {
				await importPathsIntoVirtualFs({
					sourcePath: args.resourcePath,
					destinationPath: args.virtualResourcePath,
					relativePaths: gitVisiblePaths.filter(
						(relativePath) =>
							!shouldIgnoreImportedPath({
								resource: args.resource,
								relativePath,
								bioconductorMetadata: args.bioconductorMetadata,
								ignoredPaths: args.ignoredPaths
							})
					),
					vfsId: args.vfsId
				});
				return;
			}
		}

		await importDirectoryIntoVirtualFs({
			sourcePath: args.resourcePath,
			destinationPath: args.virtualResourcePath,
			vfsId: args.vfsId,
			ignore: (relativePath) =>
				shouldIgnoreImportedPath({
					resource: args.resource,
					relativePath,
					bioconductorMetadata: args.bioconductorMetadata,
					ignoredPaths: args.ignoredPaths
				})
		});
	} catch (cause) {
		throw new CollectionError({
			message: `Failed to virtualize resource "${args.resource.name}"`,
			hint: CommonHints.CLEAR_CACHE,
			cause
		});
	}
};

const getGitHeadHash = async (resourcePath: string) => {
	try {
		const proc = Bun.spawn(['git', 'rev-parse', 'HEAD'], {
			cwd: resourcePath,
			stdout: 'pipe',
			stderr: 'pipe'
		});
		const stdout = await new Response(proc.stdout).text();
		const exitCode = await proc.exited;
		if (exitCode !== 0) return undefined;
		const trimmed = stdout.trim();
		return trimmed.length > 0 ? trimmed : undefined;
	} catch {
		return undefined;
	}
};

const getGitHeadBranch = async (resourcePath: string) => {
	try {
		const proc = Bun.spawn(['git', 'rev-parse', '--abbrev-ref', 'HEAD'], {
			cwd: resourcePath,
			stdout: 'pipe',
			stderr: 'pipe'
		});
		const stdout = await new Response(proc.stdout).text();
		const exitCode = await proc.exited;
		if (exitCode !== 0) return undefined;
		const trimmed = stdout.trim();
		if (!trimmed || trimmed === 'HEAD') return undefined;
		return trimmed;
	} catch {
		return undefined;
	}
};

const ANON_PREFIX = 'anonymous:';
const getAnonymousUrlFromName = (name: string) =>
	name.startsWith(ANON_PREFIX) ? name.slice(ANON_PREFIX.length) : undefined;
const buildVirtualMetadata = async (args: {
	resource: FsResource;
	resourcePath: string;
	loadedAt: string;
	definition?: ReturnType<ConfigServiceShape['getResource']>;
}) => {
	const base = {
		name: args.resource.name,
		fsName: args.resource.fsName,
		type: args.resource.type,
		path: args.resourcePath,
		repoSubPaths: args.resource.repoSubPaths,
		loadedAt: args.loadedAt
	};

	if (args.resource.type === 'bioconductor') {
		// The materializer records the exact package, version, and landing page it
		// downloaded, which is what the citation instructions need.
		const meta = await readBioconductorResourceMetadata(args.resourcePath);
		if (!meta) return base;
		return {
			...base,
			...(meta.package ? { package: meta.package } : {}),
			version: meta.bioconductor.packageVersion,
			bioconductorRelease: meta.bioconductor.release,
			url: meta.bioconductor.landingUrl,
			...(meta.curatedFrom ? { curatedFrom: meta.curatedFrom } : {}),
			sourceRepositoryUrl: meta.repository.url,
			sourceRepositoryKind: meta.repository.kind,
			...(isBioconductorGitSourceMetadata(meta.repository)
				? { sourceBranch: meta.repository.branch, sourceCommit: meta.repository.commit }
				: {}),
			descriptionVersion: meta.repository.descriptionVersion,
			bioconductorMetadata: meta
		};
	}

	if (args.resource.type === 'cran') {
		const meta = await readCranResourceMetadata(args.resourcePath);
		if (!meta) return base;
		return {
			...base,
			package: meta.package,
			version: meta.cran.version,
			url: meta.cran.landingUrl,
			sourceRepositoryUrl: meta.cran.sourceUrl,
			cranMetadata: meta
		};
	}

	if (args.resource.type !== 'git') return base;

	const configuredDefinition =
		args.definition && isGitResource(args.definition) ? args.definition : null;
	const url = configuredDefinition?.url ?? getAnonymousUrlFromName(args.resource.name);
	const branch = configuredDefinition?.branch ?? (await getGitHeadBranch(args.resourcePath));
	const commit = await getGitHeadHash(args.resourcePath);

	return {
		...base,
		...(url ? { url } : {}),
		...(branch ? { branch } : {}),
		...(commit ? { commit } : {})
	};
};

export const createCollectionsService = (args: {
	config: ConfigServiceShape;
	resources: ResourcesService;
}): CollectionsService => {
	const loadPromise: CollectionsService['loadPromise'] = ({
		resourceNames,
		quiet = false,
		scope = 'focused'
	}) =>
		runTransaction('collections.load', async () => {
			const uniqueNames = Array.from(new Set(resourceNames));
			if (uniqueNames.length === 0)
				throw new CollectionError({
					message: 'Cannot create collection with no resources',
					hint: `${CommonHints.LIST_RESOURCES} ${CommonHints.ADD_RESOURCE}`
				});

			metricsInfo('collections.load', { resources: uniqueNames, quiet, scope });

			const sortedNames = [...uniqueNames].sort((a, b) => a.localeCompare(b));
			const key = getCollectionKey(sortedNames, scope);
			const virtualRoot = '/';
			const vfsId = createVirtualFs();
			const cleanupVirtual = () => {
				disposeVirtualFs(vfsId);
				clearQueryFileCache(vfsId);
				clearVirtualCollectionMetadata(vfsId);
			};
			const cleanupResources = (resources: FsResource[]) =>
				Promise.all(
					resources.map(async (resource) => {
						if (!resource.cleanup) return;
						await ignoreErrors(() => resource.cleanup!());
					})
				);

			const loadedResources: FsResource[] = [];
			const unavailableResources: UnavailableResource[] = [];

			try {
				await initVirtualRoot(virtualRoot, vfsId);

				for (const name of sortedNames) {
					try {
						const resource = await loadResource(args.resources, name, quiet);
						loadedResources.push(resource);
					} catch (cause) {
						if (scope !== 'broad') throw cause;
						unavailableResources.push({ name, error: getErrorMessage(cause) });
					}
				}
				if (loadedResources.length === 0) {
					throw new CollectionError({
						message: 'None of the broad-scope resources could be loaded',
						hint: unavailableResources.map((resource) => resource.error).join(' ')
					});
				}
				assertUniqueResourceMounts(loadedResources);
				const resolvedPaths = new Map<FsResource, string>();
				for (const resource of loadedResources) {
					const resourcePath = await resolveResourcePath(resource);
					resolvedPaths.set(resource, resourcePath);
				}
				const bioconductorMetadataByResource = new Map<FsResource, BioconductorResourceMetadata>();
				const bioconductorSourceFilesByResource = new Map<FsResource, readonly string[]>();
				const managedPackages = new Map<string, ManagedBioconductorSearchContext>();
				for (const resource of loadedResources) {
					if (resource.type !== 'bioconductor') continue;
					const metadata = await readBioconductorResourceMetadata(resolvedPaths.get(resource)!);
					if (!metadata) continue;
					const sourceFiles = await readManagedSourceFiles(resolvedPaths.get(resource)!);
					bioconductorMetadataByResource.set(resource, metadata);
					bioconductorSourceFilesByResource.set(resource, sourceFiles);
					managedPackages.set(metadata.package.toLowerCase(), { metadata, sourceFiles });
				}
				const ignoredPathsByResource = new Map<FsResource, ReadonlySet<string>>();
				for (const resource of loadedResources) {
					const ignored = await buildCorpusIgnoredPaths({
						resourcePath: resolvedPaths.get(resource)!,
						managedPackages
					});
					if (resource.type === 'bioconductor') {
						const metadata = bioconductorMetadataByResource.get(resource);
						const sourceFiles = bioconductorSourceFilesByResource.get(resource);
						const managedIgnored =
							metadata && sourceFiles
								? additionalManagedBioconductorIgnoredPaths(metadata, sourceFiles)
								: new Set<string>();
						for (const relativePath of managedIgnored) ignored.add(relativePath);
					}
					if (ignored.size > 0) ignoredPathsByResource.set(resource, ignored);
				}

				const metadataResources: VirtualResourceMetadata[] = [];
				const loadedAt = new Date().toISOString();
				for (const resource of loadedResources) {
					const resourcePath = resolvedPaths.get(resource)!;
					const virtualResourcePath = path.posix.join('/', resource.fsName);

					await ignoreErrors(() =>
						rmVirtualFs(virtualResourcePath, { recursive: true, force: true }, vfsId)
					);

					await virtualizeResource({
						resource,
						resourcePath,
						virtualResourcePath,
						vfsId,
						bioconductorMetadata: bioconductorMetadataByResource.get(resource),
						ignoredPaths: ignoredPathsByResource.get(resource)
					});

					const definition = args.config.getResource(resource.name);
					const metadata = await buildVirtualMetadata({
						resource,
						resourcePath,
						loadedAt,
						definition
					});
					if (metadata) metadataResources.push(metadata);
				}

				setVirtualCollectionMetadata({
					vfsId,
					collectionKey: key,
					createdAt: loadedAt,
					resources: metadataResources,
					trace: createQueryEvidenceTrace()
				});

				const isSinglePackage =
					scope === 'focused' &&
					loadedResources.length === 1 &&
					(loadedResources[0]?.type === 'bioconductor' || loadedResources[0]?.type === 'cran');
				const collectionPath = isSinglePackage
					? path.posix.join('/', loadedResources[0]!.fsName)
					: virtualRoot;
				const instructionScope = isSinglePackage
					? 'single_package'
					: scope === 'broad'
						? 'broad'
						: loadedResources.length > 1
							? 'multi_resource'
							: 'single_resource';

				if (!isSinglePackage) {
					await writeCollectionDirectory({
						resources: loadedResources,
						metadataResources,
						vfsId,
						scope: instructionScope as 'broad' | 'multi_resource' | 'single_resource',
						unavailableResources
					});
				}

				return {
					path: collectionPath,
					agentInstructions: createCollectionInstructions(
						loadedResources,
						metadataResources,
						collectionPath,
						instructionScope,
						unavailableResources
					),
					vfsId,
					cleanup: async () => {
						await cleanupResources(loadedResources);
					}
				};
			} catch (cause) {
				cleanupVirtual();
				await cleanupResources(loadedResources);
				if (cause instanceof CollectionError) throw cause;
				throw new CollectionError({
					message: 'Failed to load resource collection',
					hint: CommonHints.CLEAR_CACHE,
					cause
				});
			}
		});

	const load: CollectionsService['load'] = ({ resourceNames, quiet, scope }) =>
		Effect.tryPromise({
			try: () => loadPromise({ resourceNames, quiet, scope }),
			catch: (cause) =>
				cause instanceof CollectionError
					? cause
					: new CollectionError({
							message: 'Failed to load resource collection',
							hint: CommonHints.CLEAR_CACHE,
							cause
						})
		});

	return {
		load,
		loadPromise
	};
};
