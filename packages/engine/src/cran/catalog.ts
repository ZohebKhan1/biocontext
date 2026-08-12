import { promises as fs } from 'node:fs';
import path from 'node:path';

import { z } from 'zod';

import { parseDcf } from '../bioconductor/dcf.ts';
import { gunzipBounded, readResponseBytesBounded } from './io.ts';

export const CRAN_BASE_URL = 'https://cloud.r-project.org';
export const CRAN_PACKAGES_URL = `${CRAN_BASE_URL}/src/contrib/PACKAGES.gz`;
export const CRAN_CATALOG_TTL_MS = 24 * 60 * 60 * 1_000;

const CRAN_CATALOG_VERSION = 1;
const CRAN_CATALOG_FILE = 'catalog.json';
const MAX_CATALOG_BYTES = 32 * 1024 * 1024;
const MAX_CATALOG_TEXT_BYTES = 128 * 1024 * 1024;
const packageNamePattern = /^[A-Za-z][A-Za-z0-9.]*$/u;

const CranPackageSchema = z.object({
	name: z.string().regex(packageNamePattern),
	version: z.string().trim().min(1),
	md5: z
		.string()
		.regex(/^[0-9a-f]{32}$/u)
		.optional(),
	published: z.string().trim().min(1).optional(),
	needsCompilation: z.enum(['yes', 'no']).optional()
});

const CranCatalogSchema = z.object({
	cacheVersion: z.literal(CRAN_CATALOG_VERSION),
	fetchedAt: z.string().datetime(),
	packages: z.array(CranPackageSchema)
});

export type CranPackage = z.infer<typeof CranPackageSchema>;
export type CranCatalog = z.infer<typeof CranCatalogSchema>;
export type CranFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export class CranCatalogError extends Error {
	readonly _tag = 'CranCatalogError';
	readonly hint?: string;

	constructor(message: string, hint?: string, options?: ErrorOptions) {
		super(message, options);
		this.hint = hint;
	}
}

export const cranLandingUrl = (packageName: string): string =>
	`${CRAN_BASE_URL}/web/packages/${encodeURIComponent(packageName)}/index.html`;

export const cranSourceUrl = (pkg: Pick<CranPackage, 'name' | 'version'>): string =>
	`${CRAN_BASE_URL}/src/contrib/${encodeURIComponent(pkg.name)}_${encodeURIComponent(pkg.version)}.tar.gz`;

export const parseCranPackages = (text: string): CranPackage[] => {
	const packages = parseDcf(text).flatMap((record) => {
		const name = record['Package']?.trim();
		const version = record['Version']?.trim();
		if (!name || !version || !packageNamePattern.test(name)) return [];
		const md5 = record['MD5sum']?.trim().toLowerCase();
		const published = record['Published']?.trim();
		const needsCompilation = record['NeedsCompilation']?.trim().toLowerCase();
		return [
			{
				name,
				version,
				...(md5 && /^[0-9a-f]{32}$/u.test(md5) ? { md5 } : {}),
				...(published ? { published } : {}),
				...(needsCompilation === 'yes' || needsCompilation === 'no' ? { needsCompilation } : {})
			} satisfies CranPackage
		];
	});
	const unique = new Map<string, CranPackage>();
	for (const pkg of packages) unique.set(pkg.name.toLowerCase(), pkg);
	return [...unique.values()].sort((left, right) => left.name.localeCompare(right.name));
};

export const findCranPackage = (
	catalog: CranCatalog,
	packageName: string
): CranPackage | undefined => {
	const target = packageName.trim().toLowerCase();
	return catalog.packages.find((pkg) => pkg.name.toLowerCase() === target);
};

const editDistance = (left: string, right: string): number => {
	const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
	for (let leftIndex = 1; leftIndex <= left.length; leftIndex++) {
		const current = [leftIndex];
		for (let rightIndex = 1; rightIndex <= right.length; rightIndex++) {
			current[rightIndex] = Math.min(
				(current[rightIndex - 1] ?? 0) + 1,
				(previous[rightIndex] ?? 0) + 1,
				(previous[rightIndex - 1] ?? 0) + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1)
			);
		}
		previous.splice(0, previous.length, ...current);
	}
	return previous[right.length] ?? Math.max(left.length, right.length);
};

