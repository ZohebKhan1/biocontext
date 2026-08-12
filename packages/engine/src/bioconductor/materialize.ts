/**
 * Turn a Bioconductor package into a small local Markdown corpus.
 *
 * Everything is fetched from bioconductor.org and written under the resource
 * cache as plain Markdown, so the same retrieval tools that search a Git
 * resource work unchanged.
 */

import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { metricsInfo } from '../metrics/index.ts';

import {
	archivedSourceArchiveUrl,
	newsUrl,
	packageLandingUrl,
	rFileUrl,
	referenceManualUrl,
	sourceArchiveUrl,
	vignetteUrl,
	describeRepository,
	detectVignetteFormat,
	type BioconductorPackage
} from './catalog.ts';
import { parseDcf } from './dcf.ts';
import { extractPdfText, repairUtf8ByteTokens } from './pdf-text.ts';
import { resolveBioconductorDocuments, type BioconductorDocumentType } from '../resources/schema.ts';
import { copyCorpusPackage, findCorpusPackage, findCorpusRoot } from './corpus.ts';
import { htmlToMarkdown } from './html-to-markdown.ts';
import {
	BIOCONDUCTOR_METADATA_FILE,
	BIOCONDUCTOR_RESOURCE_CACHE_VERSION,
	FULL_GIT_COMMIT_PATTERN,
	getVersionRelationship,
	inspectBioconductorArtifactPath,
	isBioconductorGitSourceMetadata,
	readBioconductorResourceMetadata,
	type BioconductorDocumentRecord,
	type BioconductorRepositoryMetadata,
	type BioconductorResourceMetadata
} from './metadata.ts';
import { readResponseBytesBounded } from '../cran/io.ts';
import { extractPackageSourceArchive } from '../package-source-archive.ts';
import { isNumberedBioconductorRelease } from './release.ts';
import { withBioconductorPackageMutation } from './package-mutation.ts';
import {
	BIOCONDUCTOR_SOURCE_POLICY_VERSION,
	formatSourceDirectory,
	isExcludedSourcePath,
	isSourceRootPath,
	shouldKeepSourcePath,
	sourceSparseCheckoutPatterns,
	type SourceInventory
} from './source-policy.ts';

export { BIOCONDUCTOR_METADATA_FILE, BIOCONDUCTOR_RESOURCE_CACHE_VERSION, readBioconductorResourceMetadata };
export type { BioconductorDocumentRecord, BioconductorResourceMetadata };
/** Subdirectory holding the mandatory source snapshot, beside `vignettes/`. */
export const BIOCONDUCTOR_SOURCE_DIR = 'source';
/** Subdirectory holding the curated corpus documents for this package. */
export const BIOCONDUCTOR_CORPUS_DIR = 'curated';
/** Subdirectory holding vignettes and their purled R scripts. */
export const BIOCONDUCTOR_VIGNETTES_DIR = 'vignettes';
export const BIOCONDUCTOR_MANUAL_FILE = 'reference-manual.md';
export const BIOCONDUCTOR_SOURCE_MANIFEST_FILE = 'MANIFEST.json';
export const BIOCONDUCTOR_SOURCE_DIRECTORY_FILE = 'DIRECTORY.md';
const FETCH_TIMEOUT_MS = 120_000;
const CLONE_TIMEOUT_MS = 300_000;
const MAX_SOURCE_ARCHIVE_BYTES = 128 * 1024 * 1024;
const MAX_SOURCE_UNCOMPRESSED_BYTES = 512 * 1024 * 1024;
const MAX_SOURCE_FILE_BYTES = 32 * 1024 * 1024;
const MAX_RETAINED_SOURCE_BYTES = 256 * 1024 * 1024;
const MAX_SOURCE_ARCHIVE_ENTRIES = 100_000;

/**
 * Filesystem-safe slug for a vignette title.
 *
 * Some packages publish a file name as the vignette title, so a trailing
 * document extension is dropped to avoid names like `intro.html.md`.
 */
const slugify = (value: string): string =>
	value
		.normalize('NFKD')
		.replace(/\.(html?|pdf|rmd|rnw|md|tex)$/i, '')
		.replace(/[^\w\s.-]/g, '')
		.trim()
		.replace(/\s+/g, '-')
		.replace(/-{2,}/g, '-')
		.replace(/^[.-]+|[.-]+$/g, '')
		.slice(0, 80) || 'vignette';

type FetchOutcome<T> =
	| { readonly ok: true; readonly value: T }
	| { readonly ok: false; readonly error: string; readonly status?: number };

const describeFetchError = (cause: unknown): string =>
	cause instanceof Error ? cause.message : String(cause);

type FetchImplementation = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

const fetchText = async (
	url: string,
	fetchImplementation: FetchImplementation
): Promise<FetchOutcome<string>> => {
	try {
		const response = await fetchImplementation(url, {
			signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
			headers: { accept: 'text/html, text/plain, */*' }
		});
		if (!response.ok)
			return { ok: false, error: `HTTP ${response.status}`, status: response.status };
		return { ok: true, value: await response.text() };
	} catch (cause) {
		return { ok: false, error: describeFetchError(cause) };
	}
};

/**
 * Fetch binary content.
 *
 * PDFs must never go through the text path: decoding a PDF as UTF-8 yields
 * mojibake that looks like a successful download and gets cached as one.
 */
const hasPdfSignature = (value: ArrayBuffer): boolean => {
	const bytes = new Uint8Array(value, 0, Math.min(value.byteLength, 5));
	return bytes.length === 5 && new TextDecoder('ascii').decode(bytes) === '%PDF-';
};

const fetchBytes = async (
	url: string,
	fetchImplementation: FetchImplementation
): Promise<FetchOutcome<ArrayBuffer>> => {
	try {
		const response = await fetchImplementation(url, {
			signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
			headers: { accept: 'application/pdf, */*' }
		});
		if (!response.ok)
			return { ok: false, error: `HTTP ${response.status}`, status: response.status };
		const value = await response.arrayBuffer();
		if (!hasPdfSignature(value)) {
			const contentType = response.headers.get('content-type')?.split(';', 1)[0]?.trim();
			return {
				ok: false,
				error: `expected a PDF but received ${contentType || 'non-PDF content'}`
			};
		}
		return { ok: true, value };
	} catch (cause) {
		return { ok: false, error: describeFetchError(cause) };
	}
};

