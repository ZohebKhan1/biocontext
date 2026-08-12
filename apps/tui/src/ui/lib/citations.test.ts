import { describe, expect, test } from 'bun:test';

import { parseSources } from './citations.ts';

describe('response citations', () => {
	test('moves inline local paths into a clean source list', () => {
		const parsed = parseSources('The default is all annotated genes.[./reference.md]');

		expect(parsed.body).toBe('The default is all annotated genes.');
		expect(parsed.sources).toEqual([
			{ label: './reference.md', target: './reference.md', remote: false }
		]);
	});

	test('supports a Markdown Sources heading and local paths', () => {
		const parsed = parseSources('Answer\n\n### Sources\n- ./reference.md\n- ./curated/book.md');

		expect(parsed.body).toBe('Answer');
		expect(parsed.sources.map((source) => source.target)).toEqual([
			'./reference.md',
			'./curated/book.md'
		]);
	});

	test('keeps remote source links clickable and deduplicates paths', () => {
		const parsed = parseSources(
			'Answer [./reference.md]\n\nSources:\n- [Bioconductor](https://bioconductor.org/packages/release/bioc/html/clusterProfiler.html)\n- ./reference.md'
		);

		expect(parsed.sources).toEqual([
			{ label: './reference.md', target: './reference.md', remote: false },
			{
				label: 'Bioconductor',
				target: 'https://bioconductor.org/packages/release/bioc/html/clusterProfiler.html',
				remote: true
			}
		]);
	});

	test('renders compact evidence citations with IDs, line ranges, and package scope', () => {
		const parsed = parseSources(
			'Answer [E1]\n\nSources:\n- [E1] SummarizedExperiment-class.Rd:335-343 (SummarizedExperiment 1.42.0)'
		);

		expect(parsed.body).toBe('Answer [E1]');
		expect(parsed.sources).toEqual([
			{
				label: 'SummarizedExperiment-class.Rd:335-343 (SummarizedExperiment 1.42.0)',
				target: 'SummarizedExperiment-class.Rd:335-343',
				remote: false
			}
		]);
	});

	test('supports compact source citations with nested local paths and ranges', () => {
		const parsed = parseSources(
			'Answer\n\nSources:\n- [E1] source/R/SummarizedExperiment-class.R:295-361 (SummarizedExperiment 1.42.0)'
		);

		expect(parsed.sources[0]).toMatchObject({
			target: 'source/R/SummarizedExperiment-class.R:295-361',
			remote: false
		});
	});
});
