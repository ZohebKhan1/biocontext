import { describe, expect, it } from 'bun:test';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
	archivedSourceArchiveUrl,
	CATALOG_TTL_MS,
	describeRepository,
	findPackage,
	isCompleteCatalogPackage,
	isCatalogStale,
	listPackageNames,
	loadCatalog,
	newsUrl,
	packageLandingUrl,
	parseViews,
	rFileUrl,
	referenceManualUrl,
	searchPackages,
	sourceArchiveUrl,
	suggestPackageNames,
	vignetteUrl,
	viewsUrl,
	type BioconductorCatalog,
	type BioconductorPackage
} from './catalog.ts';

const pkg = (overrides: Partial<BioconductorPackage> & { name: string }): BioconductorPackage => ({
	version: '1.0.0',
	repository: 'bioc',
	title: '',
	description: '',
	biocViews: [],
	hasNews: false,
	vignettes: [],
	rFiles: [],
	...overrides
});

const catalog: BioconductorCatalog = {
	release: '3.23',
	fetchedAt: new Date().toISOString(),
	packages: [
		pkg({
			name: 'DESeq2',
			version: '1.52.0',
			title: 'Differential gene expression analysis',
			biocViews: ['RNASeq', 'DifferentialExpression'],
			vignettes: [
				{
					title: 'Analyzing RNA-seq data',
					path: 'vignettes/DESeq2/inst/doc/DESeq2.html',
					format: 'html'
				}
			]
		}),
		pkg({ name: 'DESeq', version: '1.39.0' }),
		pkg({ name: 'edgeR', title: 'Empirical analysis of digital gene expression' }),
		pkg({ name: 'limma', biocViews: ['DifferentialExpression'] }),
		pkg({ name: 'rnaseqGene', repository: 'workflows' }),
		pkg({ name: 'GO.db', repository: 'data/annotation' })
	]
};

describe('findPackage', () => {
	it('matches the exact name first', () => {
		expect(findPackage(catalog, 'DESeq')?.name).toBe('DESeq');
		expect(findPackage(catalog, 'DESeq2')?.name).toBe('DESeq2');
	});

	it('falls back to a case-insensitive match', () => {
		expect(findPackage(catalog, 'deseq2')?.name).toBe('DESeq2');
		expect(findPackage(catalog, '  EDGER  ')?.name).toBe('edgeR');
	});

	it('returns undefined for an unknown package', () => {
		expect(findPackage(catalog, 'NotAPackage')).toBeUndefined();
	});
});

describe('listPackageNames', () => {
	it('returns canonical, sorted, case-insensitively unique package names', () => {
		const withDuplicate = {
			...catalog,
			packages: [...catalog.packages, pkg({ name: 'deseq2' })]
		};
		expect(listPackageNames(withDuplicate)).toEqual([
			'DESeq',
			'DESeq2',
			'edgeR',
			'GO.db',
			'limma',
			'rnaseqGene'
		]);
	});
});

describe('loadCatalog', () => {
	it('migrates a fresh version 1 numbered cache and derives PDF format metadata', async () => {
		const dataDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'bioconductor-catalog-migration-'));
		const cacheDirectory = path.join(dataDirectory, 'bioconductor');
		const cachePath = path.join(cacheDirectory, 'catalog-3.23.json');
		await fs.mkdir(cacheDirectory, { recursive: true });
		await fs.writeFile(
			cachePath,
			JSON.stringify({
				cacheVersion: 1,
				release: '3.23',
				fetchedAt: new Date().toISOString(),
				packages: [
					{
						...pkg({ name: 'maSigPro' }),
						vignettes: [
							{
								title: 'maSigPro User Guide',
								path: 'vignettes/maSigPro/inst/doc/maSigPro.pdf'
							}
						]
					}
				]
			})
		);

		try {
			const loaded = await loadCatalog({ dataDirectory, release: '3.23' });
			expect(loaded.packages[0]?.vignettes[0]?.format).toBe('pdf');
			const migrated = JSON.parse(await fs.readFile(cachePath, 'utf8')) as {
				cacheVersion: number;
			};
			expect(migrated.cacheVersion).toBe(3);
		} finally {
			await fs.rm(dataDirectory, { recursive: true, force: true });
		}
	});

	it('repairs valid UTF-8 byte tokens in cached package metadata', async () => {
		const dataDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'bioconductor-catalog-encoding-'));
		const cacheDirectory = path.join(dataDirectory, 'bioconductor');
		const cachePath = path.join(cacheDirectory, 'catalog-3.23.json');
		await fs.mkdir(cacheDirectory, { recursive: true });
		await fs.writeFile(
			cachePath,
			JSON.stringify({
				cacheVersion: 3,
				release: '3.23',
				fetchedAt: new Date().toISOString(),
				packages: [pkg({ name: 'GeneOverlap', maintainer: 'Ant<c3><b3>nio' })]
			})
		);

		try {
			expect((await loadCatalog({ dataDirectory, release: '3.23' })).packages[0]?.maintainer).toBe(
				'António'
			);
		} finally {
			await fs.rm(dataDirectory, { recursive: true, force: true });
		}
	});
});

describe('isCompleteCatalogPackage', () => {
	it('rejects legacy records that would crash vignette-script materialization', () => {
		const { rFiles: _rFiles, ...legacy } = pkg({ name: 'DESeq2' });
		expect(isCompleteCatalogPackage(legacy)).toBe(false);
		expect(isCompleteCatalogPackage(pkg({ name: 'DESeq2' }))).toBe(true);
	});
});

