import { describe, expect, it } from 'bun:test';

import { createVirtualFs, disposeVirtualFs, writeVirtualFsFile } from '../vfs/virtual-fs.ts';
import { executeGrepTool } from './grep.ts';

describe('grep result limits', () => {
	it('returns 25 matches by default and permits an explicit higher bound', async () => {
		const vfsId = createVirtualFs();
		try {
			await writeVirtualFsFile(
				'/many.R',
				Array.from({ length: 60 }, (_, index) => `needle <- ${index}`).join('\n'),
				vfsId
			);
			const bounded = await executeGrepTool({ pattern: 'needle' }, { basePath: '/', vfsId });
			expect(bounded.metadata.matchCount).toBe(25);
			expect(bounded.metadata.truncated).toBe(true);

			const expanded = await executeGrepTool(
				{ pattern: 'needle', limit: 40 },
				{ basePath: '/', vfsId }
			);
			expect(expanded.metadata.matchCount).toBe(40);
			expect(expanded.output).toContain('request a higher limit explicitly');
		} finally {
			disposeVirtualFs(vfsId);
		}
	});
});
