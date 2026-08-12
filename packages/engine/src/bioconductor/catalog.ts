/**
 * The Bioconductor package catalog.
 *
 * Bioconductor publishes a `VIEWS` index per repository. We fetch all four,
 * reduce them to the fields this app needs, and cache the result on disk so
 * package lookup and autocomplete stay instant after the first run.
 */

import { promises as fs } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

import { parseDcf, parseDcfList } from './dcf.ts';
import { repairUtf8ByteTokens } from './pdf-text.ts';
import { isNumberedBioconductorRelease, resolveReleaseSelector } from './release.ts';

export const BIOCONDUCTOR_BASE_URL = 'https://bioconductor.org/packages';

/** Bioconductor splits its packages across four repositories. */
export const BIOCONDUCTOR_REPOSITORIES = [
	'bioc',
	'workflows',
	'data/annotation',
	'data/experiment'
] as const;
export type BioconductorRepository = (typeof BIOCONDUCTOR_REPOSITORIES)[number];

const REPOSITORY_LABELS: Record<BioconductorRepository, string> = {
	bioc: 'Software',
	workflows: 'Workflow',
	'data/annotation': 'Annotation data',
	'data/experiment': 'Experiment data'
};

export const describeRepository = (repository: BioconductorRepository): string =>
	REPOSITORY_LABELS[repository];

export type BioconductorVignette = {
	/** Vignette title as published in `vignetteTitles`. */
	readonly title: string;
	/** Path relative to the repository root, e.g. `vignettes/DESeq2/inst/doc/DESeq2.html`. */
	readonly path: string;
	/** Rendered format. Roughly a quarter of packages publish PDF vignettes only. */
	readonly format: 'html' | 'pdf' | 'other';
};

export type BioconductorPackage = {
	readonly name: string;
	readonly version: string;
	readonly repository: BioconductorRepository;
	readonly title: string;
	readonly description: string;
	readonly biocViews: readonly string[];
	readonly maintainer?: string;
	readonly url?: string;
	readonly gitUrl?: string;
	readonly gitBranch?: string;
	readonly hasNews: boolean;
	readonly vignettes: readonly BioconductorVignette[];
	/**
	 * Purled R scripts, from the published `Rfiles` field.
	 *
	 * Deliberately not derived from the vignette paths: some packages publish an
	 * R script with no listed vignette (AnnotationDbi) and others a vignette with
	 * no script (maSigPro), so the two lists do not line up.
	 */
	readonly rFiles: readonly string[];
};

export type BioconductorCatalog = {
	readonly release: string;
	readonly fetchedAt: string;
	readonly packages: readonly BioconductorPackage[];
};

export const CATALOG_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 60_000;
// Version 2 adds the derived vignette format. Version 1 caches must be
// refreshed because a missing format caused PDF vignettes to take the HTML
// conversion path.
const CATALOG_CACHE_VERSION = 3;

export class BioconductorCatalogError extends Error {
	/** Matches the tagged-error shape the HTTP layer inspects for status and hints. */
	readonly _tag = 'BioconductorCatalogError';
	readonly hint: string;
	constructor(message: string, hint: string, options?: { cause?: unknown }) {
		super(message, options);
		this.name = 'BioconductorCatalogError';
		this.hint = hint;
	}
}

const requireNumberedRelease = (release: string): string => {
	if (!isNumberedBioconductorRelease(release)) {
		throw new BioconductorCatalogError(
			`Bioconductor catalog release must be numbered, received "${release}"`,
			'Resolve "release" or "devel" before constructing Bioconductor package URLs.'
		);
	}
	return release;
};

export const viewsUrl = (release: string, repository: BioconductorRepository): string =>
	`${BIOCONDUCTOR_BASE_URL}/${requireNumberedRelease(release)}/${repository}/VIEWS`;

/** Web page for a package, the canonical thing to link a human to. */
export const packageLandingUrl = (pkg: BioconductorPackage, release: string): string =>
	`${BIOCONDUCTOR_BASE_URL}/${requireNumberedRelease(release)}/${pkg.repository}/html/${pkg.name}.html`;

export const vignetteUrl = (pkg: BioconductorPackage, vignette: BioconductorVignette, release: string): string =>
	`${BIOCONDUCTOR_BASE_URL}/${requireNumberedRelease(release)}/${pkg.repository}/${vignette.path}`;

export const newsUrl = (pkg: BioconductorPackage, release: string): string =>
	`${BIOCONDUCTOR_BASE_URL}/${requireNumberedRelease(release)}/${pkg.repository}/news/${pkg.name}/NEWS`;

