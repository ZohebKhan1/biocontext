import { describe, expect, it } from 'bun:test';

import { createVirtualFs, disposeVirtualFs, writeVirtualFsFile } from '../vfs/virtual-fs.ts';
import { executeReadManyTool, ReadManyToolParameters, readManyLimits } from './read-many.ts';

describe('read_many', () => {
	it('reads independent line ranges in one bounded result', async () => {
		const vfsId = createVirtualFs();
		try {
			await writeVirtualFsFile('/one.R', 'a\nb\nc\nd\n', vfsId);
			await writeVirtualFsFile('/two.Rd', 'x\ny\nz\n', vfsId);
			const result = await executeReadManyTool(
				{
					ranges: [
						{ path: 'one.R', offset: 1, limit: 2 },
						{ path: 'two.Rd', offset: 0, limit: 2 }
					]
				},
				{ basePath: '/', vfsId }
			);
			expect(result.output).toContain('## one.R:2-3');
			expect(result.output).toContain('    2\tb');
			expect(result.output).toContain('## two.Rd:1-2');
			expect(result.metadata.totalLines).toBe(4);
			expect(Buffer.byteLength(result.output, 'utf8')).toBeLessThanOrEqual(
				readManyLimits.maxBatchBytes + 1_000
			);
		} finally {
			disposeVirtualFs(vfsId);
		}
	});

	it('rejects batches larger than eight ranges', () => {
		const parsed = ReadManyToolParameters.safeParse({
			ranges: Array.from({ length: readManyLimits.maxRanges + 1 }, () => ({ path: 'x.R' }))
		});
		expect(parsed.success).toBe(false);
	});
});
