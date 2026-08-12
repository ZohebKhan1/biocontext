import { describe, expect, test } from 'bun:test';

import { formatToolTarget } from './tool-display.ts';

describe('tool display', () => {
	test('uses the path for read and grep calls', () => {
		expect(
			formatToolTarget({
				type: 'tool',
				id: 'read-1',
				toolName: 'read',
				state: 'running',
				input: { path: './reference.md' }
			})
		).toBe('./reference.md');
		expect(
			formatToolTarget({
				type: 'tool',
				id: 'grep-1',
				toolName: 'grep',
				state: 'completed',
				input: { path: './source/R' }
			})
		).toBe('./source/R');
	});

	test('uses the pattern for glob and shortens long targets', () => {
		expect(
			formatToolTarget({
				type: 'tool',
				id: 'glob-1',
				toolName: 'glob',
				state: 'running',
				input: { pattern: '**/*.md' }
			})
		).toBe('**/*.md');
		const target = 'a/'.repeat(50);
		expect(
			formatToolTarget({
				type: 'tool',
				id: 'read-2',
				toolName: 'read',
				state: 'completed',
				input: { path: target }
			})
		).toHaveLength(72);
	});

	test('shows the natural-language query for ranked search calls', () => {
		expect(
			formatToolTarget({
				type: 'tool',
				id: 'search-1',
				toolName: 'search',
				state: 'running',
				input: { query: 'How does lfcShrink preserve effect direction?' }
			})
		).toBe('How does lfcShrink preserve effect direction?');
	});

	test('summarizes batched reads without dumping every range', () => {
		expect(
			formatToolTarget({
				type: 'tool',
				id: 'read-many-1',
				toolName: 'read_many',
				state: 'running',
				input: {
					ranges: [
						{ path: 'DESeq2/source/R/results.R', offset: 10, limit: 20 },
						{ path: 'DESeq2/source/man/results.Rd', offset: 5, limit: 15 }
					]
				}
			})
		).toBe('DESeq2/source/R/results.R +1 ranges');
	});

	test('falls back to the root for missing or non-string paths', () => {
		expect(
			formatToolTarget({ type: 'tool', id: 'list-1', toolName: 'list', state: 'running' })
		).toBe('.');
	});
});
