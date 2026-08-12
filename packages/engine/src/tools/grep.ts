/**
 * Grep Tool
 * Searches file contents using regular expressions in-memory
 */
import * as path from 'node:path';
import { z } from 'zod';

import type { ToolContext } from './context.ts';
import { buildIncludeMatcher } from './glob-pattern.ts';
import { resolveSandboxPathWithSymlinks } from './virtual-sandbox.ts';
import { listVirtualFsFilesRecursive, statVirtualFs } from '../vfs/virtual-fs.ts';
import { recordQuerySearch } from '../collections/virtual-metadata.ts';
import { getQueryFile } from './query-cache.ts';

const DEFAULT_RESULTS = 25;
const MAX_RESULTS = 100;

export const GrepToolParameters = z.object({
	pattern: z.string().describe('The regex pattern to search for in file contents'),
	path: z
		.string()
		.optional()
		.describe('Root-relative directory to search. Defaults to the current tool root.'),
	include: z
		.string()
		.optional()
		.describe('File pattern to include in the search (e.g. "*.md", "*.{R,Rmd}")'),
	limit: z.coerce
		.number()
		.int()
		.min(1)
		.max(MAX_RESULTS)
		.optional()
		.describe(
			`Maximum matches to return (defaults to ${DEFAULT_RESULTS}; request more only after narrowing the pattern or path)`
		)
});

export type GrepToolParametersType = z.infer<typeof GrepToolParameters>;

export type GrepToolResult = {
	title: string;
	output: string;
	metadata: {
		matchCount: number;
		fileCount: number;
		truncated: boolean;
	};
};

const safeStat = async (filePath: string, vfsId?: string) => {
	try {
		return await statVirtualFs(filePath, vfsId);
	} catch {
		return null;
	}
};

const compileRegex = (pattern: string) => {
	try {
		return new RegExp(pattern);
	} catch {
		return null;
	}
};

export const executeGrepTool = async (
	params: GrepToolParametersType,
	context: ToolContext
): Promise<GrepToolResult> => {
	const { basePath, vfsId } = context;
	const searchPath = params.path
		? await resolveSandboxPathWithSymlinks(basePath, params.path, vfsId)
		: await resolveSandboxPathWithSymlinks(basePath, '.', vfsId);
	const stats = await safeStat(searchPath, vfsId);
	if (!stats) {
		return {
			title: params.pattern,
			output: `Directory not found: ${params.path || '.'}`,
			metadata: {
				matchCount: 0,
				fileCount: 0,
				truncated: false
			}
		};
	}
	const searchFiles = stats.isFile
		? [searchPath]
		: await listVirtualFsFilesRecursive(searchPath, vfsId);

	const regex = compileRegex(params.pattern);
	if (!regex) {
		return {
			title: params.pattern,
			output: 'Invalid regex pattern.',
			metadata: {
				matchCount: 0,
				fileCount: 0,
				truncated: false
			}
		};
	}

	const includeMatcher = params.include ? buildIncludeMatcher(params.include) : null;
	const resultLimit = params.limit ?? DEFAULT_RESULTS;
	const allFiles = searchFiles.sort((left, right) => left.localeCompare(right));
	const results: Array<{ path: string; lineNumber: number; lineText: string }> = [];

	for (const filePath of allFiles) {
		if (results.length > resultLimit) break;
		const relative = path.posix.relative(
			stats.isFile ? path.dirname(searchPath) : searchPath,
			filePath
		);
		if (includeMatcher && !includeMatcher(relative)) continue;
		const cached = await getQueryFile(filePath, vfsId);
		if (cached.status !== 'text' || !cached.lines) continue;
		const lines = cached.lines;
		for (let i = 0; i < lines.length; i++) {
			const lineText = lines[i] ?? '';
			if (!regex.test(lineText)) continue;
			results.push({
				path: filePath,
				lineNumber: i + 1,
				lineText
			});
			if (results.length > resultLimit) break;
		}
	}
	recordQuerySearch(
		vfsId,
		searchPath,
		results.map((result) => result.path)
	);

	if (results.length === 0) {
		return {
			title: params.pattern,
			output: 'No matches found.',
			metadata: {
				matchCount: 0,
				fileCount: 0,
				truncated: false
			}
		};
	}

	const truncated = results.length > resultLimit;
	const displayResults = results.slice(0, resultLimit);

	const fileGroups = new Map<string, Array<{ lineNumber: number; lineText: string }>>();
	for (const result of displayResults) {
		const relativePath = path.posix.relative(basePath, result.path);
		if (!fileGroups.has(relativePath)) {
			fileGroups.set(relativePath, []);
		}
		fileGroups.get(relativePath)!.push({
			lineNumber: result.lineNumber,
			lineText: result.lineText
		});
	}

	const outputLines: string[] = [];
	for (const [filePath, matches] of fileGroups) {
		outputLines.push(`${filePath}:`);
		for (const match of matches) {
			const lineText =
				match.lineText.length > 200 ? match.lineText.substring(0, 200) + '...' : match.lineText;
			outputLines.push(`  ${match.lineNumber}: ${lineText}`);
		}
		outputLines.push('');
	}

	if (truncated) {
		outputLines.push(
			`[Truncated: Results limited to ${resultLimit} matches. Narrow the pattern/path, or request a higher limit explicitly.]`
		);
	}

	return {
		title: params.pattern,
		output: outputLines.join('\n').trim(),
		metadata: {
			matchCount: displayResults.length,
			fileCount: fileGroups.size,
			truncated
		}
	};
};
