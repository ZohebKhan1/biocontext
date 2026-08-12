/**
 * List Tool
 * Lists directory contents with file types
 */
import * as path from 'node:path';
import { z } from 'zod';

import type { ToolContext } from './context.ts';
import { resolveSandboxPathWithSymlinks } from './virtual-sandbox.ts';
import { readdirVirtualFs, statVirtualFs } from '../vfs/virtual-fs.ts';

export const ListToolParameters = z.object({
	path: z.string().describe('Directory path relative to the current tool root')
});

export type ListToolParametersType = z.infer<typeof ListToolParameters>;

export type ListToolEntry = {
	name: string;
	type: 'file' | 'directory' | 'other';
	size?: number;
};

export type ListToolResult = {
	title: string;
	output: string;
	metadata: {
		entries: ListToolEntry[];
		fileCount: number;
		directoryCount: number;
	};
};

const safeStat = async (filePath: string, vfsId?: string) => {
	try {
		return await statVirtualFs(filePath, vfsId);
	} catch {
		return null;
	}
};

export const executeListTool = async (
	params: ListToolParametersType,
	context: ToolContext
): Promise<ListToolResult> => {
	const { basePath, vfsId } = context;
	const resolvedPath = await resolveSandboxPathWithSymlinks(basePath, params.path, vfsId);
	const stats = await safeStat(resolvedPath, vfsId);
	if (!stats) {
		return {
			title: params.path,
			output: `Directory not found: ${params.path}`,
			metadata: {
				entries: [],
				fileCount: 0,
				directoryCount: 0
			}
		};
	}
	if (!stats.isDirectory) {
		return {
			title: params.path,
			output: `Path is not a directory: ${params.path}`,
			metadata: {
				entries: [],
				fileCount: 0,
				directoryCount: 0
			}
		};
	}

	const entries: ListToolEntry[] = [];
	const dirents = await readdirVirtualFs(resolvedPath, vfsId);
	for (const dirent of dirents) {
		let type: ListToolEntry['type'] = 'other';
		let size: number | undefined;
		if (dirent.isDirectory) {
			type = 'directory';
		} else if (dirent.isFile) {
			type = 'file';
			const stats = await safeStat(path.posix.join(resolvedPath, dirent.name), vfsId);
			size = stats?.size;
		}
		entries.push({
			name: dirent.name,
			type,
			size
		});
	}

	entries.sort((a, b) => {
		if (a.type === 'directory' && b.type !== 'directory') return -1;
		if (a.type !== 'directory' && b.type === 'directory') return 1;
		return a.name.localeCompare(b.name);
	});

	const fileCount = entries.filter((e) => e.type === 'file').length;
	const directoryCount = entries.filter((e) => e.type === 'directory').length;
	const outputLines: string[] = [];

	for (const entry of entries) {
		let line: string;
		if (entry.type === 'directory') {
			line = `[DIR]  ${entry.name}/`;
		} else if (entry.type === 'file') {
			const sizeStr = entry.size !== undefined ? formatSize(entry.size) : '';
			line = `[FILE] ${entry.name}${sizeStr ? ` (${sizeStr})` : ''}`;
		} else {
			line = `[???]  ${entry.name}`;
		}
		outputLines.push(line);
	}

	outputLines.push('');
	outputLines.push(
		`Total: ${entries.length} items (${directoryCount} directories, ${fileCount} files)`
	);

	return {
		title: params.path,
		output: outputLines.join('\n'),
		metadata: {
			entries,
			fileCount,
			directoryCount
		}
	};
};

const formatSize = (bytes: number): string => {
	const units = ['B', 'KB', 'MB', 'GB'];
	let size = bytes;
	let unitIndex = 0;

	while (size >= 1024 && unitIndex < units.length - 1) {
		size /= 1024;
		unitIndex++;
	}

	return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
};
