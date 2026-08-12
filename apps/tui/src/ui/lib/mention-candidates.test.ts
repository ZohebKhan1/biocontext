import { describe, expect, test } from 'bun:test';

import { buildMentionCandidates, filterMentionCandidates } from './mention-candidates.ts';

describe('mention candidates', () => {
	test('offers Bioconductor packages by case-insensitive name prefix', () => {
		const candidates = buildMentionCandidates(
			[{ name: 'Bioconductor', type: 'git' }],
			['edgeR', 'maSigPro', 'MAST']
		);

		expect(filterMentionCandidates(candidates, '@ma')).toEqual([
			{ name: 'maSigPro', kind: 'package' },
			{ name: 'MAST', kind: 'package' }
		]);
	});

	test('does not use substring matches for package completion', () => {
		const candidates = buildMentionCandidates([], ['maSigPro', 'RNAmodR']);
		expect(filterMentionCandidates(candidates, '@mod')).toEqual([]);
	});

	test('keeps configured resources first and removes package-name collisions', () => {
		const candidates = buildMentionCandidates(
			[
				{ name: 'Bioconductor', type: 'git' },
				{ name: 'DESeq2', type: 'local' }
			],
			['deseq2', 'maSigPro', 'edgeR', '']
		);

		expect(candidates).toEqual([
			{ name: 'Bioconductor', kind: 'resource' },
			{ name: 'DESeq2', kind: 'resource' },
			{ name: 'edgeR', kind: 'package' },
			{ name: 'maSigPro', kind: 'package' }
		]);
	});

	test('hides configured Bioconductor packages whose local folder is unavailable', () => {
		const candidates = buildMentionCandidates(
			[
				{ name: 'Bioconductor', type: 'git' },
				{ name: 'DESeq2', type: 'bioconductor', package: 'DESeq2' },
				{ name: 'edge-docs', type: 'bioconductor', package: 'edgeR' }
			],
			['edgeR']
		);

		expect(candidates).toEqual([
			{ name: 'Bioconductor', kind: 'resource' },
			{ name: 'edge-docs', kind: 'resource' },
			{ name: 'edgeR', kind: 'package' }
		]);
	});

	test('falls back cleanly to configured resources when no local packages are available', () => {
		const candidates = buildMentionCandidates([{ name: 'Bioconductor', type: 'git' }], []);
		expect(filterMentionCandidates(candidates, '@')).toEqual([
			{ name: 'Bioconductor', kind: 'resource' }
		]);
	});

	test('keeps configured CRAN package resources available as ordinary mentions', () => {
		expect(
			buildMentionCandidates([{ name: 'Seurat', type: 'cran', package: 'Seurat' }], [])
		).toEqual([{ name: 'Seurat', kind: 'resource' }]);
	});
});
