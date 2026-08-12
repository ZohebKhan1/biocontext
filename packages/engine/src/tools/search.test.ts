import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import {
	clearVirtualCollectionMetadata,
	setVirtualCollectionMetadata
} from '../collections/virtual-metadata.ts';
import {
	createVirtualFs,
	disposeVirtualFs,
	mkdirVirtualFs,
	writeVirtualFsFile
} from '../vfs/virtual-fs.ts';
import { executeSearchTool, SearchToolParameters } from './search.ts';

describe('ranked lexical search tool', () => {
	let vfsId: string;

	beforeEach(async () => {
		vfsId = createVirtualFs();
		await mkdirVirtualFs('/DESeq2/source/man', { recursive: true }, vfsId);
		await mkdirVirtualFs('/DESeq2/source/R', { recursive: true }, vfsId);
		await mkdirVirtualFs('/DESeq2/vignettes', { recursive: true }, vfsId);
		await mkdirVirtualFs('/edgeR/source/man', { recursive: true }, vfsId);
		await mkdirVirtualFs(
			'/Bioconductor/02_differential_expression/limma',
			{
				recursive: true
			},
			vfsId
		);
		await writeVirtualFsFile(
			'/DESeq2/source/man/lfcShrink.Rd',
			[
				'\\name{lfcShrink}',
				'\\alias{lfcShrink}',
				'\\title{Shrink log2 fold changes}',
				'\\description{Shrink noisy log2 fold change estimates after fitting DESeq2.}',
				'\\usage{lfcShrink(dds, coef, type)}'
			].join('\n'),
			vfsId
		);
		await writeVirtualFsFile(
			'/DESeq2/source/R/lfcShrink.R',
			"lfcShrink <- function(dds, coef, type) {\n  message('shrink estimates')\n}\n",
			vfsId
		);
		await writeVirtualFsFile(
			'/DESeq2/vignettes/workflow.md',
			'# Differential expression workflow\nUse shrinkage after fitting to stabilize noisy effects.\n',
			vfsId
		);
		await writeVirtualFsFile(
			'/DESeq2/README.md',
			'lfcShrink noisy log2 fold change fitting routing only\n',
			vfsId
		);
		await writeVirtualFsFile('/DESeq2/source/MANIFEST.json', '{"lfcShrink":"routing"}\n', vfsId);
		await writeVirtualFsFile(
			'/edgeR/source/man/glmQLFit.Rd',
			'\\name{glmQLFit}\nFit quasi-likelihood models for differential expression.\n',
			vfsId
		);
		await writeVirtualFsFile(
			'/Bioconductor/02_differential_expression/limma/reference.md',
			'lmFit fits linear models for differential expression.\n',
			vfsId
		);
		setVirtualCollectionMetadata({
			vfsId,
			collectionKey: 'search-test',
			createdAt: '2026-08-09T00:00:00.000Z',
			resources: [
				{
					name: 'DESeq2',
					fsName: 'DESeq2',
					type: 'bioconductor',
					path: '/managed/DESeq2',
					repoSubPaths: ['.'],
					package: 'DESeq2',
					loadedAt: '2026-08-09T00:00:00.000Z'
				},
				{
					name: 'edgeR',
					fsName: 'edgeR',
					type: 'bioconductor',
					path: '/managed/edgeR',
					repoSubPaths: ['.'],
					package: 'edgeR',
					loadedAt: '2026-08-09T00:00:00.000Z'
				},
				{
					name: 'Bioconductor',
					fsName: 'Bioconductor',
					type: 'git',
					path: '/bundled/Bioconductor',
					repoSubPaths: ['.'],
					loadedAt: '2026-08-09T00:00:00.000Z'
				}
			]
		});
	});

	afterEach(() => {
		clearVirtualCollectionMetadata(vfsId);
		disposeVirtualFs(vfsId);
	});

	it('ranks exact symbols and scopes to explicit packages', async () => {
		const result = await executeSearchTool(
			{
				query: 'How should I use `lfcShrink()` for noisy log2 fold changes?',
				packages: ['DESeq2']
			},
			{ basePath: '/', vfsId }
		);
		expect(result.metadata.resultCount).toBeGreaterThan(0);
		expect(result.metadata.packages).toEqual(['DESeq2']);
		expect(result.metadata.results[0]).toMatchObject({
			package: 'DESeq2',
			path: 'DESeq2/source/man/lfcShrink.Rd',
			family: 'source_rd'
		});
		expect(result.metadata.results.every((item) => item.package === 'DESeq2')).toBe(true);
		expect(result.metadata.results[0]?.evidenceReady).toBe(true);
		expect(result.output).toContain(
			'evidence_span={"path":"DESeq2/source/man/lfcShrink.Rd","line_start":1,"line_end":5}'
		);
		expect(result.output).toContain('evidence_ready=true');
		expect(result.output).toContain('batch two or more read requests with read_many');
		// Ranking diagnostics remain available in metadata; the model-facing
		// discovery text carries only navigation fields and the bounded excerpt.
		expect(result.output).not.toContain('score=');
		expect(result.output).not.toContain('matched=');
	});

	it('handles natural-language discovery and returns exact line-stable excerpts', async () => {
		const result = await executeSearchTool(
			{ query: 'How can I shrink noisy log2 fold change estimates after fitting?' },
			{ basePath: '/', vfsId }
		);
		const top = result.metadata.results[0]!;
		expect(top.package).toBe('DESeq2');
		expect(top.lineStart).toBe(1);
		expect(top.lineEnd).toBe(5);
		expect(top.excerpt).toContain('Shrink noisy log2 fold change estimates after fitting DESeq2.');
	});

	it('records each explicit API target without padding results with weaker paths', async () => {
		await writeVirtualFsFile(
			'/DESeq2/vignettes/combined.md',
			Array.from({ length: 5 }, () => 'lfcShrink glmQLFit implementation behavior').join('\n'),
			vfsId
		);
		const result = await executeSearchTool(
			{
				query: 'Compare `lfcShrink()` with `glmQLFit()` implementation behavior.',
				packages: ['DESeq2', 'edgeR'],
				targets: ['lfcShrink', 'glmQLFit']
			},
			{ basePath: '/', vfsId }
		);
		const covered = new Set(result.metadata.results.flatMap((item) => item.targets));
		expect(covered).toContain('lfcShrink');
		expect(covered).toContain('glmQLFit');
		expect(result.metadata.results.some((item) => item.package === 'DESeq2')).toBe(true);
		expect(result.metadata.results.some((item) => item.package === 'edgeR')).toBe(true);
	});

	it('groups short requirements even when their full phrases do not occur verbatim', async () => {
		const result = await executeSearchTool(
			{
				query: 'Compare shrinkage and quasi-likelihood behavior.',
				packages: ['DESeq2', 'edgeR'],
				targets: ['noisy estimate shrinkage', 'quasi likelihood model']
			},
			{ basePath: '/', vfsId }
		);
		const covered = new Set(result.metadata.results.flatMap((item) => item.targets));
		expect(covered).toContain('noisy estimate shrinkage');
		expect(covered).toContain('quasi likelihood model');
	});

	it('prefers package code over focused tests for signature and default targets', async () => {
		await mkdirVirtualFs('/DESeq2/source/tests', { recursive: true }, vfsId);
		await writeVirtualFsFile(
			'/DESeq2/source/tests/test-signature.R',
			'lfcShrink lfcShrink signature default default default\n',
			vfsId
		);
		const result = await executeSearchTool(
			{
				query: 'Show the lfcShrink function signature and defaults.',
				packages: ['DESeq2'],
				targets: ['lfcShrink signature defaults'],
				limit: 1
			},
			{ basePath: '/', vfsId }
		);
		expect(result.metadata.results[0]?.path).toBe('DESeq2/source/R/lfcShrink.R');
	});

	it('prefers decisive implementation and NEWS lines over matching Rd and vignette prose', async () => {
		await writeVirtualFsFile(
			'/DESeq2/source/man/translate_ids.Rd',
			'\\name{translate_ids}\n\\usage{translate_ids(data, keep_untranslated = FALSE)}\n',
			vfsId
		);
		await writeVirtualFsFile(
			'/DESeq2/source/R/id_mapping.R',
			'join_method <- if(keep_untranslated, left_join, inner_join)\n',
			vfsId
		);
		await writeVirtualFsFile(
			'/DESeq2/NEWS.md',
			'# DESeq2 v1.0\n\nID translation ambiguity analysis\n',
			vfsId
		);
		const result = await executeSearchTool(
			{
				query: 'Verify the implementation path and release note.',
				packages: ['DESeq2'],
				targets: [
					'translate_ids keep_untranslated left_join inner_join',
					'translation ambiguity NEWS'
				]
			},
			{ basePath: '/', vfsId }
		);
		expect(result.metadata.results[0]).toMatchObject({
			path: 'DESeq2/source/R/id_mapping.R',
			family: 'source_r'
		});
		const news = result.metadata.results.find((item) => item.path === 'DESeq2/NEWS.md');
		expect(news?.targets).toContain('translation ambiguity NEWS');
	});

	it('uses smart case and treats regex metacharacters literally', async () => {
		await writeVirtualFsFile('/edgeR/source/man/case.Rd', 'foobar\nmean(value)\n', vfsId);
		const exactCase = await executeSearchTool({ query: 'Find `FooBar`' }, { basePath: '/', vfsId });
		expect(exactCase.output).toBe('no_strong_match');

		const lowerCase = await executeSearchTool({ query: 'find foobar' }, { basePath: '/', vfsId });
		expect(lowerCase.metadata.results.some((item) => item.path.endsWith('/case.Rd'))).toBe(true);

		const punctuation = await executeSearchTool(
			{ query: 'Does `mean(value)` appear despite .* [ regex punctuation?' },
			{ basePath: '/', vfsId }
		);
		expect(punctuation.metadata.results.some((item) => item.path.endsWith('/case.Rd'))).toBe(true);
	});

	it('excludes generated routing and metadata artifacts', async () => {
		const result = await executeSearchTool(
			{ query: 'routing only manifest' },
			{ basePath: '/', vfsId }
		);
		expect(result.metadata.results.some((item) => item.path.endsWith('README.md'))).toBe(false);
		expect(result.metadata.results.some((item) => item.path.endsWith('MANIFEST.json'))).toBe(false);
	});

	it('rejects nonexistent package filters without leaking results from mounted packages', async () => {
		const result = await executeSearchTool(
			{ query: 'differential expression fitting', packages: ['scran'] },
			{ basePath: '/', vfsId }
		);
		expect(result.output).toContain('no_strong_match');
		expect(result.output).toContain('unknown_packages');
		expect(result.metadata.unknownPackages).toEqual(['scran']);
		expect(result.metadata.results).toEqual([]);
	});

	it('normalizes one safe encoded package prefix without accepting paths or double prefixes', async () => {
		for (const packageName of ['DESeq2', '@DESeq2', '%40DESeq2', '%40DESeq2%20', 'dEsEq2']) {
			const result = await executeSearchTool(
				{ query: 'lfcShrink', packages: [packageName] },
				{ basePath: '/', vfsId }
			);
			expect(result.metadata.unknownPackages).toEqual([]);
			expect(result.metadata.packages).toEqual(['DESeq2']);
			expect(result.metadata.results.length).toBeGreaterThan(0);
		}

		for (const packageName of ['@@DESeq2', '%ZZDESeq2', 'DESeq2/source', '%40DESeq2%2Fsource']) {
			const result = await executeSearchTool(
				{ query: 'lfcShrink', packages: [packageName] },
				{ basePath: '/', vfsId }
			);
			expect(result.output).toContain('no_strong_match');
			expect(result.output).toContain('unknown_packages');
			expect(result.metadata.results).toEqual([]);
			expect(result.metadata.unknownPackages.length).toBe(1);
		}
	});

	it('searches known packages in mixed filters while reporting unknown filters', async () => {
		const mixed = await executeSearchTool(
			{ query: 'lfcShrink', packages: ['%40DESeq2%20', 'scran'] },
			{ basePath: '/', vfsId }
		);
		expect(mixed.metadata.packages).toEqual(['DESeq2']);
		expect(mixed.metadata.unknownPackages).toEqual(['scran']);
		expect(mixed.metadata.results.every((result) => result.package === 'DESeq2')).toBe(true);

		const unknownOnly = await executeSearchTool(
			{ query: 'lfcShrink', packages: ['scran', 'GSVA'] },
			{ basePath: '/', vfsId }
		);
		expect(unknownOnly.metadata.packages).toEqual([]);
		expect(unknownOnly.metadata.unknownPackages).toEqual(['scran', 'GSVA']);
		expect(unknownOnly.metadata.searchedFileCount).toBe(0);
		expect(unknownOnly.metadata.results).toEqual([]);
	});

	it('infers package filters inside the broad bundled Bioconductor layout', async () => {
		const result = await executeSearchTool(
			{ query: 'How does lmFit fit linear models?', packages: ['limma'] },
			{ basePath: '/', vfsId }
		);
		expect(result.metadata.unknownPackages).toEqual([]);
		expect(result.metadata.results[0]).toMatchObject({
			package: 'limma',
			path: 'Bioconductor/02_differential_expression/limma/reference.md'
		});
	});

	it('deduplicates exact excerpts and prefers managed-package provenance', async () => {
		await mkdirVirtualFs('/DESeq2/curated', { recursive: true }, vfsId);
		await mkdirVirtualFs(
			'/Bioconductor/02_differential_expression/DESeq2',
			{
				recursive: true
			},
			vfsId
		);
		const duplicate = 'Unique duplicate pathway explanation for DESeq2.\n';
		await writeVirtualFsFile('/DESeq2/curated/duplicate.md', duplicate, vfsId);
		await writeVirtualFsFile(
			'/Bioconductor/02_differential_expression/DESeq2/duplicate.md',
			duplicate,
			vfsId
		);
		const result = await executeSearchTool(
			{ query: 'unique duplicate pathway explanation', packages: ['DESeq2'] },
			{ basePath: '/', vfsId }
		);
		const duplicates = result.metadata.results.filter((item) =>
			item.excerpt.includes('Unique duplicate pathway explanation')
		);
		expect(duplicates).toHaveLength(1);
		expect(duplicates[0]?.path).toBe('DESeq2/curated/duplicate.md');
	});

	it('is deterministic, bounded, and query-scoped', async () => {
		const params = { query: 'differential expression fitting', limit: 2 } as const;
		const first = await executeSearchTool(params, { basePath: '/', vfsId });
		const second = await executeSearchTool(params, { basePath: '/', vfsId });
		expect(second.metadata.results).toEqual(first.metadata.results);
		const parallel = await Promise.all(
			Array.from({ length: 20 }, () => executeSearchTool(params, { basePath: '/', vfsId }))
		);
		expect(parallel.every((result) => result.output === first.output)).toBe(true);
		expect(first.metadata.resultCount).toBeLessThanOrEqual(2);
	});

	it('ignores binary and malformed UTF-8 files', async () => {
		await writeVirtualFsFile(
			'/DESeq2/source/R/binary.dat',
			new Uint8Array([0, 108, 102, 99, 83, 104, 114, 105, 110, 107]),
			vfsId
		);
		await writeVirtualFsFile(
			'/DESeq2/source/R/invalid.txt',
			new Uint8Array([0xc3, 0x28, 108, 102, 99, 83, 104, 114, 105, 110, 107]),
			vfsId
		);
		const result = await executeSearchTool(
			{ query: '`lfcShrink`', packages: ['DESeq2'] },
			{ basePath: '/', vfsId }
		);
		expect(result.metadata.results.some((item) => item.path.endsWith('binary.dat'))).toBe(false);
		expect(result.metadata.results.some((item) => item.path.endsWith('invalid.txt'))).toBe(false);
	});

	it('bounds pathological excerpt output without losing valid source ranges', async () => {
		await writeVirtualFsFile(
			'/DESeq2/vignettes/large.md',
			Array.from({ length: 45 }, (_, index) => `lfcShrink ${index} ${'x'.repeat(1000)}`).join('\n'),
			vfsId
		);
		const result = await executeSearchTool(
			{ query: '`lfcShrink`', packages: ['DESeq2'] },
			{ basePath: '/', vfsId }
		);
		const large = result.metadata.results.find((item) => item.path.endsWith('/large.md'));
		expect(large).toBeDefined();
		expect(large!.evidenceReady).toBe(false);
		expect(Buffer.byteLength(large!.excerpt, 'utf8')).toBeLessThanOrEqual(3 * 1024);
		expect(large!.lineEnd).toBeGreaterThanOrEqual(large!.lineStart);
		expect(result.output).toContain(`"limit":${large!.lineEnd - large!.lineStart + 1}`);
		expect(result.output).toContain('evidence_ready=false');
	});

	it('survives malformed and adversarial lexical input without unsafe results', async () => {
		const seeds = [
			'',
			'   ',
			'.*+?^${}()|[]\\',
			'" OR 1=1 --',
			'NEAR(foo) AND NOT bar',
			'../../../../etc/passwd',
			'R names.with.dots',
			'e\u0301 café 数据',
			'word '.repeat(500),
			'Error: subscript out of bounds\nCalls: foo -> bar'
		];
		const queries = Array.from(
			{ length: 1000 },
			(_, index) => `${seeds[index % seeds.length]} ${index}`
		);
		for (const query of queries) {
			const result = await executeSearchTool({ query, limit: 3 }, { basePath: '/', vfsId });
			for (const item of result.metadata.results) {
				expect(item.path.startsWith('../')).toBe(false);
				expect(item.lineStart).toBeGreaterThan(0);
				expect(item.lineEnd).toBeGreaterThanOrEqual(item.lineStart);
			}
		}
		expect(SearchToolParameters.safeParse({ query: 'x'.repeat(4001) }).success).toBe(false);
		expect(
			SearchToolParameters.safeParse({
				query: 'multi-part audit',
				targets: Array.from({ length: 12 }, (_, index) => `requirement ${index}`)
			}).success
		).toBe(true);
		expect(
			SearchToolParameters.safeParse({
				query: 'multi-part audit',
				targets: Array.from({ length: 13 }, (_, index) => `requirement ${index}`)
			}).success
		).toBe(false);
	});
});
