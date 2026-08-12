import { afterEach, describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import * as tar from 'tar-stream';

import type { CranPackage } from './catalog.ts';
import {
	CRAN_SOURCE_DIR,
	CRAN_SOURCE_MANIFEST_FILE,
	materializeCranPackage,
	verifyCranPackageDirectory
} from './materialize.ts';
import { CRAN_METADATA_FILE, readCranResourceMetadata } from './metadata.ts';

const roots: string[] = [];

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

const archiveEntries = async (
	packageName: string,
	files: readonly (readonly [string, string])[]
): Promise<Uint8Array> => {
	const pack = tar.pack();
	for (const [relativePath, content] of files) {
		pack.entry({ name: `${packageName}/${relativePath}` }, content);
	}
	pack.finalize();
	const chunks: Buffer[] = [];
	for await (const chunk of pack) chunks.push(Buffer.from(chunk));
	return Bun.gzipSync(Buffer.concat(chunks));
};

const archive = (packageName: string, files: Readonly<Record<string, string>>) =>
	archiveEntries(packageName, Object.entries(files));

const sourceFiles = (packageName = 'Seurat', version = '5.5.1') => ({
	DESCRIPTION: `Package: ${packageName}\nVersion: ${version}\nTitle: Test package\n`,
	NAMESPACE: 'export(CreateSeuratObject)\n',
	'R/seurat.R': 'CreateSeuratObject <- function() {}\n',
	'man/CreateSeuratObject.Rd': '\\name{CreateSeuratObject}\n',
	'vignettes/workflow.Rmd': '# Workflow\n',
	'data/large.rda': 'not retained',
	'inst/extdata/matrix.bin': 'not retained'
});

const packageRecord = (bytes: Uint8Array): CranPackage => ({
	name: 'Seurat',
	version: '5.5.1',
	md5: createHash('md5').update(bytes).digest('hex'),
	published: '2026-06-26 09:10:02 UTC',
	needsCompilation: 'yes'
});

const makeRoot = async () => {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), 'biocontext-cran-materialize-'));
	roots.push(root);
	return root;
};

