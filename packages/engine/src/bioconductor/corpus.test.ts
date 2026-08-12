import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
	copyCorpusPackage,
	findCorpusPackage,
	findCorpusRoot,
	listCorpusPackageNames,
	parseCuratedPackageMetadata,
	REPO_CORPUS_PATH
} from './corpus.ts';

let root: string;

const write = async (relativePath: string, contents = 'x') => {
	const target = path.join(root, relativePath);
	await fs.mkdir(path.dirname(target), { recursive: true });
	await fs.writeFile(target, contents, 'utf8');
};

const writeMetadata = async (
	packageDirectory: string,
	packageName: string,
	documents: readonly string[]
) =>
	write(
		`${packageDirectory}/_metadata.yml`,
		[
			`package: ${packageName}`,
			'documents:',
			...documents.flatMap((document) => [
				`  - path: ${document}`,
				`    origin_url: https://example.org/${packageName}/${document}`,
				'    origin_type: curated_document',
				'    package_version: unknown',
				'    bioc_release: unknown'
			]),
			''
		].join('\n')
	);

beforeEach(async () => {
	root = await fs.mkdtemp(path.join(os.tmpdir(), 'biocontext-corpus-'));
});

afterEach(async () => {
	await fs.rm(root, { recursive: true, force: true });
});

describe('findCorpusRoot', () => {
	it('finds a corpus nested inside a clone of the app repository', async () => {
		await write('resources/Bioconductor/resources/bioconductor-docs/DIRECTORY.md');
		const found = await findCorpusRoot(path.join(root, 'resources'));
		expect(found).toBe(path.join(root, 'resources/Bioconductor/resources/bioconductor-docs'));
	});

	it('finds a resource pointed straight at the corpus repository', async () => {
		await write('resources/my-docs/DIRECTORY.md');
		const found = await findCorpusRoot(path.join(root, 'resources'));
		expect(found).toBe(path.join(root, 'resources/my-docs'));
	});

	it('does not depend on the resource being named Bioconductor', async () => {
		await write('resources/renamed-thing/resources/bioconductor-docs/DIRECTORY.md');
		expect(await findCorpusRoot(path.join(root, 'resources'))).toContain('renamed-thing');
	});

	it('prefers an explicit candidate over scanning', async () => {
		await write('checkout/DIRECTORY.md');
		await write('resources/Bioconductor/resources/bioconductor-docs/DIRECTORY.md');
		const found = await findCorpusRoot(path.join(root, 'resources'), [path.join(root, 'checkout')]);
		expect(found).toBe(path.join(root, 'checkout'));
	});

	it('ignores candidates that do not exist', async () => {
		await write('resources/Bioconductor/resources/bioconductor-docs/DIRECTORY.md');
		const found = await findCorpusRoot(path.join(root, 'resources'), [
			path.join(root, 'nope'),
			path.join(root, 'also-nope')
		]);
		expect(found).toContain('bioconductor-docs');
	});

	it('returns null when no corpus is present or the directory is missing', async () => {
		await write('resources/other/README.md');
		expect(await findCorpusRoot(path.join(root, 'resources'))).toBeNull();
		expect(await findCorpusRoot(path.join(root, 'absent'))).toBeNull();
	});
});

describe('findCorpusPackage', () => {
	beforeEach(async () => {
		await write('corpus/DIRECTORY.md');
		await write('corpus/02_differential_expression/DESeq2/reference.md', '# ref');
		await write('corpus/02_differential_expression/DESeq2/paper.md', '# paper');
		await writeMetadata('corpus/02_differential_expression/DESeq2', 'DESeq2', [
			'paper.md',
			'reference.md'
		]);
		await write('corpus/01_data_import_annotation/GO.db/vignette.md', '# go');
		await writeMetadata('corpus/01_data_import_annotation/GO.db', 'GO.db', ['vignette.md']);
		await write('corpus/05_visualization/EmptyPkg/notes.txt', 'not markdown');
		await write('corpus/tools/clean.py', 'python');
	});

	it('locates a package inside its category folder', async () => {
		const found = await findCorpusPackage(path.join(root, 'corpus'), 'DESeq2');
		expect(found?.relativePath).toBe('02_differential_expression/DESeq2');
		expect(found?.documents).toEqual(['paper.md', 'reference.md']);
	});

	it('matches case-insensitively and ignores surrounding whitespace', async () => {
		expect((await findCorpusPackage(path.join(root, 'corpus'), 'deseq2'))?.relativePath).toBe(
			'02_differential_expression/DESeq2'
		);
		expect((await findCorpusPackage(path.join(root, 'corpus'), '  GO.db '))?.relativePath).toBe(
			'01_data_import_annotation/GO.db'
		);
	});

	it('ignores non-category directories such as tools/', async () => {
		expect(await findCorpusPackage(path.join(root, 'corpus'), 'clean')).toBeNull();
		expect(await findCorpusPackage(path.join(root, 'corpus'), 'tools')).toBeNull();
	});

	it('returns null for a package with no markdown', async () => {
		expect(await findCorpusPackage(path.join(root, 'corpus'), 'EmptyPkg')).toBeNull();
	});

	it('returns null for an unknown package or empty name', async () => {
		expect(await findCorpusPackage(path.join(root, 'corpus'), 'scran')).toBeNull();
		expect(await findCorpusPackage(path.join(root, 'corpus'), '  ')).toBeNull();
	});
});

