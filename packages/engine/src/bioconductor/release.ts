/**
 * The current Bioconductor release number.
 *
 * Deliberately independent of the package catalog: this is read at TUI startup,
 * and `config.yaml` is a few KB where the catalog is several MB. Pulling the
 * whole catalog just to label the status bar would make launch slow and would
 * fail on a cold cache.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

const CONFIG_URL = 'https://bioconductor.org/config.yaml';
const FETCH_TIMEOUT_MS = 10_000;
const RELEASE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_VERSION = 1;
export const NUMBERED_BIOCONDUCTOR_RELEASE_PATTERN = /^\d+\.\d+$/u;

export type BioconductorRelease = {
	/** Current release series, e.g. "3.23". */
	readonly release: string;
	/** Current development series, e.g. "3.24". */
	readonly devel?: string;
	/** R version the release is built against, e.g. "4.6.0". */
	readonly rVersion?: string;
	readonly fetchedAt: string;
};

export type BioconductorReleaseSelector = 'release' | 'devel' | `${number}.${number}`;

export class BioconductorReleaseError extends Error {
	readonly _tag = 'BioconductorReleaseError';
	readonly hint: string;

	constructor(message: string, hint: string, options?: { cause?: unknown }) {
		super(message, options);
		this.name = 'BioconductorReleaseError';
		this.hint = hint;
	}
}

export const isNumberedBioconductorRelease = (value: string): boolean =>
	NUMBERED_BIOCONDUCTOR_RELEASE_PATTERN.test(value.trim());

const FIELD = (name: string) => new RegExp(`^${name}\\s*:\\s*"?([^"\\n]+)"?\\s*$`, 'm');

/**
 * Pull the few fields we need out of `config.yaml`.
 *
 * A dependency-free targeted match rather than a YAML parser: the file is large
 * and mostly irrelevant here, and these keys are top-level scalars.
 */
export const parseReleaseConfig = (content: string): Omit<BioconductorRelease, 'fetchedAt'> | null => {
	const release = FIELD('release_version').exec(content)?.[1]?.trim();
	if (!release || !isNumberedBioconductorRelease(release)) return null;
	const devel = FIELD('devel_version').exec(content)?.[1]?.trim();
	const rVersion = FIELD('r_version_associated_with_release').exec(content)?.[1]?.trim();
	return {
		release,
		...(devel && isNumberedBioconductorRelease(devel) ? { devel } : {}),
		...(rVersion ? { rVersion } : {})
	};
};

/**
 * Turn a stable config selector into the numbered identity used by every
 * catalog URL and package cache. Numeric selectors are true pins and never
 * consult bioconductor.org.
 */
export const resolveReleaseSelector = async (options: {
	readonly dataDirectory: string;
	readonly selector?: string;
	readonly refresh?: boolean;
}): Promise<string> => {
	const selector = (options.selector ?? 'release').trim();
	if (isNumberedBioconductorRelease(selector)) return selector;
	if (selector !== 'release' && selector !== 'devel') {
		throw new BioconductorReleaseError(
			`Invalid Bioconductor release selector "${selector}"`,
			'Use "release", "devel", or a numbered release such as "3.23".'
		);
	}

	const current = await loadRelease({
		dataDirectory: options.dataDirectory,
		...(options.refresh ? { refresh: true } : {})
	});
	const resolved = selector === 'release' ? current?.release : current?.devel;
	if (!resolved || !isNumberedBioconductorRelease(resolved)) {
		throw new BioconductorReleaseError(
			`Could not resolve Bioconductor selector "${selector}" to a numbered release`,
			options.refresh
				? 'The authoritative Bioconductor release configuration is unavailable. The existing package cache was left unchanged.'
				: 'Connect to bioconductor.org once, or configure a numbered release explicitly.'
		);
	}
	return resolved;
};

const cachePath = (dataDirectory: string) =>
	path.join(dataDirectory, 'bioconductor', 'release.json');

const readCache = async (dataDirectory: string): Promise<BioconductorRelease | null> => {
	try {
		const raw = await fs.readFile(cachePath(dataDirectory), 'utf8');
		const parsed = JSON.parse(raw) as BioconductorRelease & { cacheVersion?: number };
		if (parsed.cacheVersion !== CACHE_VERSION || !parsed.release) return null;
		// Drop the internal cache marker so callers see the same shape either way.
		const { cacheVersion: _cacheVersion, ...value } = parsed;
		return value;
	} catch {
		return null;
	}
};

const writeCache = async (dataDirectory: string, value: BioconductorRelease): Promise<void> => {
	const target = cachePath(dataDirectory);
	await fs.mkdir(path.dirname(target), { recursive: true });
	await fs.writeFile(target, JSON.stringify({ cacheVersion: CACHE_VERSION, ...value }), 'utf8');
};

export const isReleaseStale = (value: BioconductorRelease, now = Date.now()): boolean => {
	const fetchedAt = Date.parse(value.fetchedAt);
	if (Number.isNaN(fetchedAt)) return true;
	return now - fetchedAt > RELEASE_TTL_MS;
};

const inFlight = new Map<string, Promise<BioconductorRelease | null>>();

/**
 * Resolve the current release, preferring the on-disk cache.
 *
 * Returns null rather than throwing when bioconductor.org is unreachable and
 * nothing is cached: the status bar should degrade quietly, never block launch.
 */
export const loadRelease = async (options: {
	readonly dataDirectory: string;
	readonly refresh?: boolean;
}): Promise<BioconductorRelease | null> => {
	const key = options.dataDirectory;
	const existing = inFlight.get(key);
	if (existing && !options.refresh) return existing;

	const task = (async (): Promise<BioconductorRelease | null> => {
		const cached = options.refresh ? null : await readCache(options.dataDirectory);
		if (cached && !isReleaseStale(cached)) return cached;

		try {
			const response = await fetch(CONFIG_URL, {
				signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
				headers: { accept: 'text/yaml, text/plain, */*' }
			});
			if (!response.ok) return cached;
			const parsed = parseReleaseConfig(await response.text());
			if (!parsed) return cached;

			const value: BioconductorRelease = { ...parsed, fetchedAt: new Date().toISOString() };
			await writeCache(options.dataDirectory, value);
			return value;
		} catch {
			// Offline, or bioconductor.org is down: a stale answer beats none.
			return cached;
		}
	})();

	inFlight.set(key, task);
	try {
		return await task;
	} finally {
		if (inFlight.get(key) === task) inFlight.delete(key);
	}
};
