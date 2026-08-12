import { describe, expect, it } from 'bun:test';

import { validateResourceReference, validateResourcesArray } from './index.ts';

describe('validateResourceReference', () => {
	it('accepts configured resource names', () => {
		const result = validateResourceReference('DESeq2');
		expect(result.valid).toBe(true);
		if (result.valid) {
			expect(result.value).toBe('DESeq2');
		}
	});

	it('accepts explicit Bioconductor package references', () => {
		expect(validateResourceReference('bioconductor:DESeq2')).toEqual({
			valid: true,
			value: 'bioconductor:DESeq2'
		});
		expect(validateResourceReference('BIOCONDUCTOR:edgeR')).toMatchObject({ valid: true });
		expect(validateResourceReference('bioconductor:not-valid')).toMatchObject({ valid: false });
	});

	it('accepts and normalizes https Git URLs', () => {
		const result = validateResourceReference(
			'https://github.com/thelovelab/DESeq2/tree/main/packages'
		);
		expect(result.valid).toBe(true);
		if (result.valid) {
			expect(result.value).toBe('https://github.com/thelovelab/DESeq2');
		}
	});

	it('rejects invalid resource references', () => {
		const result = validateResourceReference('not a resource');
		expect(result.valid).toBe(false);
		if (!result.valid) {
			expect(result.error).toContain('Invalid resource reference');
		}
	});

	it('rejects non-https URLs', () => {
		const result = validateResourceReference('http://github.com/thelovelab/DESeq2');
		expect(result.valid).toBe(false);
		if (!result.valid) {
			expect(result.error).toContain('Invalid resource reference');
		}
	});
});

describe('validateResourcesArray', () => {});
