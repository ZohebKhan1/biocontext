import { describe, expect, test } from 'bun:test';
import { Effect } from 'effect';

import { formatCliError } from './errors.ts';

describe('formatCliError', () => {
	test('unwraps the generic Effect.tryPromise error and preserves the actionable hint', async () => {
		const underlying = Object.assign(
			new Error('Failed to download Bioconductor package "DESeq2"'),
			{
				hint: 'Check the package cache and try again.'
			}
		);
		let caught: unknown;
		try {
			await Effect.runPromise(Effect.tryPromise(() => Promise.reject(underlying)));
		} catch (error) {
			caught = error;
		}

		expect(formatCliError(caught)).toBe(
			'Failed to download Bioconductor package "DESeq2"\n\nHint: Check the package cache and try again.'
		);
	});
});
