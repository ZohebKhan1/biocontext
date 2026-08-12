import path from 'node:path';

import type { CuratedDocumentProvenance } from './corpus.ts';
import type { BioconductorDocumentRecord, BioconductorResourceMetadata } from './metadata.ts';

const normalizedStem = (value: string): string => {
	const withoutQuery = value.split(/[?#]/u, 1)[0] ?? value;
	let basename = path.posix.basename(withoutQuery);
	try {
		basename = decodeURIComponent(basename);
	} catch {
		// Keep the literal basename when an upstream URL contains invalid escapes.
	}
	return basename
		.replace(/\.(?:html?|pdf|rmd|rnw|md|r|rd|txt)$/iu, '')
		.normalize('NFKC')
		.replace(/[^a-z0-9]+/giu, '')
		.toLowerCase();
};

const normalizedOrigin = (value: string): string => {
	try {
		const url = new URL(value);
		const pathname = url.pathname
			.replace(/\/packages\/(?:release|devel|\d+\.\d+)\//iu, '/packages/current/')
			.replace(/\/+$/u, '')
			.toLowerCase();
		return `${url.hostname.toLowerCase()}${pathname}`;
	} catch {
		return value.trim().replace(/\/+$/u, '').toLowerCase();
	}
};

const isPublishedVignetteOrigin = (value: string): boolean => {
	try {
		const url = new URL(value);
		if (url.hostname !== 'bioconductor.org' && !url.hostname.endsWith('.bioconductor.org')) {
			return false;
		}
		return /\/packages\/(?:release|devel|\d+\.\d+)\/[^/]+\/vignettes\/[^/]+\/inst\/doc\//iu.test(
			url.pathname
		);
	} catch {
		return false;
	}
};

const successfulDocuments = (
	metadata: BioconductorResourceMetadata,
	originType: BioconductorDocumentRecord['originType']
): BioconductorDocumentRecord[] =>
	metadata.documents.filter(
		(document) => document.status === 'ok' && document.originType === originType
	);

const hasSuccessfulDocument = (
	metadata: BioconductorResourceMetadata,
	originType: BioconductorDocumentRecord['originType']
): boolean => successfulDocuments(metadata, originType).length > 0;

const publishedVignetteStems = (metadata: BioconductorResourceMetadata): Set<string> =>
	new Set(
		successfulDocuments(metadata, 'vignette')
			.map((document) => normalizedStem(document.originUrl))
			.filter(Boolean)
	);

const sourceVignetteStems = (sourceFiles: readonly string[]): Set<string> =>
	new Set(
		sourceFiles
			.filter((file) => /^vignettes\/.*\.(?:rmd|rnw|md)$/iu.test(file.replaceAll('\\', '/')))
			.map(normalizedStem)
			.filter(Boolean)
	);

const hasSourceManual = (sourceFiles: readonly string[]): boolean =>
	sourceFiles.some((file) => /^man\/.*\.rd$/iu.test(file.replaceAll('\\', '/')));

const isSourceNewsPath = (value: string): boolean =>
	/^source\/(?:inst\/)?news(?:\.md|\.rd|\.txt)?$/iu.test(value.replaceAll('\\', '/'));

const sourceNewsPriority = (value: string): readonly [number, number, string] => {
	const lower = value.toLowerCase();
	const extensionRank = lower.endsWith('.md')
		? 0
		: lower.endsWith('.rd')
			? 1
			: path.posix.extname(lower) === ''
				? 2
				: 3;
	const locationRank = lower.startsWith('source/inst/') ? 1 : 0;
	return [extensionRank, locationRank, lower];
};

/** Hide all but one deterministic source NEWS fallback when no published NEWS exists. */
export const redundantSourceNewsPaths = (sourceFiles: readonly string[]): Set<string> => {
	const candidates = sourceFiles
		.map((file) => `source/${file.replaceAll('\\', '/').replace(/^\.\//u, '')}`)
		.filter(isSourceNewsPath)
		.sort((left, right) => {
			const leftPriority = sourceNewsPriority(left);
			const rightPriority = sourceNewsPriority(right);
			if (leftPriority[0] !== rightPriority[0]) return leftPriority[0] - rightPriority[0];
			if (leftPriority[1] !== rightPriority[1]) return leftPriority[1] - rightPriority[1];
			return leftPriority[2] < rightPriority[2] ? -1 : leftPriority[2] > rightPriority[2] ? 1 : 0;
		});
	return new Set(candidates.slice(1));
};

const redundantSourceVignettePaths = (sourceFiles: readonly string[]): Set<string> => {
	const byStem = new Map<string, string[]>();
	for (const file of sourceFiles) {
		const normalized = file.replaceAll('\\', '/');
		if (!/^vignettes\/.*\.(?:rmd|rnw|md)$/iu.test(normalized)) continue;
		const stem = normalizedStem(normalized);
		if (!stem) continue;
		const paths = byStem.get(stem) ?? [];
		paths.push(`source/${normalized}`);
		byStem.set(stem, paths);
	}
	const ignored = new Set<string>();
	const extensionRank = (value: string) =>
		value.toLowerCase().endsWith('.rmd') ? 0 : value.toLowerCase().endsWith('.rnw') ? 1 : 2;
	for (const paths of byStem.values()) {
		paths.sort((left, right) => {
			const rank = extensionRank(left) - extensionRank(right);
			if (rank !== 0) return rank;
			return left < right ? -1 : left > right ? 1 : 0;
		});
		for (const duplicate of paths.slice(1)) ignored.add(duplicate);
	}
	return ignored;
};

/**
 * Decide whether a curated document repeats a canonical installed document.
 *
 * The rule uses document role and upstream origin, not package-specific names
 * or a text-similarity threshold. Books, papers, workflows, and distinct
 * tutorials remain searchable.
 */
export const isRedundantCuratedDocument = (
	metadata: BioconductorResourceMetadata,
	documentName: string,
	provenance: CuratedDocumentProvenance,
	sourceFiles: readonly string[] = []
): boolean => {
	const published = metadata.documents.filter(
		(document) => document.sourceType === 'bioconductor' && document.status === 'ok'
	);
	const origin = normalizedOrigin(provenance.originUrl);
	if (published.some((document) => normalizedOrigin(document.originUrl) === origin)) return true;

	const basename = path.posix.basename(documentName).toLowerCase();
	if (
		basename === 'reference.md' &&
		(hasSuccessfulDocument(metadata, 'reference_manual') || hasSourceManual(sourceFiles))
	) {
		return true;
	}
	if (/^news(?:\.|$)/iu.test(basename) && hasSuccessfulDocument(metadata, 'news')) return true;
	if (
		basename === 'vignette.md' &&
		(hasSuccessfulDocument(metadata, 'vignette') ||
			sourceVignetteStems(sourceFiles).has(normalizedStem(provenance.originUrl)))
	)
		return true;

	const originStem = normalizedStem(provenance.originUrl);
	return Boolean(
		isPublishedVignetteOrigin(provenance.originUrl) &&
		originStem &&
		publishedVignetteStems(metadata).has(originStem)
	);
};

/** Additional role duplicates that require the verified source inventory. */
export const additionalManagedBioconductorIgnoredPaths = (
	metadata: BioconductorResourceMetadata,
	sourceFiles: readonly string[]
): Set<string> => {
	const ignored = redundantSourceNewsPaths(sourceFiles);
	for (const duplicate of redundantSourceVignettePaths(sourceFiles)) ignored.add(duplicate);
	const authoredVignetteStems = sourceVignetteStems(sourceFiles);
	for (const document of metadata.documents) {
		if (document.status !== 'ok') continue;
		if (
			document.originType === 'vignette_script' &&
			authoredVignetteStems.has(normalizedStem(document.originUrl))
		) {
			ignored.add(document.path);
		}
		if (document.sourceType !== 'curated') continue;
		if (
			isRedundantCuratedDocument(
				metadata,
				path.posix.basename(document.path),
				{
					path: path.posix.basename(document.path),
					originUrl: document.originUrl,
					originType: 'curated_document',
					packageVersion: document.packageVersion,
					bioconductorRelease: document.bioconductorRelease
				},
				sourceFiles
			)
		) {
			ignored.add(document.path);
		}
	}
	return ignored;
};

/** Keep one searchable representation of each installed package document role. */
export const shouldIgnoreManagedBioconductorSearchPath = (
	metadata: BioconductorResourceMetadata,
	relativePath: string
): boolean => {
	const normalized = relativePath.replaceAll('\\', '/').replace(/^\.\//u, '');
	const lower = normalized.toLowerCase();

	if (lower.startsWith('source/man/') && hasSuccessfulDocument(metadata, 'reference_manual')) {
		return true;
	}
	if (isSourceNewsPath(lower) && hasSuccessfulDocument(metadata, 'news')) {
		return true;
	}

	const vignetteStems = publishedVignetteStems(metadata);
	if (lower.startsWith('source/vignettes/') && vignetteStems.size > 0) {
		const extension = path.posix.extname(lower);
		return (
			['.r', '.rmd', '.rnw', '.md'].includes(extension) &&
			vignetteStems.has(normalizedStem(normalized))
		);
	}

	const publishedScript = metadata.documents.find(
		(document) =>
			document.status === 'ok' &&
			document.originType === 'vignette_script' &&
			document.path.toLowerCase() === lower
	);
	if (publishedScript && vignetteStems.has(normalizedStem(publishedScript.originUrl))) return true;

	if (lower.startsWith('curated/')) {
		const record = metadata.documents.find(
			(document) =>
				document.status === 'ok' &&
				document.sourceType === 'curated' &&
				document.path.toLowerCase() === lower
		);
		if (record) {
			return isRedundantCuratedDocument(metadata, path.posix.basename(normalized), {
				path: path.posix.basename(normalized),
				originUrl: record.originUrl,
				originType: 'curated_document',
				packageVersion: record.packageVersion,
				bioconductorRelease: record.bioconductorRelease
			});
		}
	}

	return false;
};
