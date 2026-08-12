import { describe, expect, it } from 'bun:test';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { ConfigService } from '../config/index.ts';
import type { ResourceDefinition } from '../resources/schema.ts';
import type { ResourcesService } from '../resources/service.ts';
import type { FsResource } from '../resources/types.ts';
import { createCollectionsService } from './service.ts';
import { getCollectionKey } from './types.ts';
import { disposeVirtualFs, existsInVirtualFs, readVirtualFsFile } from '../vfs/virtual-fs.ts';
import { executeListTool } from '../tools/list.ts';
import { PathEscapeError } from '../tools/virtual-sandbox.ts';
import { BIOCONDUCTOR_METADATA_FILE, BIOCONDUCTOR_RESOURCE_CACHE_VERSION } from '../bioconductor/metadata.ts';
import { BIOCONDUCTOR_SOURCE_POLICY_VERSION } from '../bioconductor/source-policy.ts';

const createFsResource = ({
	name,
	resourcePath,
	type = 'local',
	repoSubPaths = [],
	specialAgentInstructions = ''
}: {
	name: string;
	resourcePath: string;
	type?: FsResource['type'];
	repoSubPaths?: readonly string[];
	specialAgentInstructions?: string;
}) => ({
	_tag: 'fs-based' as const,
	name,
	fsName: name,
	type,
	repoSubPaths,
	specialAgentInstructions,
	getAbsoluteDirectoryPath: async () => resourcePath
});

const createConfigMock = (definitions: Record<string, ResourceDefinition> = {}) =>
	({
		getResource: (name: string) => definitions[name]
	}) as unknown as ConfigService;

const createResourcesMock = (loadPromise: ResourcesService['loadPromise']) =>
	({
		load: () => {
			throw new Error('Not implemented in test');
		},
		loadPromise
	}) as unknown as ResourcesService;

const runGit = (cwd: string, args: string[]) => {
	const result = Bun.spawnSync({
		cmd: ['git', ...args],
		cwd,
		stdout: 'pipe',
		stderr: 'pipe'
	});
	if (result.exitCode !== 0) {
		throw new Error(
			`git ${args.join(' ')} failed: ${new TextDecoder().decode(result.stderr).trim()}`
		);
	}
};

const cleanupCollection = async (collection: { vfsId?: string; cleanup?: () => Promise<void> }) => {
	await collection.cleanup?.();
	if (collection.vfsId) disposeVirtualFs(collection.vfsId);
};

