import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { BIOCONDUCTOR_METADATA_FILE, BIOCONDUCTOR_RESOURCE_CACHE_VERSION } from './metadata.ts';
import { BIOCONDUCTOR_SOURCE_POLICY_VERSION, formatSourceDirectory } from './source-policy.ts';
import { verifyBioconductorPackageDirectory } from './verify.ts';

describe('verifyBioconductorPackageDirectory', () => {
	let root: string;
	let directory: string;

	beforeEach(async () => {
		root = await fs.mkdtemp(path.join(os.tmpdir(), 'biocontext-verify-'));
		directory = path.join(root, 'DESeq2');
	});

	afterEach(async () => {
		await fs.rm(root, { recursive: true, force: true });
	});

	const writeCompleteFixture = async () => {
		const sourceDirectory = path.join(directory, 'source');
		await fs.mkdir(sourceDirectory, { recursive: true });
		const description = 'Package: DESeq2\nVersion: 1.52.0\n';
		const namespace = 'export(DESeq)\n';
		await fs.writeFile(path.join(directory, 'README.md'), '# DESeq2\n');
		await fs.writeFile(path.join(directory, 'reference-manual.md'), '# manual\n');
		await fs.writeFile(path.join(sourceDirectory, 'DESCRIPTION'), description);
		await fs.writeFile(path.join(sourceDirectory, 'NAMESPACE'), namespace);
		const inventory = {
			policyVersion: BIOCONDUCTOR_SOURCE_POLICY_VERSION,
			files: ['DESCRIPTION', 'NAMESPACE'],
			fileCount: 2,
			bytes: Buffer.byteLength(description) + Buffer.byteLength(namespace),
			omittedCount: 0
		};
		await fs.writeFile(
			path.join(sourceDirectory, 'MANIFEST.json'),
			`${JSON.stringify(inventory, null, '\t')}\n`
		);
		await fs.writeFile(
			path.join(sourceDirectory, 'DIRECTORY.md'),
			formatSourceDirectory(inventory)
		);
		const metadata = {
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
					originUrl: 'https://bioconductor.org/packages/3.23/bioc/manuals/DESeq2/man/DESeq2.pdf',
					packageVersion: '1.52.0',
					bioconductorRelease: '3.23',
					status: 'ok'
				}
			],
			requestedDocuments: ['vignettes', 'manual'],
			fetchedAt: '2026-08-08T00:00:00.000Z'
		};
		await fs.writeFile(
			path.join(directory, BIOCONDUCTOR_METADATA_FILE),
			`${JSON.stringify(metadata, null, '\t')}\n`
		);
		return metadata;
	};

	it('reports complete only when every required local artifact is present', async () => {
		await writeCompleteFixture();
		expect(await verifyBioconductorPackageDirectory({ directory, package: 'DESeq2' })).toEqual({
			status: 'complete',
			package: 'DESeq2',
			directory,
			failures: []
		});
	});

	it('reports partial for a recognizable cache with a missing artifact', async () => {
		await writeCompleteFixture();
		await fs.rm(path.join(directory, 'reference-manual.md'));
		const result = await verifyBioconductorPackageDirectory({ directory, package: 'DESeq2' });
		expect(result.status).toBe('partial');
		expect(result.failures).toContainEqual({
			code: 'document_missing',
			message: 'Recorded file is missing or empty.',
			path: 'reference-manual.md'
		});
	});

	it('reports invalid for a missing package or malformed metadata', async () => {
		expect((await verifyBioconductorPackageDirectory({ directory, package: 'DESeq2' })).status).toBe(
			'invalid'
		);
		await fs.mkdir(directory, { recursive: true });
		await fs.writeFile(path.join(directory, BIOCONDUCTOR_METADATA_FILE), '{');
		const malformed = await verifyBioconductorPackageDirectory({ directory, package: 'DESeq2' });
		expect(malformed.status).toBe('invalid');
		expect(malformed.failures[0]?.code).toBe('metadata_malformed');
	});

	it('reports invalid for package identity conflicts and unsafe paths', async () => {
		const metadata = await writeCompleteFixture();
		metadata.package = 'edgeR';
		await fs.writeFile(path.join(directory, BIOCONDUCTOR_METADATA_FILE), JSON.stringify(metadata));
		expect(
			(await verifyBioconductorPackageDirectory({ directory, package: 'DESeq2' })).failures.map(
				(failure) => failure.code
			)
		).toContain('package_identity_conflict');

		metadata.package = 'DESeq2';
		metadata.documents[0]!.path = '../outside.md';
		await fs.writeFile(path.join(directory, BIOCONDUCTOR_METADATA_FILE), JSON.stringify(metadata));
		const unsafe = await verifyBioconductorPackageDirectory({ directory, package: 'DESeq2' });
		expect(unsafe.status).toBe('invalid');
		expect(unsafe.failures[0]?.code).toBe('metadata_path_unsafe');
	});

	it('rejects recorded artifacts that escape through a symlink', async () => {
		await writeCompleteFixture();
		const outside = path.join(root, 'outside.md');
		await fs.writeFile(outside, '# outside\n');
		await fs.rm(path.join(directory, 'reference-manual.md'));
		await fs.symlink(outside, path.join(directory, 'reference-manual.md'));

		const result = await verifyBioconductorPackageDirectory({ directory, package: 'DESeq2' });
		expect(result.status).toBe('invalid');
		expect(result.failures).toContainEqual({
			code: 'path_escape',
			message: 'Recorded path escapes the package directory.',
			path: 'reference-manual.md'
		});
	});

	it('reports partial when required provenance fields are missing', async () => {
		const metadata = await writeCompleteFixture();
		delete (metadata.documents[0] as Partial<(typeof metadata.documents)[number]>).originUrl;
		await fs.writeFile(path.join(directory, BIOCONDUCTOR_METADATA_FILE), JSON.stringify(metadata));
		const result = await verifyBioconductorPackageDirectory({ directory, package: 'DESeq2' });
		expect(result.status).toBe('partial');
		expect(result.failures[0]?.code).toBe('metadata_schema_invalid');
	});
});
