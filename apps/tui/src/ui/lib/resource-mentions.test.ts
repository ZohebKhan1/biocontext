import { describe, expect, test } from 'bun:test';

import {
	extractMentionTokens,
	hasIncompleteConfiguredResourceMatch,
	isAnonymousResourceReference,
	resolveMentionResourceReference,
	stripMentionTokens
} from './resource-mentions.ts';

describe('resource mentions', () => {
	test('extracts configured and anonymous mention tokens', () => {
		const input = [
			'@Bioconductor how do I shrink log fold changes with',
			'@https://github.com/thelovelab/DESeq2 ?'
		].join(' ');

		expect(extractMentionTokens(input)).toEqual([
			'Bioconductor',
			'https://github.com/thelovelab/DESeq2'
		]);
	});

	test('strips mention tokens and keeps question text', () => {
		const input = '@Bioconductor @https://github.com/thelovelab/DESeq2 how do I shrink LFCs?';
		expect(stripMentionTokens(input)).toBe('how do I shrink LFCs?');
	});

	test('resolves configured resources case-insensitively', () => {
		const available = [{ name: 'Bioconductor' }, { name: 'my-local-docs' }];
		expect(resolveMentionResourceReference('bioconductor', available)).toBe('Bioconductor');
		expect(resolveMentionResourceReference('@my-local-docs', available)).toBe('my-local-docs');
	});

	test('resolves anonymous git references', () => {
		const available = [{ name: 'Bioconductor' }];
		expect(resolveMentionResourceReference('https://github.com/thelovelab/DESeq2', available)).toBe(
			'https://github.com/thelovelab/DESeq2'
		);
	});

	test('rejects references that are neither configured nor package-shaped', () => {
		expect(
			resolveMentionResourceReference('unknown-resource', [{ name: 'Bioconductor' }])
		).toBeNull();
	});

	test('resolves only locally available Bioconductor package names', () => {
		const configured = [{ name: 'Bioconductor', type: 'git' as const }];
		expect(resolveMentionResourceReference('deseq2', configured, ['DESeq2'])).toBe('DESeq2');
		expect(resolveMentionResourceReference('bioconductor:deseq2', configured, ['DESeq2'])).toBe(
			'bioconductor:DESeq2'
		);
		expect(resolveMentionResourceReference('a4Core', configured, ['DESeq2'])).toBeNull();
	});

	test('does not resolve a stale configured package whose folder is missing', () => {
		expect(
			resolveMentionResourceReference(
				'DESeq2',
				[{ name: 'DESeq2', type: 'bioconductor', package: 'DESeq2' }],
				[]
			)
		).toBeNull();
	});

	test('identifies anonymous references', () => {
		expect(isAnonymousResourceReference('https://github.com/thelovelab/DESeq2')).toBe(true);
		// These helpers classify shape only; availability is checked separately.
		expect(isAnonymousResourceReference('DESeq2')).toBe(true);
		expect(isAnonymousResourceReference('bioconductor:ComplexHeatmap')).toBe(true);
		expect(isAnonymousResourceReference('GO.db')).toBe(true);
		// Hyphens and leading digits are not valid R package names.
		expect(isAnonymousResourceReference('my-local-docs')).toBe(false);
		expect(isAnonymousResourceReference('2fast')).toBe(false);
	});

	test('keeps autocomplete active for configured resource prefixes', () => {
		const available = [{ name: 'Bioconductor' }, { name: 'DESeq2' }];
		expect(hasIncompleteConfiguredResourceMatch('@Bi', available)).toBe(true);
		expect(hasIncompleteConfiguredResourceMatch('@Bioconductor', available)).toBe(false);
		expect(hasIncompleteConfiguredResourceMatch('@edgeR', available)).toBe(false);
	});

	test('keeps autocomplete active for package prefixes but accepts an exact match', () => {
		const available = [{ name: 'maSigPro' }, { name: 'maSigProData' }];
		expect(hasIncompleteConfiguredResourceMatch('@maSig', available)).toBe(true);
		expect(hasIncompleteConfiguredResourceMatch('@maSigPro', available)).toBe(false);
	});
});
