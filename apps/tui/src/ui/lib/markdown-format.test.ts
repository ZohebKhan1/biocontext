import { describe, expect, test } from 'bun:test';

import { formatMathForTerminal, normalizeTerminalMarkdown } from './markdown-format.ts';

describe('terminal Markdown formatting', () => {
	test('turns display math into readable terminal code blocks', () => {
		const formatted = normalizeTerminalMarkdown(
			['\\[', 'Y_{gj} \\sim \\operatorname{NB}(\\mu_{gj}, \\alpha_g)', '\\]'].join('\n')
		);

		expect(formatted).toContain('```\nY_gj ∼ NB(μ_gj, α_g)\n```');
	});

	test('turns inline math into readable code spans', () => {
		expect(normalizeTerminalMarkdown('The estimate is \\(\\beta_g / \\log(2)\\).')).toBe(
			'The estimate is `β_g / log(2)`.'
		);
	});

	test('does not rewrite math-looking content inside fenced code', () => {
		const source = ['```r', '\\[beta <- 1\\]', '```'].join('\n');
		expect(normalizeTerminalMarkdown(source)).toBe(source);
	});

	test('keeps incomplete display math intact during streaming', () => {
		const source = ['\\[', '\\beta_g'].join('\n');
		expect(normalizeTerminalMarkdown(source)).toBe(source);
	});

	test('simplifies common fractions and operators', () => {
		expect(formatMathForTerminal('\\frac{\\beta}{\\log(2)} \\propto \\exp(x)')).toBe(
			'(β / log(2)) ∝ exp(x)'
		);
	});
});
