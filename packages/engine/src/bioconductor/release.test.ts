import { afterEach, describe, expect, it } from 'bun:test';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { isReleaseStale, parseReleaseConfig, resolveReleaseSelector } from './release.ts';

const originalFetch = globalThis.fetch;
afterEach(() => {
	globalThis.fetch = originalFetch;
});

const CONFIG = `
# Bioconductor config
release_version: "3.23"
devel_version: "3.24"
r_version_associated_with_release: "4.6.0"
r_version_associated_with_devel: "4.6.0"
r_ver_for_bioconductor_ver:
  "3.23": "4.6"
`;

describe('parseReleaseConfig', () => {
	it('reads the release, devel, and R versions', () => {
		expect(parseReleaseConfig(CONFIG)).toEqual({
			release: '3.23',
			devel: '3.24',
			rVersion: '4.6.0'
		});
	});

	it('tolerates unquoted values', () => {
		expect(parseReleaseConfig('release_version: 3.23\n')?.release).toBe('3.23');
	});

	it('returns null when the release is absent', () => {
		expect(parseReleaseConfig('devel_version: "3.24"\n')).toBeNull();
		expect(parseReleaseConfig('')).toBeNull();
	});

	it('does not match a nested key that merely ends with the field name', () => {
		expect(parseReleaseConfig('  some_release_version: "9.9"\n')).toBeNull();
	});
});

describe('isReleaseStale', () => {
	const now = Date.UTC(2026, 0, 30);
	const at = (msAgo: number) => ({
		release: '3.23',
		fetchedAt: new Date(now - msAgo).toISOString()
	});

	it('is fresh within a day and stale after', () => {
		expect(isReleaseStale(at(60_000), now)).toBe(false);
		expect(isReleaseStale(at(25 * 60 * 60 * 1000), now)).toBe(true);
	});

	it('treats an unparseable timestamp as stale', () => {
		expect(isReleaseStale({ release: '3.23', fetchedAt: 'nope' }, now)).toBe(true);
	});
});

describe('resolveReleaseSelector', () => {
	it('keeps numeric selectors pinned without a release lookup', async () => {
		let calls = 0;
		globalThis.fetch = (async () => {
			calls += 1;
			throw new Error('must not fetch');
		}) as unknown as typeof fetch;
		expect(await resolveReleaseSelector({ dataDirectory: '/unused', selector: '3.21' })).toBe(
			'3.21'
		);
		expect(calls).toBe(0);
	});

	it('resolves release and devel aliases to numbered identities', async () => {
		const dataDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'bioconductor-release-selector-'));
		globalThis.fetch = (async () => new Response(CONFIG)) as unknown as typeof fetch;
		try {
			expect(await resolveReleaseSelector({ dataDirectory, selector: 'release' })).toBe('3.23');
			expect(await resolveReleaseSelector({ dataDirectory, selector: 'devel' })).toBe('3.24');
		} finally {
			await fs.rm(dataDirectory, { recursive: true, force: true });
		}
	});

	it('bypasses the release TTL on refresh and fails safely when authority is unavailable', async () => {
		const dataDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'bioconductor-release-refresh-'));
		globalThis.fetch = (async () => new Response(CONFIG)) as unknown as typeof fetch;
		try {
			expect(await resolveReleaseSelector({ dataDirectory, selector: 'release' })).toBe('3.23');
			globalThis.fetch = (async () =>
				new Response(
					CONFIG.replace('3.23', '3.25').replace('3.24', '3.26')
				)) as unknown as typeof fetch;
			expect(
				await resolveReleaseSelector({ dataDirectory, selector: 'release', refresh: true })
			).toBe('3.25');
			globalThis.fetch = (async () => {
				throw new Error('offline');
			}) as unknown as typeof fetch;
			await expect(
				resolveReleaseSelector({ dataDirectory, selector: 'release', refresh: true })
			).rejects.toThrow('Could not resolve');
		} finally {
			await fs.rm(dataDirectory, { recursive: true, force: true });
		}
	});
});
