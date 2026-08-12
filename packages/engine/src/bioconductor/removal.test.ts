import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
	BIOCONDUCTOR_METADATA_FILE,
	BIOCONDUCTOR_RESOURCE_CACHE_VERSION,
	type BioconductorResourceMetadata
} from './metadata.ts';
import { BIOCONDUCTOR_SOURCE_POLICY_VERSION } from './source-policy.ts';
import { CRAN_METADATA_FILE, type CranResourceMetadata } from '../cran/metadata.ts';
import {
	cleanupRemovedBioconductorPackageArtifacts,
	readRemovedBioconductorPackageNames,
	removeInstalledBioconductorPackage,
	setBioconductorPackageRemoved
} from './removal.ts';

const metadataFor = (packageName: string): BioconductorResourceMetadata => ({
	cacheVersion: BIOCONDUCTOR_RESOURCE_CACHE_VERSION,
	package: packageName,
	bioconductor: {
		release: '3.23',
		packageVersion: '1.0.0',
		repository: 'bioc',
		landingUrl: `https://bioconductor.org/packages/3.23/bioc/html/${packageName}.html`
	},
	repository: {
		kind: 'github',
		url: `https://github.com/example/${packageName}`,
		branch: 'main',
		commit: '0123456789abcdef0123456789abcdef01234567',
		descriptionPackage: packageName,
		descriptionVersion: '1.0.0',
		sourcePolicyVersion: 1,
		fileCount: 0,
		bytes: 0,
		omittedCount: 0
	},
	versionRelationship: 'aligned',
	documents: [],
	requestedDocuments: [],
	fetchedAt: '2026-08-08T00:00:00.000Z'
});

const cranMetadataFor = (packageName: string): CranResourceMetadata => ({
	cacheVersion: 1,
	package: packageName,
	cran: {
		version: '5.5.1',
		repository: 'CRAN',
		landingUrl: `https://cloud.r-project.org/web/packages/${packageName}/index.html`,
		sourceUrl: `https://cloud.r-project.org/src/contrib/${packageName}_5.5.1.tar.gz`,
		sourceSha256: 'a'.repeat(64)
	},
	source: {
		descriptionPackage: packageName,
		descriptionVersion: '5.5.1',
		sourcePolicyVersion: BIOCONDUCTOR_SOURCE_POLICY_VERSION,
		fileCount: 2,
		bytes: 10,
		omittedCount: 0
	},
	fetchedAt: '2026-08-09T00:00:00.000Z'
});

