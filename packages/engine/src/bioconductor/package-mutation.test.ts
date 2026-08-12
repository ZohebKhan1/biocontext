import { describe, expect, it } from 'bun:test';

import { withBioconductorPackageMutation } from './package-mutation.ts';

describe('withBioconductorPackageMutation', () => {
	it('allows a nested mutation of the same package without deadlocking', async () => {
		const values: string[] = [];
		await withBioconductorPackageMutation('/tmp/biocontext/DESeq2', async () => {
			values.push('outer-start');
			await withBioconductorPackageMutation('/tmp/biocontext/deseq2', async () => {
				values.push('inner');
			});
			values.push('outer-end');
		});
		expect(values).toEqual(['outer-start', 'inner', 'outer-end']);
	});

	it('serializes concurrent mutations of a package case-insensitively', async () => {
		const values: string[] = [];
		let releaseFirst: (() => void) | undefined;
		const firstCanFinish = new Promise<void>((resolve) => {
			releaseFirst = resolve;
		});
		const first = withBioconductorPackageMutation('/tmp/biocontext/DESeq2', async () => {
			values.push('first-start');
			await firstCanFinish;
			values.push('first-end');
		});
		const second = withBioconductorPackageMutation('/tmp/biocontext/deseq2', async () => {
			values.push('second');
		});
		await Promise.resolve();
		expect(values).toEqual(['first-start']);
		releaseFirst?.();
		await Promise.all([first, second]);
		expect(values).toEqual(['first-start', 'first-end', 'second']);
	});
});
