import { afterEach, describe, expect, it } from 'bun:test';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { BIOCONDUCTOR_SOURCE_POLICY_VERSION } from './source-policy.ts';
import { BIOCONDUCTOR_METADATA_FILE, LEGACY_BIOCONDUCTOR_RESOURCE_CACHE_VERSION } from './metadata.ts';
import { discoverLegacyBioconductorPackageNames } from './migration.ts';

const roots: string[] = [];
const legacyDescription = (packageName: string) => `Package: ${packageName}\nVersion: 0.9.0\n`;
const legacyNamespace = 'export(example)\n';
const legacySourceBytes = (packageName: string) =>
	Buffer.byteLength(legacyDescription(packageName)) + Buffer.byteLength(legacyNamespace);

const legacyMetadata = (packageName: string) => ({
	cacheVersion: LEGACY_BIOCONDUCTOR_RESOURCE_CACHE_VERSION,
	package: packageName,
	bioconductor: {
		release: '3.23',
		packageVersion: '1.0.0',
		repository: 'bioc',
		landingUrl: `https://bioconductor.org/packages/3.23/bioc/html/${packageName}.html`
	},
	repository: {
		kind: 'github',
		url: `https://github.com/example/${packageName}.git`,
		branch: 'RELEASE_3_23',
		commit: 'a'.repeat(40),
		descriptionPackage: packageName,
		descriptionVersion: '0.9.0',
		sourcePolicyVersion: BIOCONDUCTOR_SOURCE_POLICY_VERSION - 1,
		fileCount: 2,
		bytes: legacySourceBytes(packageName),
		omittedCount: 0
	},
	versionRelationship: 'different',
	documents: [
		{
			path: 'reference-manual.md',
			sourceType: 'bioconductor',
			originType: 'reference_manual',
			originUrl: `https://bioconductor.org/packages/3.23/bioc/manuals/${packageName}/man/${packageName}.pdf`,
			packageVersion: '1.0.0',
			bioconductorRelease: '3.23',
			status: 'ok'
		}
	],
	requestedDocuments: ['vignettes', 'manual'],
	fetchedAt: '2026-08-01T00:00:00.000Z'
});

const writeLegacyCache = async (root: string, directoryName: string, packageName: string) => {
	const directory = path.join(root, directoryName);
	await fs.mkdir(path.join(directory, 'source'), { recursive: true });
	await fs.writeFile(path.join(directory, 'README.md'), '# managed\n');
	await fs.writeFile(path.join(directory, 'reference-manual.md'), '# reference\n');
	await fs.writeFile(path.join(directory, 'source', 'DESCRIPTION'), legacyDescription(packageName));
	await fs.writeFile(path.join(directory, 'source', 'NAMESPACE'), legacyNamespace);
	await fs.writeFile(path.join(directory, 'source', 'DIRECTORY.md'), '# source\n');
	await fs.writeFile(
		path.join(directory, 'source', 'MANIFEST.json'),
		`${JSON.stringify({
			policyVersion: BIOCONDUCTOR_SOURCE_POLICY_VERSION - 1,
			files: ['DESCRIPTION', 'NAMESPACE'],
			fileCount: 2,
			bytes: legacySourceBytes(packageName),
			omittedCount: 0
		})}\n`
	);
	await fs.writeFile(
		path.join(directory, BIOCONDUCTOR_METADATA_FILE),
		`${JSON.stringify(legacyMetadata(packageName))}\n`
	);
};

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe('legacy Bioconductor cache discovery', () => {
	it('recognizes canonical schema-valid caches even when their old source version differed', async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), 'biocontext-migration-'));
		roots.push(root);
		await writeLegacyCache(root, 'PCAtools', 'PCAtools');

		expect(await discoverLegacyBioconductorPackageNames(root)).toEqual(['PCAtools']);
	});

	it('rejects malformed, renamed, incomplete, and symlinked candidates', async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), 'biocontext-migration-'));
		const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'biocontext-migration-outside-'));
		roots.push(root, outside);
		await writeLegacyCache(root, 'renamed', 'DESeq2');
		await writeLegacyCache(root, 'limma', 'limma');
		await fs.rm(path.join(root, 'limma', 'source', 'MANIFEST.json'));
		await fs.mkdir(path.join(root, 'malformed'));
		await fs.writeFile(path.join(root, 'malformed', BIOCONDUCTOR_METADATA_FILE), '{}\n');
		await writeLegacyCache(outside, 'edgeR', 'edgeR');
		await fs.symlink(path.join(outside, 'edgeR'), path.join(root, 'edgeR'), 'dir');

		expect(await discoverLegacyBioconductorPackageNames(root)).toEqual([]);
	});
});