describe('managed Bioconductor package removal', () => {
	let root: string;
	let resourcesDirectory: string;
	let dataDirectory: string;

	beforeEach(async () => {
		root = await fs.mkdtemp(path.join(os.tmpdir(), 'biocontext-remove-'));
		resourcesDirectory = path.join(root, 'resources');
		dataDirectory = path.join(root, 'data');
		await fs.mkdir(resourcesDirectory, { recursive: true });
	});

	afterEach(async () => {
		await fs.rm(root, { recursive: true, force: true });
	});

	const writeManagedPackage = async (directoryName: string, packageName = directoryName) => {
		const directory = path.join(resourcesDirectory, directoryName);
		await fs.mkdir(directory, { recursive: true });
		await fs.writeFile(
			path.join(directory, BIOCONDUCTOR_METADATA_FILE),
			JSON.stringify(metadataFor(packageName)),
			'utf8'
		);
		await fs.writeFile(path.join(directory, 'README.md'), '# managed package\n', 'utf8');
		return directory;
	};

	it('removes only the canonical managed directory and persists the removal', async () => {
		const directory = await writeManagedPackage('DESeq2');
		let removedConfigPackage = '';
		let restoreCalls = 0;

		const result = await removeInstalledBioconductorPackage({
			package: 'deseq2',
			resourcesDirectory,
			dataDirectory,
			removeConfigResources: async (packageName) => {
				removedConfigPackage = packageName;
				return { removedNames: ['DESeq2'] };
			},
			restoreConfigResources: async () => {
				restoreCalls += 1;
			}
		});

		expect(result).toEqual({
			package: 'DESeq2',
			removedConfigResources: ['DESeq2'],
			cleanupPending: false
		});
		expect(removedConfigPackage).toBe('DESeq2');
		expect(restoreCalls).toBe(0);
		expect(await Bun.file(path.join(directory, BIOCONDUCTOR_METADATA_FILE)).exists()).toBe(false);
		expect(await Bun.file(`${directory}.previous`).exists()).toBe(false);
		expect(await readRemovedBioconductorPackageNames(dataDirectory)).toEqual(['DESeq2']);
	});

	it('clears a removal marker when the package is explicitly enabled again', async () => {
		await setBioconductorPackageRemoved(dataDirectory, 'DESeq2', true);
		expect(await setBioconductorPackageRemoved(dataDirectory, 'deseq2', false)).toBe(true);
		expect(await readRemovedBioconductorPackageNames(dataDirectory)).toEqual([]);
	});

	it('removes a schema-valid CRAN package without creating a Bioconductor suppression marker', async () => {
		const directory = path.join(resourcesDirectory, 'Seurat');
		await fs.mkdir(directory, { recursive: true });
		await fs.writeFile(
			path.join(directory, CRAN_METADATA_FILE),
			JSON.stringify(cranMetadataFor('Seurat')),
			'utf8'
		);
		const result = await removeInstalledBioconductorPackage({
			package: 'seurat',
			resourcesDirectory,
			dataDirectory,
			removeConfigResources: async () => ({ removedNames: ['Seurat'] }),
			restoreConfigResources: async () => undefined
		});
		expect(result).toEqual({
			package: 'Seurat',
			removedConfigResources: ['Seurat'],
			cleanupPending: false
		});
		expect(await Bun.file(directory).exists()).toBe(false);
		expect(await readRemovedBioconductorPackageNames(dataDirectory)).toEqual([]);
	});

	it('serializes removal-state updates for different packages', async () => {
		await Promise.all([
			setBioconductorPackageRemoved(dataDirectory, 'DESeq2', true),
			setBioconductorPackageRemoved(dataDirectory, 'limma', true),
			setBioconductorPackageRemoved(dataDirectory, 'edgeR', true)
		]);
		expect(await readRemovedBioconductorPackageNames(dataDirectory)).toEqual(['DESeq2', 'edgeR', 'limma']);
	});

	it('refuses unmanaged, mismatched, and symlinked directories without deleting them', async () => {
		const unmanaged = path.join(resourcesDirectory, 'limma');
		await fs.mkdir(unmanaged);
		await fs.writeFile(path.join(unmanaged, 'notes.txt'), 'user data', 'utf8');
		await expect(
			removeInstalledBioconductorPackage({
				package: 'limma',
				resourcesDirectory,
				dataDirectory,
				removeConfigResources: async () => ({ removedNames: [] }),
				restoreConfigResources: async () => undefined
			})
		).rejects.toThrow('No removable managed package');
		expect(await Bun.file(path.join(unmanaged, 'notes.txt')).text()).toBe('user data');

		const mismatched = await writeManagedPackage('edgeR', 'DESeq2');
		await expect(
			removeInstalledBioconductorPackage({
				package: 'DESeq2',
				resourcesDirectory,
				dataDirectory,
				removeConfigResources: async () => ({ removedNames: [] }),
				restoreConfigResources: async () => undefined
			})
		).rejects.toThrow('directory identity conflicts');
		expect(await Bun.file(path.join(mismatched, BIOCONDUCTOR_METADATA_FILE)).exists()).toBe(true);

		await fs.rm(mismatched, { recursive: true });
		const outside = path.join(root, 'outside-DESeq2');
		await fs.mkdir(outside);
		await fs.writeFile(
			path.join(outside, BIOCONDUCTOR_METADATA_FILE),
			JSON.stringify(metadataFor('DESeq2'))
		);
		await fs.symlink(outside, path.join(resourcesDirectory, 'DESeq2'), 'dir');
		await expect(
			removeInstalledBioconductorPackage({
				package: 'DESeq2',
				resourcesDirectory,
				dataDirectory,
				removeConfigResources: async () => ({ removedNames: [] }),
				restoreConfigResources: async () => undefined
			})
		).rejects.toThrow('symbolic link');
		expect(await Bun.file(path.join(outside, BIOCONDUCTOR_METADATA_FILE)).exists()).toBe(true);
	});

	it('refuses a directory with conflicting Bioconductor and CRAN identities', async () => {
		const directory = await writeManagedPackage('DESeq2');
		await fs.writeFile(
			path.join(directory, CRAN_METADATA_FILE),
			JSON.stringify(cranMetadataFor('DESeq2')),
			'utf8'
		);

		await expect(
			removeInstalledBioconductorPackage({
				package: 'DESeq2',
				resourcesDirectory,
				dataDirectory,
				removeConfigResources: async () => ({ removedNames: [] }),
				restoreConfigResources: async () => undefined
			})
		).rejects.toThrow('both Bioconductor and CRAN metadata');
		expect(await Bun.file(path.join(directory, BIOCONDUCTOR_METADATA_FILE)).exists()).toBe(true);
		expect(await Bun.file(path.join(directory, CRAN_METADATA_FILE)).exists()).toBe(true);
	});

	it('leaves package data and removal state unchanged when config mutation fails', async () => {
		const directory = await writeManagedPackage('DESeq2');
		await expect(
			removeInstalledBioconductorPackage({
				package: 'DESeq2',
				resourcesDirectory,
				dataDirectory,
				removeConfigResources: async () => {
					throw new Error('config is read-only');
				},
				restoreConfigResources: async () => undefined
			})
		).rejects.toThrow('config is read-only');
		expect(await Bun.file(path.join(directory, BIOCONDUCTOR_METADATA_FILE)).exists()).toBe(true);
		expect(await readRemovedBioconductorPackageNames(dataDirectory)).toEqual([]);
	});

	it('never deletes an unrecognized recovery directory', async () => {
		const directory = await writeManagedPackage('DESeq2');
		const recovery = `${directory}.previous`;
		await fs.mkdir(recovery);
		await fs.writeFile(path.join(recovery, 'user-notes.txt'), 'keep me', 'utf8');

		await expect(
			removeInstalledBioconductorPackage({
				package: 'DESeq2',
				resourcesDirectory,
				dataDirectory,
				removeConfigResources: async () => ({ removedNames: [] }),
				restoreConfigResources: async () => undefined
			})
		).rejects.toThrow('unrecognized recovery data');
		expect(await Bun.file(path.join(directory, BIOCONDUCTOR_METADATA_FILE)).exists()).toBe(true);
		expect(await Bun.file(path.join(recovery, 'user-notes.txt')).text()).toBe('keep me');

		await setBioconductorPackageRemoved(dataDirectory, 'DESeq2', true);
		await cleanupRemovedBioconductorPackageArtifacts({ dataDirectory, resourcesDirectory });
		expect(await Bun.file(path.join(recovery, 'user-notes.txt')).text()).toBe('keep me');
	});
});
