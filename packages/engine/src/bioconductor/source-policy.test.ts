import { describe, expect, test } from 'bun:test';

import {
	BIOCONDUCTOR_SOURCE_POLICY_VERSION,
	shouldKeepSourcePath,
	sourceSparseCheckoutPatterns
} from './source-policy.ts';

describe('Bioconductor source policy', () => {
	test('keeps the common package implementation and authored documentation', () => {
		for (const file of [
			'DESCRIPTION',
			'NAMESPACE',
			'README.md',
			'R/DESeq.R',
			'man/DESeq.Rd',
			'vignettes/DESeq2.Rmd',
			'vignettes/DESeq2.R',
			'src/fit.cpp',
			'inst/scripts/prepare.R'
		]) {
			expect(shouldKeepSourcePath(file)).toBe(true);
		}
	});

	test('omits generated assets, packaged data, fixtures, and unrelated build machinery', () => {
		for (const file of [
			'docs/reference/index.html',
			'pkgdown/index.html',
			'vignettes/assets/figure.png',
			'man/figures/example.png',
			'inst/extdata/example.sqlite',
			'data/example.rda',
			'tests/testdata/counts.rds',
			'tests/testthat/fixtures/example.txt',
			'configure.generated',
			'R/Makevars',
			'R/sysdata.rda'
		]) {
			expect(shouldKeepSourcePath(file)).toBe(false);
		}
	});

	test('keeps authored tests, build metadata, and selected GitHub workflows', () => {
		for (const file of [
			'tests/testthat/test-basic.R',
			'tests/testthat/helper-data.R',
			'configure',
			'Makevars',
			'.Rbuildignore',
			'.github/workflows/check-standard.yml'
		]) {
			expect(shouldKeepSourcePath(file)).toBe(true);
		}
	});

	test('keeps Seurat-style source tutorials without their large rendered assets', () => {
		expect(shouldKeepSourcePath('vignettes/essential_commands.Rmd')).toBe(true);
		expect(shouldKeepSourcePath('vignettes/assets/spatial_vignette_hd.png')).toBe(false);
		expect(shouldKeepSourcePath('index.md')).toBe(true);
	});

	test('has a versioned source snapshot policy', () => {
		expect(BIOCONDUCTOR_SOURCE_POLICY_VERSION).toBe(3);
		expect(sourceSparseCheckoutPatterns).toContain('/R/**/*.R');
		expect(sourceSparseCheckoutPatterns).toContain('/vignettes/**/*.Rmd');
		expect(sourceSparseCheckoutPatterns).toContain('/inst/**/*.R');
		expect(sourceSparseCheckoutPatterns).toContain('/tests/**/*.R');
		expect(sourceSparseCheckoutPatterns).toContain('/.github/workflows/**/*.yml');
	});
});
