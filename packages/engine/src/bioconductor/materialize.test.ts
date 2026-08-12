import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import * as tar from 'tar-stream';

import type { BioconductorPackage } from './catalog.ts';
import {
	BIOCONDUCTOR_METADATA_FILE,
	BIOCONDUCTOR_RESOURCE_CACHE_VERSION,
	BIOCONDUCTOR_SOURCE_DIRECTORY_FILE,
	BIOCONDUCTOR_SOURCE_MANIFEST_FILE,
	isCompleteBioconductorResourceCache,
	materializeBioconductorPackage,
	readBioconductorResourceMetadata,
	resolveRepositoryPlan,
	resolveRequestedSourceUrl
} from './materialize.ts';

const pkg = (overrides: Partial<BioconductorPackage> = {}): BioconductorPackage => ({
	name: 'DESeq2',
	version: '1.52.0',
	repository: 'bioc',
	title: 'Differential expression analysis',
	description: 'Analyze count data.',
	biocViews: [],
	hasNews: false,
	vignettes: [
		{
			title: 'DESeq2 workflow',
			path: 'vignettes/DESeq2/inst/doc/DESeq2.html',
			format: 'html'
		}
	],
	rFiles: [],
	url: 'https://github.com/thelovelab/DESeq2',
	gitUrl: 'https://git.bioconductor.org/packages/DESeq2',
	gitBranch: 'RELEASE_3_23',
	...overrides
});

describe('repository planning', () => {
	it('uses the exact versioned Bioconductor source archive by default', () => {
		expect(resolveRepositoryPlan(pkg(), '3.23', false)).toEqual({
			kind: 'bioconductor_archive',
			url: 'https://bioconductor.org/packages/3.23/bioc/src/contrib/DESeq2_1.52.0.tar.gz',
			archivedUrl:
				'https://bioconductor.org/packages/3.23/bioc/src/contrib/Archive/DESeq2/DESeq2_1.52.0.tar.gz'
		});
		expect(resolveRequestedSourceUrl(pkg(), '3.23', undefined)).toBe(
			'https://bioconductor.org/packages/3.23/bioc/src/contrib/DESeq2_1.52.0.tar.gz'
		);
	});

	it('uses the same archive rule regardless of published Git host', () => {
		expect(
			resolveRepositoryPlan(
				pkg({ url: 'https://example.org/DESeq2', gitBranch: 'RELEASE_3_23' }),
				'3.23',
				undefined
			)
		).toEqual({
			kind: 'bioconductor_archive',
			url: 'https://bioconductor.org/packages/3.23/bioc/src/contrib/DESeq2_1.52.0.tar.gz',
			archivedUrl:
				'https://bioconductor.org/packages/3.23/bioc/src/contrib/Archive/DESeq2/DESeq2_1.52.0.tar.gz'
		});
	});

	it('labels explicit overrides custom_git and preserves their branch', () => {
		expect(
			resolveRepositoryPlan(pkg(), '3.23', 'https://github.com/me/DESeq2/', 'experiment')
		).toEqual({
			kind: 'custom_git',
			url: 'https://github.com/me/DESeq2',
			branch: 'experiment'
		});
	});

	it('records an immutable source-commit request in the repository plan', () => {
		const commit = '0123456789abcdef0123456789abcdef01234567';
		expect(
			resolveRepositoryPlan(
				pkg(),
				'3.23',
				'https://git.bioconductor.org/packages/DESeq2',
				'RELEASE_3_23',
				commit
			)
		).toEqual({
			kind: 'custom_git',
			url: 'https://git.bioconductor.org/packages/DESeq2',
			branch: 'RELEASE_3_23',
			commit
		});
		expect(() =>
			resolveRepositoryPlan(pkg(), '3.23', undefined, undefined, 'not-a-commit')
		).toThrow('full 40-character Git commit');
	});

	it('does not require a Git repository for an automatic source snapshot', () => {
		expect(
			resolveRepositoryPlan(pkg({ url: undefined, gitUrl: undefined }), '3.23', undefined)
		).toMatchObject({ kind: 'bioconductor_archive' });
	});
});

