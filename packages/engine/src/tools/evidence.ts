import path from 'node:path';

import { z } from 'zod';
import { parse as parseYaml } from 'yaml';

import type { ToolContext } from './context.ts';
import { resolveSandboxPathWithSymlinks } from './virtual-sandbox.ts';
import { existsInVirtualFs, readVirtualFsFile } from '../vfs/virtual-fs.ts';
import {
	getVirtualCollectionMetadata,
	type EvidenceResult,
	type VirtualResourceMetadata
} from '../collections/virtual-metadata.ts';
import { parseCuratedPackageMetadata } from '../bioconductor/corpus.ts';
import { FULL_GIT_COMMIT_PATTERN, isBioconductorGitSourceMetadata } from '../bioconductor/metadata.ts';
import { getQueryFile } from './query-cache.ts';

const MAX_EVIDENCE_LINES = 80;
const MAX_EVIDENCE_BYTES = 16 * 1024;
const NON_EVIDENCE_FILES = new Set([
	'README.md',
	'DIRECTORY.md',
	'MANIFEST.json',
	'.bioconductor-meta.json',
	'.cran-meta.json',
	'_metadata.yml'
]);

export const EvidenceToolParameters = z.object({
	spans: z
		.array(
			z.object({
				path: z
					.string()
					.describe(
						'A text file path already inspected by read or an evidence-ready search excerpt'
					),
				line_start: z.coerce
					.number()
					.int()
					.positive()
					.describe('First evidence line, inclusive (1-based)'),
				line_end: z.coerce
					.number()
					.int()
					.positive()
					.describe('Last evidence line, inclusive (1-based)')
			})
		)
		.min(1)
		.max(12)
		.describe('One to twelve independent exact evidence spans')
});

export type EvidenceToolParametersType = z.infer<typeof EvidenceToolParameters>;
export type EvidenceToolResult = { title: string; output: string; evidence: EvidenceResult[] };

/**
 * Evidence must come from lines the agent actually inspected in a read or a
 * fully visible search excerpt. A claim often spans adjacent inspected ranges,
 * so coverage is evaluated against their merged union.
 */
export const isCoveredByInspectedRanges = (
	ranges: readonly { start: number; end: number }[] | undefined,
	lineStart: number,
	lineEnd: number
): boolean => {
	if (!ranges || ranges.length === 0) return false;
	const sorted = [...ranges].sort((left, right) => left.start - right.start);
	let cursor = lineStart;
	for (const range of sorted) {
		if (range.start > cursor) break;
		if (range.end >= cursor) cursor = range.end + 1;
		if (cursor > lineEnd) return true;
	}
	return cursor > lineEnd;
};

const resourceForPath = (
	resources: readonly VirtualResourceMetadata[],
	absolutePath: string
): { resource: VirtualResourceMetadata; relativePath: string } | null => {
	const normalized = path.posix.resolve('/', absolutePath);
	for (const resource of resources) {
		const root = path.posix.join('/', resource.fsName);
		const relativePath = path.posix.relative(root, normalized);
		if (!relativePath.startsWith('..') && !path.posix.isAbsolute(relativePath)) {
			return { resource, relativePath };
		}
	}
	return null;
};

const encodeGitPath = (value: string) =>
	value
		.split('/')
		.map((segment) => encodeURIComponent(segment))
		.join('/');

const githubBlobUrl = (url: string, commit: string, relativePath: string) =>
	`${url.replace(/\.git$/u, '').replace(/\/+$/u, '')}/blob/${commit}/${encodeGitPath(relativePath)}`;

const inferCorpusPackage = (absolutePath: string): string => {
	const segments = absolutePath.split('/').filter(Boolean);
	const category = segments.findIndex((segment) => /^\d+_/u.test(segment));
	return category >= 0 ? (segments[category + 1] ?? 'unknown') : 'unknown';
};