describe('CRAN materialization', () => {
	it('publishes an exact, filtered, schema-valid CRAN source snapshot', async () => {
		const root = await makeRoot();
		const bytes = await archive('Seurat', sourceFiles());
		const directory = path.join(root, 'resources', 'Seurat');
		const result = await materializeCranPackage(
			{ pkg: packageRecord(bytes), directory },
			{
				fetch: async () => new Response(Buffer.from(bytes)),
				now: () => new Date('2026-08-09T00:00:00.000Z')
			}
		);

		expect(result.downloaded).toBe(true);
		expect(result.metadata).toMatchObject({
			package: 'Seurat',
			cran: { version: '5.5.1', repository: 'CRAN' },
			source: { descriptionPackage: 'Seurat', descriptionVersion: '5.5.1' }
		});
		expect(await verifyCranPackageDirectory({ directory, package: 'Seurat' })).toMatchObject({
			status: 'complete',
			failures: []
		});
		expect(
			await fs.readFile(path.join(directory, CRAN_SOURCE_DIR, 'R', 'seurat.R'), 'utf8')
		).toContain('CreateSeuratObject');
		await expect(fs.stat(path.join(directory, CRAN_SOURCE_DIR, 'data'))).rejects.toThrow();
		const manifest = JSON.parse(
			await fs.readFile(path.join(directory, CRAN_SOURCE_DIR, CRAN_SOURCE_MANIFEST_FILE), 'utf8')
		) as { files: string[]; omittedCount: number };
		expect(manifest.files).toContain('man/CreateSeuratObject.Rd');
		expect(manifest.omittedCount).toBe(2);
	});

	it('reuses a complete cache without fetching the archive again', async () => {
		const root = await makeRoot();
		const bytes = await archive('Seurat', sourceFiles());
		const directory = path.join(root, 'resources', 'Seurat');
		let fetches = 0;
		const fetchArchive = async () => {
			fetches += 1;
			return new Response(Buffer.from(bytes));
		};
		await materializeCranPackage({ pkg: packageRecord(bytes), directory }, { fetch: fetchArchive });
		const reused = await materializeCranPackage(
			{ pkg: packageRecord(bytes), directory },
			{ fetch: fetchArchive }
		);
		expect(reused.downloaded).toBe(false);
		expect(fetches).toBe(1);
	});

	it('rejects traversal archives without publishing a package directory', async () => {
		const root = await makeRoot();
		const bytes = await archive('Seurat', {
			...sourceFiles(),
			'../escape.txt': 'escape'
		});
		const directory = path.join(root, 'resources', 'Seurat');
		await expect(
			materializeCranPackage(
				{ pkg: packageRecord(bytes), directory },
				{ fetch: async () => new Response(Buffer.from(bytes)) }
			)
		).rejects.toThrow('escapes Seurat');
		await expect(fs.stat(directory)).rejects.toThrow();
		expect(
			(await fs.readdir(path.dirname(directory))).filter((name) => name.includes('.partial'))
		).toEqual([]);
	});

	it('rejects backslash archive paths and leaves no partial directory', async () => {
		const root = await makeRoot();
		const bytes = await archive('Seurat', {
			...sourceFiles(),
			'R\\escape.R': 'escape'
		});
		const directory = path.join(root, 'resources', 'Seurat');
		await expect(
			materializeCranPackage(
				{ pkg: packageRecord(bytes), directory },
				{ fetch: async () => new Response(Buffer.from(bytes)) }
			)
		).rejects.toThrow('unsafe path');
		await expect(fs.stat(directory)).rejects.toThrow();
	});

	it('rejects duplicate archive paths even when the duplicated file would be omitted', async () => {
		const root = await makeRoot();
		const bytes = await archiveEntries('Seurat', [
			...Object.entries(sourceFiles()),
			['data/duplicate.rda', 'first'],
			['data/duplicate.rda', 'second']
		]);
		const directory = path.join(root, 'resources', 'Seurat');
		await expect(
			materializeCranPackage(
				{ pkg: packageRecord(bytes), directory },
				{ fetch: async () => new Response(Buffer.from(bytes)) }
			)
		).rejects.toThrow('duplicate CRAN source archive entry');
		await expect(fs.stat(directory)).rejects.toThrow();
	});

	it('refuses to overwrite an unmanaged resource directory before fetching', async () => {
		const root = await makeRoot();
		const bytes = await archive('Seurat', sourceFiles());
		const directory = path.join(root, 'resources', 'Seurat');
		await fs.mkdir(directory, { recursive: true });
		await fs.writeFile(path.join(directory, 'user-file.txt'), 'keep me');
		let fetches = 0;
		await expect(
			materializeCranPackage(
				{ pkg: packageRecord(bytes), directory },
				{
					fetch: async () => {
						fetches += 1;
						return new Response(Buffer.from(bytes));
					}
				}
			)
		).rejects.toThrow('Refusing to replace');
		expect(fetches).toBe(0);
		expect(await fs.readFile(path.join(directory, 'user-file.txt'), 'utf8')).toBe('keep me');
	});

	it('preserves the previous complete cache byte-for-byte after a failed refresh', async () => {
		const root = await makeRoot();
		const bytes = await archive('Seurat', sourceFiles());
		const directory = path.join(root, 'resources', 'Seurat');
		await materializeCranPackage(
			{ pkg: packageRecord(bytes), directory },
			{ fetch: async () => new Response(Buffer.from(bytes)) }
		);
		const before = await fs.readFile(path.join(directory, CRAN_METADATA_FILE), 'utf8');
		await expect(
			materializeCranPackage(
				{ pkg: packageRecord(bytes), directory, refresh: true },
				{ fetch: async () => new Response('unavailable', { status: 503 }) }
			)
		).rejects.toThrow('HTTP 503');
		expect(await fs.readFile(path.join(directory, CRAN_METADATA_FILE), 'utf8')).toBe(before);
		expect((await readCranResourceMetadata(directory))?.package).toBe('Seurat');
	});

	it('reports missing manifest files as a partial cache', async () => {
		const root = await makeRoot();
		const bytes = await archive('Seurat', sourceFiles());
		const directory = path.join(root, 'resources', 'Seurat');
		await materializeCranPackage(
			{ pkg: packageRecord(bytes), directory },
			{ fetch: async () => new Response(Buffer.from(bytes)) }
		);
		await fs.rm(path.join(directory, CRAN_SOURCE_DIR, 'R', 'seurat.R'));
		const verification = await verifyCranPackageDirectory({ directory, package: 'Seurat' });
		expect(verification.status).toBe('partial');
		expect(verification.failures.map((failure) => failure.code)).toContain('missing_source_file');
	});

	it('rejects metadata whose CRAN provenance URL does not match its package identity', async () => {
		const root = await makeRoot();
		const bytes = await archive('Seurat', sourceFiles());
		const directory = path.join(root, 'resources', 'Seurat');
		await materializeCranPackage(
			{ pkg: packageRecord(bytes), directory },
			{ fetch: async () => new Response(Buffer.from(bytes)) }
		);
		const metadata = JSON.parse(
			await fs.readFile(path.join(directory, CRAN_METADATA_FILE), 'utf8')
		) as { cran: { sourceUrl: string } };
		metadata.cran.sourceUrl = 'https://example.com/Seurat_5.5.1.tar.gz';
		await fs.writeFile(path.join(directory, CRAN_METADATA_FILE), JSON.stringify(metadata));

		expect(await verifyCranPackageDirectory({ directory, package: 'Seurat' })).toMatchObject({
			status: 'invalid',
			failures: [{ code: 'metadata_invalid' }]
		});
	});

	it('classifies traversal paths in a source manifest as invalid', async () => {
		const root = await makeRoot();
		const bytes = await archive('Seurat', sourceFiles());
		const directory = path.join(root, 'resources', 'Seurat');
		await materializeCranPackage(
			{ pkg: packageRecord(bytes), directory },
			{ fetch: async () => new Response(Buffer.from(bytes)) }
		);
		const manifestPath = path.join(directory, CRAN_SOURCE_DIR, CRAN_SOURCE_MANIFEST_FILE);
		const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8')) as { files: string[] };
		manifest.files.push('../escape');
		await fs.writeFile(manifestPath, JSON.stringify(manifest));
		const verification = await verifyCranPackageDirectory({ directory, package: 'Seurat' });
		expect(verification.status).toBe('invalid');
		expect(verification.failures.map((failure) => failure.code)).toContain('unsafe_path');
	});

	it('classifies a DESCRIPTION identity conflict as invalid', async () => {
		const root = await makeRoot();
		const bytes = await archive('Seurat', sourceFiles());
		const directory = path.join(root, 'resources', 'Seurat');
		await materializeCranPackage(
			{ pkg: packageRecord(bytes), directory },
			{ fetch: async () => new Response(Buffer.from(bytes)) }
		);
		await fs.writeFile(
			path.join(directory, CRAN_SOURCE_DIR, 'DESCRIPTION'),
			'Package: NotSeurat\nVersion: 5.5.1\n'
		);
		const verification = await verifyCranPackageDirectory({ directory, package: 'Seurat' });
		expect(verification.status).toBe('invalid');
		expect(verification.failures.map((failure) => failure.code)).toContain(
			'description_identity_conflict'
		);
	});

	it('rejects a symlinked managed package root', async () => {
		const root = await makeRoot();
		const bytes = await archive('Seurat', sourceFiles());
		const directory = path.join(root, 'resources', 'Seurat');
		await materializeCranPackage(
			{ pkg: packageRecord(bytes), directory },
			{ fetch: async () => new Response(Buffer.from(bytes)) }
		);
		const linked = path.join(root, 'resources', 'linked-Seurat');
		await fs.symlink(directory, linked, 'dir');
		const verification = await verifyCranPackageDirectory({
			directory: linked,
			package: 'Seurat'
		});
		expect(verification.status).toBe('invalid');
		expect(verification.failures.map((failure) => failure.code)).toContain('unsafe_path');
	});
});