/** Exact package source release used for the published Bioconductor package version. */
export const sourceArchiveUrl = (pkg: BioconductorPackage, release: string): string =>
	`${BIOCONDUCTOR_BASE_URL}/${requireNumberedRelease(release)}/${pkg.repository}/src/contrib/${encodeURIComponent(pkg.name)}_${encodeURIComponent(pkg.version)}.tar.gz`;

/** Stable location for a superseded patch release within the same numbered repository. */
export const archivedSourceArchiveUrl = (pkg: BioconductorPackage, release: string): string =>
	`${BIOCONDUCTOR_BASE_URL}/${requireNumberedRelease(release)}/${pkg.repository}/src/contrib/Archive/${encodeURIComponent(pkg.name)}/${encodeURIComponent(pkg.name)}_${encodeURIComponent(pkg.version)}.tar.gz`;

/** Reference manual: the package's Rd help pages rendered as one PDF. */
export const referenceManualUrl = (pkg: BioconductorPackage, release: string): string =>
	`${BIOCONDUCTOR_BASE_URL}/${requireNumberedRelease(release)}/${pkg.repository}/manuals/${pkg.name}/man/${pkg.name}.pdf`;

/** A purled vignette R script, from the published `Rfiles` list. */
export const rFileUrl = (pkg: BioconductorPackage, rFilePath: string, release: string): string =>
	`${BIOCONDUCTOR_BASE_URL}/${requireNumberedRelease(release)}/${pkg.repository}/${rFilePath}`;

/**
 * `vignettes` and `vignetteTitles` are parallel comma-separated lists. Titles
 * are frequently missing or shorter than the path list, so pair defensively and
 * fall back to the file name.
 */
export const detectVignetteFormat = (vignettePath: string): BioconductorVignette['format'] => {
	const extension = vignettePath.split('.').pop()?.toLowerCase();
	if (extension === 'html' || extension === 'htm') return 'html';
	if (extension === 'pdf') return 'pdf';
	return 'other';
};

const parseVignettes = (record: Record<string, string>): BioconductorVignette[] => {
	const paths = parseDcfList(record['vignettes']);
	const titles = parseDcfList(record['vignetteTitles']);
	return paths.map((vignettePath, index) => {
		const fallback = path.basename(vignettePath).replace(/\.[^.]+$/, '');
		return {
			path: vignettePath,
			title: titles[index]?.trim() || fallback,
			format: detectVignetteFormat(vignettePath)
		};
	});
};

const toPackage = (
	record: Record<string, string>,
	repository: BioconductorRepository
): BioconductorPackage | null => {
	const name = record['Package']?.trim();
	if (!name) return null;
	const cleanText = (value: string | undefined): string | undefined =>
		value === undefined ? undefined : repairUtf8ByteTokens(value);
	const title = cleanText(record['Title']?.trim()) ?? '';
	const description = cleanText(record['Description']?.trim()) ?? '';
	const maintainer = cleanText(record['Maintainer']?.trim());
	return {
		name,
		version: record['Version']?.trim() ?? 'unknown',
		repository,
		title,
		description,
		biocViews: parseDcfList(record['biocViews']),
		...(maintainer ? { maintainer } : {}),
		...(record['URL']?.trim() ? { url: record['URL'].trim() } : {}),
		...(record['git_url']?.trim() ? { gitUrl: record['git_url'].trim() } : {}),
		...(record['git_branch']?.trim() ? { gitBranch: record['git_branch'].trim() } : {}),
		hasNews: record['hasNEWS']?.trim().toUpperCase() === 'TRUE',
		vignettes: parseVignettes(record),
		rFiles: parseDcfList(record['Rfiles'])
	};
};

/** Parse one repository's published VIEWS payload into catalog records. */
export const parseViews = (content: string, repository: BioconductorRepository): BioconductorPackage[] =>
	parseDcf(content)
		.map((record) => toPackage(record, repository))
		.filter((pkg): pkg is BioconductorPackage => pkg !== null);

const fetchText = async (url: string): Promise<string> => {
	const response = await fetch(url, {
		signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
		headers: { accept: 'text/plain, */*' }
	});
	if (!response.ok) {
		throw new BioconductorCatalogError(
			`Bioconductor request failed (${response.status}) for ${url}`,
			'Check your network connection, then try again.'
		);
	}
	return response.text();
};

