import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import {
	BIOCONDUCTOR_RESOURCE_CACHE_VERSION,
	type BioconductorResourceMetadata
} from '../bioconductor/metadata.ts';
import { BIOCONDUCTOR_SOURCE_POLICY_VERSION } from '../bioconductor/source-policy.ts';
import type { CranResourceMetadata } from '../cran/metadata.ts';
import {
	clearVirtualCollectionMetadata,
	getVirtualCollectionMetadata,
	setVirtualCollectionMetadata
} from '../collections/virtual-metadata.ts';
import {
	createVirtualFs,
	disposeVirtualFs,
	mkdirVirtualFs,
	writeVirtualFsFile
} from '../vfs/virtual-fs.ts';
import { executeEvidenceTool, finalizeEvidenceAnswer } from './evidence.ts';
import { executeGrepTool } from './grep.ts';
import { executeReadTool } from './read.ts';
import { executeSearchTool } from './search.ts';

const commit = 'a'.repeat(40);

const metadata = (kind: 'github' | 'bioconductor_git' = 'github'): BioconductorResourceMetadata => ({
	cacheVersion: BIOCONDUCTOR_RESOURCE_CACHE_VERSION,
	package: 'DESeq2',
	bioconductor: {
		release: '3.23',
		packageVersion: '1.52.0',
		repository: 'bioc',
		landingUrl: 'https://bioconductor.org/packages/3.23/bioc/html/DESeq2.html'
	},
	repository: {
		kind,
		url:
			kind === 'github'
				? 'https://github.com/thelovelab/DESeq2'
				: 'https://git.bioconductor.org/packages/DESeq2',
		branch: kind === 'github' ? 'devel' : 'RELEASE_3_23',
		commit,
		descriptionPackage: 'DESeq2',
		descriptionVersion: '1.52.0',
		sourcePolicyVersion: BIOCONDUCTOR_SOURCE_POLICY_VERSION,
		fileCount: 1,
		bytes: 10,
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
			path: 'curated/reference.md',
			sourceType: 'curated',
			originType: 'curated_document',
			originUrl: 'https://example.org/original-reference',
			packageVersion: 'unknown',
			bioconductorRelease: 'unknown',
			status: 'ok'
		}
	],
	requestedDocuments: ['vignettes', 'manual'],
	curatedFrom: '02_differential_expression/DESeq2',
	fetchedAt: '2026-08-08T00:00:00.000Z'
});

const cranMetadata = (): CranResourceMetadata => ({
	cacheVersion: 1,
	package: 'Seurat',
	cran: {
		version: '5.5.1',
		repository: 'CRAN',
		landingUrl: 'https://cloud.r-project.org/web/packages/Seurat/index.html',
		sourceUrl: 'https://cloud.r-project.org/src/contrib/Seurat_5.5.1.tar.gz',
		sourceSha256: 'b'.repeat(64),
		md5: 'a'.repeat(32),
		published: '2026-06-26 09:10:02 UTC'
	},
	source: {
		descriptionPackage: 'Seurat',
		descriptionVersion: '5.5.1',
		sourcePolicyVersion: BIOCONDUCTOR_SOURCE_POLICY_VERSION,
		fileCount: 1,
		bytes: 25,
		omittedCount: 0
	},
	fetchedAt: '2026-08-09T00:00:00.000Z'
});