const looksLikeHtmlDocument = (value: string): boolean =>
	/^\s*(?:<!doctype\s+html\b|<html\b)/iu.test(value);

const looksLikePdfDocument = (value: string): boolean => /^\s*%PDF-/u.test(value);

const normalizedDocumentTitle = (value: string): string =>
	value
		.normalize('NFKC')
		.replace(/[\s:.-]+/gu, ' ')
		.trim()
		.toLocaleLowerCase();

/** Avoid repeating the title when the PDF itself begins with the same title. */
const removeDuplicatePdfTitle = (title: string, text: string): string => {
	const match = /^\s*([^\r\n]+)\r?\n/u.exec(text);
	if (!match || normalizedDocumentTitle(match[1] ?? '') !== normalizedDocumentTitle(title))
		return text;
	return text.slice(match[0].length).replace(/^\n/u, '');
};

const renderIndex = (
	pkg: BioconductorPackage,
	release: string,
	documentRecords: readonly BioconductorDocumentRecord[],
	metadata: Pick<BioconductorResourceMetadata, 'repository' | 'versionRelationship' | 'curatedFrom'>
): string => {
	const documents = documentRecords
		.filter((document) => document.status === 'ok')
		.map((document) => document.path);
	const curatedDocuments = documentRecords.filter(
		(document) => document.sourceType === 'curated' && document.status === 'ok'
	);
	const failedDocuments = documentRecords.filter((document) => document.status === 'failed');
	const skippedDocuments = documentRecords.filter((document) => document.status === 'skipped');
	const lines = [
		`# ${pkg.name}`,
		'',
		pkg.title ? `**${repairUtf8ByteTokens(pkg.title)}**` : '',
		'',
		`- Package: \`${pkg.name}\``,
		`- Version: ${pkg.version}`,
		`- Bioconductor release: ${release}`,
		`- Repository: ${describeRepository(pkg.repository)}`,
		`- Landing page: ${packageLandingUrl(pkg, release)}`,
		pkg.maintainer ? `- Maintainer: ${repairUtf8ByteTokens(pkg.maintainer)}` : '',
		pkg.url ? `- Project URL: ${pkg.url}` : '',
		pkg.gitUrl ? `- Published Git source: ${pkg.gitUrl}` : '',
		'',
		'## Description',
		'',
		repairUtf8ByteTokens(pkg.description) || '_No description published._',
		''
	];

	if (pkg.biocViews.length > 0) {
		lines.push('## biocViews', '', pkg.biocViews.map((view) => `- ${view}`).join('\n'), '');
	}

	if (documents.length > 0) {
		lines.push(
			'## Documents in this resource',
			'',
			documents.map((file) => `- [${file}](${file})`).join('\n'),
			''
		);
	}

	if (failedDocuments.length > 0) {
		lines.push(
			'## Documents pending retry',
			'',
			'These published documents could not be prepared. Reinstall this package through /add to retry them.',
			'',
			failedDocuments
				.map((document) => `- \`${document.path}\`: ${document.error ?? 'download failed'}`)
				.join('\n'),
			''
		);
	}

	if (skippedDocuments.length > 0) {
		lines.push(
			'## Unavailable documents',
			'',
			skippedDocuments
				.map((document) => `- \`${document.path}\`: ${document.error ?? 'not published'}`)
				.join('\n'),
			''
		);
	}

	if (metadata.curatedFrom && curatedDocuments.length > 0) {
		lines.push(
			'## Curated documents',
			'',
			`Hand-curated documentation for this package, under \`${BIOCONDUCTOR_CORPUS_DIR}/\`.`,
			`These come from the bundled corpus (\`${metadata.curatedFrom}\`) and retain independent per-document provenance.`,
			'',
			curatedDocuments.map((document) => `- [${document.path}](${document.path})`).join('\n'),
			''
		);
	}

	const sourceLines = isBioconductorGitSourceMetadata(metadata.repository)
		? [
				'- Source type: explicit Git override',
				`- Repository: ${metadata.repository.url}`,
				`- Checked-out branch: ${metadata.repository.branch}`,
				`- Commit: ${metadata.repository.commit}`
			]
		: [
				'- Source type: exact Bioconductor source release',
				`- Source archive: ${metadata.repository.url}`,
				`- Source SHA-256: ${metadata.repository.sha256}`
			];
	lines.push(
		'## Package source',
		'',
		`The filtered package source is stored under \`${BIOCONDUCTOR_SOURCE_DIR}/\`.`,
		...sourceLines,
		`- DESCRIPTION package/version: ${metadata.repository.descriptionPackage} ${metadata.repository.descriptionVersion}`,
		`- Filtered source files: ${metadata.repository.fileCount} (${metadata.repository.bytes} bytes)`,
		`- \`${BIOCONDUCTOR_SOURCE_DIR}/R/\` holds the implementation, \`${BIOCONDUCTOR_SOURCE_DIR}/man/\` the Rd help pages,`,
		`  and \`${BIOCONDUCTOR_SOURCE_DIR}/DESCRIPTION\` the dependency and version metadata.`,
		`- \`${BIOCONDUCTOR_SOURCE_DIR}/${BIOCONDUCTOR_SOURCE_DIRECTORY_FILE}\` lists the filtered files and what was omitted.`,
		''
	);

	lines.push(
		'## Citation guidance',
		'',
		`Cite files in this resource by their path (for example \`${pkg.name}/${documents[0] ?? 'README.md'}\`)`,
		`and link readers to ${packageLandingUrl(pkg, release)}.`,
		`This is ${pkg.name} ${pkg.version} from Bioconductor ${release}; state the version when behavior is version-specific.`,
		''
	);

	return lines.filter((line, index, all) => !(line === '' && all[index - 1] === '')).join('\n');
};

export type MaterializeResult = {
	readonly directory: string;
	readonly metadata: BioconductorResourceMetadata;
	/** False when a matching version was already on disk and nothing was downloaded. */
	readonly downloaded: boolean;
};

const pathExistsAs = async (target: string, kind: 'file' | 'directory'): Promise<boolean> => {
	try {
		const stats = await fs.stat(target);
		return kind === 'file' ? stats.isFile() && stats.size > 0 : stats.isDirectory();
	} catch {
		return false;
	}
};

