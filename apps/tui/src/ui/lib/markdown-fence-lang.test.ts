import { describe, expect, test } from 'bun:test';

import { normalizeFenceLang } from './markdown-fence-lang.ts';

describe('normalizeFenceLang', () => {
	test('normalizes common aliases in fenced code blocks', () => {
		const input = [
			'# hi',
			'',
			'```R',
			'dds <- DESeq(dds)',
			'```',
			'',
			'```rmd',
			'summary(res)',
			'```',
			'',
			'```r',
			'resultsNames(dds)',
			'```',
			'',
			'```  py',
			'print("hi")',
			'```',
			'',
			'~~~sh',
			'echo hi',
			'~~~',
			'',
			'```unknown',
			'x',
			'```'
		].join('\n');

		const output = normalizeFenceLang(input);

		expect(output).toContain('```r\ndds <- DESeq(dds)');
		expect(output).toContain('```r\nsummary(res)');
		expect(output).toContain('```r\nresultsNames(dds)');
		expect(output).toContain('```  python\n');
		expect(output).toContain('~~~bash\n');
		expect(output).toContain('```unknown\n');
		expect(output).toContain('\n```\n');
	});

	test('preserves indentation and fence length', () => {
		const input = ['  ````r', '  plotMA(res)', '  ````'].join('\n');
		const output = normalizeFenceLang(input);
		expect(output).toBe(['  ````r', '  plotMA(res)', '  ````'].join('\n'));
	});
});
