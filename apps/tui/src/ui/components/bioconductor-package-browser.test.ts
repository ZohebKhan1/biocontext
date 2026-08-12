import { describe, expect, test } from 'bun:test';

import { createBioconductorResourceInput, getVisibleStart } from './bioconductor-package-browser.tsx';

const MAX_VISIBLE = 8;

describe('getVisibleStart', () => {
	test('does not scroll when everything fits', () => {
		expect(getVisibleStart(0, 3)).toBe(0);
		expect(getVisibleStart(2, 3)).toBe(0);
		expect(getVisibleStart(7, 8)).toBe(0);
	});

	test('keeps the top of a long list pinned until the selection passes the middle', () => {
		expect(getVisibleStart(0, 100)).toBe(0);
		expect(getVisibleStart(3, 100)).toBe(0);
		expect(getVisibleStart(4, 100)).toBe(0);
		expect(getVisibleStart(5, 100)).toBe(1);
	});

	test('centres the selection in the middle of a long list', () => {
		expect(getVisibleStart(50, 100)).toBe(46);
	});

	test('never scrolls past the end', () => {
		// The last window is [92, 100); centring stops once it would overrun.
		expect(getVisibleStart(99, 100)).toBe(92);
		expect(getVisibleStart(96, 100)).toBe(92);
		expect(getVisibleStart(95, 100)).toBe(91);
	});

	test('always yields a full window for a long list', () => {
		for (let index = 0; index < 100; index += 1) {
			const start = getVisibleStart(index, 100);
			expect(start).toBeGreaterThanOrEqual(0);
			expect(start + MAX_VISIBLE).toBeLessThanOrEqual(100);
			// The selected row must be inside the window it computes.
			expect(index).toBeGreaterThanOrEqual(start);
			expect(index).toBeLessThan(start + MAX_VISIBLE);
		}
	});

	test('handles an empty list', () => {
		expect(getVisibleStart(0, 0)).toBe(0);
	});
});

describe('createBioconductorResourceInput', () => {
	test('uses mandatory automatic source for a new /add installation', () => {
		expect(createBioconductorResourceInput('DESeq2')).toEqual({
			type: 'bioconductor',
			name: 'DESeq2',
			package: 'DESeq2'
		});
	});

	test('preserves configured document, release, source, branch, and note settings', () => {
		expect(
			createBioconductorResourceInput('DESeq2', {
				name: 'DESeq2',
				type: 'bioconductor',
				url: 'DESeq2',
				branch: 'main',
				package: 'DESeq2',
				release: '3.22',
				documents: ['vignettes', 'manual'],
				source: 'https://github.com/me/DESeq2',
				sourceBranch: 'experiment',
				specialNotes: 'lab checkout'
			})
		).toEqual({
			type: 'bioconductor',
			name: 'DESeq2',
			package: 'DESeq2',
			release: '3.22',
			documents: ['vignettes', 'manual'],
			source: 'https://github.com/me/DESeq2',
			sourceBranch: 'experiment',
			specialNotes: 'lab checkout'
		});
	});

	test('drops legacy boolean source settings and their branch', () => {
		const resource = createBioconductorResourceInput('edgeR', {
			name: 'edgeR',
			type: 'bioconductor',
			url: 'edgeR',
			branch: 'main',
			source: true,
			sourceBranch: 'devel'
		});
		expect(resource.source).toBeUndefined();
		expect(resource.sourceBranch).toBeUndefined();
	});
});