const sameValues = (left: readonly string[] | undefined, right: readonly string[]): boolean =>
	left !== undefined && [...left].sort().join('\0') === [...right].sort().join('\0');

const hasExpectedDocumentInventory = (
	metadata: BioconductorResourceMetadata,
	pkg: BioconductorPackage,
	release: string,
	requested: readonly BioconductorDocumentType[]
): boolean => {
	const expected = [
		...(requested.includes('vignettes')
			? pkg.vignettes.map((vignette) => ({
					originType: 'vignette' as const,
					originUrl: vignetteUrl(pkg, vignette, release)
				}))
			: []),
		...(requested.includes('vignetteScripts')
			? pkg.rFiles.map((rFile) => ({
					originType: 'vignette_script' as const,
					originUrl: rFileUrl(pkg, rFile, release)
				}))
			: []),
		...(requested.includes('manual')
			? [{ originType: 'reference_manual' as const, originUrl: referenceManualUrl(pkg, release) }]
			: []),
		...(requested.includes('news')
			? [{ originType: 'news' as const, originUrl: newsUrl(pkg, release) }]
			: [])
	];

	return (
		metadata.documents.filter((document) => document.sourceType === 'bioconductor').length ===
			expected.length &&
		expected.every((item) =>
			metadata.documents.some(
				(document) =>
					document.sourceType === 'bioconductor' &&
					document.originType === item.originType &&
					document.originUrl === item.originUrl
			)
		)
	);
};

const hasRequiredPublishedEvidence = (metadata: BioconductorResourceMetadata): boolean =>
	metadata.documents.some(
		(document) =>
			document.sourceType === 'bioconductor' &&
			document.status === 'ok' &&
			(document.originType === 'vignette' || document.originType === 'reference_manual')
	);

export const isCompleteBioconductorResourceCache = async (
	directory: string,
	metadata: BioconductorResourceMetadata
): Promise<boolean> => {
	if (!hasRequiredPublishedEvidence(metadata)) return false;
	if (!isNumberedBioconductorRelease(metadata.bioconductor.release)) return false;
	if (metadata.repository.descriptionPackage !== metadata.package) return false;
	if (metadata.repository.descriptionVersion !== metadata.bioconductor.packageVersion) return false;
	if (metadata.versionRelationship !== 'aligned') return false;
	if (
		isBioconductorGitSourceMetadata(metadata.repository) &&
		!FULL_GIT_COMMIT_PATTERN.test(metadata.repository.commit)
	)
		return false;
	if ((await inspectBioconductorArtifactPath(directory, 'README.md', 'file')) !== 'ok') return false;
	for (const document of metadata.documents) {
		if (document.status !== 'ok') continue;
		if ((await inspectBioconductorArtifactPath(directory, document.path, 'file')) !== 'ok') return false;
	}
	if ((await inspectBioconductorArtifactPath(directory, BIOCONDUCTOR_SOURCE_DIR, 'directory')) !== 'ok')
		return false;
	{
		const sourceDirectory = path.join(directory, BIOCONDUCTOR_SOURCE_DIR);
		if (
			(await inspectBioconductorArtifactPath(
				directory,
				`${BIOCONDUCTOR_SOURCE_DIR}/${BIOCONDUCTOR_SOURCE_DIRECTORY_FILE}`,
				'file'
			)) !== 'ok'
		)
			return false;
		if (
			(await inspectBioconductorArtifactPath(
				directory,
				`${BIOCONDUCTOR_SOURCE_DIR}/${BIOCONDUCTOR_SOURCE_MANIFEST_FILE}`,
				'file'
			)) !== 'ok'
		)
			return false;
		try {
			const inventory = JSON.parse(
				await fs.readFile(path.join(sourceDirectory, BIOCONDUCTOR_SOURCE_MANIFEST_FILE), 'utf8')
			) as Partial<SourceInventory>;
			if (
				inventory.policyVersion !== metadata.repository.sourcePolicyVersion ||
				inventory.fileCount !== metadata.repository.fileCount ||
				inventory.bytes !== metadata.repository.bytes ||
				inventory.omittedCount !== metadata.repository.omittedCount ||
				!Array.isArray(inventory.files) ||
				!inventory.files.includes('DESCRIPTION') ||
				!inventory.files.includes('NAMESPACE') ||
				inventory.files.some((file) => typeof file !== 'string' || !shouldKeepSourcePath(file))
			)
				return false;
			for (const file of inventory.files) {
				if (
					(await inspectBioconductorArtifactPath(directory, `${BIOCONDUCTOR_SOURCE_DIR}/${file}`, 'file')) !== 'ok'
				)
					return false;
			}
			const description = await readDescriptionIdentity(sourceDirectory);
			if (
				description.package !== metadata.repository.descriptionPackage ||
				description.version !== metadata.repository.descriptionVersion
			)
				return false;
		} catch {
			return false;
		}
	}
	return true;
};

export type MaterializeOptions = {
	readonly pkg: BioconductorPackage;
	readonly release: string;
	readonly directory: string;
	/** Which published documents to download; omitted means all. */
	readonly documents?: readonly BioconductorDocumentType[];
	/** Include bundled curated documents; false keeps only release docs and source. */
	readonly includeCurated?: boolean;
	/** Where cloned resources live, used to locate the bundled corpus. */
	readonly resourcesDirectory?: string;
	/** Extra places to look for the corpus, e.g. a repository checkout in dev. */
	readonly corpusCandidates?: readonly string[];
	/** A string pins a custom repository. Booleans are legacy and both mean automatic source. */
	readonly source?: boolean | string;
	readonly sourceBranch?: string;
	/** Pin an explicit Git source to an immutable commit. */
	readonly sourceCommit?: string;
	/** Refetch even when the cached copy matches the published version. */
	readonly refresh?: boolean;
	readonly quiet?: boolean;
};

export type MaterializeDependencies = {
	readonly fetch?: FetchImplementation;
	readonly extractPdfText?: typeof extractPdfText;
};

export type BioconductorRepositoryPlan =
	| { readonly kind: 'bioconductor_archive'; readonly url: string; readonly archivedUrl: string }
	| {
			readonly kind: 'custom_git';
			readonly url: string;
			readonly branch?: string;
			readonly commit?: string;
	  };

