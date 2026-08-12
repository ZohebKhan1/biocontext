import { describe, expect, test } from 'bun:test';

import { parseResourceInput, selectActiveResources } from './input-resource-scope.ts';

describe('input resource scope', () => {
	test('explicit mentions replace the active scope and follow-ups retain it', () => {
		expect(selectActiveResources(['Bioconductor'], ['DESeq2'])).toEqual(['DESeq2']);
		expect(selectActiveResources(['DESeq2'], [])).toEqual(['DESeq2']);
		expect(selectActiveResources(['DESeq2'], ['Bioconductor'])).toEqual(['Bioconductor']);
	});

	test('keeps multiple selected packages without case duplicates', () => {
		expect(selectActiveResources(['Bioconductor'], ['DESeq2', 'edgeR', 'deseq2'])).toEqual([
			'DESeq2',
			'edgeR'
		]);
	});

	test('ignores mentions inside pasted R code while preserving the pasted question', () => {
		const parsed = parseResourceInput([
			{ type: 'mention', content: '@DESeq2' },
			{ type: 'text', content: ' explain this:\n' },
			{ type: 'pasted', content: "#' @import edgeR\n@limma <- 1", lines: 2 }
		]);

		expect(parsed.resources).toEqual(['DESeq2']);
		expect(parsed.question).toStartWith('DESeq2 explain this:');
		expect(parsed.question).toContain('@import edgeR');
		expect(parsed.question).toContain('@limma <- 1');
		expect(parsed.hasQuestionContent).toBe(true);
	});

	test('keeps mentioned package names in the model question but rejects mention-only input', () => {
		const comparison = parseResourceInput([
			{ type: 'text', content: 'Compare ' },
			{ type: 'mention', content: '@DESeq2' },
			{ type: 'text', content: ' with ' },
			{ type: 'mention', content: '@edgeR' }
		]);
		expect(comparison.question).toBe('Compare DESeq2 with edgeR');
		expect(comparison.hasQuestionContent).toBe(true);

		const mentionOnly = parseResourceInput([
			{ type: 'mention', content: '@DESeq2' },
			{ type: 'text', content: '?' }
		]);
		expect(mentionOnly.hasQuestionContent).toBe(false);
	});
});