describe('createCollectionsService', () => {
	it('keeps broad and focused collection identities distinct', () => {
		expect(getCollectionKey(['DESeq2'], 'focused')).not.toBe(getCollectionKey(['DESeq2'], 'broad'));
	});

	it('imports git-backed local resources from tracked and unignored files only', async () => {
		const resourcePath = await fs.mkdtemp(path.join(os.tmpdir(), 'biocontext-collections-git-'));
		const collections = createCollectionsService({
			config: createConfigMock(),
			resources: createResourcesMock(async () => createFsResource({ name: 'repo', resourcePath }))
		});

		try {
			await fs.mkdir(path.join(resourcePath, 'node_modules', 'pkg'), { recursive: true });
			await fs.writeFile(path.join(resourcePath, '.gitignore'), 'node_modules\n');
			await fs.writeFile(path.join(resourcePath, 'package.json'), '{"name":"repo"}\n');
			await fs.writeFile(path.join(resourcePath, 'README.md'), 'local notes\n');
			await fs.writeFile(path.join(resourcePath, 'node_modules', 'pkg', 'index.js'), 'ignored\n');

			runGit(resourcePath, ['init', '-q']);
			runGit(resourcePath, ['add', '.gitignore', 'package.json']);

			const collection = await collections.loadPromise({ resourceNames: ['repo'] });

			try {
				expect(await existsInVirtualFs('/repo/package.json', collection.vfsId)).toBe(true);
				expect(await existsInVirtualFs('/repo/README.md', collection.vfsId)).toBe(true);
				expect(await existsInVirtualFs('/repo/node_modules/pkg/index.js', collection.vfsId)).toBe(
					false
				);
				expect(await existsInVirtualFs('/repo/.git/config', collection.vfsId)).toBe(false);
			} finally {
				await cleanupCollection(collection);
			}
		} finally {
			await fs.rm(resourcePath, { recursive: true, force: true });
		}
	});

	it('falls back to directory import and still skips heavy local build directories', async () => {
		const resourcePath = await fs.mkdtemp(
			path.join(os.tmpdir(), 'biocontext-collections-local-')
		);
		const collections = createCollectionsService({
			config: createConfigMock(),
			resources: createResourcesMock(async () => createFsResource({ name: 'repo', resourcePath }))
		});

		try {
			await fs.mkdir(path.join(resourcePath, 'node_modules', 'pkg'), { recursive: true });
			await fs.mkdir(path.join(resourcePath, 'dist'), { recursive: true });
			await fs.writeFile(path.join(resourcePath, 'package.json'), '{"name":"repo"}\n');
			await fs.writeFile(path.join(resourcePath, 'README.md'), 'hello\n');
			await fs.writeFile(path.join(resourcePath, 'node_modules', 'pkg', 'index.js'), 'ignored\n');
			await fs.writeFile(path.join(resourcePath, 'dist', 'bundle.js'), 'ignored\n');

			const collection = await collections.loadPromise({ resourceNames: ['repo'] });

			try {
				expect(await existsInVirtualFs('/repo/package.json', collection.vfsId)).toBe(true);
				expect(await existsInVirtualFs('/repo/README.md', collection.vfsId)).toBe(true);
				expect(await existsInVirtualFs('/repo/node_modules/pkg/index.js', collection.vfsId)).toBe(
					false
				);
				expect(await existsInVirtualFs('/repo/dist/bundle.js', collection.vfsId)).toBe(false);
				expect(collection.agentInstructions).not.toContain('<special_notes>');
			} finally {
				await cleanupCollection(collection);
			}
		} finally {
			await fs.rm(resourcePath, { recursive: true, force: true });
		}
	});

	it('includes git citation metadata in agent instructions', async () => {
		const resourcePath = await fs.mkdtemp(
			path.join(os.tmpdir(), 'biocontext-collections-git-meta-')
		);
		const collections = createCollectionsService({
			config: createConfigMock({
				docs: {
					type: 'git',
					name: 'docs',
					url: 'https://github.com/example/repo.git',
					branch: 'main',
					searchPath: 'guides',
					specialNotes: 'Prefer the guides folder.'
				}
			}),
			resources: createResourcesMock(async () =>
				createFsResource({
					name: 'docs',
					resourcePath,
					type: 'git',
					repoSubPaths: ['guides'],
					specialAgentInstructions: 'Prefer the guides folder.'
				})
			)
		});

		try {
			await fs.writeFile(path.join(resourcePath, 'README.md'), 'hello\n');
			runGit(resourcePath, ['init', '-q']);
			runGit(resourcePath, ['config', 'user.email', 'test@example.com']);
			runGit(resourcePath, ['config', 'user.name', 'biocontext Test']);
			runGit(resourcePath, ['add', 'README.md']);
			runGit(resourcePath, ['commit', '-m', 'init']);

			const collection = await collections.loadPromise({ resourceNames: ['docs'] });

			try {
				expect(collection.agentInstructions).toContain(
					'<repo_url>https://github.com/example/repo</repo_url>'
				);
				expect(collection.agentInstructions).toContain('<repo_branch>main</repo_branch>');
				expect(collection.agentInstructions).toContain(
					'<github_blob_prefix>https://github.com/example/repo/blob/main</github_blob_prefix>'
				);
				expect(collection.agentInstructions).toContain(
					'<citation_rule>Convert virtual paths under ./docs/ to repo-relative paths, then encode each path segment for GitHub URLs.</citation_rule>'
				);
				expect(collection.agentInstructions).toContain('<path>./docs/guides</path>');
				expect(collection.agentInstructions).toContain('<repo_commit>');
				expect(collection.agentInstructions).toContain(
					'<special_notes>Prefer the guides folder.</special_notes>'
				);
			} finally {
				await cleanupCollection(collection);
			}
		} finally {
			await fs.rm(resourcePath, { recursive: true, force: true });
		}
	});

	it('roots a focused single-package collection inside that package', async () => {
		const resourcePath = await fs.mkdtemp(
			path.join(os.tmpdir(), 'biocontext-collections-package-')
		);
		const collections = createCollectionsService({
			config: createConfigMock(),
			resources: createResourcesMock(async () =>
				createFsResource({ name: 'DESeq2', resourcePath, type: 'bioconductor' })
			)
		});

		try {
			await fs.writeFile(path.join(resourcePath, 'README.md'), '# DESeq2\n');
			await fs.mkdir(path.join(resourcePath, 'vignettes'));
			await fs.writeFile(path.join(resourcePath, 'vignettes', 'DESeq2.md'), 'content\n');

			const collection = await collections.loadPromise({
				resourceNames: ['DESeq2'],
				scope: 'focused'
			});
			try {
				expect(collection.path).toBe('/DESeq2');
				expect(collection.agentInstructions).toContain('<query_scope mode="single_package">');
				expect(collection.agentInstructions).toContain('<path>.</path>');

				const listed = await executeListTool(
					{ path: '.' },
					{ basePath: collection.path, vfsId: collection.vfsId }
				);
				expect(listed.output).toContain('README.md');
				await expect(
					executeListTool(
						{ path: '../Bioconductor' },
						{ basePath: collection.path, vfsId: collection.vfsId }
					)
				).rejects.toBeInstanceOf(PathEscapeError);
			} finally {
				await cleanupCollection(collection);
			}
		} finally {
			await fs.rm(resourcePath, { recursive: true, force: true });
		}
	});

	it('generates a deterministic broad routing index at the collection root', async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), 'biocontext-collections-index-'));
		const paths = {
			Bioconductor: path.join(root, 'corpus'),
			DESeq2: path.join(root, 'DESeq2')
		};
		await fs.mkdir(path.join(paths.Bioconductor, 'docs'), { recursive: true });
		await fs.mkdir(paths.DESeq2, { recursive: true });
		await fs.writeFile(path.join(paths.Bioconductor, 'docs', 'DIRECTORY.md'), '# Corpus\n');
		await fs.writeFile(path.join(paths.DESeq2, 'README.md'), '# DESeq2\n');

		const collections = createCollectionsService({
			config: createConfigMock(),
			resources: createResourcesMock(async (name) =>
				createFsResource({
					name,
					resourcePath: paths[name as keyof typeof paths],
					type: name === 'DESeq2' ? 'bioconductor' : 'git',
					repoSubPaths: name === 'Bioconductor' ? ['docs'] : []
				})
			)
		});

		try {
			const collection = await collections.loadPromise({
				resourceNames: ['DESeq2', 'Bioconductor'],
				scope: 'broad'
			});
			try {
				expect(collection.path).toBe('/');
				expect(await existsInVirtualFs('/DIRECTORY.md', collection.vfsId)).toBe(true);
				const directory = await readVirtualFsFile('/DIRECTORY.md', collection.vfsId);
				expect(directory).toContain('## Bioconductor');
				expect(directory).toContain('Bioconductor/docs/DIRECTORY.md');
				expect(directory).toContain('## DESeq2');
				expect(directory).toContain('Search named resources directly');
				expect(directory.indexOf('## Bioconductor')).toBeLessThan(directory.indexOf('## DESeq2'));
				expect(collection.agentInstructions).toContain('<query_scope mode="broad">');
				expect(collection.agentInstructions).toContain('Search named packages directly');
			} finally {
				await cleanupCollection(collection);
			}
		} finally {
			await fs.rm(root, { recursive: true, force: true });
		}
	});

	it('mounts one canonical documentation representation across managed source and corpus', async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), 'biocontext-collections-dedup-'));
		const corpus = path.join(root, 'corpus');
		const managed = path.join(root, 'DESeq2');
		const corpusPackage = path.join(corpus, '02_differential_expression', 'DESeq2');
		await fs.mkdir(corpusPackage, { recursive: true });
		await fs.mkdir(path.join(managed, 'source', 'R'), { recursive: true });
		await fs.mkdir(path.join(managed, 'source', 'man'), { recursive: true });
		await fs.mkdir(path.join(managed, 'source', 'vignettes'), { recursive: true });
		await fs.mkdir(path.join(managed, 'vignettes'), { recursive: true });
		await fs.writeFile(path.join(corpus, 'DIRECTORY.md'), '# corpus\n');
		await fs.writeFile(path.join(corpusPackage, 'vignette.md'), '# duplicate vignette\n');
		await fs.writeFile(path.join(corpusPackage, 'paper.md'), '# distinct paper\n');
		await fs.writeFile(
			path.join(corpusPackage, '_metadata.yml'),
			[
				'package: DESeq2',
				'documents:',
				'  - path: paper.md',
				'    origin_url: https://doi.org/10.1186/s13059-014-0550-8',
				'    origin_type: curated_document',
				'    package_version: unknown',
				'    bioc_release: unknown',
				'  - path: vignette.md',
				'    origin_url: https://bioconductor.org/packages/release/bioc/vignettes/DESeq2/inst/doc/DESeq2.html',
				'    origin_type: curated_document',
				'    package_version: unknown',
				'    bioc_release: unknown',
				''
			].join('\n')
		);
		await fs.writeFile(path.join(managed, 'README.md'), '# DESeq2\n');
		await fs.writeFile(path.join(managed, 'reference-manual.md'), '# canonical reference\n');
		await fs.writeFile(path.join(managed, 'NEWS.md'), '# canonical NEWS\n');
		await fs.writeFile(path.join(managed, 'vignettes', 'DESeq2.md'), '# canonical vignette\n');
		await fs.writeFile(path.join(managed, 'vignettes', 'DESeq2.R'), 'duplicate_code()\n');
		await fs.writeFile(path.join(managed, 'source', 'R', 'DESeq.R'), 'DESeq <- function() {}\n');
		await fs.writeFile(path.join(managed, 'source', 'man', 'DESeq.Rd'), '\\name{DESeq}\n');
		await fs.writeFile(path.join(managed, 'source', 'NEWS'), 'duplicate NEWS\n');
		await fs.writeFile(path.join(managed, 'source', 'vignettes', 'DESeq2.Rmd'), '# source\n');
		await fs.writeFile(
			path.join(managed, BIOCONDUCTOR_METADATA_FILE),
			JSON.stringify({
				cacheVersion: BIOCONDUCTOR_RESOURCE_CACHE_VERSION,
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
					sourcePolicyVersion: BIOCONDUCTOR_SOURCE_POLICY_VERSION,
					fileCount: 4,
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
						originUrl:
							'https://bioconductor.org/packages/3.23/bioc/vignettes/DESeq2/inst/doc/DESeq2.R',
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
			})
		);

		const paths = { Bioconductor: corpus, DESeq2: managed };
		const collections = createCollectionsService({
			config: createConfigMock(),
			resources: createResourcesMock(async (name) =>
				createFsResource({
					name,
					resourcePath: paths[name as keyof typeof paths],
					type: name === 'DESeq2' ? 'bioconductor' : 'git'
				})
			)
		});

		try {
			const collection = await collections.loadPromise({
				resourceNames: ['Bioconductor', 'DESeq2'],
				scope: 'broad'
			});
			try {
				expect(await existsInVirtualFs('/DESeq2/reference-manual.md', collection.vfsId)).toBe(true);
				expect(await existsInVirtualFs('/DESeq2/NEWS.md', collection.vfsId)).toBe(true);
				expect(await existsInVirtualFs('/DESeq2/vignettes/DESeq2.md', collection.vfsId)).toBe(true);
				expect(await existsInVirtualFs('/DESeq2/source/R/DESeq.R', collection.vfsId)).toBe(true);
				expect(await existsInVirtualFs('/DESeq2/source/man/DESeq.Rd', collection.vfsId)).toBe(
					false
				);
				expect(await existsInVirtualFs('/DESeq2/source/NEWS', collection.vfsId)).toBe(false);
				expect(
					await existsInVirtualFs('/DESeq2/source/vignettes/DESeq2.Rmd', collection.vfsId)
				).toBe(false);
				expect(await existsInVirtualFs('/DESeq2/vignettes/DESeq2.R', collection.vfsId)).toBe(false);
				expect(
					await existsInVirtualFs(
						'/Bioconductor/02_differential_expression/DESeq2/vignette.md',
						collection.vfsId
					)
				).toBe(false);
				expect(
					await existsInVirtualFs(
						'/Bioconductor/02_differential_expression/DESeq2/paper.md',
						collection.vfsId
					)
				).toBe(true);
			} finally {
				await cleanupCollection(collection);
			}
		} finally {
			await fs.rm(root, { recursive: true, force: true });
		}
	});

	it('keeps broad scope usable when one optional resource cannot be loaded', async () => {
		const resourcePath = await fs.mkdtemp(
			path.join(os.tmpdir(), 'biocontext-collections-degraded-')
		);
		await fs.writeFile(path.join(resourcePath, 'README.md'), '# healthy\n');
		const collections = createCollectionsService({
			config: createConfigMock(),
			resources: createResourcesMock(async (name) => {
				if (name === 'stale-notes') throw new Error('configured path is missing');
				return createFsResource({ name, resourcePath });
			})
		});

		try {
			const collection = await collections.loadPromise({
				resourceNames: ['healthy', 'stale-notes'],
				scope: 'broad'
			});
			try {
				const directory = await readVirtualFsFile('/DIRECTORY.md', collection.vfsId);
				expect(directory).toContain('## healthy');
				expect(directory).toContain('## Unavailable resources');
				expect(directory).toContain('stale-notes');
				expect(collection.agentInstructions).toContain('<unavailable_resources>');
			} finally {
				await cleanupCollection(collection);
			}
		} finally {
			await fs.rm(resourcePath, { recursive: true, force: true });
		}
	});

	it('rejects resources that would overwrite the same virtual mount', async () => {
		const resourcePath = await fs.mkdtemp(
			path.join(os.tmpdir(), 'biocontext-collections-collision-')
		);
		const collections = createCollectionsService({
			config: createConfigMock(),
			resources: createResourcesMock(async (name) => ({
				...createFsResource({ name, resourcePath }),
				fsName: 'DESeq2'
			}))
		});

		try {
			await expect(
				collections.loadPromise({ resourceNames: ['DESeq2', 'bioconductor:DESeq2'] })
			).rejects.toThrow('resolve to the same collection path');
		} finally {
			await fs.rm(resourcePath, { recursive: true, force: true });
		}
	});

	it('allows distinct mount aliases to read the same source directory', async () => {
		const resourcePath = await fs.mkdtemp(
			path.join(os.tmpdir(), 'biocontext-collections-source-collision-')
		);
		const collections = createCollectionsService({
			config: createConfigMock(),
			resources: createResourcesMock(async (name) =>
				createFsResource({ name, resourcePath, type: 'bioconductor' })
			)
		});

		try {
			await fs.writeFile(path.join(resourcePath, 'README.md'), '# shared\n');
			const collection = await collections.loadPromise({
				resourceNames: ['deseq-docs', 'DESeq2']
			});
			try {
				expect(await existsInVirtualFs('/deseq-docs/README.md', collection.vfsId)).toBe(true);
				expect(await existsInVirtualFs('/DESeq2/README.md', collection.vfsId)).toBe(true);
			} finally {
				await cleanupCollection(collection);
			}
		} finally {
			await fs.rm(resourcePath, { recursive: true, force: true });
		}
	});
});
