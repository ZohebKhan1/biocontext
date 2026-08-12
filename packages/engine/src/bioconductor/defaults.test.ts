import { describe, expect, it } from 'bun:test';

import { DEFAULT_BIOCONDUCTOR_PACKAGE_COUNT, DEFAULT_BIOCONDUCTOR_PACKAGE_NAMES } from './default-package-list.ts';
import { runDefaultBioconductorBootstrap } from './defaults.ts';

describe('default Bioconductor package bootstrap', () => {
	it('keeps the curated default package set canonical and unique', () => {
		expect(DEFAULT_BIOCONDUCTOR_PACKAGE_NAMES).toEqual([
			'edgeR',
			'DESeq2',
			'limma',
			'fgsea',
			'ComplexHeatmap',
			'tximport',
			'tximeta',
			'apeglm',
			'AnnotationDbi',
			'biomaRt',
			'SummarizedExperiment'
		]);
		expect(new Set(DEFAULT_BIOCONDUCTOR_PACKAGE_NAMES).size).toBe(DEFAULT_BIOCONDUCTOR_PACKAGE_COUNT);
	});

	it('installs missing packages independently and reports partial failures', async () => {
		const ready = new Set(['DESeq2']);
		const installed: string[] = [];
		const result = await runDefaultBioconductorBootstrap(
			{ resourcesDirectory: '/tmp/biocontext-defaults', dataDirectory: '/tmp/biocontext-data' },
			{
				loadRemovedPackageNames: async () => [],
				loadLegacyPackageNames: async () => [],
				packageReady: async (name, release) => release === '3.23' && ready.has(name),
				loadPackageCatalog: async () => ({
					release: '3.23',
					fetchedAt: '2026-08-08T00:00:00.000Z',
					packages: DEFAULT_BIOCONDUCTOR_PACKAGE_NAMES.map((name) => ({
						name,
						version: '1.0.0',
						repository: 'bioc' as const,
						title: '',
						description: '',
						biocViews: [],
						hasNews: false,
						vignettes: [],
						rFiles: []
					}))
				}),
				installPackage: async (pkg, release) => {
					expect(release).toBe('3.23');
					installed.push(pkg.name);
					if (pkg.name === 'limma') throw new Error('temporary failure');
					ready.add(pkg.name);
				},
				concurrency: 1
			}
		);

		expect(result.state).toBe('partial');
		expect(result.ready).toBe(DEFAULT_BIOCONDUCTOR_PACKAGE_COUNT - 1);
		expect(result.failed).toEqual(['limma']);
		expect(installed).not.toContain('DESeq2');
		expect(installed).toContain('edgeR');
	});

	it('checks readiness against the currently resolved numbered release', async () => {
		const checkedReleases: string[] = [];
		const result = await runDefaultBioconductorBootstrap(
			{
				resourcesDirectory: '/tmp/biocontext-defaults-ready',
				dataDirectory: '/tmp/biocontext-data'
			},
			{
				loadRemovedPackageNames: async () => [],
				loadLegacyPackageNames: async () => [],
				packageReady: async (_name, release) => {
					checkedReleases.push(release);
					return true;
				},
				loadPackageCatalog: async () => ({
					release: '3.24',
					fetchedAt: '2026-08-08T00:00:00.000Z',
					packages: []
				})
			}
		);

		expect(result).toEqual({
			state: 'complete',
			total: DEFAULT_BIOCONDUCTOR_PACKAGE_COUNT,
			ready: DEFAULT_BIOCONDUCTOR_PACKAGE_COUNT,
			failed: []
		});
		expect(checkedReleases).toEqual(Array(DEFAULT_BIOCONDUCTOR_PACKAGE_COUNT).fill('3.24'));
	});

	it('does not reinstall packages explicitly removed by the user', async () => {
		const checked: string[] = [];
		const installed: string[] = [];
		const result = await runDefaultBioconductorBootstrap(
			{
				resourcesDirectory: '/tmp/biocontext-defaults-removed',
				dataDirectory: '/tmp/biocontext-data-removed'
			},
			{
				loadRemovedPackageNames: async () => ['DESeq2', 'limma'],
				loadLegacyPackageNames: async () => [],
				packageReady: async (name) => {
					checked.push(name);
					return true;
				},
				loadPackageCatalog: async () => ({
					release: '3.24',
					fetchedAt: '2026-08-08T00:00:00.000Z',
					packages: []
				}),
				installPackage: async (pkg) => {
					installed.push(pkg.name);
				}
			}
		);

		expect(result).toEqual({
			state: 'complete',
			total: DEFAULT_BIOCONDUCTOR_PACKAGE_COUNT - 2,
			ready: DEFAULT_BIOCONDUCTOR_PACKAGE_COUNT - 2,
			failed: []
		});
		expect(checked).not.toContain('DESeq2');
		expect(checked).not.toContain('limma');
		expect(installed).toEqual([]);
	});

	it('upgrades every recognized legacy managed package with the same package-neutral rule', async () => {
		const ready = new Set<string>(DEFAULT_BIOCONDUCTOR_PACKAGE_NAMES);
		const installed: string[] = [];
		const result = await runDefaultBioconductorBootstrap(
			{
				resourcesDirectory: '/tmp/biocontext-defaults-migration',
				dataDirectory: '/tmp/biocontext-data-migration'
			},
			{
				loadRemovedPackageNames: async () => [],
				loadLegacyPackageNames: async () => ['PCAtools', 'DESeq2', 'decoupleR'],
				packageReady: async (name) => ready.has(name),
				loadPackageCatalog: async () => ({
					release: '3.24',
					fetchedAt: '2026-08-08T00:00:00.000Z',
					packages: ['PCAtools', 'decoupleR'].map((name) => ({
						name,
						version: '1.0.0',
						repository: 'bioc' as const,
						title: '',
						description: '',
						biocViews: [],
						hasNews: false,
						vignettes: [],
						rFiles: []
					}))
				}),
				installPackage: async (pkg) => {
					installed.push(pkg.name);
					ready.add(pkg.name);
				},
				concurrency: 1
			}
		);

		expect(result).toEqual({
			state: 'complete',
			total: DEFAULT_BIOCONDUCTOR_PACKAGE_COUNT + 2,
			ready: DEFAULT_BIOCONDUCTOR_PACKAGE_COUNT + 2,
			failed: []
		});
		expect(installed).toEqual(['PCAtools', 'decoupleR']);
	});
});
