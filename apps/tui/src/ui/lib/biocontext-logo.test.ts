import { describe, expect, it } from 'bun:test';

import {
	BIOCONTEXT_FULL_ALLOWED_CHARACTERS,
	BIOCONTEXT_FULL_HEIGHT,
	BIOCONTEXT_FULL_ROWS,
	BIOCONTEXT_FULL_WIDTH,
	BIOCONTEXT_LOGO_TONES,
	BIOCONTEXT_LOGICAL_ALLOWED_CHARACTERS,
	BIOCONTEXT_LOGICAL_GLYPHS,
	selectBiocontextLogoVariant,
	type BiocontextLogoTone
} from './biocontext-logo.ts';

describe('biocontext logo artwork', () => {
	it('uses consistent high-resolution source glyphs', () => {
		const allowedCharacters = new Set<string>(BIOCONTEXT_LOGICAL_ALLOWED_CHARACTERS);
		for (const glyph of Object.values(BIOCONTEXT_LOGICAL_GLYPHS)) {
			expect(glyph).toHaveLength(9);
			for (const row of glyph) {
				expect(row).toHaveLength(6);
				expect([...row].every((character) => allowedCharacters.has(character))).toBe(true);
			}
		}
	});

	it('encodes six aligned rows with gradient faces and restrained depth tones', () => {
		expect(BIOCONTEXT_FULL_ROWS).toHaveLength(BIOCONTEXT_FULL_HEIGHT);
		const allowedCharacters = new Set<string>(BIOCONTEXT_FULL_ALLOWED_CHARACTERS);
		const tones = new Set<BiocontextLogoTone>();
		let hasTwoToneCell = false;

		for (const row of BIOCONTEXT_FULL_ROWS) {
			const artwork = row.map((run) => run.text).join('');
			expect(artwork).toHaveLength(BIOCONTEXT_FULL_WIDTH);
			expect(artwork).not.toMatch(/[\u0000-\u001f\u007f-\u009f]/u);
			expect([...artwork].every((character) => allowedCharacters.has(character))).toBe(true);
			for (const run of row) {
				if (run.foreground) tones.add(run.foreground);
				if (run.background) {
					tones.add(run.background);
					hasTwoToneCell = true;
				}
			}
		}

		expect(tones).toEqual(new Set<BiocontextLogoTone>(BIOCONTEXT_LOGO_TONES));
		expect(hasTwoToneCell).toBe(true);
		expect([...tones].filter((tone) => tone.includes('depth-'))).toHaveLength(4);
		expect([...tones].filter((tone) => tone.includes('face-'))).toHaveLength(6);
	});
});

describe('biocontext logo responsive selection', () => {
	it('selects the full, compact, and hidden variants for available space', () => {
		expect(
			selectBiocontextLogoVariant({
				terminalWidth: 80,
				terminalHeight: 24,
				startupSummary: 'Ready.'
			})
		).toBe('full');
		expect(
			selectBiocontextLogoVariant({
				terminalWidth: 64,
				terminalHeight: 40,
				startupSummary: 'Ready.'
			})
		).toBe('compact');
		expect(
			selectBiocontextLogoVariant({
				terminalWidth: 14,
				terminalHeight: 40,
				startupSummary: 'Ready.'
			})
		).toBe('hidden');
		expect(
			selectBiocontextLogoVariant({
				terminalWidth: 80,
				terminalHeight: 12,
				startupSummary: 'Ready.'
			})
		).toBe('hidden');
	});

	it('accounts for startup-summary wrapping before selecting artwork', () => {
		expect(
			selectBiocontextLogoVariant({
				terminalWidth: 80,
				terminalHeight: 24,
				startupSummary: 'x'.repeat(199)
			})
		).toBe('compact');
		expect(
			selectBiocontextLogoVariant({
				terminalWidth: 80,
				terminalHeight: 24,
				startupSummary: 'x'.repeat(600)
			})
		).toBe('hidden');
	});
});
