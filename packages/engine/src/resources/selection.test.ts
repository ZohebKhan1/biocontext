import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { BIOCONDUCTOR_METADATA_FILE, BIOCONDUCTOR_RESOURCE_CACHE_VERSION } from '../bioconductor/materialize.ts';
import {
	BIOCONDUCTOR_SOURCE_POLICY_VERSION,
	formatSourceDirectory
} from '../bioconductor/source-policy.ts';
import { managedBioconductorCacheReference } from './helpers.ts';
import {
	discoverCachedBioconductorPackageNames,
	discoverLocalBioconductorPackageNames,
	MAX_BROAD_RESOURCES,
	resolveResourceSelection
} from './selection.ts';
import type { ResourceDefinition } from './schema.ts';

describe('resource selection', () => {
	let resourcesDirectory: string;

	beforeEach(async () => {
		resourcesDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'biocontext-selection-'));
	});

	afterEach(async () => {
		await fs.rm(resourcesDirectory, { recursive: true, force: true });
	});

	const configured: ResourceDefinition[] = [
		{
			type: 'git',
			name: 'Bioconductor',
			url: 'https://github.com/ZohebKhan1/biocontext',
			branch: 'main'
		},
		{ type: 'local', name: 'lab-notes', path: '/tmp/lab-notes' }
	];

	const writeMetadata = async (directory: string, packageName: string) => {
		const target = path.join(resourcesDirectory, directory);
		const sourceDirectory = path.join(target, 'source');
		await fs.mkdir(sourceDirectory, { recursive: true });
		const description = `Package: ${packageName}\nVersion: 1.0.0\n`;
		const namespace = 'export(example)\n';
		const inventory = {
			policyVersion: BIOCONDUCTOR_SOURCE_POLICY_VERSION,
			files: ['DESCRIPTION', 'NAMESPACE'],
			fileCount: 2,
			bytes: Buffer.byteLength(description) + Buffer.byteLength(namespace),
			omittedCount: 0
		};
		await fs.writeFile(path.join(target, 'README.md'), '# package\n');
		await fs.writeFile(path.join(target, 'reference-manual.md'), '# package\n');
		await fs.writeFile(path.join(sourceDirectory, 'DESCRIPTION'), description);
		await fs.writeFile(path.join(sourceDirectory, 'NAMESPACE'), namespace);
		await fs.writeFile(path.join(sourceDirectory, 'MANIFEST.json'), JSON.stringify(inventory));
		await fs.writeFile(
			path.join(sourceDirectory, 'DIRECTORY.md'),
			formatSourceDirectory(inventory)
		);
		await fs.writeFile(
			path.join(target, BIOCONDUCTOR_METADATA_FILE),
			JSON.stringify({
				cacheVersion: BIOCONDUCTOR_RESOURCE_CACHE_VERSION,
				package: packageName,
				bioconductor: {
					release: '3.22',
					packageVersion: '1.0.0',
					repository: 'bioc',
					landingUrl: `https://bioconductor.org/packages/3.22/bioc/html/${packageName}.html`
				},
				repository: {
					kind: 'github',
					url: `https://github.com/Bioconductor/${packageName}`,
					branch: 'main',
					commit: 'a'.repeat(40),
					descriptionPackage: packageName,
					descriptionVersion: '1.0.0',
					sourcePolicyVersion: inventory.policyVersion,
					fileCount: inventory.fileCount,
					bytes: inventory.bytes,
					omittedCount: inventory.omittedCount
				},
				versionRelationship: 'aligned',
				documents: [
					{
						path: 'reference-manual.md',
						sourceType: 'bioconductor',
						originType: 'reference_manual',
						originUrl: `https://bioconductor.org/packages/3.22/bioc/manuals/${packageName}/man/${packageName}.pdf`,
						packageVersion: '1.0.0',
						bioconductorRelease: '3.22',
						status: 'ok'
					}
				],
				requestedDocuments: ['vignettes', 'manual'],
				fetchedAt: '2026-08-08T00:00:00.000Z'
			})
		);
	};

	it('uses exact package mentions as a focused scope', async () => {
		expect(
			await resolveResourceSelection({
				requested: ['DESeq2', 'deseq2', 'edgeR'],
				configuredResources: configured,
				resourcesDirectory
			})
		).toEqual({ mode: 'focused', resourceNames: ['DESeq2', 'edgeR'] });
	});

	it('expands Bioconductor to configured and managed cached resources', async () => {
		await writeMetadata('DESeq2', 'DESeq2');
		await writeMetadata('broken-name', 'edgeR');
		await fs.mkdir(path.join(resourcesDirectory, 'limma.partial'));

		const selection = await resolveResourceSelection({
			requested: ['Bioconductor'],
			configuredResources: configured,
			resourcesDirectory
		});

		expect(selection).toEqual({
			mode: 'broad',
			resourceNames: ['Bioconductor', 'lab-notes', managedBioconductorCacheReference('DESeq2')]
		});
	});

	it('ignores malformed, partial, and mismatched package caches', async () => {
		await writeMetadata('DESeq2', 'DESeq2');
		await writeMetadata('wrong', 'limma');
		await fs.mkdir(path.join(resourcesDirectory, 'edgeR.partial'));
		await fs.writeFile(path.join(resourcesDirectory, 'not-a-directory'), 'x');

		expect(await discoverCachedBioconductorPackageNames(resourcesDirectory)).toEqual(['DESeq2']);
	});

	it('counts unique local packages across the curated corpus and managed caches', async () => {
		const corpus = path.join(resourcesDirectory, 'Bioconductor/resources/bioconductor-docs');
		await fs.mkdir(path.join(corpus, '02_differential_expression/DESeq2'), { recursive: true });
		await fs.mkdir(path.join(corpus, '02_differential_expression/edgeR'), { recursive: true });
		await fs.writeFile(path.join(corpus, 'DIRECTORY.md'), '# packages\n');
		await fs.writeFile(
			path.join(corpus, '02_differential_expression/DESeq2/reference.md'),
			'# DESeq2\n'
		);
		await fs.writeFile(
			path.join(corpus, '02_differential_expression/edgeR/reference.md'),
			'# edgeR\n'
		);
		await writeMetadata('DESeq2', 'DESeq2');
		await writeMetadata('limma', 'limma');

		expect(await discoverLocalBioconductorPackageNames(resourcesDirectory)).toEqual([
			'DESeq2',
			'edgeR',
			'limma'
		]);
	});

	it('does not expose non-default curated packages as local @ resources', async () => {
		const corpus = path.join(resourcesDirectory, 'Bioconductor/resources/bioconductor-docs');
		await fs.mkdir(path.join(corpus, '01_data_import_annotation/GO.db'), { recursive: true });
		await fs.writeFile(path.join(corpus, 'DIRECTORY.md'), '# packages\n');
		await fs.writeFile(
			path.join(corpus, '01_data_import_annotation/GO.db/reference.md'),
			'# GO.db\n'
		);

		expect(await discoverLocalBioconductorPackageNames(resourcesDirectory)).not.toContain('GO.db');
	});

	it('does not add a cached package twice when a configured alias already owns it', async () => {
		await writeMetadata('DESeq2', 'DESeq2');
		const selection = await resolveResourceSelection({
			requested: ['Bioconductor'],
			configuredResources: [...configured, { type: 'bioconductor', name: 'deseq-docs', package: 'DESeq2' }],
			resourcesDirectory
		});

		expect(selection.resourceNames).toEqual(['Bioconductor', 'lab-notes', 'deseq-docs']);
	});

	it('bounds broad expansion while allowing the default package pool', async () => {
		const manyResources: ResourceDefinition[] = Array.from(
			{ length: MAX_BROAD_RESOURCES + 1 },
			(_, index) => ({
				type: 'local' as const,
				name: `resource-${index}`,
				path: `/tmp/resource-${index}`
			})
		);

		await expect(
			resolveResourceSelection({
				requested: ['Bioconductor'],
				configuredResources: manyResources,
				resourcesDirectory
			})
		).rejects.toThrow(`maximum ${MAX_BROAD_RESOURCES}`);
	});
});
