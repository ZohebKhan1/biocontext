/**
 * Deterministic ranked lexical discovery over the query-scoped in-memory VFS.
 *
 * This deliberately remains an index-free search. It compiles the user's raw
 * question into literal symbol/term probes, ranks one line-stable window per
 * file. Fully visible excerpts become inspected evidence candidates immediately;
 * truncated excerpts still require a read before evidence can be issued.
 */
import path from 'node:path';

import { z } from 'zod';

import {
	getVirtualCollectionMetadata,
	recordQueryInspection,
	recordQuerySearch,
	type VirtualCollectionMetadata
} from '../collections/virtual-metadata.ts';
import { listVirtualFsFilesRecursive, statVirtualFs } from '../vfs/virtual-fs.ts';
import type { ToolContext } from './context.ts';
import { getQueryFile } from './query-cache.ts';
import { resolveSandboxPathWithSymlinks } from './virtual-sandbox.ts';

const DEFAULT_RESULTS = 6;
const MAX_RESULTS = 16;
const MAX_PATTERNS = 48;
const MAX_TARGET_PATTERNS = 4;
const MAX_HIT_LINES_PER_FILE = 256;
const EXCERPT_BEFORE = 5;
const EXCERPT_AFTER = 12;
const MAX_EXCERPT_LINE_LENGTH = 500;
const MAX_EXCERPT_BYTES = 3 * 1024;

const NON_SEARCH_FILES = new Set([
	'README.md',
	'DIRECTORY.md',
	'MANIFEST.json',
	'.bioconductor-meta.json',
	'.cran-meta.json',
	'_metadata.yml'
]);

const STOP_WORDS = new Set(
	'a an and are as at be because behavior by can code could default defaults did do does exact for from how i if implementation in into is it me method methods my of on or package parameter path result results should signature source that the their them then this to use using value values was what when where which why will with would you your function error get set return returns object data analysis'.split(
		' '
	)
);

export const SearchToolParameters = z.object({
	query: z
		.string()
		.max(4000)
		.describe('The complete user question or a faithful natural-language restatement'),
	packages: z
		.array(z.string().trim().min(1).max(100))
		.max(8)
		.optional()
		.describe('Optional exact mounted package/resource names used to restrict the search'),
	targets: z
		.array(z.string().trim().min(2).max(120))
		.min(1)
		.max(12)
		.optional()
		.describe(
			'Optional distinct API symbols or short requirements that each need their own ranked result group'
		),
	limit: z.coerce
		.number()
		.int()
		.min(1)
		.max(MAX_RESULTS)
		.optional()
		.describe(
			`Maximum ranked files to return (defaults to ${DEFAULT_RESULTS}; request more only for a concrete evidence gap)`
		)
});

export type SearchToolParametersType = z.infer<typeof SearchToolParameters>;

export type SearchResult = {
	package: string;
	path: string;
	lineStart: number;
	lineEnd: number;
	family: string;
	targets: string[];
	matchedTerms: string[];
	score: number;
	excerpt: string;
	evidenceReady: boolean;
};

export type SearchToolResult = {
	title: string;
	output: string;
	metadata: {
		resultCount: number;
		searchedFileCount: number;
		patterns: string[];
		packages: string[];
		unknownPackages: string[];
		results: SearchResult[];
	};
};

type QueryPlan = {
	packages: string[];
	symbols: string[];
	terms: string[];
	patterns: string[];
	targets: Array<{ label: string; patterns: string[] }>;
};

type SearchableFile = {
	absolutePath: string;
	displayPath: string;
	package: string;
	family: string;
	provenancePriority: number;
	sourcePriority: number;
};

type SearchCorpus = {
	basePath: string;
	files: SearchableFile[];
	packageNames: string[];
};

const corpusCache = new WeakMap<VirtualCollectionMetadata, Map<string, Promise<SearchCorpus>>>();

const tokenize = (text: string) =>
	text.normalize('NFKC').match(/[\p{L}\p{N}_][\p{L}\p{N}_.:-]*/gu) ?? [];

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

