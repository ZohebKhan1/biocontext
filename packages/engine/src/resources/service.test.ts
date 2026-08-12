import { describe, expect, it } from 'bun:test';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
	createAnonymousDirectoryKey,
	createAnonymousResource,
	createResourcesService,
	resolveResourceDefinition
} from './service.ts';
import { managedBioconductorCacheReference, resourceNameToKey } from './helpers.ts';
import {
	BIOCONDUCTOR_METADATA_FILE,
	BIOCONDUCTOR_RESOURCE_CACHE_VERSION,
	BIOCONDUCTOR_SOURCE_DIRECTORY_FILE,
	BIOCONDUCTOR_SOURCE_MANIFEST_FILE
} from '../bioconductor/materialize.ts';
import { BIOCONDUCTOR_SOURCE_POLICY_VERSION } from '../bioconductor/source-policy.ts';
import type { ConfigService } from '../config/index.ts';
import {
	BIOCONDUCTOR_DOCUMENT_TYPES,
	ResourceDefinitionSchema,
	resolveBioconductorDocuments,
	type ResourceDefinition
} from './schema.ts';

describe('Resources.resolveResourceDefinition', () => {
	const configuredResource: ResourceDefinition = {
		type: 'git',
		name: 'DESeq2',
		url: 'https://github.com/thelovelab/DESeq2',
		branch: 'main',
		searchPath: 'vignettes'
	};

	const getResource = (name: string) => (name === 'DESeq2' ? configuredResource : undefined);

	it('resolves configured resources by name first', () => {
		const definition = resolveResourceDefinition('DESeq2', getResource);
		expect(definition.type).toBe('git');
		expect(definition.name).toBe('DESeq2');
	});

	it('creates anonymous git resources from valid URLs', () => {
		const definition = resolveResourceDefinition(
			'https://github.com/thelovelab/DESeq2/tree/main/packages',
			() => undefined
		);
		expect(definition.type).toBe('git');
		if (definition.type === 'git') {
			expect(definition.url).toBe('https://github.com/thelovelab/DESeq2');
			expect(definition.branch).toBe('main');
			expect(definition.name.startsWith('anonymous:')).toBe(true);
		}
	});

	it('reuses the same cache key for repeated normalized URLs', () => {
		const first = createAnonymousResource('https://github.com/thelovelab/DESeq2');
		const second = createAnonymousResource(
			'https://github.com/thelovelab/DESeq2/blob/main/packages'
		);
		expect(first).not.toBeNull();
		expect(second).not.toBeNull();
		if (first && second) {
			expect(resourceNameToKey(first.name)).toBe(resourceNameToKey(second.name));
		}
	});

	it('uses short deterministic keys for anonymous repository paths', () => {
		const main = createAnonymousResource('https://github.com/thelovelab/DESeq2');
		const withPath = createAnonymousResource(
			'https://github.com/thelovelab/DESeq2/tree/main/packages'
		);
		expect(main).not.toBeNull();
		expect(withPath).not.toBeNull();
		if (main && withPath && main.type === 'git' && withPath.type === 'git') {
			expect(createAnonymousDirectoryKey(main.url)).toBe(createAnonymousDirectoryKey(withPath.url));
		}
		if (main) {
			expect(main.name.startsWith('anonymous:')).toBe(true);
			expect(main.name.length).toBeGreaterThan(19);
		}
	});
});

describe('Bioconductor references', () => {
	const noResources = () => undefined;

	it('resolves a bare package name to a Bioconductor resource', () => {
		const definition = resolveResourceDefinition('DESeq2', noResources);
		expect(definition).toEqual({ type: 'bioconductor', name: 'DESeq2', package: 'DESeq2' });
	});

	it('resolves an explicit Bioconductor package reference', () => {
		expect(resolveResourceDefinition('bioconductor:ComplexHeatmap', noResources)).toEqual({
			type: 'bioconductor',
			name: 'ComplexHeatmap',
			package: 'ComplexHeatmap'
		});
		expect(resolveResourceDefinition('BIOCONDUCTOR:edgeR', noResources)).toEqual({
			type: 'bioconductor',
			name: 'edgeR',
			package: 'edgeR'
		});
	});

	it('accepts dots in package names', () => {
		expect(createAnonymousResource('GO.db')).toEqual({
			type: 'bioconductor',
			name: 'GO.db',
			package: 'GO.db'
		});
	});

	it('prefers a configured resource over the Bioconductor index', () => {
		const configured = { type: 'local' as const, name: 'DESeq2', path: '/tmp/mine' };
		const definition = resolveResourceDefinition('DESeq2', (name) =>
			name === 'DESeq2' ? configured : undefined
		);
		expect(definition).toBe(configured);
	});

	it('still prefers a git URL over a package name', () => {
		const definition = createAnonymousResource('https://github.com/thelovelab/DESeq2');
		expect(definition?.type).toBe('git');
	});

	it('rejects tokens that are not valid R package names', () => {
		expect(createAnonymousResource('my-local-docs')).toBeNull();
		expect(createAnonymousResource('2fast')).toBeNull();
		expect(createAnonymousResource('bioconductor:not valid')).toBeNull();
	});
});

