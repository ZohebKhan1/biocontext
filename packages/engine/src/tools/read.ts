/**
 * Read Tool
 * Reads file contents with line numbers, truncation, and special file handling
 */
import * as path from 'node:path';
import { z } from 'zod';

import type { ToolContext } from './context.ts';
import { resolveSandboxPathWithSymlinks } from './virtual-sandbox.ts';
import { existsInVirtualFs, readdirVirtualFs } from '../vfs/virtual-fs.ts';
import {
	getVirtualCollectionMetadata,
	recordQueryInspection
} from '../collections/virtual-metadata.ts';
import { getQueryFile } from './query-cache.ts';

const DEFAULT_MAX_LINES = 250;
export const MAX_READ_LINES = 2000;
const MAX_BYTES = 50 * 1024;
const MAX_LINE_LENGTH = 2000;

export const ReadToolParameters = z.object({
	path: z.string().describe('File path relative to the current tool root'),
	offset: z.coerce
		.number()
		.int()
		.nonnegative()
		.optional()
		.describe('The line number to start reading from (0-based)'),
	limit: z.coerce
		.number()
		.int()
		.positive()
		.max(MAX_READ_LINES)
		.optional()
		.describe(`The number of lines to read (defaults to ${DEFAULT_MAX_LINES})`)
});

export type ReadToolParametersType = z.infer<typeof ReadToolParameters>;

export type ReadToolResult = {
	title: string;
	output: string;
	metadata: {
		lines: number;
		truncated: boolean;
		truncatedByLines?: boolean;
		truncatedByBytes?: boolean;
		reused?: boolean;
		isImage?: boolean;
		isPdf?: boolean;
		isBinary?: boolean;
	};
	attachments?: Array<{
		type: 'file';
		mime: string;
		data: string;
	}>;
};

const uncoveredRanges = (
	ranges: readonly { start: number; end: number }[],
	start: number,
	end: number
): Array<{ start: number; end: number }> => {
	const uncovered: Array<{ start: number; end: number }> = [];
	let cursor = start;
	for (const range of [...ranges].sort((left, right) => left.start - right.start)) {
		if (range.end < cursor) continue;
		if (range.start > end) break;
		if (range.start > cursor)
			uncovered.push({ start: cursor, end: Math.min(end, range.start - 1) });
		cursor = Math.max(cursor, range.end + 1);
		if (cursor > end) break;
	}
	if (cursor <= end) uncovered.push({ start: cursor, end });
	return uncovered;
};

const IMAGE_EXTENSIONS = new Set([
	'.png',
	'.jpg',
	'.jpeg',
	'.gif',
	'.webp',
	'.bmp',
	'.ico',
	'.svg'
]);

const PDF_EXTENSIONS = new Set(['.pdf']);