const buildExcerpt = (lines: readonly string[], lineStart: number, requestedEnd: number) => {
	const excerptLines: string[] = [];
	let bytes = 0;
	let evidenceReady = true;
	for (let index = lineStart - 1; index < requestedEnd; index++) {
		const sourceLine = lines[index] ?? '';
		const lineWasTruncated = sourceLine.length > MAX_EXCERPT_LINE_LENGTH;
		const rendered = lineWasTruncated
			? `${sourceLine.slice(0, MAX_EXCERPT_LINE_LENGTH)}...`
			: sourceLine;
		const nextBytes = Buffer.byteLength(rendered, 'utf8') + (excerptLines.length > 0 ? 1 : 0);
		if (excerptLines.length > 0 && bytes + nextBytes > MAX_EXCERPT_BYTES) break;
		excerptLines.push(rendered);
		if (lineWasTruncated) evidenceReady = false;
		bytes += nextBytes;
	}
	return {
		lineEnd: lineStart + excerptLines.length - 1,
		excerpt: excerptLines.join('\n'),
		evidenceReady
	};
};

const compileQuery = (
	question: string,
	packageNames: readonly string[],
	requestedPackages: readonly string[] = [],
	requestedTargets: readonly string[] = []
): { plan: QueryPlan; unknownPackages: string[] } => {
	const packageMap = new Map<string, string>();
	for (const name of packageNames) {
		const key = canonicalPackageKey(name);
		if (key && !packageMap.has(key)) packageMap.set(key, name);
	}
	const rawTokens = tokenize(question);
	const requested = requestedPackages.map((name) => ({
		original: name.normalize('NFKC').trim(),
		key: canonicalPackageKey(name)
	}));
	const unknownPackages = requested
		.filter((item) => !item.key || !packageMap.has(item.key))
		.map((item) => item.original);
	const requestedKnown = requested
		.map((item) => (item.key ? packageMap.get(item.key) : undefined))
		.filter((name): name is string => Boolean(name));
	const inferred = rawTokens
		.map((token) => packageMap.get(canonicalPackageKey(token) ?? token.toLowerCase()))
		.filter((name): name is string => Boolean(name));
	const packages = [...new Set(requested.length > 0 ? requestedKnown : inferred)];
	const explicitSymbols = [
		...question.matchAll(/`([^`]{1,80})`|\b([A-Za-z][A-Za-z0-9._]{1,79})\s*\(/gu)
	]
		.map((match) => (match[1] ?? match[2] ?? '').trim())
		.filter(Boolean);
	const shapedSymbols = rawTokens.filter(
		(token) => token.length >= 3 && (/[._]/u.test(token) || /[a-z][A-Z]/u.test(token))
	);
	const symbols = [...new Set([...explicitSymbols, ...shapedSymbols])].slice(0, 8);
	const symbolKeys = new Set(symbols.map((symbol) => symbol.toLowerCase()));
	const targetPlans = requestedTargets.map((target) => {
		const label = target.trim();
		const tokens = [...new Set(tokenize(label))].filter(
			(token) => token.length >= 2 && !STOP_WORDS.has(token.toLowerCase())
		);
		const patterns = [
			...tokens.filter((token) => /[._]|[a-z][A-Z]/u.test(token)),
			...tokens.filter((token) => !/[._]|[a-z][A-Z]/u.test(token))
		].slice(0, MAX_TARGET_PATTERNS);
		return { label, patterns: patterns.length ? patterns : [label] };
	});
	const targetPatterns = targetPlans.flatMap((target) => target.patterns);
	const terms = [
		...new Set(
			rawTokens
				.map((token) => token.toLowerCase())
				.filter(
					(token) =>
						token.length >= 3 &&
						!STOP_WORDS.has(token) &&
						!packageMap.has(token) &&
						!symbolKeys.has(token)
				)
		)
	]
		.sort((left, right) => right.length - left.length || left.localeCompare(right))
		.slice(0, 12);
	const patterns = [...new Set([...targetPatterns, ...symbols, ...terms])].slice(0, MAX_PATTERNS);
	const targets =
		targetPlans.length > 0
			? targetPlans
					.map((target) => ({
						...target,
						patterns: target.patterns.filter((pattern) => patterns.includes(pattern))
					}))
					.filter((target) => target.patterns.length > 0)
			: symbols
					.filter((symbol) => patterns.includes(symbol))
					.map((symbol) => ({ label: symbol, patterns: [symbol] }));
	return { plan: { packages, symbols, terms, patterns, targets }, unknownPackages };
};

/**
 * Package filters arrive from both the command palette and model-generated tool
 * calls, so they may contain one URL-encoded resource mention. Keep this
 * intentionally narrow: a failed decode is not repaired and path-like names
 * never become package matches.
 */
const canonicalPackageKey = (value: string): string | null => {
	let normalized = value.normalize('NFKC').trim();
	try {
		normalized = decodeURIComponent(normalized);
	} catch {
		// Retain the original text on malformed encodings.
	}
	normalized = normalized.normalize('NFKC').trim();
	if (normalized.startsWith('@')) normalized = normalized.slice(1);
	if (!normalized || normalized.includes('/') || normalized.includes('\\')) return null;
	return normalized.toLowerCase();
};

const familyForPath = (filePath: string): string => {
	const normalized = filePath.toLowerCase();
	const basename = path.posix.basename(normalized);
	if (basename === 'news' || basename === 'news.md' || normalized.includes('/news.')) return 'news';
	if (basename === 'reference-manual.md') return 'reference_manual';
	if (normalized.includes('/curated/')) return 'curated';
	if (normalized.includes('/vignettes/'))
		return normalized.includes('/source/') ? 'source_vignette' : 'vignette';
	if (normalized.includes('/source/man/') && normalized.endsWith('.rd')) return 'source_rd';
	if (normalized.includes('/source/r/') && normalized.endsWith('.r')) return 'source_r';
	if (normalized.includes('/source/src/')) return 'source_native';
	if (normalized.includes('/source/tests/') || normalized.includes('/source/inst/unittests/'))
		return 'focused_test';
	return normalized.includes('/source/') ? 'source_text' : 'authored_text';
};

const familyWeight = (family: string, requirement: string): number => {
	const apiContract =
		/signature|usage|argument|parameter|formal|default|function definition/iu.test(requirement);
	const implementation =
		/implement|internal|source|under the hood|algorithm|code path|assignment|branch|dispatch|join|helper|filter/iu.test(
			requirement
		);
	const version = /version|deprecated|default|changed|compatib|news|changelog|release note/iu.test(
		requirement
	);
	if (apiContract) {
		if (family === 'source_r') return 1.4;
		if (['source_rd', 'reference_manual'].includes(family)) return 1.3;
		if (family === 'source_native') return 1.15;
		if (family === 'focused_test') return 0.75;
		return 0.9;
	}
	if (implementation) {
		if (['source_r', 'source_native'].includes(family)) return 1.4;
		if (family === 'focused_test') return 1.05;
		if (family === 'source_text') return 1.15;
		if (['source_rd', 'source_vignette'].includes(family)) return 0.9;
		return 0.85;
	}
	if (version) return family === 'news' ? 1.35 : 1;
	if (['vignette', 'curated', 'reference_manual', 'source_rd'].includes(family)) return 1.12;
	return 1;
};

const inferPackage = (absolutePath: string, vfsId?: string): string => {
	const metadata = vfsId ? getVirtualCollectionMetadata(vfsId) : undefined;
	const normalized = absolutePath.replace(/^\/+|\/+$/gu, '');
	const resource = metadata?.resources.find(
		(item) => normalized === item.fsName || normalized.startsWith(`${item.fsName}/`)
	);
	if (resource?.package) return resource.package;
	if (resource) {
		const relativeSegments = normalized.slice(resource.fsName.length).split('/').filter(Boolean);
		const categoryIndex = relativeSegments.findIndex((segment) => /^\d+_/u.test(segment));
		if (categoryIndex >= 0 && relativeSegments[categoryIndex + 1]) {
			return relativeSegments[categoryIndex + 1]!;
		}
		return resource.name;
	}
	return normalized.split('/')[0] ?? 'unknown';
};

const provenancePriority = (absolutePath: string, vfsId?: string): number => {
	const metadata = vfsId ? getVirtualCollectionMetadata(vfsId) : undefined;
	const normalized = absolutePath.replace(/^\/+|\/+$/gu, '');
	const resource = metadata?.resources.find(
		(item) => normalized === item.fsName || normalized.startsWith(`${item.fsName}/`)
	);
	return resource?.package ? 2 : 1;
};

const isGeneratedRoutingArtifact = (absolutePath: string): boolean => {
	const basename = path.posix.basename(absolutePath);
	if (NON_SEARCH_FILES.has(basename)) return true;
	return false;
};

const createCorpus = async (basePath: string, vfsId?: string): Promise<SearchCorpus> => {
	const absoluteFiles = (await listVirtualFsFilesRecursive(basePath, vfsId)).sort((left, right) =>
		left.localeCompare(right)
	);
	const files = absoluteFiles
		.filter((absolutePath) => !isGeneratedRoutingArtifact(absolutePath))
		.map((absolutePath) => ({
			absolutePath,
			displayPath: path.posix.relative(basePath, absolutePath),
			package: inferPackage(absolutePath, vfsId),
			family: familyForPath(absolutePath),
			provenancePriority: provenancePriority(absolutePath, vfsId),
			sourcePriority: absolutePath.toLowerCase().includes('/source/') ? 1 : 0
		}));
	return {
		basePath,
		files,
		packageNames: [...new Set(files.map((file) => file.package))].sort((left, right) =>
			left.localeCompare(right)
		)
	};
};

const buildCorpus = (basePath: string, vfsId?: string): Promise<SearchCorpus> => {
	const metadata = vfsId ? getVirtualCollectionMetadata(vfsId) : undefined;
	if (!metadata) return createCorpus(basePath, vfsId);
	let byBasePath = corpusCache.get(metadata);
	if (!byBasePath) {
		byBasePath = new Map();
		corpusCache.set(metadata, byBasePath);
	}
	const cached = byBasePath.get(basePath);
	if (cached) return cached;
	const pending = createCorpus(basePath, vfsId).catch((error: unknown) => {
		byBasePath?.delete(basePath);
		throw error;
	});
	byBasePath.set(basePath, pending);
	return pending;
};

const matchTerms = (text: string, plan: QueryPlan): string[] => {
	const lower = text.toLowerCase();
	const found = new Map<string, string>();
	for (const term of plan.patterns) {
		if (lower.includes(term.toLowerCase()) && !found.has(term.toLowerCase())) {
			found.set(term.toLowerCase(), term);
		}
	}
	return [...found.values()];
};

const formatResults = (
	results: readonly SearchResult[],
	unknownPackages: readonly string[] = []
) => {
	const unknownNote =
		unknownPackages.length > 0 ? `\nunknown_packages=${JSON.stringify(unknownPackages)}` : '';
	if (results.length === 0) return `no_strong_match${unknownNote}`;
	return `Bounded search results. Exact excerpts marked evidence_ready=true are already inspected and may go directly into one batched evidence call. Read only when a wider range is needed or evidence_ready=false; batch two or more read requests with read_many.${unknownNote}\n\n${results
		.map((result, index) => {
			const target = result.targets.length > 0 ? ` targets=${JSON.stringify(result.targets)}` : '';
			const nextAction = result.evidenceReady
				? `evidence_span=${JSON.stringify({
						path: result.path,
						line_start: result.lineStart,
						line_end: result.lineEnd
					})}`
				: `read=${JSON.stringify({
						path: result.path,
						offset: result.lineStart - 1,
						limit: result.lineEnd - result.lineStart + 1
					})}`;
			return `${index + 1}. ${result.path}:${result.lineStart}-${result.lineEnd} package=${result.package} family=${result.family}${target} evidence_ready=${result.evidenceReady}\n${nextAction}\n${result.excerpt}`;
		})
		.join('\n\n')}`;
};

export const executeSearchTool = async (
	params: SearchToolParametersType,
	context: ToolContext
): Promise<SearchToolResult> => {
	const query = params.query.normalize('NFKC').trim().slice(0, 4000);
	const searchPath = await resolveSandboxPathWithSymlinks(context.basePath, '.', context.vfsId);
	const stats = await statVirtualFs(searchPath, context.vfsId).catch(() => null);
	const empty = (
		args: {
			patterns?: string[];
			packages?: string[];
			unknownPackages?: string[];
			searchedFileCount?: number;
		} = {}
	): SearchToolResult => {
		const unknownNote =
			(args.unknownPackages?.length ?? 0) > 0
				? `\nunknown_packages=${JSON.stringify(args.unknownPackages)}`
				: '';
		return {
			title: query || 'search',
			output: `no_strong_match${unknownNote}`,
			metadata: {
				resultCount: 0,
				searchedFileCount: args.searchedFileCount ?? 0,
				patterns: args.patterns ?? [],
				packages: args.packages ?? [],
				unknownPackages: args.unknownPackages ?? [],
				results: []
			}
		};
	};
	if (!query || !stats?.isDirectory) return empty();

	const corpus = await buildCorpus(searchPath, context.vfsId);
	const { plan, unknownPackages } = compileQuery(
		query,
		corpus.packageNames,
		params.packages,
		params.targets
	);
	const patterns = plan.patterns;
	if (patterns.length === 0 || ((params.packages?.length ?? 0) > 0 && plan.packages.length === 0)) {
		return empty({ patterns, packages: plan.packages, unknownPackages });
	}
	const packageKeys = new Set(
		plan.packages
			.map((name) => canonicalPackageKey(name))
			.filter((name): name is string => Boolean(name))
	);
	const files =
		packageKeys.size > 0
			? corpus.files.filter((file) => {
					const key = canonicalPackageKey(file.package);
					return key !== null && packageKeys.has(key);
				})
			: corpus.files;
	const compiledPatterns = patterns.map((term) => ({
		term,
		regex: new RegExp(escapeRegex(term), term === term.toLowerCase() ? 'iu' : 'u')
	}));
	const candidates: Array<{
		file: SearchableFile;
		lines: string[];
		matched: Set<string>;
		hits: number;
		hitLines: Set<number>;
	}> = [];

	for (const file of files) {
		const cached = await getQueryFile(file.absolutePath, context.vfsId);
		if (cached.status !== 'text' || !cached.lines) continue;
		const lines = cached.lines;
		const matched = new Set<string>();
		const hitLines = new Set<number>();
		let hits = 0;
		for (let index = 0; index < lines.length; index++) {
			for (const pattern of compiledPatterns) {
				if (!pattern.regex.test(lines[index] ?? '')) continue;
				matched.add(pattern.term);
				hits++;
				if (hitLines.size < MAX_HIT_LINES_PER_FILE) hitLines.add(index + 1);
			}
			// Ranking caps the hit contribution at eight and cannot improve once
			// every probe has appeared. The first qualifying window is the
			// deterministic tie-break winner, so later lines cannot change it.
			if (hits >= 8 && matched.size === compiledPatterns.length) break;
		}
		if (matched.size > 0) candidates.push({ file, lines, matched, hits, hitLines });
	}

	type RankedSearchResult = SearchResult & {
		provenancePriority: number;
		sourcePriority: number;
		target: string | null;
		targetMatches: number;
		targetMatchScore: number;
	};
	const rankCandidate = (
		candidate: (typeof candidates)[number],
		target: { label: string; patterns: string[] } | null
	): RankedSearchResult | null => {
		const windows = [...candidate.hitLines]
			.map((hitLine) => {
				const lineStart = Math.max(1, hitLine - EXCERPT_BEFORE);
				const requestedEnd = Math.min(candidate.lines.length, hitLine + EXCERPT_AFTER);
				const { lineEnd, excerpt, evidenceReady } = buildExcerpt(
					candidate.lines,
					lineStart,
					requestedEnd
				);
				const matchedTerms = matchTerms(excerpt, plan);
				const exact = plan.symbols.filter((symbol) =>
					matchedTerms.some((term) => term.toLowerCase() === symbol.toLowerCase())
				).length;
				const targetMatches = target
					? target.patterns.filter((pattern) =>
							matchedTerms.some((term) => term.toLowerCase() === pattern.toLowerCase())
						).length
					: 0;
				const targetMatchScore = target
					? target.patterns.reduce(
							(sum, pattern, index) =>
								sum +
								(matchedTerms.some((term) => term.toLowerCase() === pattern.toLowerCase())
									? target.patterns.length - index
									: 0),
							0
						)
					: 0;
				const targetMatch = target ? targetMatches > 0 : true;
				return {
					lineStart,
					lineEnd,
					excerpt,
					evidenceReady,
					matchedTerms,
					exact,
					targetMatch,
					targetMatches,
					targetMatchScore
				};
			})
			.filter((window) => window.targetMatch)
			.sort(
				(left, right) =>
					right.targetMatches - left.targetMatches ||
					right.targetMatchScore - left.targetMatchScore ||
					right.exact - left.exact ||
					right.matchedTerms.length - left.matchedTerms.length ||
					left.lineStart - right.lineStart
			);
		const best = windows[0];
		if (!best) return null;
		const score =
			(best.matchedTerms.length * 6 +
				candidate.matched.size * 2 +
				Math.min(candidate.hits, 8) +
				best.exact * 10 +
				(target ? 24 + best.targetMatches * 8 : 0)) *
			familyWeight(candidate.file.family, target?.label ?? query);
		return {
			package: candidate.file.package,
			path: candidate.file.displayPath,
			lineStart: best.lineStart,
			lineEnd: best.lineEnd,
			family: candidate.file.family,
			targets: target ? [target.label] : [],
			matchedTerms: best.matchedTerms,
			score,
			excerpt: best.excerpt,
			evidenceReady: best.evidenceReady,
			provenancePriority: candidate.file.provenancePriority,
			sourcePriority: candidate.file.sourcePriority,
			target: target?.label ?? null,
			targetMatches: best.targetMatches,
			targetMatchScore: best.targetMatchScore
		};
	};
	const ranked = candidates
		.flatMap((candidate) => [
			...plan.targets.map((target) => rankCandidate(candidate, target)).filter(Boolean),
			rankCandidate(candidate, null)
		])
		.filter((result): result is RankedSearchResult => Boolean(result))
		.sort(
			(left, right) =>
				right.score - left.score ||
				right.provenancePriority - left.provenancePriority ||
				right.sourcePriority - left.sourcePriority ||
				left.path.localeCompare(right.path) ||
				left.lineStart - right.lineStart
		);
	const results: SearchResult[] = [];
	const resultByExcerpt = new Map<string, SearchResult>();
	const resultLimit =
		params.limit ?? Math.min(MAX_RESULTS, Math.max(DEFAULT_RESULTS, plan.targets.length));
	const addResult = (rankedResult: RankedSearchResult): boolean => {
		const {
			provenancePriority: internalPriority,
			sourcePriority: internalSourcePriority,
			target: internalTarget,
			targetMatches: internalTargetMatches,
			targetMatchScore: internalTargetMatchScore,
			...result
		} = rankedResult;
		void internalPriority;
		void internalSourcePriority;
		void internalTarget;
		void internalTargetMatches;
		void internalTargetMatchScore;
		const duplicateKey = `${result.package.toLowerCase()}\0${result.excerpt
			.normalize('NFKC')
			.replace(/\s+/gu, ' ')
			.trim()
			.toLowerCase()}`;
		const duplicate = resultByExcerpt.get(duplicateKey);
		if (duplicate) {
			duplicate.targets = [...new Set([...duplicate.targets, ...result.targets])];
			return false;
		}
		if (results.length >= resultLimit) return false;
		resultByExcerpt.set(duplicateKey, result);
		results.push(result);
		return true;
	};
	// Reserve the best discovery result for each explicit target before using
	// remaining slots for globally strong context. One strong excerpt may cover
	// several targets; do not admit a weaker file only to make paths distinct.
	for (const target of plan.targets) {
		const candidate = ranked
			.filter((result) => result.target === target.label)
			.sort(
				(left, right) =>
					right.targetMatches - left.targetMatches ||
					right.targetMatchScore - left.targetMatchScore ||
					right.score - left.score ||
					right.provenancePriority - left.provenancePriority ||
					right.sourcePriority - left.sourcePriority ||
					left.path.localeCompare(right.path) ||
					left.lineStart - right.lineStart
			)[0];
		if (candidate) addResult(candidate);
		if (results.length >= resultLimit) break;
	}
	if (results.length < resultLimit) {
		for (const rankedResult of ranked) {
			if (rankedResult.target !== null) continue;
			addResult(rankedResult);
			if (results.length >= resultLimit) break;
		}
	}

	recordQuerySearch(
		context.vfsId,
		searchPath,
		results.map((result) => path.posix.resolve(searchPath, result.path))
	);
	for (const result of results) {
		if (!result.evidenceReady) continue;
		recordQueryInspection(context.vfsId, path.posix.resolve(searchPath, result.path), {
			start: result.lineStart,
			end: result.lineEnd
		});
	}
	return {
		title: query,
		output: formatResults(results, unknownPackages),
		metadata: {
			resultCount: results.length,
			searchedFileCount: files.length,
			patterns,
			packages: plan.packages,
			unknownPackages,
			results
		}
	};
};
