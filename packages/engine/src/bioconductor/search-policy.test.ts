import { describe, expect, it } from 'bun:test';

import type { BioconductorResourceMetadata } from './metadata.ts';
import {
	additionalManagedBioconductorIgnoredPaths,
	isRedundantCuratedDocument,
	redundantSourceNewsPaths,
	shouldIgnoreManagedBioconductorSearchPath
} from './search-policy.ts';

const metadata = (): BioconductorResourceMetadata => ({
	cacheVersion: 10,
	package: 'DESeq2',
	bioconductor: {
		release: '3.23',
		packageVersion: '1.52.0',
		repository: 'bioc',
		landingUrl: 'https://bioconductor.org/packages/3.23/bioc/html/DESeq2.html'
	},
	repository: {
		kind: 'bioconductor_archive',
		url: 'https://bioconductor.org/packages/3.23/bioc/src/contrib/DESeq2_1.52.0.tar.gz',
		sha256: 'a'.repeat(64),
		descriptionPackage: 'DESeq2',
		descriptionVersion: '1.52.0',
		sourcePolicyVersion: 3,
		fileCount: 5,
		bytes: 100,
		omittedCount: 0
	},
	versionRelationship: 'aligned',
	documents: [
		{
			path: 'vignettes/DESeq2.md',
			sourceType: 'bioconductor',
			originType: 'vignette',
			originUrl:
				'https://bioconductor.org/packages/3.23/bioc/vignettes/DESeq2/inst/doc/DESeq2.html',
			packageVersion: '1.52.0',
			bioconductorRelease: '3.23',
			status: 'ok'
		},
		{
			path: 'vignettes/DESeq2.R',
			sourceType: 'bioconductor',
			originType: 'vignette_script',
			originUrl: 'https://bioconductor.org/packages/3.23/bioc/vignettes/DESeq2/inst/doc/DESeq2.R',
			packageVersion: '1.52.0',
			bioconductorRelease: '3.23',
			status: 'ok'
		},
		{
			path: 'reference-manual.md',
			sourceType: 'bioconductor',
			originType: 'reference_manual',
			originUrl: 'https://bioconductor.org/packages/3.23/bioc/manuals/DESeq2/man/DESeq2.pdf',
			packageVersion: '1.52.0',
			bioconductorRelease: '3.23',
			status: 'ok'
		},
		{
			path: 'NEWS.md',
			sourceType: 'bioconductor',
			originType: 'news',
			originUrl: 'https://bioconductor.org/packages/3.23/bioc/news/DESeq2/NEWS',
			packageVersion: '1.52.0',
			bioconductorRelease: '3.23',
			status: 'ok'
		}
	],
	requestedDocuments: ['vignettes', 'vignetteScripts', 'manual', 'news'],
	fetchedAt: '2026-08-12T00:00:00.000Z'
});

describe('canonical Bioconductor search policy', () => {
	it('hides duplicate source documentation while retaining implementation and unmatched workflows', () => {
		const value = metadata();
		expect(shouldIgnoreManagedBioconductorSearchPath(value, 'source/man/DESeq.Rd')).toBe(true);
		expect(shouldIgnoreManagedBioconductorSearchPath(value, 'source/NEWS')).toBe(true);
		expect(shouldIgnoreManagedBioconductorSearchPath(value, 'source/inst/NEWS.md')).toBe(true);
		expect(shouldIgnoreManagedBioconductorSearchPath(value, 'source/vignettes/DESeq2.Rmd')).toBe(true);
		expect(shouldIgnoreManagedBioconductorSearchPath(value, 'source/vignettes/library.bib')).toBe(false);
		expect(shouldIgnoreManagedBioconductorSearchPath(value, 'vignettes/DESeq2.R')).toBe(true);
		expect(shouldIgnoreManagedBioconductorSearchPath(value, 'source/vignettes/extra-workflow.Rmd')).toBe(
			false
		);
		expect(shouldIgnoreManagedBioconductorSearchPath(value, 'source/R/core.R')).toBe(false);
	});

	it('keeps one deterministic source NEWS fallback when no published NEWS is available', () => {
		expect([...redundantSourceNewsPaths(['NEWS', 'NEWS.md', 'inst/NEWS.Rd', 'R/news.R'])]).toEqual([
			'source/inst/NEWS.Rd',
			'source/NEWS'
		]);
	});

	it('uses exact source documentation as the fallback before duplicated corpus material', () => {
		const value = metadata();
		value.documents = value.documents.map((document) =>
			document.originType === 'reference_manual' || document.originType === 'vignette'
				? { ...document, status: 'failed' as const }
				: document
		);
		value.documents.push({
			path: 'curated/reference.md',
			sourceType: 'curated',
			originType: 'curated_document',
			originUrl: 'https://github.com/thelovelab/DESeq2',
			packageVersion: 'unknown',
			bioconductorRelease: 'unknown',
			status: 'ok'
		});
		value.documents.push({
			path: 'curated/vignette.md',
			sourceType: 'curated',
			originType: 'curated_document',
			originUrl:
				'https://bioconductor.org/packages/release/bioc/vignettes/DESeq2/inst/doc/DESeq2.html',
			packageVersion: 'unknown',
			bioconductorRelease: 'unknown',
			status: 'ok'
		});
		expect([
			...additionalManagedBioconductorIgnoredPaths(value, [
				'man/DESeq.Rd',
				'vignettes/DESeq2.Rmd',
				'vignettes/DESeq2.md'
			])
		]).toEqual([
			'source/vignettes/DESeq2.md',
			'vignettes/DESeq2.R',
			'curated/reference.md',
			'curated/vignette.md'
		]);
	});

	it('suppresses equivalent corpus roles but keeps distinct papers and books', () => {
		const value = metadata();
		const provenance = (path: string, originUrl: string) => ({
			path,
			originUrl,
			originType: 'curated_document' as const,
			packageVersion: 'unknown',
			bioconductorRelease: 'unknown'
		});
		expect(
			isRedundantCuratedDocument(
				value,
				'vignette.md',
				provenance(
					'vignette.md',
					'https://bioconductor.org/packages/release/bioc/vignettes/DESeq2/inst/doc/DESeq2.html'
				)
			)
		).toBe(true);
		expect(
			isRedundantCuratedDocument(
				value,
				'reference.md',
				provenance('reference.md', 'https://example.org/reference')
			)
		).toBe(true);
		expect(
			isRedundantCuratedDocument(
				value,
				'paper.md',
				provenance('paper.md', 'https://doi.org/10.1186/s13059-014-0550-8')
			)
		).toBe(false);
		expect(
			isRedundantCuratedDocument(
				value,
				'tutorial.md',
				provenance('tutorial.md', 'https://github.com/thelovelab/DESeq2')
			)
		).toBe(false);
		expect(
			isRedundantCuratedDocument(
				value,
				'tutorial.md',
				provenance(
					'tutorial.md',
					'https://example.org/packages/release/bioc/vignettes/DESeq2/inst/doc/DESeq2.html'
				)
			)
		).toBe(false);
	});
});
