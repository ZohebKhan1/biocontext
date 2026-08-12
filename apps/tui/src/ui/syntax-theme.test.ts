import { expect, test } from 'bun:test';
import { RGBA } from '@opentui/core';

import { codeSyntaxStyle, GITHUB_DARK_CODE_COLORS, syntaxStyle } from './syntax-theme.ts';

test('keeps the GitHub Dark code palette separate from Markdown presentation styles', () => {
	expect(codeSyntaxStyle).not.toBe(syntaxStyle);
	expect(
		codeSyntaxStyle.getStyle('keyword')?.fg?.equals(RGBA.fromHex(GITHUB_DARK_CODE_COLORS.keyword))
	).toBe(true);
	expect(
		codeSyntaxStyle.getStyle('string')?.fg?.equals(RGBA.fromHex(GITHUB_DARK_CODE_COLORS.string))
	).toBe(true);
	expect(
		codeSyntaxStyle.getStyle('comment')?.fg?.equals(RGBA.fromHex(GITHUB_DARK_CODE_COLORS.comment))
	).toBe(true);
});
