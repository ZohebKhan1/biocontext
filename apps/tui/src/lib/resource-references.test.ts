import { describe, expect, test } from 'bun:test';

import {
	extractMentionTokens,
	parseTextSegment,
	stripMentionTokens,
	stripResolvedMentionTokens
} from './resource-references.ts';

describe('resource references', () => {
	test('classifies a bare at sign so configured-resource autocomplete can open', () => {
		expect(parseTextSegment('@')).toEqual([{ type: 'mention', content: '@' }]);
	});

	test('extracts mentions with surrounding punctuation', () => {
		const input = 'How does @DESeq2? compare to (@edgeR), and @limma.';

		expect(extractMentionTokens(input)).toEqual(['DESeq2', 'edgeR', 'limma']);
	});

	test('strips mentions while preserving surrounding punctuation', () => {
		const input = 'How does (@edgeR), compare to @DESeq2?';

		expect(stripMentionTokens(input)).toBe('How does (), compare to ?');
	});

	test('strips resolved mentions without dropping trailing punctuation', () => {
		const input = 'How does @DESeq2? compare to (@edgeR), exactly?';

		expect(stripResolvedMentionTokens(input, ['DESeq2', 'edgeR'])).toBe(
			'How does ? compare to (), exactly?'
		);
	});

	test('deduplicates mentions case-insensitively', () => {
		expect(extractMentionTokens('@DESeq2 versus @deseq2')).toEqual(['DESeq2']);
	});

	test('uses one lexer for mentions next to punctuation and separates suffixes', () => {
		expect(parseTextSegment('Compare (@DESeq2), with `@edgeR`.')).toEqual([
			{ type: 'text', content: 'Compare (' },
			{ type: 'mention', content: '@DESeq2' },
			{ type: 'text', content: '), with `' },
			{ type: 'mention', content: '@edgeR' },
			{ type: 'text', content: '`.' }
		]);
	});
});