describe('materializeBioconductorPackage', () => {
	let root: string;
	let repositoryCounter = 0;

	beforeEach(async () => {
		root = await fs.mkdtemp(path.join(os.tmpdir(), 'biocontext-materialize-'));
	});

	afterEach(async () => {
		await fs.rm(root, { recursive: true, force: true });
	});

	const runGit = (cwd: string, args: string[]): string => {
		const result = Bun.spawnSync({ cmd: ['git', ...args], cwd, stdout: 'pipe', stderr: 'pipe' });
		if (result.exitCode !== 0) {
			throw new Error(
				`git ${args.join(' ')} failed: ${new TextDecoder().decode(result.stderr).trim()}`
			);
		}
		return new TextDecoder().decode(result.stdout).trim();
	};

	const createRepository = async (
		options: {
			version?: string;
			packageName?: string;
			branch?: string;
		} = {}
	) => {
		const directory = path.join(root, `repository-${repositoryCounter++}`);
		await fs.mkdir(path.join(directory, 'R'), { recursive: true });
		await fs.mkdir(path.join(directory, 'man', 'figures'), { recursive: true });
		await fs.mkdir(path.join(directory, 'data'), { recursive: true });
		const packageName = options.packageName ?? 'DESeq2';
		const versionLine = options.version === '' ? '' : `Version: ${options.version ?? '1.52.0'}\n`;
		await fs.writeFile(
			path.join(directory, 'DESCRIPTION'),
			`Package: ${packageName}\n${versionLine}`
		);
		await fs.writeFile(path.join(directory, 'NAMESPACE'), 'export(DESeq)\n');
		await fs.writeFile(path.join(directory, 'R', 'DESeq.R'), 'DESeq <- function() {}\n');
		await fs.writeFile(path.join(directory, 'man', 'DESeq.Rd'), '\\name{DESeq}\n');
		await fs.writeFile(path.join(directory, 'man', 'figures', 'plot.png'), 'binary');
		await fs.writeFile(path.join(directory, 'data', 'example.rda'), 'binary');
		runGit(directory, ['init', '-q', '--initial-branch', options.branch ?? 'main']);
		runGit(directory, ['config', 'user.email', 'test@example.com']);
		runGit(directory, ['config', 'user.name', 'biocontext test']);
		runGit(directory, ['add', '.']);
		runGit(directory, ['commit', '-qm', 'fixture']);
		return { directory, commit: runGit(directory, ['rev-parse', 'HEAD']) };
	};

	const pdf = () => new TextEncoder().encode('%PDF-reference manual');
	const extractPdf = async () => ({ text: 'DESeq reference documentation', pageCount: 1 });
	const sourceArchive = async (packageName = 'DESeq2', version = '1.52.0') => {
		const pack = tar.pack();
		for (const [relativePath, content] of Object.entries({
			DESCRIPTION: `Package: ${packageName}\nVersion: ${version}\n`,
			NAMESPACE: 'export(DESeq)\n',
			'R/DESeq.R': 'DESeq <- function() {}\n',
			'man/DESeq.Rd': '\\name{DESeq}\n',
			'vignettes/DESeq2.Rmd': '# Workflow\n',
			'data/example.rda': 'not retained'
		})) {
			pack.entry({ name: `${packageName}/${relativePath}` }, content);
		}
		pack.finalize();
		const chunks: Buffer[] = [];
		for await (const chunk of pack) chunks.push(Buffer.from(chunk));
		return Bun.gzipSync(Buffer.concat(chunks));
	};
	const successfulFetch = async (input: string | URL | Request) => {
		const url = String(input);
		if (url.endsWith('.html')) return new Response('<html><body><p>Run DESeq.</p></body></html>');
		if (url.endsWith('/DESeq2.pdf')) {
			return new Response(pdf(), { headers: { 'content-type': 'application/pdf' } });
		}
		if (url.endsWith('.R')) return new Response('temporary failure', { status: 503 });
		return new Response('missing', { status: 404 });
	};

	const install = async (options: {
		directory?: string;
		repository?: string;
		release?: string;
		package?: BioconductorPackage;
		refresh?: boolean;
		fetch?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
		documents?: readonly ('vignettes' | 'vignetteScripts' | 'manual' | 'news')[];
		includeCurated?: boolean;
		resourcesDirectory?: string;
		corpusCandidates?: readonly string[];
	}) => {
		const repository = options.repository ?? (await createRepository()).directory;
		return materializeBioconductorPackage(
			{
				pkg: options.package ?? pkg(),
				release: options.release ?? '3.23',
				directory: options.directory ?? path.join(root, 'resources', 'DESeq2'),
				documents: options.documents ?? ['vignettes', 'manual'],
				...(options.includeCurated === undefined ? {} : { includeCurated: options.includeCurated }),
				source: repository,
				refresh: options.refresh,
				quiet: true,
				resourcesDirectory: options.resourcesDirectory,
				corpusCandidates: options.corpusCandidates
			},
			{ fetch: options.fetch ?? successfulFetch, extractPdfText: extractPdf }
		);
	};

	it('records numbered package identity, the actual checkout, and a complete source inventory', async () => {
		const source = await createRepository({ branch: 'fixture-main' });
		const result = await install({ repository: source.directory });

		expect(result.metadata.cacheVersion).toBe(BIOCONDUCTOR_RESOURCE_CACHE_VERSION);
		expect(result.metadata.bioconductor).toEqual({
			release: '3.23',
			packageVersion: '1.52.0',
			repository: 'bioc',
			landingUrl: 'https://bioconductor.org/packages/3.23/bioc/html/DESeq2.html'
		});
		expect(result.metadata.repository.kind).toBe('custom_git');
		if (result.metadata.repository.kind !== 'custom_git') throw new Error('expected Git source');
		expect(result.metadata.repository.branch).toBe('fixture-main');
		expect(result.metadata.repository.commit).toBe(source.commit);
		expect(result.metadata.repository.commit).toMatch(/^[0-9a-f]{40}$/);
		expect(result.metadata.repository.descriptionVersion).toBe('1.52.0');
		expect(result.metadata.versionRelationship).toBe('aligned');
		expect(result.metadata.repository.fileCount).toBeGreaterThanOrEqual(4);
		expect(await isCompleteBioconductorResourceCache(result.directory, result.metadata)).toBe(true);
		expect(
			await fs.readFile(path.join(result.directory, 'source', BIOCONDUCTOR_SOURCE_MANIFEST_FILE), 'utf8')
		).toContain('DESCRIPTION');
		expect(
			await fs.readFile(path.join(result.directory, 'source', BIOCONDUCTOR_SOURCE_DIRECTORY_FILE), 'utf8')
		).toContain('# Package source');
		await expect(fs.stat(path.join(result.directory, 'source', 'data'))).rejects.toThrow();
		await expect(
			fs.stat(path.join(result.directory, 'source', 'man', 'figures', 'plot.png'))
		).rejects.toThrow();
	});

	it('uses and verifies the exact Bioconductor source archive for automatic installs', async () => {
		const archive = await sourceArchive();
		const directory = path.join(root, 'resources', 'DESeq2');
		const result = await materializeBioconductorPackage(
			{
				pkg: pkg(),
				release: '3.23',
				directory,
				documents: ['vignettes', 'manual'],
				quiet: true
			},
			{
				fetch: async (input) => {
					const url = String(input);
					if (url.endsWith('.tar.gz')) return new Response(Buffer.from(archive));
					return successfulFetch(input);
				},
				extractPdfText: extractPdf
			}
		);

		expect(result.metadata.repository).toMatchObject({
			kind: 'bioconductor_archive',
			descriptionPackage: 'DESeq2',
			descriptionVersion: '1.52.0'
		});
		if (result.metadata.repository.kind !== 'bioconductor_archive') {
			throw new Error('expected archive source');
		}
		expect(result.metadata.repository.sha256).toMatch(/^[0-9a-f]{64}$/u);
		expect(result.metadata.versionRelationship).toBe('aligned');
		expect(await fs.readFile(path.join(directory, 'source', 'R', 'DESeq.R'), 'utf8')).toContain(
			'DESeq <- function'
		);
		await expect(fs.stat(path.join(directory, 'source', 'data'))).rejects.toThrow();
		expect(await isCompleteBioconductorResourceCache(directory, result.metadata)).toBe(true);
	});

	it('uses the official package archive when a cached patch release left src/contrib', async () => {
		const archive = await sourceArchive();
		const directory = path.join(root, 'resources', 'DESeq2-archived');
		const requestedSourceUrls: string[] = [];
		const result = await materializeBioconductorPackage(
			{
				pkg: pkg(),
				release: '3.23',
				directory,
				documents: ['vignettes', 'manual'],
				quiet: true
			},
			{
				fetch: async (input) => {
					const url = String(input);
					if (url.includes('/src/contrib/')) {
						requestedSourceUrls.push(url);
						return url.includes('/Archive/')
							? new Response(Buffer.from(archive))
							: new Response('superseded', { status: 404 });
					}
					return successfulFetch(input);
				},
				extractPdfText: extractPdf
			}
		);

		expect(requestedSourceUrls).toEqual([
			'https://bioconductor.org/packages/3.23/bioc/src/contrib/DESeq2_1.52.0.tar.gz',
			'https://bioconductor.org/packages/3.23/bioc/src/contrib/Archive/DESeq2/DESeq2_1.52.0.tar.gz'
		]);
		expect(result.metadata.repository.url).toBe(requestedSourceUrls[1]!);
		const reused = await materializeBioconductorPackage(
			{
				pkg: pkg(),
				release: '3.23',
				directory,
				documents: ['vignettes', 'manual'],
				quiet: true
			},
			{
				fetch: async () => {
					throw new Error('complete archived cache should not refetch');
				},
				extractPdfText: extractPdf
			}
		);
		expect(reused.downloaded).toBe(false);
	});

	it('rejects an archive whose DESCRIPTION version differs from VIEWS', async () => {
		const archive = await sourceArchive('DESeq2', '1.53.0');
		const directory = path.join(root, 'mismatched-archive');
		await expect(
			materializeBioconductorPackage(
				{
					pkg: pkg(),
					release: '3.23',
					directory,
					documents: ['vignettes', 'manual'],
					quiet: true
				},
				{
					fetch: async (input) =>
						String(input).endsWith('.tar.gz')
							? new Response(Buffer.from(archive))
							: successfulFetch(input),
					extractPdfText: extractPdf
				}
			)
		).rejects.toThrow('expected DESeq2 1.52.0');
		await expect(fs.stat(directory)).rejects.toThrow();
	});

	it('retains independent curated provenance and does not copy its sidecar', async () => {
		const corpus = path.join(root, 'corpus');
		const packageDirectory = path.join(corpus, '02_differential_expression', 'DESeq2');
		await fs.mkdir(packageDirectory, { recursive: true });
		await fs.writeFile(path.join(corpus, 'DIRECTORY.md'), '# corpus\n');
		await fs.writeFile(path.join(packageDirectory, 'reference.md'), '# curated\n');
		await fs.writeFile(
			path.join(packageDirectory, '_metadata.yml'),
			[
				'package: DESeq2',
				'documents:',
				'  - path: reference.md',
				'    origin_url: https://example.org/original-reference',
				'    origin_type: curated_document',
				'    package_version: unknown',
				'    bioc_release: unknown',
				''
			].join('\n')
		);
		const resourcesDirectory = path.join(root, 'resources');
		const result = await install({ resourcesDirectory, corpusCandidates: [corpus] });
		const curated = result.metadata.documents.find((document) => document.sourceType === 'curated');
		expect(curated).toMatchObject({
			path: 'curated/reference.md',
			originUrl: 'https://example.org/original-reference',
			packageVersion: 'unknown',
			bioconductorRelease: 'unknown',
			status: 'ok'
		});
		await expect(
			fs.stat(path.join(result.directory, 'curated', '_metadata.yml'))
		).rejects.toThrow();
	});

	it('can exclude bundled curated documents from a release/source snapshot', async () => {
		const corpus = path.join(root, 'corpus-clean');
		const packageDirectory = path.join(corpus, '02_differential_expression', 'DESeq2');
		await fs.mkdir(packageDirectory, { recursive: true });
		await fs.writeFile(path.join(corpus, 'DIRECTORY.md'), '# corpus\n');
		await fs.writeFile(path.join(packageDirectory, 'reference.md'), '# stale curated\n');
		await fs.writeFile(
			path.join(packageDirectory, '_metadata.yml'),
			[
				'package: DESeq2',
				'documents:',
				'  - path: reference.md',
				'    origin_url: https://example.org/stale-reference',
				'    origin_type: curated_document',
				'    package_version: unknown',
				'    bioc_release: unknown',
				''
			].join('\n')
		);
		const result = await install({
			resourcesDirectory: path.join(root, 'resources-clean'),
			corpusCandidates: [corpus],
			includeCurated: false
		});
		expect(result.metadata.documents.some((document) => document.sourceType === 'curated')).toBe(
			false
		);
		await expect(fs.stat(path.join(result.directory, 'curated'))).rejects.toThrow();
	});

	it('keeps optional failures while the required document and repository families are complete', async () => {
		const packageWithScript = pkg({ rFiles: ['vignettes/DESeq2/inst/doc/DESeq2.R'] });
		const result = await install({
			package: packageWithScript,
			documents: ['vignettes', 'vignetteScripts', 'manual']
		});
		expect(
			result.metadata.documents.find((document) => document.originType === 'vignette_script')
		).toMatchObject({
			status: 'failed',
			error: 'HTTP 503'
		});
		expect(await isCompleteBioconductorResourceCache(result.directory, result.metadata)).toBe(true);
	});

	it('accepts only a source whose DESCRIPTION matches the published version', async () => {
		const aligned = await createRepository({ version: '1.52.0' });
		const result = await install({
			directory: path.join(root, 'resource-aligned'),
			repository: aligned.directory
		});
		expect(result.metadata.versionRelationship).toBe('aligned');

		for (const [name, version] of [
			['different', '1.52.0.0'],
			['unknown', '']
		] as const) {
			const source = await createRepository({ version });
			await expect(
				install({ directory: path.join(root, `resource-${name}`), repository: source.directory })
			).rejects.toThrow('expected DESeq2 1.52.0');
		}
	});

	it('fails a first install when published documents are unavailable', async () => {
		const directory = path.join(root, 'missing-documents');
		await expect(
			install({ directory, fetch: async () => new Response('missing', { status: 404 }) })
		).rejects.toThrow('at least one published vignette or reference manual is required');
		await expect(fs.stat(directory)).rejects.toThrow();
	});

	it('fails a first install when its repository checkout is incomplete', async () => {
		const source = await createRepository();
		await fs.writeFile(path.join(source.directory, 'NAMESPACE'), 'changed but not committed\n');
		const invalidSource = path.join(root, 'missing-repository');
		const directory = path.join(root, 'missing-source-package');
		await expect(install({ directory, repository: invalidSource })).rejects.toThrow(
			'Could not clone'
		);
		await expect(fs.stat(directory)).rejects.toThrow();
	});

	it('preserves the previous complete directory byte-for-byte after a failed refresh', async () => {
		const directory = path.join(root, 'refresh-package');
		const source = await createRepository();
		await install({ directory, repository: source.directory });
		const beforeMetadata = await fs.readFile(path.join(directory, BIOCONDUCTOR_METADATA_FILE), 'utf8');
		const beforeReadme = await fs.readFile(path.join(directory, 'README.md'), 'utf8');
		await expect(
			install({
				directory,
				repository: source.directory,
				refresh: true,
				fetch: async () => new Response('temporary failure', { status: 503 })
			})
		).rejects.toThrow('at least one published vignette or reference manual is required');
		expect(await fs.readFile(path.join(directory, BIOCONDUCTOR_METADATA_FILE), 'utf8')).toBe(
			beforeMetadata
		);
		expect(await fs.readFile(path.join(directory, 'README.md'), 'utf8')).toBe(beforeReadme);
		expect(
			(await fs.readdir(path.dirname(directory))).some((name) => name.includes('.partial-'))
		).toBe(false);
	});

	it('refreshes a changed numbered release in the same directory without retaining history', async () => {
		const directory = path.join(root, 'numbered-release');
		const source = await createRepository();
		await install({ directory, repository: source.directory, release: '3.23' });
		const refreshed = await install({ directory, repository: source.directory, release: '3.24' });
		expect(refreshed.downloaded).toBe(true);
		expect(refreshed.metadata.bioconductor.release).toBe('3.24');
		expect((await fs.readdir(path.dirname(directory))).sort()).toEqual(
			['numbered-release', source.directory.split('/').at(-1)!].sort()
		);
		await expect(fs.stat(`${directory}.previous`)).rejects.toThrow();
	});

	it('reuses a complete cache and rebuilds when a recorded artifact disappears', async () => {
		const directory = path.join(root, 'cached-package');
		const source = await createRepository();
		expect((await install({ directory, repository: source.directory })).downloaded).toBe(true);
		expect((await install({ directory, repository: source.directory })).downloaded).toBe(false);
		await fs.rm(path.join(directory, 'reference-manual.md'));
		expect((await install({ directory, repository: source.directory })).downloaded).toBe(true);
	});

	it('rejects aliases at the materialization boundary', async () => {
		await expect(install({ release: 'release' })).rejects.toThrow(
			'Materialization requires a numbered Bioconductor release'
		);
	});

	it('rejects malformed and traversal metadata before mounting a cache', async () => {
		const directory = path.join(root, 'tampered');
		await fs.mkdir(directory, { recursive: true });
		await fs.writeFile(
			path.join(directory, BIOCONDUCTOR_METADATA_FILE),
			JSON.stringify({
				cacheVersion: BIOCONDUCTOR_RESOURCE_CACHE_VERSION,
				package: 'DESeq2',
				bioconductor: {
					release: '3.23',
					packageVersion: '1.52.0',
					repository: 'bioc',
					landingUrl: 'https://example.org'
				},
				repository: {
					kind: 'custom_git',
					url: 'https://example.org/repository',
					branch: 'main',
					commit: 'a'.repeat(40),
					descriptionPackage: 'DESeq2',
					descriptionVersion: '1.52.0',
					sourcePolicyVersion: 1,
					fileCount: 1,
					bytes: 1,
					omittedCount: 0
				},
				versionRelationship: 'aligned',
				documents: [
					{
						path: '../outside.md',
						sourceType: 'bioconductor',
						originType: 'vignette',
						originUrl: 'https://example.org/vignette',
						packageVersion: '1.52.0',
						bioconductorRelease: '3.23',
						status: 'ok'
					}
				],
				requestedDocuments: ['vignettes', 'manual'],
				fetchedAt: '2026-08-08T00:00:00.000Z'
			})
		);
		expect(await readBioconductorResourceMetadata(directory)).toBeNull();
	});
});