describe('parseViews', () => {
	it('captures the published Git URL and release branch', () => {
		expect(
			parseViews(
				[
					'Package: DESeq2',
					'Version: 1.52.0',
					'git_url: https://git.bioconductor.org/packages/DESeq2',
					'git_branch: RELEASE_3_23',
					'Rfiles:',
					''
				].join('\n'),
				'bioc'
			)[0]
		).toMatchObject({
			gitUrl: 'https://git.bioconductor.org/packages/DESeq2',
			gitBranch: 'RELEASE_3_23'
		});
	});
});

describe('searchPackages', () => {
	it('ranks exact name, then prefix, then substring', () => {
		expect(searchPackages(catalog, 'DESeq').map((p) => p.name)).toEqual(['DESeq', 'DESeq2']);
	});

	it('falls back to titles and biocViews', () => {
		expect(searchPackages(catalog, 'digital gene').map((p) => p.name)).toEqual(['edgeR']);
		expect(searchPackages(catalog, 'differentialexpression').map((p) => p.name)).toEqual([
			'DESeq2',
			'limma'
		]);
	});

	it('respects the limit and returns nothing for an empty query', () => {
		expect(searchPackages(catalog, 'e', 2)).toHaveLength(2);
		expect(searchPackages(catalog, '   ')).toEqual([]);
	});
});

describe('suggestPackageNames', () => {
	it('suggests near matches for a typo', () => {
		expect(suggestPackageNames(catalog, 'DESeq22')).toContain('DESeq2');
	});

	it('stays quiet for very short input', () => {
		expect(suggestPackageNames(catalog, 'D')).toEqual([]);
	});
});

describe('isCatalogStale', () => {
	const now = Date.UTC(2026, 0, 30);

	it('is fresh inside the TTL and stale past it', () => {
		const fresh = { ...catalog, fetchedAt: new Date(now - CATALOG_TTL_MS + 1000).toISOString() };
		const stale = { ...catalog, fetchedAt: new Date(now - CATALOG_TTL_MS - 1000).toISOString() };
		expect(isCatalogStale(fresh, now)).toBe(false);
		expect(isCatalogStale(stale, now)).toBe(true);
	});

	it('treats an unparseable timestamp as stale', () => {
		expect(isCatalogStale({ ...catalog, fetchedAt: 'not-a-date' }, now)).toBe(true);
	});
});

describe('url builders', () => {
	const deseq2 = findPackage(catalog, 'DESeq2')!;
	const workflow = findPackage(catalog, 'rnaseqGene')!;

	it('builds VIEWS urls per repository', () => {
		expect(viewsUrl('3.23', 'bioc')).toBe('https://bioconductor.org/packages/3.23/bioc/VIEWS');
		expect(viewsUrl('3.20', 'data/annotation')).toBe(
			'https://bioconductor.org/packages/3.20/data/annotation/VIEWS'
		);
	});

	it('rejects mutable aliases at the URL boundary', () => {
		expect(() => viewsUrl('release', 'bioc')).toThrow('must be numbered');
		expect(() => packageLandingUrl(deseq2, 'devel')).toThrow('must be numbered');
	});

	it('builds landing, vignette, and news urls inside the right repository', () => {
		expect(packageLandingUrl(deseq2, '3.23')).toBe(
			'https://bioconductor.org/packages/3.23/bioc/html/DESeq2.html'
		);
		expect(packageLandingUrl(workflow, '3.23')).toBe(
			'https://bioconductor.org/packages/3.23/workflows/html/rnaseqGene.html'
		);
		expect(vignetteUrl(deseq2, deseq2.vignettes[0]!, '3.23')).toBe(
			'https://bioconductor.org/packages/3.23/bioc/vignettes/DESeq2/inst/doc/DESeq2.html'
		);
		expect(newsUrl(deseq2, '3.23')).toBe(
			'https://bioconductor.org/packages/3.23/bioc/news/DESeq2/NEWS'
		);
	});
});

describe('describeRepository', () => {
	it('labels every repository', () => {
		expect(describeRepository('bioc')).toBe('Software');
		expect(describeRepository('workflows')).toBe('Workflow');
		expect(describeRepository('data/annotation')).toBe('Annotation data');
		expect(describeRepository('data/experiment')).toBe('Experiment data');
	});
});

describe('vignette formats and document URLs', () => {
	const deseq2 = pkg({
		name: 'DESeq2',
		version: '1.52.0',
		vignettes: [
			{
				title: 'Analyzing RNA-seq data',
				path: 'vignettes/DESeq2/inst/doc/DESeq2.html',
				format: 'html'
			}
		],
		rFiles: ['vignettes/DESeq2/inst/doc/DESeq2.R']
	});

	it('builds the reference manual URL', () => {
		expect(referenceManualUrl(deseq2, '3.23')).toBe(
			'https://bioconductor.org/packages/3.23/bioc/manuals/DESeq2/man/DESeq2.pdf'
		);
	});

	it('builds R script URLs from the published Rfiles list', () => {
		expect(rFileUrl(deseq2, deseq2.rFiles[0]!, '3.23')).toBe(
			'https://bioconductor.org/packages/3.23/bioc/vignettes/DESeq2/inst/doc/DESeq2.R'
		);
	});

	it('builds an exact versioned source archive URL', () => {
		expect(sourceArchiveUrl(deseq2, '3.23')).toBe(
			'https://bioconductor.org/packages/3.23/bioc/src/contrib/DESeq2_1.52.0.tar.gz'
		);
		expect(archivedSourceArchiveUrl(deseq2, '3.23')).toBe(
			'https://bioconductor.org/packages/3.23/bioc/src/contrib/Archive/DESeq2/DESeq2_1.52.0.tar.gz'
		);
	});

	it('builds URLs inside the package’s own repository', () => {
		const workflow = pkg({ name: 'rnaseqGene', repository: 'workflows' });
		expect(referenceManualUrl(workflow, '3.23')).toContain('/workflows/manuals/');
	});
});
