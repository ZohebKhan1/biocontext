/**
 * Batched text reader for independent, already-discovered source spans.
 *
 * A shared byte budget is divided before any range is read. This matters for
 * evidence integrity: the inspection ledger must never authorize text that was
 * fetched internally but omitted from the model-visible tool result.
 */
import { z } from 'zod';

import type { ToolContext } from './context.ts';
import { executeReadTool, type ReadToolResult } from './read.ts';

const MAX_RANGES = 8;
const MAX_LINES_PER_RANGE = 400;
const MAX_BATCH_BYTES = 64 * 1024;
const MIN_RANGE_BYTES = 4 * 1024;

const ReadRangeParameters = z.object({
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
		.max(MAX_LINES_PER_RANGE)
		.optional()
		.describe('The number of lines to read (defaults to 250)')
});

export const ReadManyToolParameters = z.object({
	ranges: z
		.array(ReadRangeParameters)
		.min(1)
		.max(MAX_RANGES)
		.describe('One to eight independent text-file ranges to read in one tool round trip')
});

export type ReadManyToolParametersType = z.infer<typeof ReadManyToolParameters>;

type ReadManyItem = {
	path: string;
	offset: number;
	limit: number;
	lines: number;
	truncated: boolean;
};

export type ReadManyToolResult = {
	title: string;
	output: string;
	metadata: {
		ranges: ReadManyItem[];
		totalLines: number;
		truncated: boolean;
	};
};

const visibleRangeLabel = (
	params: ReadManyToolParametersType['ranges'][number],
	result: ReadToolResult
) => {
	const start = (params.offset ?? 0) + 1;
	const end = result.metadata.lines > 0 ? start + result.metadata.lines - 1 : start;
	return `${params.path}:${start}-${end}`;
};

export const executeReadManyTool = async (
	params: ReadManyToolParametersType,
	context: ToolContext
): Promise<ReadManyToolResult> => {
	const perRangeBytes = Math.max(
		MIN_RANGE_BYTES,
		Math.floor(MAX_BATCH_BYTES / params.ranges.length) - 256
	);
	const results = await Promise.all(
		params.ranges.map((range) => executeReadTool(range, context, { maxBytes: perRangeBytes }))
	);
	const items = results.map((result, index): ReadManyItem => {
		const range = params.ranges[index]!;
		return {
			path: range.path,
			offset: range.offset ?? 0,
			limit: range.limit ?? 250,
			lines: result.metadata.lines,
			truncated: result.metadata.truncated
		};
	});
	const output = results
		.map((result, index) => {
			const range = params.ranges[index]!;
			const special = result.attachments?.length
				? '\n[Use read for image or PDF attachments; read_many returns text ranges only.]'
				: '';
			return `## ${visibleRangeLabel(range, result)}\n${result.output}${special}`;
		})
		.join('\n\n');
	return {
		title: `${params.ranges.length} range${params.ranges.length === 1 ? '' : 's'}`,
		output,
		metadata: {
			ranges: items,
			totalLines: items.reduce((sum, item) => sum + item.lines, 0),
			truncated: items.some((item) => item.truncated)
		}
	};
};

export const readManyLimits = {
	maxRanges: MAX_RANGES,
	maxLinesPerRange: MAX_LINES_PER_RANGE,
	maxBatchBytes: MAX_BATCH_BYTES
};