export const suggestCranPackageNames = (
	catalog: CranCatalog,
	packageName: string,
	limit = 3
): string[] => {
	const target = packageName.trim().toLowerCase();
	if (target.length < 3) return [];
	return catalog.packages
		.map((pkg) => ({ name: pkg.name, distance: editDistance(target, pkg.name.toLowerCase()) }))
		.filter((candidate) => candidate.distance <= Math.max(2, Math.floor(target.length / 3)))
		.sort((left, right) => left.distance - right.distance || left.name.localeCompare(right.name))
		.slice(0, limit)
		.map((candidate) => candidate.name);
};

const catalogPath = (dataDirectory: string) => path.join(dataDirectory, 'cran', CRAN_CATALOG_FILE);

const readCachedCatalog = async (dataDirectory: string): Promise<CranCatalog | null> => {
	try {
		const parsed = CranCatalogSchema.safeParse(
			JSON.parse(await fs.readFile(catalogPath(dataDirectory), 'utf8'))
		);
		return parsed.success ? parsed.data : null;
	} catch {
		return null;
	}
};

const isFresh = (catalog: CranCatalog, now: number): boolean => {
	const fetchedAt = Date.parse(catalog.fetchedAt);
	return Number.isFinite(fetchedAt) && now - fetchedAt < CRAN_CATALOG_TTL_MS;
};

const writeCatalog = async (dataDirectory: string, catalog: CranCatalog): Promise<void> => {
	const file = catalogPath(dataDirectory);
	await fs.mkdir(path.dirname(file), { recursive: true });
	const temporary = `${file}.partial-${crypto.randomUUID()}`;
	try {
		await fs.writeFile(temporary, `${JSON.stringify(catalog, null, '\t')}\n`, 'utf8');
		await fs.rename(temporary, file);
	} finally {
		await fs.rm(temporary, { force: true });
	}
};

export type LoadCranCatalogOptions = {
	readonly dataDirectory: string;
	readonly refresh?: boolean;
	readonly fetch?: CranFetch;
	readonly now?: number;
};

export const loadCranCatalog = async (options: LoadCranCatalogOptions): Promise<CranCatalog> => {
	const now = options.now ?? Date.now();
	const cached = await readCachedCatalog(options.dataDirectory);
	if (!options.refresh && cached && isFresh(cached, now)) return cached;

	const fetchImpl: CranFetch = options.fetch ?? globalThis.fetch;
	let response: Response;
	try {
		response = await fetchImpl(CRAN_PACKAGES_URL, {
			headers: { accept: 'application/gzip, application/octet-stream' },
			signal: AbortSignal.timeout(120_000)
		});
	} catch (cause) {
		if (!options.refresh && cached) return cached;
		throw new CranCatalogError(
			'Could not download the CRAN package index',
			'Check your network connection and CRAN mirror availability, then try /add again.',
			{ cause }
		);
	}
	if (!response.ok) {
		if (!options.refresh && cached) return cached;
		throw new CranCatalogError(
			`CRAN package index returned HTTP ${response.status}`,
			'Try /add again after the CRAN mirror is available.'
		);
	}

	let compressed: Uint8Array;
	try {
		compressed = await readResponseBytesBounded(response, MAX_CATALOG_BYTES, 'CRAN package index');
	} catch (cause) {
		throw new CranCatalogError('CRAN package index has an invalid size', undefined, { cause });
	}
	if (compressed.byteLength === 0 || compressed.byteLength > MAX_CATALOG_BYTES) {
		throw new CranCatalogError('CRAN package index has an invalid size');
	}

	let text: string;
	try {
		text = new TextDecoder().decode(
			await gunzipBounded(compressed, MAX_CATALOG_TEXT_BYTES, 'CRAN package index')
		);
	} catch (cause) {
		throw new CranCatalogError('CRAN package index is not valid gzip data', undefined, {
			cause
		});
	}
	const packages = parseCranPackages(text);
	if (packages.length < 1_000) {
		throw new CranCatalogError('CRAN package index is incomplete');
	}
	const catalog: CranCatalog = {
		cacheVersion: CRAN_CATALOG_VERSION,
		fetchedAt: new Date(now).toISOString(),
		packages
	};
	await writeCatalog(options.dataDirectory, catalog);
	return catalog;
};