describe('evidence tool', () => {
	let vfsId: string;
	const context = () => ({ basePath: '/', vfsId });

	beforeEach(async () => {
		vfsId = createVirtualFs();
		await mkdirVirtualFs('/DESeq2/vignettes', { recursive: true }, vfsId);
		await mkdirVirtualFs('/DESeq2/curated', { recursive: true }, vfsId);
		await mkdirVirtualFs('/DESeq2/source/R', { recursive: true }, vfsId);
		await writeVirtualFsFile('/DESeq2/vignettes/DESeq2.md', 'first\nsecond\nthird\nfourth', vfsId);
		await writeVirtualFsFile('/DESeq2/curated/reference.md', 'curated one\ncurated two', vfsId);
		await writeVirtualFsFile('/DESeq2/source/R/DESeq.R', 'DESeq <- function() {}\n', vfsId);
		await writeVirtualFsFile('/DESeq2/README.md', '# routing\n', vfsId);
		setVirtualCollectionMetadata({
			vfsId,
			collectionKey: 'DESeq2',
			createdAt: '2026-08-08T00:00:00.000Z',
			resources: [
				{
					name: 'DESeq2',
					fsName: 'DESeq2',
					type: 'bioconductor',
					path: '/managed/DESeq2',
					repoSubPaths: ['.'],
					package: 'DESeq2',
					bioconductorMetadata: metadata(),
					loadedAt: '2026-08-08T00:00:00.000Z'
				}
			]
		});
	});

	afterEach(() => {
		clearVirtualCollectionMetadata(vfsId);
		disposeVirtualFs(vfsId);
	});

	it('requires read inspection, then returns exact inclusive lines with managed provenance', async () => {
		await executeGrepTool({ pattern: 'second', path: 'DESeq2' }, context());
		await expect(
			executeEvidenceTool(
				{ spans: [{ path: 'DESeq2/vignettes/DESeq2.md', line_start: 2, line_end: 3 }] },
				context()
			)
		).rejects.toThrow('covered by a prior read or evidence-ready search excerpt');

		await executeReadTool({ path: 'DESeq2/vignettes/DESeq2.md' }, context());
		const result = await executeEvidenceTool(
			{ spans: [{ path: 'DESeq2/vignettes/DESeq2.md', line_start: 2, line_end: 3 }] },
			context()
		);
		expect(result.evidence[0]).toMatchObject({
			id: 'E1',
			package: 'DESeq2',
			package_version: '1.52.0',
			bioc_release: '3.23',
			path: 'vignettes/DESeq2.md',
			line_start: 2,
			line_end: 3,
			source_type: 'bioconductor',
			origin_type: 'vignette',
			repository_commit: null,
			content: 'second\nthird'
		});
	});

	it('accepts exact fully visible search excerpts without a redundant read', async () => {
		const search = await executeSearchTool(
			{ query: 'Where are second and third documented?', packages: ['DESeq2'] },
			context()
		);
		const result = search.metadata.results.find(
			(item) => item.path === 'DESeq2/vignettes/DESeq2.md'
		);
		expect(result).toBeDefined();
		expect(result!.evidenceReady).toBe(true);
		const evidence = await executeEvidenceTool(
			{ spans: [{ path: result!.path, line_start: result!.lineStart, line_end: result!.lineEnd }] },
			context()
		);
		expect(evidence.evidence[0]!.content).toBe(result!.excerpt);
	});

	it('keeps truncated search excerpts ineligible until an exact read', async () => {
		await writeVirtualFsFile(
			'/DESeq2/vignettes/long-search.md',
			`uniqueSearchNeedle ${'x'.repeat(2001)}\nshort`,
			vfsId
		);
		const search = await executeSearchTool(
			{ query: 'uniqueSearchNeedle', packages: ['DESeq2'] },
			context()
		);
		const result = search.metadata.results.find((item) => item.path.endsWith('/long-search.md'));
		expect(result).toBeDefined();
		expect(result!.evidenceReady).toBe(false);
		await expect(
			executeEvidenceTool(
				{
					spans: [{ path: result!.path, line_start: result!.lineStart, line_end: result!.lineEnd }]
				},
				context()
			)
		).rejects.toThrow('covered by a prior read or evidence-ready search excerpt');
	});

	it('issues independent batched locators atomically and hides content from the model', async () => {
		await executeReadTool({ path: 'DESeq2/vignettes/DESeq2.md' }, context());
		const result = await executeEvidenceTool(
			{
				spans: [
					{ path: 'DESeq2/vignettes/DESeq2.md', line_start: 1, line_end: 1 },
					{ path: 'DESeq2/vignettes/DESeq2.md', line_start: 3, line_end: 4 }
				]
			},
			context()
		);
		expect(result.evidence.map((item) => item.id)).toEqual(['E1', 'E2']);
		const exposed = JSON.parse(result.output) as { evidence: Record<string, unknown>[] };
		expect(exposed.evidence).toEqual([
			{
				evidence_id: 'E1',
				package: 'DESeq2',
				path: 'vignettes/DESeq2.md',
				line_start: 1,
				line_end: 1
			},
			{
				evidence_id: 'E2',
				package: 'DESeq2',
				path: 'vignettes/DESeq2.md',
				line_start: 3,
				line_end: 4
			}
		]);
		expect(JSON.stringify(exposed)).not.toContain('first');
		const before = getVirtualCollectionMetadata(vfsId)!.trace.nextEvidenceId;
		await expect(
			executeEvidenceTool(
				{
					spans: [
						{ path: 'DESeq2/vignettes/DESeq2.md', line_start: 1, line_end: 1 },
						{ path: 'missing.md', line_start: 1, line_end: 1 }
					]
				},
				context()
			)
		).rejects.toThrow();
		expect(getVirtualCollectionMetadata(vfsId)!.trace.nextEvidenceId).toBe(before);
	});

	it('rejects evidence outside the exact line range returned by read', async () => {
		await executeReadTool({ path: 'DESeq2/vignettes/DESeq2.md', offset: 0, limit: 1 }, context());
		await expect(
			executeEvidenceTool(
				{ spans: [{ path: 'DESeq2/vignettes/DESeq2.md', line_start: 1, line_end: 2 }] },
				context()
			)
		).rejects.toThrow('covered by a prior read or evidence-ready search excerpt');

		const firstLine = await executeEvidenceTool(
			{ spans: [{ path: 'DESeq2/vignettes/DESeq2.md', line_start: 1, line_end: 1 }] },
			context()
		);
		expect(firstLine.evidence[0]!.content).toBe('first');

		await executeReadTool({ path: 'DESeq2/vignettes/DESeq2.md', offset: 1, limit: 2 }, context());
		const covered = await executeEvidenceTool(
			{ spans: [{ path: 'DESeq2/vignettes/DESeq2.md', line_start: 2, line_end: 3 }] },
			context()
		);
		expect(covered.evidence[0]!.content).toBe('second\nthird');
	});

	it('combines adjacent reads so a claim spanning two reads needs no third read', async () => {
		await executeReadTool({ path: 'DESeq2/vignettes/DESeq2.md', offset: 0, limit: 1 }, context());
		await executeReadTool({ path: 'DESeq2/vignettes/DESeq2.md', offset: 1, limit: 2 }, context());
		const spanning = await executeEvidenceTool(
			{ spans: [{ path: 'DESeq2/vignettes/DESeq2.md', line_start: 1, line_end: 3 }] },
			context()
		);
		expect(spanning.evidence[0]!.content).toBe('first\nsecond\nthird');
	});

	it('returns a compact reminder instead of repeating a fully inspected range', async () => {
		await executeReadTool({ path: 'DESeq2/vignettes/DESeq2.md', offset: 0, limit: 3 }, context());
		const repeated = await executeReadTool(
			{ path: 'DESeq2/vignettes/DESeq2.md', offset: 0, limit: 3 },
			context()
		);
		expect(repeated.metadata.reused).toBe(true);
		expect(repeated.output).toContain('Already inspected');
		expect(repeated.output).toContain('remain eligible for evidence');
		const evidence = await executeEvidenceTool(
			{ spans: [{ path: 'DESeq2/vignettes/DESeq2.md', line_start: 1, line_end: 3 }] },
			context()
		);
		expect(evidence.evidence[0]!.content).toBe('first\nsecond\nthird');
	});

	it('returns only the unseen suffix of a partially overlapping range', async () => {
		await executeReadTool({ path: 'DESeq2/vignettes/DESeq2.md', offset: 0, limit: 3 }, context());
		const extended = await executeReadTool(
			{ path: 'DESeq2/vignettes/DESeq2.md', offset: 0, limit: 4 },
			context()
		);
		expect(extended.metadata.reused).toBe(true);
		expect(extended.output).toContain('    4\tfourth');
		expect(extended.output).not.toContain('    1\tfirst');
		expect(extended.output).toContain('only new lines are shown');
		const evidence = await executeEvidenceTool(
			{ spans: [{ path: 'DESeq2/vignettes/DESeq2.md', line_start: 1, line_end: 4 }] },
			context()
		);
		expect(evidence.evidence[0]!.content).toBe('first\nsecond\nthird\nfourth');
	});

	it('does not combine disjoint reads or truncated long lines into evidence coverage', async () => {
		await executeReadTool({ path: 'DESeq2/vignettes/DESeq2.md', offset: 0, limit: 1 }, context());
		await executeReadTool({ path: 'DESeq2/vignettes/DESeq2.md', offset: 2, limit: 1 }, context());
		await expect(
			executeEvidenceTool(
				{ spans: [{ path: 'DESeq2/vignettes/DESeq2.md', line_start: 1, line_end: 3 }] },
				context()
			)
		).rejects.toThrow('covered by a prior read or evidence-ready search excerpt');

		await writeVirtualFsFile('/DESeq2/vignettes/long.md', `${'x'.repeat(2001)}\nshort`, vfsId);
		await executeReadTool({ path: 'DESeq2/vignettes/long.md' }, context());
		await expect(
			executeEvidenceTool(
				{ spans: [{ path: 'DESeq2/vignettes/long.md', line_start: 1, line_end: 1 }] },
				context()
			)
		).rejects.toThrow('covered by a prior read or evidence-ready search excerpt');
		const short = await executeEvidenceTool(
			{ spans: [{ path: 'DESeq2/vignettes/long.md', line_start: 2, line_end: 2 }] },
			context()
		);
		expect(short.evidence[0]!.content).toBe('short');
	});

	it('normalizes copied curated records without substituting installed versions', async () => {
		await executeReadTool({ path: 'DESeq2/curated/reference.md' }, context());
		const result = await executeEvidenceTool(
			{ spans: [{ path: 'DESeq2/curated/reference.md', line_start: 1, line_end: 1 }] },
			context()
		);
		expect(result.evidence[0]).toMatchObject({
			package_version: 'unknown',
			bioc_release: 'unknown',
			source_type: 'curated',
			origin_type: 'curated_document',
			origin_url: 'https://example.org/original-reference'
		});
	});

	it('uses DESCRIPTION identity and a commit-pinned GitHub URL for repository source', async () => {
		await executeReadTool({ path: 'DESeq2/source/R/DESeq.R' }, context());
		const result = await executeEvidenceTool(
			{ spans: [{ path: 'DESeq2/source/R/DESeq.R', line_start: 1, line_end: 1 }] },
			context()
		);
		expect(result.evidence[0]).toMatchObject({
			package_version: '1.52.0',
			bioc_release: '3.23',
			source_type: 'repository',
			origin_type: 'repository_file',
			repository_commit: commit
		});
		expect(result.evidence[0]!.origin_url).toBe(
			`https://github.com/thelovelab/DESeq2/blob/${commit}/R/DESeq.R`
		);
	});

	it('does not invent a blob URL for Bioconductor Git source', async () => {
		getVirtualCollectionMetadata(vfsId)!.resources[0]!.bioconductorMetadata = metadata('bioconductor_git');
		await executeReadTool({ path: 'DESeq2/source/R/DESeq.R' }, context());
		const result = await executeEvidenceTool(
			{ spans: [{ path: 'DESeq2/source/R/DESeq.R', line_start: 1, line_end: 1 }] },
			context()
		);
		expect(result.evidence[0]!.origin_url).toBe(
			`local:https://git.bioconductor.org/packages/DESeq2@${commit}`
		);
		expect(result.evidence[0]!.bioc_release).toBe('3.23');
		expect(result.evidence[0]!.repository_commit).toBe(commit);
		const finalized = finalizeEvidenceAnswer({
			vfsId,
			query: 'How?',
			draft: 'Implementation claim. [[E1]]'
		});
		expect(finalized.text).toContain('- [E1] DESeq.R:1-1 (DESeq2 1.52.0)');
		expect(finalized.text).not.toContain(`revision ${commit.slice(0, 12)}`);
		expect(finalized.text).not.toContain('](https://git.bioconductor.org');
	});

	it('records exact Bioconductor archive and digest provenance for package source', async () => {
		getVirtualCollectionMetadata(vfsId)!.resources[0]!.bioconductorMetadata = {
			...metadata(),
			repository: {
				kind: 'bioconductor_archive',
				url: 'https://bioconductor.org/packages/3.23/bioc/src/contrib/DESeq2_1.52.0.tar.gz',
				sha256: 'b'.repeat(64),
				descriptionPackage: 'DESeq2',
				descriptionVersion: '1.52.0',
				sourcePolicyVersion: BIOCONDUCTOR_SOURCE_POLICY_VERSION,
				fileCount: 1,
				bytes: 10,
				omittedCount: 0
			}
		};
		await executeReadTool({ path: 'DESeq2/source/R/DESeq.R' }, context());
		const result = await executeEvidenceTool(
			{ spans: [{ path: 'DESeq2/source/R/DESeq.R', line_start: 1, line_end: 1 }] },
			context()
		);
		expect(result.evidence[0]).toMatchObject({
			package_version: '1.52.0',
			bioc_release: '3.23',
			origin_url:
				'https://bioconductor.org/packages/3.23/bioc/src/contrib/DESeq2_1.52.0.tar.gz#sha256=' +
				'b'.repeat(64),
			repository_commit: null
		});
	});

	it('uses exact CRAN release provenance without inventing Bioconductor or Git identity', async () => {
		clearVirtualCollectionMetadata(vfsId);
		await mkdirVirtualFs('/Seurat/source/man', { recursive: true }, vfsId);
		await writeVirtualFsFile('/Seurat/source/man/FindMarkers.Rd', 'Find markers\n', vfsId);
		setVirtualCollectionMetadata({
			vfsId,
			collectionKey: 'Seurat',
			createdAt: '2026-08-09T00:00:00.000Z',
			resources: [
				{
					name: 'Seurat',
					fsName: 'Seurat',
					type: 'cran',
					path: '/managed/Seurat',
					repoSubPaths: [],
					package: 'Seurat',
					version: '5.5.1',
					cranMetadata: cranMetadata(),
					loadedAt: '2026-08-09T00:00:00.000Z'
				}
			]
		});
		await executeReadTool({ path: 'Seurat/source/man/FindMarkers.Rd' }, context());
		const result = await executeEvidenceTool(
			{ spans: [{ path: 'Seurat/source/man/FindMarkers.Rd', line_start: 1, line_end: 1 }] },
			context()
		);
		expect(result.evidence[0]).toMatchObject({
			package: 'Seurat',
			package_version: '5.5.1',
			bioc_release: 'unknown',
			source_type: 'cran',
			origin_type: 'cran_package_file',
			origin_url: 'https://cloud.r-project.org/src/contrib/Seurat_5.5.1.tar.gz',
			repository_commit: null
		});
	});

	it('rejects generated routing and manifest files as authoritative evidence', async () => {
		await executeReadTool({ path: 'DESeq2/README.md' }, context());
		await expect(
			executeEvidenceTool(
				{ spans: [{ path: 'DESeq2/README.md', line_start: 1, line_end: 1 }] },
				context()
			)
		).rejects.toThrow('not evidence');
	});

	it('resolves broad bundled-corpus provenance from sibling YAML', async () => {
		clearVirtualCollectionMetadata(vfsId);
		await mkdirVirtualFs(
			'/Bioconductor/02_differential_expression/DESeq2',
			{ recursive: true },
			vfsId
		);
		await writeVirtualFsFile(
			'/Bioconductor/02_differential_expression/DESeq2/vignette.md',
			'curated evidence\n',
			vfsId
		);
		await writeVirtualFsFile(
			'/Bioconductor/02_differential_expression/DESeq2/_metadata.yml',
			[
				'package: DESeq2',
				'documents:',
				'  - path: vignette.md',
				'    origin_url: https://example.org/original-vignette',
				'    origin_type: curated_document',
				'    package_version: "1.51.0"',
				'    bioc_release: "3.22"',
				''
			].join('\n'),
			vfsId
		);
		setVirtualCollectionMetadata({
			vfsId,
			collectionKey: 'Bioconductor',
			createdAt: '2026-08-08T00:00:00.000Z',
			resources: [
				{
					name: 'Bioconductor',
					fsName: 'Bioconductor',
					type: 'local',
					path: '/bundled',
					repoSubPaths: ['.'],
					loadedAt: '2026-08-08T00:00:00.000Z'
				}
			]
		});
		const evidencePath = 'Bioconductor/02_differential_expression/DESeq2/vignette.md';
		await executeReadTool({ path: evidencePath }, context());
		const result = await executeEvidenceTool(
			{ spans: [{ path: evidencePath, line_start: 1, line_end: 1 }] },
			context()
		);
		expect(result.evidence[0]).toMatchObject({
			package: 'DESeq2',
			package_version: '1.51.0',
			bioc_release: '3.22',
			source_type: 'curated',
			origin_url: 'https://example.org/original-vignette'
		});
	});

	it('accepts only issued cited IDs and builds the canonical source list', async () => {
		await executeReadTool({ path: 'DESeq2/vignettes/DESeq2.md' }, context());
		await executeEvidenceTool(
			{ spans: [{ path: 'DESeq2/vignettes/DESeq2.md', line_start: 1, line_end: 2 }] },
			context()
		);
		const finalized = finalizeEvidenceAnswer({
			vfsId,
			query: 'How?',
			draft: 'The result is supported. [[E1]] [[E999]]\n\nSources:\n- draft'
		});
		expect(finalized.evidence.status).toBe('supported');
		expect(finalized.evidence.results.map((result) => result.id)).toEqual(['E1']);
		expect(finalized.text).toContain('The result is supported. [E1]');
		expect(finalized.text).not.toContain('E999');
		expect(finalized.text.match(/Sources:/g)).toHaveLength(1);
		expect(finalized.text).toContain('- [E1] DESeq2.md:1-2 (DESeq2 1.52.0)');
		expect(finalized.text).not.toContain('https://bioconductor.org');
	});

	it('keeps compact citations unambiguous when filenames collide', async () => {
		await writeVirtualFsFile('/DESeq2/source/DESeq2.md', 'source evidence\n', vfsId);
		await executeReadTool({ path: 'DESeq2/vignettes/DESeq2.md' }, context());
		await executeReadTool({ path: 'DESeq2/source/DESeq2.md' }, context());
		await executeEvidenceTool(
			{ spans: [{ path: 'DESeq2/vignettes/DESeq2.md', line_start: 1, line_end: 2 }] },
			context()
		);
		await executeEvidenceTool(
			{ spans: [{ path: 'DESeq2/source/DESeq2.md', line_start: 1, line_end: 1 }] },
			context()
		);

		const finalized = finalizeEvidenceAnswer({
			vfsId,
			query: 'How?',
			draft: 'Both locations are relevant. [[E1]] [[E2]]'
		});
		expect(finalized.text).toContain('- [E1] vignettes/DESeq2.md:1-2');
		expect(finalized.text).toContain('- [E2] source/DESeq2.md:1-1');
	});

	it('returns insufficient_evidence for uncited reads or fabricated IDs', async () => {
		await executeReadTool({ path: 'DESeq2/vignettes/DESeq2.md' }, context());
		const finalized = finalizeEvidenceAnswer({
			vfsId,
			query: 'Unsupported?',
			draft: 'A claim with [[E88]].'
		});
		expect(finalized.evidence).toEqual({
			status: 'insufficient_evidence',
			query: 'Unsupported?',
			searched_packages: ['DESeq2'],
			searched_documents: 1,
			results: []
		});
	});

	it('disposes the in-memory query trace with the virtual collection', () => {
		expect(getVirtualCollectionMetadata(vfsId)).toBeDefined();
		clearVirtualCollectionMetadata(vfsId);
		expect(getVirtualCollectionMetadata(vfsId)).toBeUndefined();
	});
});