/** Resolve the mandatory source identity before any package files are staged. */
export const resolveRepositoryPlan = (
	pkg: BioconductorPackage,
	release: string,
	source: boolean | string | undefined,
	sourceBranch?: string,
	sourceCommit?: string
): BioconductorRepositoryPlan => {
	if (sourceCommit && !FULL_GIT_COMMIT_PATTERN.test(sourceCommit)) {
		throw new Error(`sourceCommit for ${pkg.name} must be a full 40-character Git commit`);
	}
	if (typeof source === 'string') {
		const url = source.trim().replace(/\/+$/u, '');
		if (!url) throw new Error(`A non-blank custom source URL is required for ${pkg.name}`);
		return {
			kind: 'custom_git',
			url,
			...(sourceBranch ? { branch: sourceBranch } : {}),
			...(sourceCommit ? { commit: sourceCommit } : {})
		};
	}
	if (sourceCommit || sourceBranch) {
		if (!pkg.gitUrl?.trim()) {
			throw new Error(`${pkg.name} does not publish a Git URL for the requested source override`);
		}
		return {
			kind: 'custom_git',
			url: pkg.gitUrl.trim().replace(/\/+$/u, ''),
			...(sourceBranch || pkg.gitBranch ? { branch: (sourceBranch ?? pkg.gitBranch)!.trim() } : {}),
			...(sourceCommit ? { commit: sourceCommit } : {})
		};
	}

	return {
		kind: 'bioconductor_archive',
		url: sourceArchiveUrl(pkg, release),
		archivedUrl: archivedSourceArchiveUrl(pkg, release)
	};
};

/** Compatibility helper; source opt-out is intentionally ignored. */
export const resolveRequestedSourceUrl = (
	pkg: BioconductorPackage,
	release: string,
	source: boolean | string | undefined,
	sourceBranch?: string,
	sourceCommit?: string
): string => resolveRepositoryPlan(pkg, release, source, sourceBranch, sourceCommit).url;

const runGit = async (
	args: readonly string[],
	cwd?: string
): Promise<{ ok: boolean; stdout: string; stderr: string }> => {
	const proc = Bun.spawn(['git', ...args], {
		...(cwd ? { cwd } : {}),
		stdout: 'pipe',
		stderr: 'pipe'
	});
	const timer = setTimeout(() => proc.kill(), CLONE_TIMEOUT_MS);
	try {
		const [stdout, stderr] = await Promise.all([
			new Response(proc.stdout).text(),
			new Response(proc.stderr).text()
		]);
		const exitCode = await proc.exited;
		return { ok: exitCode === 0, stdout, stderr };
	} finally {
		clearTimeout(timer);
	}
};

const readHeadCommit = async (directory: string): Promise<string | undefined> => {
	const result = await runGit(['rev-parse', 'HEAD'], directory);
	const value = result.stdout.trim();
	return result.ok && FULL_GIT_COMMIT_PATTERN.test(value) ? value : undefined;
};

const readHeadBranch = async (directory: string): Promise<string | undefined> => {
	const result = await runGit(['rev-parse', '--abbrev-ref', 'HEAD'], directory);
	const value = result.stdout.trim();
	return result.ok && value && value !== 'HEAD' ? value : undefined;
};

const readDescriptionIdentity = async (
	directory: string
): Promise<{ package: string; version: string }> => {
	const descriptionPath = path.join(directory, 'DESCRIPTION');
	const records = parseDcf(await fs.readFile(descriptionPath, 'utf8'));
	const record = records[0];
	const packageName = record?.['Package']?.trim();
	const version = record?.['Version']?.trim();
	if (!packageName) throw new Error('source DESCRIPTION has no Package field');
	return { package: packageName, version: version || 'unknown' };
};

const countFiles = async (directory: string): Promise<number> => {
	let count = 0;
	try {
		for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
			if (entry.isDirectory() && !entry.isSymbolicLink())
				count += await countFiles(path.join(directory, entry.name));
			else count += 1;
		}
	} catch {
		return count;
	}
	return count;
};

