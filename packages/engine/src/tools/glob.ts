/**
 * Glob Tool
 * Fast file pattern matching in-memory
 */
import * as path from 'node:path';
import { z } from 'zod';

import type { ToolContext } from './context.ts';
import { globToRegExp } from './glob-pattern.ts';
import { resolveSandboxPathWithSymlinks } from './virtual-sandbox.ts';
import { listVirtualFsFilesRecursive, statVirtualFs } from '../vfs/virtual-fs.ts';

const MAX_RESULTS = 100;

export const GlobToolParameters = z.object({
	pattern: z
		.string()
		.describe('The glob pattern to match files against (e.g. "**/*.md", "source/R/*.R")'),
	path: z
		.string()
		.optional()
		.describe('Root-relative directory to search. Defaults to the current tool root.')
});

export type GlobToolParametersType = z.infer<typeof GlobToolParameters>;

export type GlobToolResult = {
	title: string;
	output: string;
	metadata: {
		count: number;
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

export const executeGlobTool = async (
	params: GlobToolParametersType,
	context: ToolContext
): Promise<GlobToolResult> => {
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
				count: 0,
				truncated: false
			}
		};
	}
	if (!stats.isDirectory) {
		return {
			title: params.pattern,
			output: `Path is not a directory: ${params.path || '.'}`,
			metadata: {
				count: 0,
				truncated: false
			}
		};
	}

	const files: string[] = [];
	const patternRegex = globToRegExp(params.pattern);
	const allFiles = (await listVirtualFsFilesRecursive(searchPath, vfsId)).sort((left, right) =>
		left.localeCompare(right)
	);

	for (const file of allFiles) {
		const relative = path.posix.relative(searchPath, file);
		if (!patternRegex.test(relative)) continue;
		files.push(file);
	}

	if (files.length === 0) {
		return {
			title: params.pattern,
			output: 'No files found matching pattern.',
			metadata: {
				count: 0,
				truncated: false
			}
		};
	}

	const truncated = files.length > MAX_RESULTS;
	const displayFiles = truncated ? files.slice(0, MAX_RESULTS) : files;
	const outputLines = displayFiles.map((file) => path.posix.relative(basePath, file));

	if (truncated) {
		outputLines.push('');
		outputLines.push(
			`[Truncated: Results limited to ${MAX_RESULTS} files. Use a more specific pattern for more targeted results.]`
		);
	}

	return {
		title: params.pattern,
		output: outputLines.join('\n'),
		metadata: {
			count: displayFiles.length,
			truncated
		}
	};
};