const fetchRepository = async (
	release: string,
	repository: BioconductorRepository
): Promise<BioconductorPackage[]> => {
	const content = await fetchText(viewsUrl(release, repository));
	const packages = parseViews(content, repository);
	if (packages.length === 0) {
		throw new BioconductorCatalogError(
			`Bioconductor returned an invalid or empty VIEWS index for ${repository}`,
			'Keep the existing package index and try refreshing again later.'
		);
	}
	return packages;
};

const catalogCachePath = (dataDirectory: string, release: string) =>
	path.join(dataDirectory, 'bioconductor', `catalog-${requireNumberedRelease(release)}.json`);

const isStringArray = (value: unknown): value is string[] =>
	Array.isArray(value) && value.every((entry) => typeof entry === 'string');

/** Guard every field used by package materialization before trusting a disk cache. */
export const isCompleteCatalogPackage = (value: unknown): value is BioconductorPackage => {
	if (!value || typeof value !== 'object') return false;
	const pkg = value as Record<string, unknown>;
	if (
		typeof pkg.name !== 'string' ||
		typeof pkg.version !== 'string' ||
		typeof pkg.title !== 'string' ||
		typeof pkg.description !== 'string' ||
		typeof pkg.hasNews !== 'boolean' ||
		!BIOCONDUCTOR_REPOSITORIES.includes(pkg.repository as BioconductorRepository) ||
		!isStringArray(pkg.biocViews) ||
		!isStringArray(pkg.rFiles) ||
		!Array.isArray(pkg.vignettes) ||
		(pkg.gitBranch !== undefined && typeof pkg.gitBranch !== 'string')
	)
		return false;

	return pkg.vignettes.every(
		(vignette) =>
			Boolean(vignette) &&
			typeof vignette === 'object' &&
			typeof (vignette as Record<string, unknown>).path === 'string' &&
			typeof (vignette as Record<string, unknown>).title === 'string'
	);
};

const writeCachedCatalog = async (
	dataDirectory: string,
	release: string,
	catalog: BioconductorCatalog
): Promise<void> => {
	const cachePath = catalogCachePath(dataDirectory, release);
	await fs.mkdir(path.dirname(cachePath), { recursive: true });
	const stagingPath = `${cachePath}.partial-${randomUUID()}`;
	try {
		await fs.writeFile(
			stagingPath,
			JSON.stringify({ ...catalog, cacheVersion: CATALOG_CACHE_VERSION }),
			'utf8'
		);
		await fs.rename(stagingPath, cachePath);
	} finally {
		await fs.rm(stagingPath, { force: true }).catch(() => undefined);
	}
};

const readCachedCatalog = async (
	dataDirectory: string,
	release: string
): Promise<BioconductorCatalog | null> => {
	try {
		const raw = await fs.readFile(catalogCachePath(dataDirectory, release), 'utf8');
		const parsed = JSON.parse(raw) as BioconductorCatalog & { cacheVersion?: number };
		if (parsed.cacheVersion !== 1 && parsed.cacheVersion !== CATALOG_CACHE_VERSION) return null;
		if (typeof parsed.release !== 'string' || typeof parsed.fetchedAt !== 'string') return null;
		if (parsed.release !== release || !isNumberedBioconductorRelease(parsed.release)) return null;
		if (!Array.isArray(parsed.packages) || parsed.packages.length === 0) return null;
		if (parsed.packages.some((pkg) => !isCompleteCatalogPackage(pkg))) return null;

		const catalog: BioconductorCatalog = {
			release: parsed.release,
			fetchedAt: parsed.fetchedAt,
			packages: parsed.packages.map((pkg) => ({
				...pkg,
				title: repairUtf8ByteTokens(pkg.title),
				description: repairUtf8ByteTokens(pkg.description),
				...(pkg.maintainer ? { maintainer: repairUtf8ByteTokens(pkg.maintainer) } : {}),
				vignettes: pkg.vignettes.map((vignette: BioconductorVignette) => ({
					...vignette,
					format: detectVignetteFormat(vignette.path)
				}))
			}))
		};
		if (parsed.cacheVersion !== CATALOG_CACHE_VERSION) {
			await writeCachedCatalog(dataDirectory, release, catalog).catch(() => undefined);
		}
		return catalog;
	} catch {
		return null;
	}
};

export const isCatalogStale = (catalog: BioconductorCatalog, now = Date.now()): boolean => {
	const fetchedAt = Date.parse(catalog.fetchedAt);
	if (Number.isNaN(fetchedAt)) return true;
	return now - fetchedAt > CATALOG_TTL_MS;
};