const resolveManagedProvenance = (
	resource: VirtualResourceMetadata,
	relativePath: string
): Omit<EvidenceResult, 'id' | 'path' | 'line_start' | 'line_end' | 'content'> | null => {
	const metadata = resource.bioconductorMetadata;
	if (!metadata) return null;
	if (relativePath.startsWith('source/')) {
		const sourcePath = relativePath.slice('source/'.length);
		const source = metadata.repository;
		const gitSource = isBioconductorGitSourceMetadata(source);
		const isGitHub = gitSource && /^https:\/\/(?:www\.)?github\.com\//iu.test(source.url);
		const originUrl = gitSource
			? isGitHub
				? githubBlobUrl(source.url, source.commit, sourcePath)
				: `local:${source.url}@${source.commit}`
			: `${source.url}#sha256=${source.sha256}`;
		return {
			package: metadata.package,
			package_version: source.descriptionVersion,
			bioc_release: metadata.bioconductor.release,
			source_type: 'repository',
			origin_type: 'repository_file',
			origin_url: originUrl,
			repository_commit: gitSource ? source.commit : null
		};
	}

	const document = metadata.documents.find(
		(record) => record.path === relativePath && record.status === 'ok'
	);
	if (!document) return null;
	return {
		package: metadata.package,
		package_version: document.packageVersion,
		bioc_release: document.bioconductorRelease,
		source_type: document.sourceType,
		origin_type: document.originType,
		origin_url: document.originUrl,
		repository_commit: null
	};
};

const resolveCranProvenance = (
	resource: VirtualResourceMetadata,
	relativePath: string
): Omit<EvidenceResult, 'id' | 'path' | 'line_start' | 'line_end' | 'content'> | null => {
	const metadata = resource.cranMetadata;
	if (!metadata || !relativePath.startsWith('source/')) return null;
	return {
		package: metadata.package,
		package_version: metadata.cran.version,
		bioc_release: 'unknown',
		source_type: 'cran',
		origin_type: 'cran_package_file',
		origin_url: metadata.cran.sourceUrl,
		repository_commit: null
	};
};

const resolveCuratedSiblingProvenance = async (
	absolutePath: string,
	vfsId: string | undefined
): Promise<Omit<EvidenceResult, 'id' | 'path' | 'line_start' | 'line_end' | 'content'> | null> => {
	if (path.posix.extname(absolutePath).toLowerCase() !== '.md') return null;
	const metadataPath = path.posix.join(path.posix.dirname(absolutePath), '_metadata.yml');
	if (!(await existsInVirtualFs(metadataPath, vfsId))) return null;
	try {
		const parsed = parseCuratedPackageMetadata(
			parseYaml(await readVirtualFsFile(metadataPath, vfsId))
		);
		if (!parsed.success) return null;
		const provenance = parsed.documents.get(path.posix.basename(absolutePath));
		if (!provenance) return null;
		return {
			package: parsed.package,
			package_version: provenance.packageVersion,
			bioc_release: provenance.bioconductorRelease,
			source_type: 'curated',
			origin_type: 'curated_document',
			origin_url: provenance.originUrl,
			repository_commit: null
		};
	} catch {
		return null;
	}
};

const resolveGenericProvenance = (
	resource: VirtualResourceMetadata,
	relativePath: string,
	absolutePath: string
): Omit<EvidenceResult, 'id' | 'path' | 'line_start' | 'line_end' | 'content'> => {
	const packageName = resource.package ?? inferCorpusPackage(absolutePath);
	if (resource.type === 'git' && resource.url && resource.commit) {
		if (!FULL_GIT_COMMIT_PATTERN.test(resource.commit)) {
			throw new Error('Generic Git evidence requires a full 40-character commit');
		}
		const isGitHub = /^https:\/\/(?:www\.)?github\.com\//iu.test(resource.url);
		return {
			package: packageName,
			package_version: resource.version ?? 'unknown',
			bioc_release: 'unknown',
			source_type: 'git',
			origin_type: 'git_file',
			origin_url: isGitHub
				? githubBlobUrl(resource.url, resource.commit, relativePath)
				: `local:${resource.url}@${resource.commit}`,
			repository_commit: resource.commit
		};
	}
	return {
		package: packageName,
		package_version: resource.version ?? 'unknown',
		bioc_release: 'unknown',
		source_type: 'local',
		origin_type: 'local_file',
		origin_url: `local:${resource.name}`,
		repository_commit: null
	};
};