export const executeReadTool = async (
	params: ReadToolParametersType,
	context: ToolContext,
	options: { maxBytes?: number } = {}
): Promise<ReadToolResult> => {
	const { basePath, vfsId } = context;
	const resolvedPath = await resolveSandboxPathWithSymlinks(basePath, params.path, vfsId);
	const exists = await existsInVirtualFs(resolvedPath, vfsId);
	if (!exists) {
		const dir = path.dirname(resolvedPath);
		const filename = path.basename(resolvedPath);

		let files: string[] = [];
		try {
			const entries = await readdirVirtualFs(dir, vfsId);
			files = entries.map((entry) => entry.name);
		} catch {
			files = [];
		}

		const suggestions = files
			.filter((f) => f.toLowerCase().includes(filename.toLowerCase().slice(0, 3)))
			.slice(0, 5);
		const suggestionText =
			suggestions.length > 0
				? `\nDid you mean:\n${suggestions.map((s) => `  - ${s}`).join('\n')}`
				: '';

		return {
			title: params.path,
			output: `File not found: ${params.path}${suggestionText}`,
			metadata: {
				lines: 0,
				truncated: false
			}
		};
	}

	const ext = path.extname(resolvedPath).toLowerCase();

	if (IMAGE_EXTENSIONS.has(ext)) {
		const bytes = (await getQueryFile(resolvedPath, vfsId)).bytes ?? new Uint8Array();
		const base64 = Buffer.from(bytes).toString('base64');
		const mime = getImageMime(ext);

		return {
			title: params.path,
			output: `[Image file: ${path.basename(resolvedPath)}]`,
			metadata: {
				lines: 0,
				truncated: false,
				isImage: true
			},
			attachments: [
				{
					type: 'file',
					mime,
					data: base64
				}
			]
		};
	}

	if (PDF_EXTENSIONS.has(ext)) {
		const bytes = (await getQueryFile(resolvedPath, vfsId)).bytes ?? new Uint8Array();
		const base64 = Buffer.from(bytes).toString('base64');

		return {
			title: params.path,
			output: `[PDF file: ${path.basename(resolvedPath)}]`,
			metadata: {
				lines: 0,
				truncated: false,
				isPdf: true
			},
			attachments: [
				{
					type: 'file',
					mime: 'application/pdf',
					data: base64
				}
			]
		};
	}

	const cached = await getQueryFile(resolvedPath, vfsId);
	if (cached.status === 'binary') {
		return {
			title: params.path,
			output: `[Binary file: ${path.basename(resolvedPath)}]`,
			metadata: {
				lines: 0,
				truncated: false,
				isBinary: true
			}
		};
	}

	if (cached.status !== 'text' || !cached.lines) {
		return {
			title: params.path,
			output: `Unable to decode file: ${params.path}`,
			metadata: { lines: 0, truncated: false, isBinary: true }
		};
	}
	const allLines = cached.lines;
	const maxBytes = Math.max(1, Math.min(MAX_BYTES, options.maxBytes ?? MAX_BYTES));

	const offset = params.offset ?? 0;
	const limit = params.limit ?? DEFAULT_MAX_LINES;
	const requestedStart = offset + 1;
	const requestedEnd = Math.min(allLines.length, offset + limit);
	const priorRanges = vfsId
		? (getVirtualCollectionMetadata(vfsId)?.trace.inspectedRanges.get(resolvedPath) ?? [])
		: [];
	const unseen =
		requestedEnd >= requestedStart
			? uncoveredRanges(priorRanges, requestedStart, requestedEnd)
			: [];
	if (requestedEnd >= requestedStart && unseen.length === 0) {
		return {
			title: params.path,
			output: `[Already inspected: ${params.path} lines ${requestedStart}-${requestedEnd}. These lines remain eligible for evidence; cite them directly or read a different range.]`,
			metadata: { lines: 0, truncated: false, reused: true }
		};
	}
	const narrowed =
		unseen.length === 1 && (unseen[0]!.start !== requestedStart || unseen[0]!.end !== requestedEnd);
	const readStart = narrowed ? unseen[0]!.start : requestedStart;
	const readEnd = narrowed ? unseen[0]!.end : requestedEnd;
	const readOffset = readStart - 1;

	let truncatedByLines = false;
	let truncatedByBytes = false;
	const outputLines: string[] = [];
	const fullyReadRanges: Array<{ start: number; end: number }> = [];
	let totalBytes = 0;
	const endLine = readEnd;

	for (let i = readOffset; i < endLine; i++) {
		let line = allLines[i] ?? '';
		let lineTruncated = false;
		if (line.length > MAX_LINE_LENGTH) {
			line = line.substring(0, MAX_LINE_LENGTH) + '...';
			lineTruncated = true;
		}

		const lineBytes = Buffer.byteLength(line, 'utf8');
		if (totalBytes + lineBytes > maxBytes) {
			truncatedByBytes = true;
			break;
		}

		outputLines.push(line);
		totalBytes += lineBytes;
		if (!lineTruncated) {
			const lineNumber = i + 1;
			const previous = fullyReadRanges.at(-1);
			if (previous && previous.end + 1 === lineNumber) previous.end = lineNumber;
			else fullyReadRanges.push({ start: lineNumber, end: lineNumber });
		}
	}
	if (outputLines.length > 0) {
		recordQueryInspection(vfsId, resolvedPath);
		for (const range of fullyReadRanges) recordQueryInspection(vfsId, resolvedPath, range);
	}

	if (outputLines.length < endLine - readOffset || (!narrowed && endLine < allLines.length)) {
		truncatedByLines = !truncatedByBytes && outputLines.length >= limit;
	}

	const formattedOutput = outputLines
		.map((line, index) => {
			const lineNum = (index + readOffset + 1).toString().padStart(5, ' ');
			return `${lineNum}\t${line}`;
		})
		.join('\n');

	let truncationMessage = '';
	if (truncatedByBytes || truncatedByLines) {
		const remaining = allLines.length - readOffset - outputLines.length;
		if (remaining > 0) {
			truncationMessage = `\n\n[Truncated: ${remaining} more lines. Use offset=${offset + outputLines.length} to continue reading.]`;
		}
	}
	const reuseMessage = narrowed
		? `\n\n[Previously inspected portions of requested lines ${requestedStart}-${requestedEnd} were omitted; only new lines are shown. The full requested range remains eligible for evidence.]`
		: '';

	return {
		title: params.path,
		output: formattedOutput + reuseMessage + truncationMessage,
		metadata: {
			lines: outputLines.length,
			truncated: truncatedByBytes || truncatedByLines,
			truncatedByLines,
			truncatedByBytes,
			reused: narrowed || undefined
		}
	};
};

const getImageMime = (ext: string): string => {
	switch (ext) {
		case '.png':
			return 'image/png';
		case '.jpg':
		case '.jpeg':
			return 'image/jpeg';
		case '.gif':
			return 'image/gif';
		case '.webp':
			return 'image/webp';
		case '.bmp':
			return 'image/bmp';
		case '.ico':
			return 'image/x-icon';
		case '.svg':
			return 'image/svg+xml';
		default:
			return 'application/octet-stream';
	}
};