/** Remove everything outside the source policy and record the resulting inventory. */
const filterSourceCheckout = async (directory: string): Promise<SourceInventory> => {
	const files: string[] = [];
	let bytes = 0;
	let omittedCount = 0;

	const visit = async (current: string, relativeDirectory: string): Promise<void> => {
		let entries;
		try {
			entries = await fs.readdir(current, { withFileTypes: true });
		} catch {
			return;
		}

		for (const entry of entries) {
			const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
			const absolutePath = path.join(current, entry.name);

			if (entry.isSymbolicLink()) {
				await fs.rm(absolutePath, { recursive: true, force: true });
				omittedCount += 1;
				continue;
			}

			if (entry.isDirectory()) {
				if (isExcludedSourcePath(relativePath) || !isSourceRootPath(relativePath)) {
					omittedCount += await countFiles(absolutePath);
					await fs.rm(absolutePath, { recursive: true, force: true });
					continue;
				}
				await visit(absolutePath, relativePath);
				continue;
			}

			if (!shouldKeepSourcePath(relativePath)) {
				await fs.rm(absolutePath, { force: true });
				omittedCount += 1;
				continue;
			}

			try {
				const stats = await fs.stat(absolutePath);
				files.push(relativePath.replaceAll('\\', '/'));
				bytes += stats.size;
			} catch {
				await fs.rm(absolutePath, { force: true });
				omittedCount += 1;
			}
		}
	};

	await visit(directory, '');
	const removeEmptyDirectories = async (current: string): Promise<void> => {
		let entries;
		try {
			entries = await fs.readdir(current, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			if (entry.isDirectory() && !entry.isSymbolicLink()) {
				await removeEmptyDirectories(path.join(current, entry.name));
			}
		}
		try {
			if ((await fs.readdir(current)).length === 0 && current !== directory)
				await fs.rmdir(current);
		} catch {
			// A concurrent filesystem change should not make an otherwise valid
			// source checkout unusable; the inventory remains authoritative.
		}
	};
	await removeEmptyDirectories(directory);
	files.sort((left, right) => left.localeCompare(right));
	const inventory: SourceInventory = {
		policyVersion: BIOCONDUCTOR_SOURCE_POLICY_VERSION,
		files,
		fileCount: files.length,
		bytes,
		omittedCount
	};
	await fs.writeFile(
		path.join(directory, BIOCONDUCTOR_SOURCE_MANIFEST_FILE),
		`${JSON.stringify(inventory, null, '\t')}\n`,
		'utf8'
	);
	await fs.writeFile(
		path.join(directory, BIOCONDUCTOR_SOURCE_DIRECTORY_FILE),
		formatSourceDirectory(inventory),
		'utf8'
	);
	return inventory;
};

/**
 * Shallow-clone the package source next to its documentation.
 *
 * Shallow because only the current tree is useful for grounding answers, and a
 * full history would be many times larger for no retrieval benefit.
 */
const cloneSource = async (args: {
	readonly url: string;
	readonly branch?: string;
	readonly sourceCommit?: string;
	readonly targetPath: string;
	readonly expectedPackage: string;
}): Promise<{
	commit: string;
	branch: string;
	descriptionPackage: string;
	descriptionVersion: string;
	inventory: SourceInventory;
}> => {
	const cloneArgs = [
		'clone',
		'--depth',
		'1',
		'--filter=blob:none',
		'--no-checkout',
		...(args.sourceCommit && !args.branch ? [] : ['--single-branch']),
		...(args.branch ? ['--branch', args.branch] : []),
		args.url,
		args.targetPath
	];

	let result = await runGit(cloneArgs);
	if (!result.ok) {
		// Some Bioconductor mirrors do not advertise partial-clone support. Retry
		// with a shallow clone; the post-checkout policy still limits the files we
		// retain, so behavior remains deterministic.
		await fs.rm(args.targetPath, { recursive: true, force: true });
		result = await runGit([
			'clone',
			'--depth',
			'1',
			...(args.sourceCommit && !args.branch ? [] : ['--single-branch']),
			...(args.branch ? ['--branch', args.branch] : []),
			args.url,
			args.targetPath
		]);
	}
	if (!result.ok) {
		const detail = result.stderr.trim().split('\n').at(-1) ?? 'git clone failed';
		throw new Error(`Could not clone ${args.url}: ${detail}`);
	}
	if (args.sourceCommit) {
		let fetched = await runGit(
			['fetch', '--depth', '1', 'origin', args.sourceCommit],
			args.targetPath
		);
		if (!fetched.ok) {
			fetched = await runGit(['fetch', '--unshallow', 'origin'], args.targetPath);
		}
		if (
			!fetched.ok ||
			!(await runGit(['cat-file', '-e', `${args.sourceCommit}^{commit}`], args.targetPath)).ok
		) {
			throw new Error(
				`source commit ${args.sourceCommit} could not be fetched: ${fetched.stderr.trim().split('\n').at(-1) ?? 'git fetch failed'}`
			);
		}
	}

	// A partial clone starts with no working tree. If the fallback clone checked
	// out files already, this operation is harmless and keeps the same policy.
	const sparseInit = await runGit(['sparse-checkout', 'init', '--no-cone'], args.targetPath);
	if (sparseInit.ok) {
		const sparseSet = await runGit(
			['sparse-checkout', 'set', '--no-cone', ...sourceSparseCheckoutPatterns],
			args.targetPath
		);
		if (!sparseSet.ok) await runGit(['sparse-checkout', 'disable'], args.targetPath);
	}
	const checkout = await runGit(
		args.sourceCommit
			? ['checkout', '--force', '--detach', args.sourceCommit]
			: ['checkout', '--force', 'HEAD'],
		args.targetPath
	);
	if (!checkout.ok) {
		throw new Error(
			`source checkout failed: ${checkout.stderr.trim().split('\n').at(-1) ?? 'unknown error'}`
		);
	}

	const commit = await readHeadCommit(args.targetPath);
	if (!commit) throw new Error('source checkout does not resolve to a full 40-character commit');
	const branch = args.sourceCommit ? 'detached' : await readHeadBranch(args.targetPath);
	if (!branch)
		throw new Error(
			'source checkout does not expose its actual checked-out branch or detached ref'
		);
	const description = await readDescriptionIdentity(args.targetPath);
	if (description.package !== args.expectedPackage) {
		throw new Error(
			`source DESCRIPTION identifies package ${description.package}, expected ${args.expectedPackage}`
		);
	}
	// The clone is a snapshot, not a working repo; dropping .git before filtering
	// keeps the retrieval index clean and avoids exposing repository internals to tools.
	await fs.rm(path.join(args.targetPath, '.git'), { recursive: true, force: true });
	const inventory = await filterSourceCheckout(args.targetPath);
	const missingMetadata = ['DESCRIPTION', 'NAMESPACE'].filter(
		(file) => !inventory.files.includes(file)
	);
	if (missingMetadata.length > 0) {
		throw new Error(`source checkout is missing ${missingMetadata.join(' and ')}`);
	}
	return {
		commit,
		branch,
		descriptionPackage: description.package,
		descriptionVersion: description.version,
		inventory
	};
};

const preparePackageSource = async (args: {
	readonly plan: BioconductorRepositoryPlan;
	readonly pkg: BioconductorPackage;
	readonly targetPath: string;
	readonly fetchImplementation: FetchImplementation;
}): Promise<BioconductorRepositoryMetadata> => {
	if (args.plan.kind === 'bioconductor_archive') {
		let archiveUrl = args.plan.url;
		let response = await args.fetchImplementation(archiveUrl, {
			headers: { accept: 'application/gzip, application/octet-stream' },
			signal: AbortSignal.timeout(CLONE_TIMEOUT_MS)
		});
		if (response.status === 404 || response.status === 410) {
			await response.body?.cancel();
			archiveUrl = args.plan.archivedUrl;
			response = await args.fetchImplementation(archiveUrl, {
				headers: { accept: 'application/gzip, application/octet-stream' },
				signal: AbortSignal.timeout(CLONE_TIMEOUT_MS)
			});
		}
		if (!response.ok) {
			throw new Error(
				`Bioconductor source archive returned HTTP ${response.status} for ${archiveUrl}`
			);
		}
		const archive = await readResponseBytesBounded(
			response,
			MAX_SOURCE_ARCHIVE_BYTES,
			'Bioconductor source archive'
		);
		if (
			archive.byteLength === 0 ||
			archive.byteLength > MAX_SOURCE_ARCHIVE_BYTES ||
			archive[0] !== 0x1f ||
			archive[1] !== 0x8b
		) {
			throw new Error('Bioconductor source archive is not valid gzip data');
		}
		const sha256 = createHash('sha256').update(archive).digest('hex');
		const extracted = await extractPackageSourceArchive({
			archive,
			archiveLabel: 'Bioconductor source archive',
			package: args.pkg.name,
			version: args.pkg.version,
			directory: args.targetPath,
			manifestFile: BIOCONDUCTOR_SOURCE_MANIFEST_FILE,
			directoryFile: BIOCONDUCTOR_SOURCE_DIRECTORY_FILE,
			maximumUncompressedBytes: MAX_SOURCE_UNCOMPRESSED_BYTES,
			maximumRetainedFileBytes: MAX_SOURCE_FILE_BYTES,
			maximumRetainedTotalBytes: MAX_RETAINED_SOURCE_BYTES,
			maximumArchiveEntries: MAX_SOURCE_ARCHIVE_ENTRIES
		});
		return {
			kind: 'bioconductor_archive',
			url: archiveUrl,
			sha256,
			descriptionPackage: extracted.description.package,
			descriptionVersion: extracted.description.version,
			sourcePolicyVersion: extracted.inventory.policyVersion,
			fileCount: extracted.inventory.fileCount,
			bytes: extracted.inventory.bytes,
			omittedCount: extracted.inventory.omittedCount
		};
	}

	const cloned = await cloneSource({
		url: args.plan.url,
		...(args.plan.branch ? { branch: args.plan.branch } : {}),
		...(args.plan.commit ? { sourceCommit: args.plan.commit } : {}),
		targetPath: args.targetPath,
		expectedPackage: args.pkg.name
	});
	if (cloned.descriptionVersion !== args.pkg.version) {
		throw new Error(
			`custom Git source DESCRIPTION identifies ${args.pkg.name} ${cloned.descriptionVersion}, expected ${args.pkg.name} ${args.pkg.version}`
		);
	}
	return {
		kind: 'custom_git',
		url: args.plan.url,
		branch: cloned.branch,
		commit: cloned.commit,
		...(args.plan.commit ? { requestedCommit: args.plan.commit } : {}),
		descriptionPackage: cloned.descriptionPackage,
		descriptionVersion: cloned.descriptionVersion,
		sourcePolicyVersion: cloned.inventory.policyVersion,
		fileCount: cloned.inventory.fileCount,
		bytes: cloned.inventory.bytes,
		omittedCount: cloned.inventory.omittedCount
	};
};

const previousDirectory = (directory: string) => `${directory}.previous`;

const recoverPreviousDirectory = async (directory: string): Promise<void> => {
	if (await pathExistsAs(directory, 'directory')) return;
	const previous = previousDirectory(directory);
	if (await pathExistsAs(previous, 'directory')) await fs.rename(previous, directory);
};

/** Install a prepared directory while preserving the last good copy on failure. */
const replaceDirectory = async (staging: string, directory: string): Promise<void> => {
	const previous = previousDirectory(directory);
	await fs.rm(previous, { recursive: true, force: true });
	let movedExisting = false;
	try {
		await fs.rename(directory, previous);
		movedExisting = true;
	} catch (cause) {
		if ((cause as NodeJS.ErrnoException).code !== 'ENOENT') throw cause;
	}

	try {
		await fs.rename(staging, directory);
	} catch (cause) {
		if (movedExisting) {
			await fs.rm(directory, { recursive: true, force: true });
			await fs.rename(previous, directory);
		}
		throw cause;
	}

	if (movedExisting) await fs.rm(previous, { recursive: true, force: true });
};

/**
 * Download a package's published documentation into `directory` as Markdown or R source.
 *
 * Re-running is cheap: if the cached copy already matches the published
 * version, nothing is fetched. A vignette that fails to download is skipped
 * rather than failing the whole package, so one broken document does not make
 * the package unusable.
 */
const materializeBioconductorPackageOnce = async (
	options: MaterializeOptions,
	dependencies: MaterializeDependencies = {}
): Promise<MaterializeResult> => {
	const { pkg, release, directory } = options;
	if (!isNumberedBioconductorRelease(release)) {
		throw new Error(
			`Materialization requires a numbered Bioconductor release, received ${release}`
		);
	}
	if (!pkg.version.trim() || pkg.version === 'unknown') {
		throw new Error(`Materialization requires an exact published version for ${pkg.name}`);
	}
	const fetchImplementation = dependencies.fetch ?? globalThis.fetch;
	const extractPdf = dependencies.extractPdfText ?? extractPdfText;

	const repositoryPlan = resolveRepositoryPlan(
		pkg,
		release,
		options.source,
		options.sourceBranch,
		options.sourceCommit
	);
	const requested = Array.from(
		new Set<BioconductorDocumentType>([...resolveBioconductorDocuments(options.documents), 'vignettes', 'manual'])
	);
	await recoverPreviousDirectory(directory);

	// The corpus is itself a cloned resource, so it may not exist on the very
	// first run. Resolving it before the cache check means a package cached
	// without curated docs picks them up once the corpus lands.
	const corpusRoot =
		options.includeCurated === false
			? null
			: options.resourcesDirectory
				? await findCorpusRoot(options.resourcesDirectory, options.corpusCandidates ?? [])
				: null;
	const corpusPackage = corpusRoot ? await findCorpusPackage(corpusRoot, pkg.name) : null;

	// Reuse the cached copy only when the published version, the release, the
	// requested source, and the curated documents all match, and no earlier
	// source failure is pending.
	const existing = await readBioconductorResourceMetadata(directory);
	const sameDocumentSet = sameValues(existing?.requestedDocuments, requested);
	const expectedCurated = (corpusPackage?.documents ?? []).map((file) => {
		const provenance = corpusPackage?.provenance.get(file);
		return [
			`${BIOCONDUCTOR_CORPUS_DIR}/${file}`,
			provenance?.originUrl ?? '',
			provenance?.packageVersion ?? '',
			provenance?.bioconductorRelease ?? ''
		].join('\0');
	});
	const actualCurated = (existing?.documents ?? [])
		.filter((document) => document.sourceType === 'curated')
		.map((document) =>
			[document.path, document.originUrl, document.packageVersion, document.bioconductorRelease].join('\0')
		);
	const sameCuratedDocuments = sameValues(actualCurated, expectedCurated);
	// A document that failed is worth retrying; one the package does not publish
	// is not, so `skipped` entries must not keep invalidating the cache.
	const hasRetryableFailure = (existing?.documents ?? []).some(
		(document) => document.status === 'failed'
	);
	const sourceIdentityMatches =
		existing?.repository.kind === repositoryPlan.kind &&
		(repositoryPlan.kind === 'bioconductor_archive'
			? existing.repository.url === repositoryPlan.url ||
				existing.repository.url === repositoryPlan.archivedUrl
			: existing.repository.url === repositoryPlan.url &&
				isBioconductorGitSourceMetadata(existing.repository) &&
				(!repositoryPlan.branch || existing.repository.branch === repositoryPlan.branch) &&
				(!repositoryPlan.commit || existing.repository.requestedCommit === repositoryPlan.commit));
	const cacheMatches =
		existing?.cacheVersion === BIOCONDUCTOR_RESOURCE_CACHE_VERSION &&
		existing.package === pkg.name &&
		existing.bioconductor.packageVersion === pkg.version &&
		existing.bioconductor.release === release &&
		existing.bioconductor.repository === pkg.repository &&
		sourceIdentityMatches &&
		existing.repository.sourcePolicyVersion === BIOCONDUCTOR_SOURCE_POLICY_VERSION &&
		existing.repository.descriptionVersion === pkg.version &&
		existing.curatedFrom === corpusPackage?.relativePath &&
		sameCuratedDocuments &&
		sameDocumentSet &&
		hasExpectedDocumentInventory(existing, pkg, release, requested) &&
		!hasRetryableFailure;
	if (
		!options.refresh &&
		cacheMatches &&
		existing &&
		(await isCompleteBioconductorResourceCache(directory, existing))
	) {
		return { directory, metadata: existing, downloaded: false };
	}

	if (!options.quiet) {
		metricsInfo(`Downloading ${pkg.name} ${pkg.version} from Bioconductor ${release}`);
	}

	const staging = `${directory}.partial-${crypto.randomUUID()}`;
	await fs.mkdir(staging, { recursive: true });
	try {
		const documents: BioconductorDocumentRecord[] = [];
		const usedNames = new Set<string>();
		const wants = (kind: BioconductorDocumentType) => requested.includes(kind);
		const publishedRecord = (
			path: string,
			originType: Exclude<BioconductorDocumentRecord['originType'], 'curated_document'>,
			originUrl: string
		) => ({
			path,
			sourceType: 'bioconductor' as const,
			originType,
			originUrl,
			packageVersion: pkg.version || 'unknown',
			bioconductorRelease: release
		});

		const uniqueName = (base: string, extension: string) => {
			let candidate = `${base}${extension}`;
			let suffix = 2;
			while (usedNames.has(candidate.normalize('NFKC').toLowerCase())) {
				candidate = `${base}-${suffix++}${extension}`;
			}
			usedNames.add(candidate.normalize('NFKC').toLowerCase());
			return candidate;
		};

		if (wants('vignettes')) {
			for (const vignette of pkg.vignettes) {
				const url = vignetteUrl(pkg, vignette, release);
				const file = path.join(BIOCONDUCTOR_VIGNETTES_DIR, uniqueName(slugify(vignette.title), '.md'));
				const record = publishedRecord(file, 'vignette', url);

				// PDF vignettes are common enough (roughly a quarter of packages publish
				// no HTML at all) that routing them by format is required, not an edge case.
				let markdown = '';
				let failure: string | undefined;

				const format = detectVignetteFormat(vignette.path);
				if (format === 'pdf') {
					const bytes = await fetchBytes(url, fetchImplementation);
					if (bytes.ok) {
						try {
							const extracted = await extractPdf(bytes.value);
							const body = removeDuplicatePdfTitle(vignette.title, extracted.text);
							markdown = body ? `# ${vignette.title}\n\n${body}` : '';
							if (!markdown) failure = 'no text could be extracted from the PDF';
						} catch (cause) {
							failure = describeFetchError(cause);
						}
					} else {
						failure = bytes.error;
					}
				} else if (format === 'html') {
					const html = await fetchText(url, fetchImplementation);
					if (html.ok) {
						const body = looksLikePdfDocument(html.value) ? '' : htmlToMarkdown(html.value);
						if (looksLikePdfDocument(html.value)) {
							failure = 'received a PDF for an HTML vignette';
						} else if (!body.trim()) {
							failure = 'converted vignette was empty';
						} else {
							markdown = /^#\s/mu.test(body) ? body : `# ${vignette.title}\n\n${body}`;
						}
					} else {
						failure = html.error;
					}
				} else {
					failure = `unsupported vignette format in ${vignette.path}`;
				}

				if (failure || !markdown.trim()) {
					documents.push({ ...record, status: 'failed', error: failure ?? 'empty document' });
					continue;
				}

				await fs.mkdir(path.join(staging, BIOCONDUCTOR_VIGNETTES_DIR), { recursive: true });
				await fs.writeFile(
					path.join(staging, file),
					`${markdown}\n\n---\n\nSource: ${url}\n`,
					'utf8'
				);
				documents.push({ ...record, status: 'ok' });
			}
		}

		if (wants('vignetteScripts')) {
			// Taken from the published `Rfiles` list rather than derived from vignette
			// paths, because the two lists do not correspond one to one.
			for (const rFile of pkg.rFiles ?? []) {
				const url = rFileUrl(pkg, rFile, release);
				const base = path.basename(rFile).replace(/\.[^.]+$/, '');
				const file = path.join(BIOCONDUCTOR_VIGNETTES_DIR, uniqueName(slugify(base), '.R'));
				const record = publishedRecord(file, 'vignette_script', url);

				const script = await fetchText(url, fetchImplementation);
				if (!script.ok || script.value.trim().length === 0 || looksLikeHtmlDocument(script.value)) {
					documents.push({
						...record,
						status: 'failed',
						error: !script.ok
							? script.error
							: looksLikeHtmlDocument(script.value)
								? 'received HTML instead of an R script'
								: 'empty script'
					});
					continue;
				}

				await fs.mkdir(path.join(staging, BIOCONDUCTOR_VIGNETTES_DIR), { recursive: true });
				// Written as runnable R, not fenced Markdown: it is exact source.
				await fs.writeFile(
					path.join(staging, file),
					`# Source: ${url}\n${script.value.trimEnd()}\n`,
					'utf8'
				);
				documents.push({ ...record, status: 'ok' });
			}
		}

		if (wants('manual')) {
			const url = referenceManualUrl(pkg, release);
			const record = publishedRecord(BIOCONDUCTOR_MANUAL_FILE, 'reference_manual', url);
			const bytes = await fetchBytes(url, fetchImplementation);
			if (!bytes.ok) {
				documents.push({
					...record,
					status: bytes.status === 404 ? 'skipped' : 'failed',
					error: bytes.error
				});
			} else {
				try {
					const extracted = await extractPdf(bytes.value);
					if (extracted.text.trim().length === 0) {
						documents.push({ ...record, status: 'failed', error: 'no text extracted' });
					} else {
						await fs.writeFile(
							path.join(staging, BIOCONDUCTOR_MANUAL_FILE),
							[
								`# ${pkg.name} reference manual`,
								'',
								`Rd help pages for ${pkg.name} ${pkg.version}, extracted from the published PDF.`,
								'Argument names and defaults are authoritative; spacing and tables may be imperfect.',
								'',
								extracted.text,
								'',
								'---',
								'',
								`Source: ${url}`,
								''
							].join('\n'),
							'utf8'
						);
						documents.push({ ...record, status: 'ok' });
					}
				} catch (cause) {
					documents.push({ ...record, status: 'failed', error: describeFetchError(cause) });
				}
			}
		}

		if (wants('news')) {
			const url = newsUrl(pkg, release);
			const record = publishedRecord('NEWS.md', 'news', url);
			if (!pkg.hasNews) {
				// Nothing published, so this must not be retried forever.
				documents.push({ ...record, status: 'skipped' });
			} else {
				const news = await fetchText(url, fetchImplementation);
				if (!news.ok || news.value.trim().length === 0 || looksLikeHtmlDocument(news.value)) {
					documents.push({
						...record,
						status: 'failed',
						error: !news.ok
							? news.error
							: looksLikeHtmlDocument(news.value)
								? 'received HTML instead of NEWS'
								: 'empty NEWS'
					});
				} else {
					await fs.writeFile(
						path.join(staging, 'NEWS.md'),
						`# ${pkg.name} NEWS\n\n\`\`\`text\n${news.value.trim()}\n\`\`\`\n\nSource: ${url}\n`,
						'utf8'
					);
					documents.push({ ...record, status: 'ok' });
				}
			}
		}

		let curatedDocuments: string[] = [];
		if (corpusPackage) {
			curatedDocuments = await copyCorpusPackage(
				corpusPackage,
				path.join(staging, BIOCONDUCTOR_CORPUS_DIR)
			);
			for (const file of curatedDocuments) {
				const provenance = corpusPackage.provenance.get(file);
				if (!provenance) throw new Error(`Curated provenance is missing for ${pkg.name}/${file}`);
				documents.push({
					path: `${BIOCONDUCTOR_CORPUS_DIR}/${file}`,
					sourceType: 'curated',
					originType: 'curated_document',
					originUrl: provenance.originUrl,
					packageVersion: provenance.packageVersion,
					bioconductorRelease: provenance.bioconductorRelease,
					status: 'ok'
				});
			}
		}

		const hasRequiredDocument = documents.some(
			(document) =>
				document.sourceType === 'bioconductor' &&
				document.status === 'ok' &&
				(document.originType === 'vignette' || document.originType === 'reference_manual')
		);
		if (!hasRequiredDocument) {
			throw new Error(
				`${pkg.name} installation is incomplete: at least one published vignette or reference manual is required`
			);
		}

		if (!options.quiet) {
			metricsInfo(`Preparing exact ${pkg.name} source from ${repositoryPlan.url}`);
		}
		const repository = await preparePackageSource({
			plan: repositoryPlan,
			pkg,
			targetPath: path.join(staging, BIOCONDUCTOR_SOURCE_DIR),
			fetchImplementation
		});

		const metadata: BioconductorResourceMetadata = {
			cacheVersion: BIOCONDUCTOR_RESOURCE_CACHE_VERSION,
			package: pkg.name,
			bioconductor: {
				release,
				packageVersion: pkg.version || 'unknown',
				repository: pkg.repository,
				landingUrl: packageLandingUrl(pkg, release)
			},
			repository,
			versionRelationship: getVersionRelationship(pkg.version, repository.descriptionVersion),
			documents,
			requestedDocuments: [...requested],
			...(corpusPackage ? { curatedFrom: corpusPackage.relativePath } : {}),
			fetchedAt: new Date().toISOString()
		};

		await fs.writeFile(
			path.join(staging, 'README.md'),
			renderIndex(pkg, release, documents, metadata),
			'utf8'
		);
		await fs.writeFile(
			path.join(staging, BIOCONDUCTOR_METADATA_FILE),
			`${JSON.stringify(metadata, null, '\t')}\n`,
			'utf8'
		);
		const stagedMetadata = await readBioconductorResourceMetadata(staging);
		if (!stagedMetadata || !(await isCompleteBioconductorResourceCache(staging, stagedMetadata))) {
			throw new Error(`${pkg.name} staging directory failed completeness verification`);
		}

		await fs.mkdir(path.dirname(directory), { recursive: true });
		await replaceDirectory(staging, directory);

		if (!options.quiet) {
			const ok = documents.filter((document) => document.status === 'ok').length;
			const failed = documents.filter((document) => document.status === 'failed').length;
			metricsInfo(
				`Prepared ${pkg.name} with ${ok} document(s)${failed > 0 ? `, ${failed} failed (retry with /add)` : ''}`
			);
		}

		return { directory, metadata, downloaded: true };
	} finally {
		await fs.rm(staging, { recursive: true, force: true });
	}
};

/** Serialize writes to one package directory while allowing different packages in parallel. */
export const materializeBioconductorPackage = async (
	options: MaterializeOptions,
	dependencies: MaterializeDependencies = {}
): Promise<MaterializeResult> =>
	withBioconductorPackageMutation(options.directory, () =>
		materializeBioconductorPackageOnce(options, dependencies)
	);
