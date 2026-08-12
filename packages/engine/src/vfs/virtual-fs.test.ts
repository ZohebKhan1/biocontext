import { describe, it, expect } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { executeGlobTool } from '../tools/glob.ts';
import { executeGrepTool } from '../tools/grep.ts';
import { executeListTool } from '../tools/list.ts';
import { executeReadTool } from '../tools/read.ts';
import { PathEscapeError } from '../tools/virtual-sandbox.ts';
import {
	createVirtualFs,
	disposeVirtualFs,
	existsInVirtualFs,
	importDirectoryIntoVirtualFs,
	listVirtualFsFilesRecursive,
	mkdirVirtualFs,
	readVirtualFsFile,
	readdirVirtualFs,
	rmVirtualFs,
	statVirtualFs,
	symlinkVirtualFs,
	writeVirtualFsFile
} from './virtual-fs.ts';

const posix = path.posix;

const createRoot = () => `/vfs-test-${randomUUID()}`;

const cleanupVirtual = async (root: string, vfsId?: string) => {
	try {
		await rmVirtualFs(root, { recursive: true, force: true }, vfsId);
	} catch {
		// ignore cleanup failures
	}
};

describe('VirtualFs (just-bash)', () => {
	it('supports basic in-memory file operations', async () => {
		const root = createRoot();
		const vfsId = createVirtualFs();
		try {
			const dir = posix.join(root, 'dir');
			const file = posix.join(dir, 'hello.txt');

			await mkdirVirtualFs(dir, { recursive: true }, vfsId);
			await writeVirtualFsFile(file, 'Hello virtual', vfsId);

			const text = await readVirtualFsFile(file, vfsId);
			expect(text).toBe('Hello virtual');

			const fileStat = await statVirtualFs(file, vfsId);
			expect(fileStat.isFile).toBe(true);

			const dirStat = await statVirtualFs(dir, vfsId);
			expect(dirStat.isDirectory).toBe(true);

			const entries = await readdirVirtualFs(dir, vfsId);
			expect(entries.some((entry) => entry.name === 'hello.txt')).toBe(true);

			const files = await listVirtualFsFilesRecursive(root, vfsId);
			expect(files).toContain(file);
		} finally {
			await cleanupVirtual(root, vfsId);
			disposeVirtualFs(vfsId);
		}
	});

	it('imports from disk and works with virtual tools', async () => {
		const root = createRoot();
		const vfsId = createVirtualFs();
		const sourceDir = await fs.mkdtemp(path.join(os.tmpdir(), 'biocontext-vfs-'));
		try {
			const resourceName = `repo-${randomUUID()}`;
			const collectionPath = root;
			const resourcePath = posix.join(collectionPath, resourceName);

			await fs.mkdir(path.join(sourceDir, 'src'), { recursive: true });
			await fs.writeFile(path.join(sourceDir, 'README.md'), 'Virtual README\nneedle');
			await fs.writeFile(path.join(sourceDir, 'src', 'index.ts'), 'export const needle = "found";');
			await fs.mkdir(path.join(sourceDir, '.git'), { recursive: true });
			await fs.writeFile(path.join(sourceDir, '.git', 'HEAD'), 'ref: refs/heads/main');

			await mkdirVirtualFs(collectionPath, { recursive: true }, vfsId);

			await importDirectoryIntoVirtualFs({
				sourcePath: sourceDir,
				destinationPath: resourcePath,
				vfsId,
				ignore: (relativePath) => {
					const normalized = relativePath.split(path.sep).join('/');
					return (
						normalized === '.git' || normalized.startsWith('.git/') || normalized.includes('/.git/')
					);
				}
			});

			expect(await existsInVirtualFs(posix.join(resourcePath, 'README.md'), vfsId)).toBe(true);
			expect(await existsInVirtualFs(posix.join(resourcePath, '.git', 'HEAD'), vfsId)).toBe(false);

			const context = { basePath: collectionPath, vfsId };

			const listResult = await executeListTool({ path: '.' }, context);
			expect(listResult.metadata.entries.some((entry) => entry.name === resourceName)).toBe(true);

			const readResult = await executeReadTool({ path: `${resourceName}/README.md` }, context);
			expect(readResult.output).toContain('needle');

			const globResult = await executeGlobTool({ pattern: '**/*.ts' }, context);
			expect(globResult.output.split('\n')).toContain(`${resourceName}/src/index.ts`);

			const grepResult = await executeGrepTool({ pattern: 'needle' }, context);
			expect(grepResult.output).toContain(`${resourceName}/README.md`);

			await writeVirtualFsFile(
				posix.join(resourcePath, 'many.txt'),
				Array.from({ length: 300 }, (_, index) => `line-${index + 1}`).join('\n'),
				vfsId
			);
			const defaultRead = await executeReadTool({ path: `${resourceName}/many.txt` }, context);
			expect(defaultRead.metadata.lines).toBe(250);
			expect(defaultRead.metadata.truncated).toBe(true);
			const fileGrep = await executeGrepTool(
				{ pattern: 'needle', path: `${resourceName}/README.md` },
				context
			);
			expect(fileGrep.metadata.matchCount).toBe(1);
		} finally {
			await cleanupVirtual(root, vfsId);
			await fs.rm(sourceDir, { recursive: true, force: true });
			disposeVirtualFs(vfsId);
		}
	});

	it('prevents focused tools and recursive searches from following escaping symlinks', async () => {
		const vfsId = createVirtualFs();
		try {
			await mkdirVirtualFs('/DESeq2', { recursive: true }, vfsId);
			await mkdirVirtualFs('/other', { recursive: true }, vfsId);
			await writeVirtualFsFile('/DESeq2/README.md', '# DESeq2\n', vfsId);
			await writeVirtualFsFile('/other/secret.txt', 'outside-secret', vfsId);
			await symlinkVirtualFs('/other', '/DESeq2/escape', vfsId);

			const context = { basePath: '/DESeq2', vfsId };
			await expect(executeReadTool({ path: 'escape/secret.txt' }, context)).rejects.toBeInstanceOf(
				PathEscapeError
			);
			await expect(executeReadTool({ path: 'escape/missing.txt' }, context)).rejects.toBeInstanceOf(
				PathEscapeError
			);
			await expect(executeListTool({ path: 'escape' }, context)).rejects.toBeInstanceOf(
				PathEscapeError
			);
			await expect(
				executeGrepTool({ pattern: 'outside-secret', path: 'escape' }, context)
			).rejects.toBeInstanceOf(PathEscapeError);
			await expect(
				executeGlobTool({ pattern: '**/*', path: 'escape' }, context)
			).rejects.toBeInstanceOf(PathEscapeError);

			const recursive = await executeGrepTool({ pattern: 'outside-secret' }, context);
			expect(recursive.output).toBe('No matches found.');
		} finally {
			disposeVirtualFs(vfsId);
		}
	});

	it('terminates recursive traversal when an in-scope symlink forms a cycle', async () => {
		const vfsId = createVirtualFs();
		try {
			await mkdirVirtualFs('/DESeq2', { recursive: true }, vfsId);
			await writeVirtualFsFile('/DESeq2/README.md', 'cycle-safe', vfsId);
			await symlinkVirtualFs('.', '/DESeq2/loop', vfsId);

			const files = await listVirtualFsFilesRecursive('/DESeq2', vfsId);
			expect(files).toEqual(['/DESeq2/README.md']);
			const grep = await executeGrepTool({ pattern: 'cycle-safe' }, { basePath: '/DESeq2', vfsId });
			expect(grep.output.match(/README\.md/g)).toHaveLength(1);
		} finally {
			disposeVirtualFs(vfsId);
		}
	});
});
