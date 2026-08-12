import { describe, expect, it } from 'bun:test';
import { resolve } from 'node:path';

import { DEFAULT_RESOURCES } from '../../../packages/engine/src/config/index.ts';
import { DEFAULT_BIOCONDUCTOR_PACKAGE_NAMES } from '../../../packages/engine/src/bioconductor/default-package-list.ts';
import { createThread } from './ui/thread-store.ts';

describe('Bioconductor defaults', () => {
	it('configures the curated documentation corpus as the only default resource', () => {
		expect(DEFAULT_RESOURCES).toHaveLength(1);
		expect(DEFAULT_RESOURCES[0]).toMatchObject({
			name: 'Bioconductor',
			type: 'git',
			url: 'https://github.com/ZohebKhan1/biocontext',
			branch: 'main',
			searchPath: 'resources/bioconductor-docs'
		});
	});

	it('attaches Bioconductor to every new TUI thread', () => {
		expect(createThread().resources).toEqual(['Bioconductor']);
	});

	it('ships the documented default package set', () => {
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
	});

	it('contains the bundled corpus routing index', async () => {
		const directoryPath = resolve(
			import.meta.dir,
			'../../../resources/bioconductor-docs/DIRECTORY.md'
		);
		expect(await Bun.file(directoryPath).exists()).toBe(true);
	});
});
