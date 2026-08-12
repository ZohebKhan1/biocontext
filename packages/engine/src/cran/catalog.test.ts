import { afterEach, describe, expect, it } from 'bun:test';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
	CRAN_PACKAGES_URL,
	cranSourceUrl,
	findCranPackage,
	loadCranCatalog,
	parseCranPackages,
	suggestCranPackageNames
} from './catalog.ts';

const records = [
	'Package: Seurat',
	'Version: 5.5.1',
	'MD5sum: b07be078da2106bfa6cd0572744fdbb6',
	'NeedsCompilation: yes',
	'Published: 2026-06-26 09:10:02 UTC',
	'',
	'Package: msigdbr',
	'Version: 25.1.1',
	'NeedsCompilation: no',
	''
].join('\n');

describe('CRAN catalog', () => {
	it('parses canonical package identities and builds exact source URLs', () => {
		const packages = parseCranPackages(records);
		expect(packages).toHaveLength(2);
		expect(packages[1]).toMatchObject({
			name: 'Seurat',
			version: '5.5.1',
			needsCompilation: 'yes'
		});
		expect(cranSourceUrl(packages[1]!)).toBe(
			'https://cloud.r-project.org/src/contrib/Seurat_5.5.1.tar.gz'
		);
	});

	it('resolves names case-insensitively and offers bounded typo suggestions', () => {
		const catalog = {
			cacheVersion: 1 as const,
			fetchedAt: '2026-08-09T00:00:00.000Z',
			packages: parseCranPackages(records)
		};
		expect(findCranPackage(catalog, 'seurat')?.name).toBe('Seurat');
		expect(suggestCranPackageNames(catalog, 'Seurrat')).toEqual(['Seurat']);
	});

	it('caches the official gzip index and reuses it inside the TTL', async () => {
		const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'biocontext-cran-catalog-'));
		let requests = 0;
		const packageRecords = Array.from({ length: 1_001 }, (_, index) =>
			[`Package: pkg${index}`, `Version: 1.0.${index}`, ''].join('\n')
		).join('\n');
		const fetchIndex = async (input: string | URL | Request) => {
			expect(String(input)).toBe(CRAN_PACKAGES_URL);
			requests += 1;
			return new Response(Bun.gzipSync(new TextEncoder().encode(packageRecords)));
		};
		try {
			const first = await loadCranCatalog({
				dataDirectory: directory,
				fetch: fetchIndex,
				now: Date.parse('2026-08-09T00:00:00.000Z')
			});
			const second = await loadCranCatalog({
				dataDirectory: directory,
				fetch: fetchIndex,
				now: Date.parse('2026-08-09T01:00:00.000Z')
			});
			expect(first.packages).toHaveLength(1_001);
			expect(second).toEqual(first);
			expect(requests).toBe(1);
		} finally {
			await fs.rm(directory, { recursive: true, force: true });
		}
	});

	it('uses a valid stale catalog after a transient failure but explicit refresh fails safely', async () => {
		const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'biocontext-cran-stale-'));
		const packageRecords = Array.from({ length: 1_001 }, (_, index) =>
			[`Package: pkg${index}`, `Version: 1.0.${index}`, ''].join('\n')
		).join('\n');
		try {
			await loadCranCatalog({
				dataDirectory: directory,
				fetch: async () => new Response(Bun.gzipSync(new TextEncoder().encode(packageRecords))),
				now: Date.parse('2026-08-01T00:00:00.000Z')
			});
			const unavailable = async () => {
				throw new Error('offline');
			};
			const stale = await loadCranCatalog({
				dataDirectory: directory,
				fetch: unavailable,
				now: Date.parse('2026-08-09T00:00:00.000Z')
			});
			expect(stale.fetchedAt).toBe('2026-08-01T00:00:00.000Z');
			await expect(
				loadCranCatalog({
					dataDirectory: directory,
					fetch: unavailable,
					refresh: true,
					now: Date.parse('2026-08-09T00:00:00.000Z')
				})
			).rejects.toThrow('Could not download');
		} finally {
			await fs.rm(directory, { recursive: true, force: true });
		}
	});
});
