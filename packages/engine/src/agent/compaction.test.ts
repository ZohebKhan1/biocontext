import { describe, expect, it } from 'bun:test';
import type { ModelMessage } from 'ai';

import {
	compactToolResultMessages,
	createCompactionStats,
	prepareCompactedStep,
	TOOL_RESULT_COMPACTION_THRESHOLD_BYTES
} from './compaction.ts';

const assistantCall = (id: string, toolName: string, input: unknown): ModelMessage =>
	({
		role: 'assistant',
		content: [{ type: 'tool-call', toolCallId: id, toolName, input }]
	}) as ModelMessage;

const toolResult = (id: string, toolName: string, output: unknown): ModelMessage =>
	({
		role: 'tool',
		content: [
			{
				type: 'tool-result',
				toolCallId: id,
				toolName,
				output: {
					type: 'text',
					value: typeof output === 'string' ? output : JSON.stringify(output)
				}
			}
		]
	}) as ModelMessage;

describe('deterministic tool-result compaction', () => {
	it('compacts old discovery and cited reads while preserving evidence, calls, and recent batches', () => {
		const messages: ModelMessage[] = [
			{ role: 'user', content: 'What does the package do?' },
			assistantCall('search-1', 'search', { query: 'complete question' }),
			toolResult('search-1', 'search', 's'.repeat(40_000)),
			assistantCall('read-1', 'read', { path: 'source/R/old.R' }),
			toolResult('read-1', 'read', 'r'.repeat(40_000)),
			assistantCall('evidence-1', 'evidence', {
				path: 'source/R/old.R',
				line_start: 1,
				line_end: 2
			}),
			toolResult('evidence-1', 'evidence', {
				evidence_id: 'E1',
				path: 'source/R/old.R',
				content: 'authoritative evidence'
			}),
			assistantCall('read-2', 'read', { path: 'source/R/current.R' }),
			toolResult('read-2', 'read', 'a'.repeat(1_000)),
			assistantCall('read-3', 'read', { path: 'source/R/current.R' }),
			toolResult('read-3', 'read', 'b'.repeat(1_000)),
			assistantCall('read-4', 'read', { path: 'source/R/current.R' }),
			toolResult('read-4', 'read', 'c'.repeat(1_000)),
			assistantCall('read-5', 'read', { path: 'source/R/current.R' }),
			toolResult('read-5', 'read', 'd'.repeat(1_000))
		];
		const before = JSON.stringify(messages);
		const result = compactToolResultMessages(messages);

		expect(result.compacted).toBe(true);
		expect(result.compactedResults).toBe(2);
		expect(result.compactedBytes).toBeGreaterThan(0);
		expect(JSON.stringify(messages)).toBe(before);

		const serialized = JSON.stringify(result.messages);
		expect(serialized).toContain('compacted search result');
		expect(serialized).toContain('compacted read of source/R/old.R');
		expect(serialized).toContain('authoritative evidence');
		expect(serialized).toContain('a'.repeat(1_000));
		expect(serialized).toContain('d'.repeat(1_000));
		expect(serialized).toContain('read-1');
		expect(serialized).toContain('evidence-1');

		const compactedToolOutputs = result.messages
			.filter((message) => message.role === 'tool')
			.flatMap((message) => (Array.isArray(message.content) ? message.content : []))
			.filter((part) => (part as { type?: string }).type === 'tool-result')
			.map((part) => (part as { output?: unknown }).output);
		expect(
			compactedToolOutputs.every(
				(output) =>
					(output as { type?: string; value?: unknown })?.type === 'text' &&
					(output as { type?: string; value?: unknown })?.value !== undefined
			)
		).toBe(true);
	});

	it('preserves uncited reads and rehydrates a path when it is read again', () => {
		const messages: ModelMessage[] = [
			{ role: 'user', content: 'Question' },
			assistantCall('read-old', 'read', { path: 'source/R/repeated.R' }),
			toolResult('read-old', 'read', 'x'.repeat(60_000)),
			assistantCall('uncited', 'read', { path: 'source/R/uncited.R' }),
			toolResult('uncited', 'read', 'u'.repeat(30_000)),
			assistantCall('evidence', 'evidence', {
				path: 'source/R/repeated.R',
				line_start: 1,
				line_end: 1
			}),
			toolResult('evidence', 'evidence', { evidence_id: 'E1', path: 'source/R/repeated.R' }),
			assistantCall('read-new', 'read', { path: 'source/R/repeated.R' }),
			toolResult('read-new', 'read', 'new authoritative read'),
			assistantCall('read-new-2', 'read', { path: 'source/R/repeated.R' }),
			toolResult('read-new-2', 'read', 'newer authoritative read'),
			assistantCall('read-new-3', 'read', { path: 'source/R/repeated.R' }),
			toolResult('read-new-3', 'read', 'newest authoritative read')
		];
		const result = compactToolResultMessages(messages);
		const serialized = JSON.stringify(result.messages);
		expect(serialized).toContain('compacted read of source/R/repeated.R');
		expect(serialized).toContain('u'.repeat(30_000));
		expect(serialized).toContain('new authoritative read');
	});

	it('names the inspected line range so a compacted read is cited rather than re-read', () => {
		const messages: ModelMessage[] = [
			{ role: 'user', content: 'Question' },
			assistantCall('read-1', 'read', { path: 'source/R/results.R', offset: 99, limit: 250 }),
			toolResult('read-1', 'read', 'r'.repeat(90_000)),
			assistantCall('evidence', 'evidence', {
				path: 'source/R/results.R',
				line_start: 100,
				line_end: 120
			}),
			toolResult('evidence', 'evidence', { evidence_id: 'E1', path: 'source/R/results.R' }),
			assistantCall('read-2', 'read', { path: 'source/R/a.R' }),
			toolResult('read-2', 'read', 'a'),
			assistantCall('read-3', 'read', { path: 'source/R/b.R' }),
			toolResult('read-3', 'read', 'b'),
			assistantCall('read-4', 'read', { path: 'source/R/c.R' }),
			toolResult('read-4', 'read', 'c'),
			assistantCall('read-5', 'read', { path: 'source/R/d.R' }),
			toolResult('read-5', 'read', 'd')
		];
		const serialized = JSON.stringify(compactToolResultMessages(messages).messages);
		expect(serialized).toContain('compacted read of source/R/results.R lines 100-349');
		expect(serialized).toContain('cite them directly with evidence');
		expect(serialized).not.toContain('re-read if needed');
	});

	it('uses UTF-8 bytes at the exact threshold, is idempotent, and starts after step four', () => {
		const exact: ModelMessage[] = [
			{ role: 'user', content: 'Question' },
			assistantCall('search', 'search', { query: 'q' }),
			toolResult('search', 'search', 'é'.repeat(TOOL_RESULT_COMPACTION_THRESHOLD_BYTES / 2)),
			assistantCall('grep', 'grep', { pattern: 'q' }),
			toolResult('grep', 'grep', ''),
			assistantCall('list', 'list', { path: '.' }),
			toolResult('list', 'list', '')
		];
		const atThreshold = compactToolResultMessages(exact);
		expect(atThreshold.toolResultBytes).toBe(TOOL_RESULT_COMPACTION_THRESHOLD_BYTES);
		expect(atThreshold.compacted).toBe(false);
		const base = exact.map((message, index) =>
			index === 2
				? toolResult(
						'search',
						'search',
						'é'.repeat(TOOL_RESULT_COMPACTION_THRESHOLD_BYTES / 2) + 'x'
					)
				: message
		) as ModelMessage[];

		const stats = createCompactionStats();
		const before = JSON.stringify(base);
		const compacted = prepareCompactedStep({ stepNumber: 3, messages: base, stats });
		expect(compacted).toBeUndefined();
		expect(stats).toEqual({ passes: 0, compactedResults: 0, compactedBytes: 0 });
		expect(JSON.stringify(base)).toBe(before);

		const next = prepareCompactedStep({ stepNumber: 4, messages: base, stats });
		expect(next).toBeDefined();
		const second = prepareCompactedStep({ stepNumber: 5, messages: next!, stats });
		expect(second).toBeUndefined();
		expect(stats.passes).toBe(1);
	});
});