describe('Bioconductor document selection', () => {
	it('treats an unset document list as every type', () => {
		expect(resolveBioconductorDocuments(undefined)).toEqual(BIOCONDUCTOR_DOCUMENT_TYPES);
	});

	it('passes an explicit selection through unchanged', () => {
		expect(resolveBioconductorDocuments(['vignettes', 'news'])).toEqual(['vignettes', 'news']);
	});

	it('accepts a bioconductor definition with a document subset', () => {
		const parsed = ResourceDefinitionSchema.safeParse({
			type: 'bioconductor',
			name: 'DESeq2',
			package: 'DESeq2',
			documents: ['vignettes', 'manual']
		});
		expect(parsed.success).toBe(true);
	});

	it('rejects an unknown document type or an empty list', () => {
		const base = { type: 'bioconductor', name: 'DESeq2', package: 'DESeq2' };
		expect(ResourceDefinitionSchema.safeParse({ ...base, documents: ['nope'] }).success).toBe(
			false
		);
		expect(ResourceDefinitionSchema.safeParse({ ...base, documents: [] }).success).toBe(false);
	});
});

describe('CRAN resource definitions', () => {
	it('accepts a package resource independently of Bioconductor', () => {
		expect(
			ResourceDefinitionSchema.parse({ type: 'cran', name: 'Seurat', package: 'Seurat' })
		).toEqual({ type: 'cran', name: 'Seurat', package: 'Seurat' });
	});

	it('rejects unsafe or malformed R package names', () => {
		expect(
			ResourceDefinitionSchema.safeParse({ type: 'cran', name: 'escape', package: '../Seurat' })
				.success
		).toBe(false);
		expect(
			ResourceDefinitionSchema.safeParse({ type: 'cran', name: '2bad', package: '2bad' }).success
		).toBe(false);
	});
});