export type LoadCatalogOptions = {
	readonly dataDirectory: string;
	readonly release?: string;
	/** Bypass the on-disk cache and refetch from bioconductor.org. */
	readonly refresh?: boolean;
};

const inFlight = new Map<string, Promise<BioconductorCatalog>>();

/**
 * Load the catalog, preferring the on-disk cache.
 *
 * A stale cache is still returned if the network fetch fails, so losing
 * connectivity degrades freshness rather than breaking package lookup.
 */
export const loadCatalog = async (options: LoadCatalogOptions): Promise<BioconductorCatalog> => {
	const release = await resolveReleaseSelector({
		dataDirectory: options.dataDirectory,
		selector: options.release ?? 'release',
		...(options.refresh ? { refresh: true } : {})
	});
	const key = `${options.dataDirectory}::${release}`;

	const existing = inFlight.get(key);
	if (existing && !options.refresh) return existing;

	const task = (async (): Promise<BioconductorCatalog> => {
		const cached = options.refresh ? null : await readCachedCatalog(options.dataDirectory, release);
		if (cached && !isCatalogStale(cached)) return cached;

		try {
			const perRepository = await Promise.all(
				BIOCONDUCTOR_REPOSITORIES.map((repository) => fetchRepository(release, repository))
			);
			const catalog: BioconductorCatalog = {
				release,
				fetchedAt: new Date().toISOString(),
				packages: perRepository.flat()
			};
			await writeCachedCatalog(options.dataDirectory, release, catalog);
			return catalog;
		} catch (cause) {
			if (cached && !options.refresh) return cached;
			throw new BioconductorCatalogError(
				'Could not download the Bioconductor package index',
				'bioconductor.org must be reachable the first time you use a Bioconductor package.',
				{ cause }
			);
		}
	})();

	inFlight.set(key, task);
	try {
		return await task;
	} finally {
		if (inFlight.get(key) === task) inFlight.delete(key);
	}
};

/** Package names are case-sensitive in Bioconductor, but users rarely are. */
export const findPackage = (catalog: BioconductorCatalog, name: string): BioconductorPackage | undefined => {
	const trimmed = name.trim();
	const exact = catalog.packages.find((pkg) => pkg.name === trimmed);
	if (exact) return exact;
	const lower = trimmed.toLowerCase();
	return catalog.packages.find((pkg) => pkg.name.toLowerCase() === lower);
};

/** Canonical, deterministic package names for lightweight clients such as autocomplete. */
export const listPackageNames = (catalog: BioconductorCatalog): string[] => {
	const names = new Map<string, string>();
	for (const pkg of catalog.packages) {
		const name = pkg.name.trim();
		const key = name.toLowerCase();
		if (name && !names.has(key)) names.set(key, name);
	}
	return [...names.values()].sort((a, b) => a.localeCompare(b));
};

const scorePackage = (pkg: BioconductorPackage, query: string): number => {
	const name = pkg.name.toLowerCase();
	if (name === query) return 0;
	if (name.startsWith(query)) return 1;
	if (name.includes(query)) return 2;
	if (pkg.title.toLowerCase().includes(query)) return 3;
	if (pkg.biocViews.some((view) => view.toLowerCase().includes(query))) return 4;
	return Number.POSITIVE_INFINITY;
};

/** Rank by how directly the query hits: exact name, prefix, substring, then title and biocViews. */
export const searchPackages = (catalog: BioconductorCatalog, query: string, limit = 25): BioconductorPackage[] => {
	const normalized = query.trim().toLowerCase();
	if (normalized.length === 0) return [];

	return catalog.packages
		.map((pkg) => ({ pkg, score: scorePackage(pkg, normalized) }))
		.filter((entry) => Number.isFinite(entry.score))
		.sort((a, b) => a.score - b.score || a.pkg.name.localeCompare(b.pkg.name))
		.slice(0, limit)
		.map((entry) => entry.pkg);
};

/** Nearest names by prefix overlap, for "did you mean" on a failed lookup. */
export const suggestPackageNames = (catalog: BioconductorCatalog, name: string, limit = 3): string[] => {
	const normalized = name.trim().toLowerCase();
	if (normalized.length < 2) return [];
	const prefix = normalized.slice(0, Math.max(2, Math.ceil(normalized.length / 2)));
	return catalog.packages
		.filter((pkg) => pkg.name.toLowerCase().startsWith(prefix))
		.map((pkg) => pkg.name)
		.sort((a, b) => Math.abs(a.length - name.length) - Math.abs(b.length - name.length))
		.slice(0, limit);
};