describe('listCorpusPackageNames', () => {
	it('keeps the bundled 22-package set complete', async () => {
		expect(await listCorpusPackageNames(REPO_CORPUS_PATH)).toEqual([
			'AnnotationDbi',
			'apeglm',
			'biomaRt',
			'clusterProfiler',
			'ComplexHeatmap',
			'DESeq2',
			'edgeR',
			'enrichplot',
			'fgsea',
			'GO.db',
			'GSVA',
			'ImpulseDE2',
			'limma',
			'maSigPro',
			'msigdbr',
			'PCAtools',
			'ReactomePA',
			'S4Vectors',
			'singscore',
			'SummarizedExperiment',
			'tximeta',
			'tximport'
		]);
	});

	it('lists only package directories containing Markdown', async () => {
		await write('corpus/DIRECTORY.md');
		await write('corpus/02_differential_expression/DESeq2/reference.md');
		await write('corpus/01_data_import/AnnotationDbi/vignette.md');
		await write('corpus/03_time_series/empty/notes.txt');
		await write('corpus/tools/not-a-package.md');

		expect(await listCorpusPackageNames(path.join(root, 'corpus'))).toEqual([
			'AnnotationDbi',
			'DESeq2'
		]);
	});
});

describe('copyCorpusPackage', () => {
	it('copies every markdown document into the target directory', async () => {
		await write('corpus/DIRECTORY.md');
		await write('corpus/02_differential_expression/DESeq2/reference.md', '# ref');
		await write('corpus/02_differential_expression/DESeq2/workflow.md', '# workflow');
		await writeMetadata('corpus/02_differential_expression/DESeq2', 'DESeq2', [
			'reference.md',
			'workflow.md'
		]);

		const source = (await findCorpusPackage(path.join(root, 'corpus'), 'DESeq2'))!;
		const target = path.join(root, 'out', 'curated');
		const written = await copyCorpusPackage(source, target);

		expect(written).toEqual(['reference.md', 'workflow.md']);
		expect(await fs.readFile(path.join(target, 'reference.md'), 'utf8')).toBe('# ref');
		expect(await fs.readFile(path.join(target, 'workflow.md'), 'utf8')).toBe('# workflow');
	});

	it('repairs known PDF glyph artifacts while preserving curated Markdown content', async () => {
		await write('corpus/DIRECTORY.md');
		await write(
			'corpus/02_differential_expression/edgeR/vignette.md',
			'St VincentŠs bisulĄte sequencing workĆow\n'
		);
		await writeMetadata('corpus/02_differential_expression/edgeR', 'edgeR', ['vignette.md']);

		const source = (await findCorpusPackage(path.join(root, 'corpus'), 'edgeR'))!;
		const target = path.join(root, 'out', 'curated');
		await copyCorpusPackage(source, target);

		expect(await fs.readFile(path.join(target, 'vignette.md'), 'utf8')).toBe(
			"St Vincent's bisulfite sequencing workflow\n"
		);
	});
});

describe('curated provenance validation', () => {
	it('requires exactly one record for every Markdown document', () => {
		const result = parseCuratedPackageMetadata(
			{
				package: 'DESeq2',
				documents: [
					{
						path: 'vignette.md',
						origin_url: 'https://example.org/vignette',
						origin_type: 'curated_document',
						package_version: '1.52.0',
						bioc_release: '3.23'
					}
				]
			},
			['vignette.md', 'reference.md']
		);
		expect(result.success).toBe(false);
		if (!result.success)
			expect(result.issues).toContain('documents: missing entry for reference.md');
	});

	it('keeps different per-document versions and unknown releases distinct', () => {
		const result = parseCuratedPackageMetadata({
			package: 'DESeq2',
			documents: [
				{
					path: 'vignette.md',
					origin_url: 'https://example.org/vignette',
					origin_type: 'curated_document',
					package_version: '1.52.0',
					bioc_release: '3.23'
				},
				{
					path: 'reference.md',
					origin_url: 'https://example.org/reference',
					origin_type: 'curated_document',
					package_version: '1.53.1',
					bioc_release: 'unknown'
				}
			]
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.documents.get('vignette.md')?.packageVersion).toBe('1.52.0');
			expect(result.documents.get('reference.md')?.packageVersion).toBe('1.53.1');
			expect(result.documents.get('reference.md')?.bioconductorRelease).toBe('unknown');
		}
	});

	it('validates the bundled corpus one-to-one', async () => {
		for (const packageName of await listCorpusPackageNames(REPO_CORPUS_PATH)) {
			expect(await findCorpusPackage(REPO_CORPUS_PATH, packageName)).not.toBeNull();
		}
	});
});