describe('managed Bioconductor caches', () => {
	it('mounts a broad-scope cache without redownloading or changing its document subset', async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), 'biocontext-managed-cache-'));
		const directory = path.join(root, 'resources', 'DESeq2');
		try {
			await fs.mkdir(path.join(directory, 'source'), { recursive: true });
			await fs.writeFile(path.join(directory, 'README.md'), '# DESeq2\n');
			await fs.writeFile(path.join(directory, 'reference-manual.md'), '# manual\n');
			const sourceDescription = 'Package: DESeq2\nVersion: 1.52.0\n';
			await fs.writeFile(path.join(directory, 'source', 'DESCRIPTION'), sourceDescription);
			const sourceNamespace = 'export(DESeq)\n';
			await fs.writeFile(path.join(directory, 'source', 'NAMESPACE'), sourceNamespace);
			await fs.writeFile(path.join(directory, 'source', BIOCONDUCTOR_SOURCE_DIRECTORY_FILE), '# source\n');
			await fs.writeFile(
				path.join(directory, 'source', BIOCONDUCTOR_SOURCE_MANIFEST_FILE),
				JSON.stringify({
					policyVersion: BIOCONDUCTOR_SOURCE_POLICY_VERSION,
					files: ['DESCRIPTION', 'NAMESPACE'],
					fileCount: 2,
					bytes: Buffer.byteLength(sourceDescription) + Buffer.byteLength(sourceNamespace),
					omittedCount: 0
				})
			);
			await fs.writeFile(
				path.join(directory, BIOCONDUCTOR_METADATA_FILE),
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
						kind: 'github',
						url: 'https://github.com/thelovelab/DESeq2',
						branch: 'devel',
						commit: 'a'.repeat(40),
						descriptionPackage: 'DESeq2',
						descriptionVersion: '1.52.0',
						sourcePolicyVersion: BIOCONDUCTOR_SOURCE_POLICY_VERSION,
						fileCount: 2,
						bytes: Buffer.byteLength(sourceDescription) + Buffer.byteLength(sourceNamespace),
						omittedCount: 0
					},
					versionRelationship: 'aligned',
					fetchedAt: '2026-08-07T00:00:00.000Z',
					requestedDocuments: ['vignettes', 'manual'],
					documents: [
						{
							path: 'reference-manual.md',
							sourceType: 'bioconductor',
							originType: 'reference_manual',
							originUrl:
								'https://bioconductor.org/packages/3.23/bioc/manuals/DESeq2/man/DESeq2.pdf',
							packageVersion: '1.52.0',
							bioconductorRelease: '3.23',
							status: 'ok'
						}
					]
				})
			);
			const before = await fs.readFile(path.join(directory, BIOCONDUCTOR_METADATA_FILE), 'utf8');
			const config = {
				resourcesDirectory: path.join(root, 'resources'),
				dataDirectory: root,
				getResource: () => undefined
			} as unknown as ConfigService;
			const resource = await createResourcesService(config).loadPromise(
				managedBioconductorCacheReference('DESeq2')
			);
			const directResource = await createResourcesService(config).loadPromise('deseq2');

			expect(resource.name).toBe('DESeq2');
			expect(await resource.getAbsoluteDirectoryPath()).toBe(directory);
			expect(directResource.name).toBe('DESeq2');
			expect(await directResource.getAbsoluteDirectoryPath()).toBe(directory);
			expect(await fs.readFile(path.join(directory, BIOCONDUCTOR_METADATA_FILE), 'utf8')).toBe(before);
			expect(await fs.readFile(path.join(directory, 'source', 'DESCRIPTION'), 'utf8')).toContain(
				'Package: DESeq2'
			);
		} finally {
			await fs.rm(root, { recursive: true, force: true });
		}
	});

	it('loads a default package from the bundled corpus without creating a managed cache', async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), 'biocontext-curated-cache-'));
		const resourcesDirectory = path.join(root, 'resources');
		const packageDirectory = path.join(
			resourcesDirectory,
			'Bioconductor',
			'resources',
			'bioconductor-docs',
			'02_differential_expression',
			'edgeR'
		);
		try {
			await fs.mkdir(packageDirectory, { recursive: true });
			await fs.writeFile(
				path.join(resourcesDirectory, 'Bioconductor/resources/bioconductor-docs/DIRECTORY.md'),
				'# packages\n'
			);
			await fs.writeFile(path.join(packageDirectory, 'reference.md'), '# local docs\n');
			await fs.writeFile(
				path.join(packageDirectory, '_metadata.yml'),
				[
					'package: edgeR',
					'documents:',
					'  - path: reference.md',
					'    origin_url: https://example.org/edgeR/reference',
					'    origin_type: curated_document',
					'    package_version: unknown',
					'    bioc_release: unknown',
					''
				].join('\n')
			);
			const config = {
				resourcesDirectory,
				dataDirectory: root,
				getResource: () => undefined
			} as unknown as ConfigService;

			const resource = await createResourcesService(config).loadPromise('edgeR');
			expect(resource.type).toBe('bioconductor');
			expect(await resource.getAbsoluteDirectoryPath()).toBe(packageDirectory);
			expect(
				await Bun.file(path.join(resourcesDirectory, 'edgeR', BIOCONDUCTOR_METADATA_FILE)).exists()
			).toBe(false);
		} finally {
			await fs.rm(root, { recursive: true, force: true });
		}
	});

	it('does not expose an old curated-only package as a default @ resource', async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), 'biocontext-curated-defaults-'));
		const resourcesDirectory = path.join(root, 'resources');
		const packageDirectory = path.join(
			resourcesDirectory,
			'Bioconductor',
			'resources',
			'bioconductor-docs',
			'01_data_import_annotation',
			'GO.db'
		);
		try {
			await fs.mkdir(packageDirectory, { recursive: true });
			await fs.writeFile(
				path.join(resourcesDirectory, 'Bioconductor/resources/bioconductor-docs/DIRECTORY.md'),
				'# packages\n'
			);
			await fs.writeFile(path.join(packageDirectory, 'reference.md'), '# local docs\n');
			const config = {
				resourcesDirectory,
				dataDirectory: root,
				getResource: () => undefined
			} as unknown as ConfigService;

			expect(createResourcesService(config).loadPromise('GO.db')).rejects.toThrow(
				'is not installed locally'
			);
		} finally {
			await fs.rm(root, { recursive: true, force: true });
		}
	});

	it('rejects a package mention that is not installed locally', async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), 'biocontext-local-only-'));
		try {
			const config = {
				resourcesDirectory: path.join(root, 'resources'),
				dataDirectory: root,
				getResource: () => undefined
			} as unknown as ConfigService;

			expect(
				createResourcesService(config).loadPromise('DefinitelyNotInstalledPackage')
			).rejects.toThrow('is not installed locally');
		} finally {
			await fs.rm(root, { recursive: true, force: true });
		}
	});
});
