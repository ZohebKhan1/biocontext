import { describe, expect, it } from 'bun:test';

import { buildIncludeMatcher, globToRegExp } from './glob-pattern.ts';

describe('glob patterns', () => {
	it('lets a recursive pattern match root and nested files', () => {
		const matcher = globToRegExp('**/*.md');
		expect(matcher.test('README.md')).toBe(true);
		expect(matcher.test('curated/reference.md')).toBe(true);
		expect(matcher.test('README.txt')).toBe(false);
	});

	it('supports documented brace alternatives in grep include filters', () => {
		const matcher = buildIncludeMatcher('*.{R,Rmd}');
		expect(matcher('source/R/results.R')).toBe(true);
		expect(matcher('vignettes/workflow.Rmd')).toBe(true);
		expect(matcher('vignettes/workflow.md')).toBe(false);
	});
});
