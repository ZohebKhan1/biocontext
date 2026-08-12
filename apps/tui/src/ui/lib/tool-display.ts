import type { Chunk } from '../types.ts';

const toolInput = (chunk: Extract<Chunk, { type: 'tool' }>): Record<string, unknown> =>
	chunk.input && typeof chunk.input === 'object' ? (chunk.input as Record<string, unknown>) : {};

/** Keep tool activity useful at a glance without dumping the full JSON input. */
export const formatToolTarget = (chunk: Extract<Chunk, { type: 'tool' }>): string => {
	const input = toolInput(chunk);
	const evidenceSpans = Array.isArray(input.spans) ? input.spans : [];
	const evidencePath =
		evidenceSpans[0] && typeof evidenceSpans[0] === 'object'
			? (evidenceSpans[0] as Record<string, unknown>).path
			: undefined;
	const readRanges = Array.isArray(input.ranges) ? input.ranges : [];
	const firstReadPath =
		readRanges[0] && typeof readRanges[0] === 'object'
			? (readRanges[0] as Record<string, unknown>).path
			: undefined;
	const value =
		chunk.toolName === 'search'
			? input.query
			: chunk.toolName === 'read_many'
				? `${typeof firstReadPath === 'string' ? firstReadPath : '.'}${readRanges.length > 1 ? ` +${readRanges.length - 1} ranges` : ''}`
				: chunk.toolName === 'evidence'
					? `${typeof evidencePath === 'string' ? evidencePath : '.'}${evidenceSpans.length > 1 ? ` +${evidenceSpans.length - 1} spans` : ''}`
					: chunk.toolName === 'glob'
						? (input.pattern ?? input.path)
						: (input.path ?? input.pattern);
	if (typeof value !== 'string' || value.trim().length === 0) return '.';
	const compact = value.trim().replace(/\s+/gu, ' ');
	return compact.length > 72 ? `${compact.slice(0, 69)}...` : compact;
};