export const executeEvidenceTool = async (
	params: EvidenceToolParametersType,
	context: ToolContext
): Promise<EvidenceToolResult> => {
	if (!context.vfsId) throw new Error('Evidence requires a query-scoped virtual filesystem');
	const collection = getVirtualCollectionMetadata(context.vfsId);
	if (!collection) throw new Error('Query evidence state is unavailable');
	// Resolve and validate every span before allocating any IDs or mutating the trace.
	const prepared: Array<{
		absolutePath: string;
		located: { resource: VirtualResourceMetadata; relativePath: string };
		line_start: number;
		line_end: number;
		content: string;
		provenance: Omit<EvidenceResult, 'id' | 'path' | 'line_start' | 'line_end' | 'content'>;
	}> = [];
	for (const span of params.spans) {
		if (span.line_end < span.line_start)
			throw new Error('line_end must be greater than or equal to line_start');
		if (span.line_end - span.line_start + 1 > MAX_EVIDENCE_LINES) {
			throw new Error(`Evidence excerpts are limited to ${MAX_EVIDENCE_LINES} lines`);
		}
		const absolutePath = await resolveSandboxPathWithSymlinks(
			context.basePath,
			span.path,
			context.vfsId
		);
		if (
			!isCoveredByInspectedRanges(
				collection.trace.inspectedRanges.get(absolutePath),
				span.line_start,
				span.line_end
			)
		) {
			throw new Error(
				'Evidence can only be issued for exact line ranges covered by a prior read or evidence-ready search excerpt'
			);
		}
		if (NON_EVIDENCE_FILES.has(path.posix.basename(absolutePath))) {
			throw new Error(
				`${path.posix.basename(absolutePath)} is a routing or manifest file, not evidence`
			);
		}
		const located = resourceForPath(collection.resources, absolutePath);
		if (!located) throw new Error('Evidence path does not belong to a mounted resource');
		const cached = await getQueryFile(absolutePath, context.vfsId);
		if (cached.status !== 'text' || !cached.lines)
			throw new Error(`Unable to decode evidence file: ${span.path}`);
		if (span.line_start > cached.lines.length || span.line_end > cached.lines.length) {
			throw new Error(`Evidence range exceeds the file's ${cached.lines.length} lines`);
		}
		const content = cached.lines.slice(span.line_start - 1, span.line_end).join('\n');
		if (Buffer.byteLength(content, 'utf8') > MAX_EVIDENCE_BYTES) {
			throw new Error(`Evidence excerpts are limited to ${MAX_EVIDENCE_BYTES} bytes`);
		}
		const provenance =
			resolveManagedProvenance(located.resource, located.relativePath) ??
			resolveCranProvenance(located.resource, located.relativePath) ??
			(await resolveCuratedSiblingProvenance(absolutePath, context.vfsId)) ??
			resolveGenericProvenance(located.resource, located.relativePath, absolutePath);
		prepared.push({
			absolutePath,
			located,
			line_start: span.line_start,
			line_end: span.line_end,
			content,
			provenance
		});
	}

	const evidence = prepared.map((item, index): EvidenceResult => {
		const id = `E${collection.trace.nextEvidenceId + index}`;
		return {
			id,
			...item.provenance,
			path: item.located.relativePath,
			line_start: item.line_start,
			line_end: item.line_end,
			content: item.content
		};
	});
	collection.trace.nextEvidenceId += evidence.length;
	for (const item of evidence) {
		collection.trace.evidence.set(item.id, item);
		collection.trace.searchedPackages.add(item.package);
	}
	const locators = evidence.map(
		({ id, package: packageName, path: evidencePath, line_start, line_end }) => ({
			evidence_id: id,
			package: packageName,
			path: evidencePath,
			line_start,
			line_end
		})
	);
	return {
		title: locators
			.map((item) => `${item.evidence_id} ${item.path}:${item.line_start}-${item.line_end}`)
			.join(', '),
		output: JSON.stringify({ evidence: locators }),
		evidence
	};
};

