import { describe, expect, it } from 'bun:test';

import { gunzipBounded, readResponseBytesBounded } from './io.ts';

describe('bounded CRAN I/O', () => {
	it('reads a response inside its declared limit', async () => {
		const bytes = await readResponseBytesBounded(new Response('Seurat'), 16, 'archive');
		expect(new TextDecoder().decode(bytes)).toBe('Seurat');
	});

	it('rejects declared and streamed bodies beyond the limit', async () => {
		await expect(
			readResponseBytesBounded(
				new Response('x', { headers: { 'content-length': '100' } }),
				10,
				'archive'
			)
		).rejects.toThrow('exceeds 10 bytes');
		await expect(
			readResponseBytesBounded(new Response('0123456789abcdef'), 8, 'archive')
		).rejects.toThrow('exceeds 8 bytes');
	});

	it('bounds gzip expansion while preserving valid content', async () => {
		const compressed = Bun.gzipSync(new TextEncoder().encode('a'.repeat(2_048)));
		expect((await gunzipBounded(compressed, 4_096, 'index')).byteLength).toBe(2_048);
		await expect(gunzipBounded(compressed, 1_024, 'index')).rejects.toThrow(
			'expands beyond 1024 bytes'
		);
	});
});