export type EvidenceEnvelope =
	| {
			status: 'supported';
			query: string;
			searched_packages: string[];
			searched_documents: number;
			results: EvidenceResult[];
	  }
	| {
			status: 'insufficient_evidence';
			query: string;
			searched_packages: string[];
			searched_documents: number;
			results: [];
	  };

const removeDraftSources = (text: string): string =>
	text.replace(/\n(?:#{1,6}\s+)?Sources:?\s*\n[\s\S]*$/iu, '').trim();

const normalizeCitationPath = (value: string): string =>
	value.replaceAll('\\', '/').replace(/^\.\//u, '');

const compactCitationPath = (value: string): string => {
	const normalized = normalizeCitationPath(value);
	return normalized.split('/').at(-1) ?? normalized;
};

const getCitationPaths = (results: readonly EvidenceResult[]): Map<string, string> => {
	const pathsByBasename = new Map<string, Set<string>>();
	for (const result of results) {
		const normalized = normalizeCitationPath(result.path);
		const basename = compactCitationPath(normalized);
		const paths = pathsByBasename.get(basename) ?? new Set<string>();
		paths.add(normalized);
		pathsByBasename.set(basename, paths);
	}
	return new Map(
		results.map((result) => {
			const normalized = normalizeCitationPath(result.path);
			const basename = compactCitationPath(normalized);
			const paths = pathsByBasename.get(basename);
			return [result.id, paths && paths.size > 1 ? normalized : basename];
		})
	);
};

const formatSourceIdentity = (result: EvidenceResult): string => {
	const identity = [
		result.package_version === 'unknown'
			? result.package
			: `${result.package} ${result.package_version}`
	];
	if (result.source_type === 'cran') identity.push('CRAN');
	return identity.join('; ');
};

export const finalizeEvidenceAnswer = (args: {
	vfsId?: string;
	query: string;
	draft: string;
}): { text: string; evidence: EvidenceEnvelope } => {
	const collection = args.vfsId ? getVirtualCollectionMetadata(args.vfsId) : undefined;
	const trace = collection?.trace;
	const citedIds: string[] = [];
	const seen = new Set<string>();
	for (const match of args.draft.matchAll(/\[\[(E\d+)\]\]/gu)) {
		const id = match[1];
		if (id && trace?.evidence.has(id) && !seen.has(id)) {
			seen.add(id);
			citedIds.push(id);
		}
	}
	const searchedPackages = [...(trace?.searchedPackages ?? [])].sort((left, right) =>
		left.localeCompare(right)
	);
	const searchedDocuments = trace?.inspectedDocuments.size ?? 0;
	if (!trace || citedIds.length === 0) {
		return {
			text: 'Insufficient evidence to answer this question from the inspected local sources.',
			evidence: {
				status: 'insufficient_evidence',
				query: args.query,
				searched_packages: searchedPackages,
				searched_documents: searchedDocuments,
				results: []
			}
		};
	}

	const results = citedIds.map((id) => trace.evidence.get(id)!);
	const body = removeDraftSources(args.draft)
		.replace(/\[\[(E\d+)\]\]/gu, (_match, id: string) => (seen.has(id) ? `[${id}]` : ''))
		.trim();
	const citationPaths = getCitationPaths(results);
	const sources = results.map((result) => {
		const location = `${citationPaths.get(result.id) ?? compactCitationPath(result.path)}:${result.line_start}-${result.line_end}`;
		return `- [${result.id}] ${location} (${formatSourceIdentity(result)})`;
	});
	return {
		text: `${body}\n\nSources:\n${sources.join('\n')}`,
		evidence: {
			status: 'supported',
			query: args.query,
			searched_packages: searchedPackages,
			searched_documents: searchedDocuments,
			results
		}
	};
};
