import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import * as path from 'node:path';

import { InMemoryFs } from 'just-bash';

const posix = path.posix;

export type VfsStat = {
	isFile: boolean;
	isDirectory: boolean;
	size: number;
	mtimeMs: number;
};

export type VfsDirEntry = {
	name: string;
	isFile: boolean;
	isDirectory: boolean;
};

type MaybeStat = {
	isFile?: (() => boolean) | boolean;
	isDirectory?: (() => boolean) | boolean;
	size?: number;
	mtime?: Date;
	mtimeMs?: number;
};

const defaultId = 'default';
const instances = new Map<string, InMemoryFs>([[defaultId, new InMemoryFs()]]);

const getInstance = (vfsId?: string) => {
	const key = vfsId ?? defaultId;
	const existing = instances.get(key);
	if (existing) return existing;
	const created = new InMemoryFs();
	instances.set(key, created);
	return created;
};

const normalizeVfsPath = (filePath: string): string => {
	const resolved = posix.resolve('/', filePath);
	return resolved === '' ? '/' : resolved;
};

const toStat = (stat: MaybeStat): VfsStat => {
	const isFile = typeof stat.isFile === 'function' ? stat.isFile() : Boolean(stat.isFile);
	const isDirectory =
		typeof stat.isDirectory === 'function' ? stat.isDirectory() : Boolean(stat.isDirectory);
	const mtimeMs =
		typeof stat.mtimeMs === 'number'
			? stat.mtimeMs
			: stat.mtime instanceof Date
				? stat.mtime.getTime()
				: 0;
	return {
		isFile,
		isDirectory,
		size: stat.size ?? 0,
		mtimeMs
	};
};

export const createVirtualFs = () => {
	const vfsId = randomUUID();
	instances.set(vfsId, new InMemoryFs());
	return vfsId;
};

export const hasVirtualFs = (vfsId?: string) => {
	const key = vfsId ?? defaultId;
	return instances.has(key);
};

export const resetVirtualFs = (vfsId?: string) => {
	const key = vfsId ?? defaultId;
	instances.set(key, new InMemoryFs());
};

export const disposeVirtualFs = (vfsId?: string) => {
	const key = vfsId ?? defaultId;
	instances.delete(key);
};

export const disposeAllVirtualFs = () => {
	instances.clear();
	instances.set(defaultId, new InMemoryFs());
};

export const resolveVirtualFsPath = (filePath: string): string => normalizeVfsPath(filePath);

export const mkdirVirtualFs = async (
	filePath: string,
	options?: { recursive?: boolean },
	vfsId?: string
) => {
	await getInstance(vfsId).mkdir(normalizeVfsPath(filePath), options);
};

export const rmVirtualFs = async (
	filePath: string,
	options?: { recursive?: boolean; force?: boolean },
	vfsId?: string
) => {
	await getInstance(vfsId).rm(normalizeVfsPath(filePath), options);
};

export const existsInVirtualFs = async (filePath: string, vfsId?: string) => {
	try {
		await getInstance(vfsId).stat(normalizeVfsPath(filePath));
		return true;
	} catch {
		return false;
	}
};

export const statVirtualFs = async (filePath: string, vfsId?: string) => {
	const stats = (await getInstance(vfsId).stat(normalizeVfsPath(filePath))) as MaybeStat;
	return toStat(stats);
};

export const readdirVirtualFs = async (filePath: string, vfsId?: string) => {
	let resolved = normalizeVfsPath(filePath);
	try {
		resolved = await realpathVirtualFs(filePath, vfsId);
	} catch {
		resolved = normalizeVfsPath(filePath);
	}
	const entries = (await getInstance(vfsId).readdir(resolved)) as string[];
	const result: VfsDirEntry[] = [];
	for (const name of entries) {
		const entryPath = normalizeVfsPath(posix.join(filePath, name));
		let entryStat: VfsStat | null = null;
		try {
			entryStat = await statVirtualFs(entryPath, vfsId);
		} catch {
			entryStat = null;
		}
		result.push({
			name,
			isFile: entryStat?.isFile ?? false,
			isDirectory: entryStat?.isDirectory ?? false
		});
	}
	return result;
};

export const readVirtualFsFile = async (filePath: string, vfsId?: string) =>
	getInstance(vfsId).readFile(normalizeVfsPath(filePath));

export const readVirtualFsFileBuffer = async (filePath: string, vfsId?: string) =>
	getInstance(vfsId).readFileBuffer(normalizeVfsPath(filePath));

export const writeVirtualFsFile = async (
	filePath: string,
	data: string | ArrayBufferView,
	vfsId?: string
) => {
	const content =
		typeof data === 'string'
			? data
			: new Uint8Array(data.buffer as ArrayBufferLike, data.byteOffset, data.byteLength);
	await getInstance(vfsId).writeFile(normalizeVfsPath(filePath), content);
};

export const symlinkVirtualFs = async (targetPath: string, linkPath: string, vfsId?: string) => {
	const target = posix.isAbsolute(targetPath) ? normalizeVfsPath(targetPath) : targetPath;
	await getInstance(vfsId).symlink(target, normalizeVfsPath(linkPath));
};

export const realpathVirtualFs = async (filePath: string, vfsId?: string) => {
	const resolved = normalizeVfsPath(filePath);
	const maybe = getInstance(vfsId) as unknown as {
		realpath?: (path: string) => Promise<string>;
	};
	if (typeof maybe.realpath === 'function') {
		return maybe.realpath(resolved);
	}
	return resolved;
};

export const listVirtualFsFilesRecursive = async (rootPath: string, vfsId?: string) => {
	const files: string[] = [];
	const normalizedRoot = normalizeVfsPath(rootPath);
	let canonicalRoot = normalizedRoot;
	try {
		canonicalRoot = await realpathVirtualFs(normalizedRoot, vfsId);
	} catch {
		canonicalRoot = normalizedRoot;
	}
	const isInsideRoot = async (candidate: string) => {
		let canonical = candidate;
		try {
			canonical = await realpathVirtualFs(candidate, vfsId);
		} catch {
			canonical = candidate;
		}
		const relative = posix.relative(canonicalRoot, canonical);
		return !relative.startsWith('..') && !posix.isAbsolute(relative);
	};
	const stack: string[] = [normalizedRoot];
	const visitedDirectories = new Set<string>();

	while (stack.length > 0) {
		const current = stack.pop();
		if (!current) continue;
		let canonicalCurrent = current;
		try {
			canonicalCurrent = await realpathVirtualFs(current, vfsId);
		} catch {
			canonicalCurrent = current;
		}
		if (visitedDirectories.has(canonicalCurrent)) continue;
		visitedDirectories.add(canonicalCurrent);
		let entries: VfsDirEntry[] = [];
		try {
			entries = await readdirVirtualFs(current, vfsId);
		} catch {
			entries = [];
		}
		if (entries.length === 0) continue;

		for (const entry of entries) {
			const entryPath = normalizeVfsPath(posix.join(current, entry.name));
			if (!(await isInsideRoot(entryPath))) continue;
			if (entry.isDirectory) {
				stack.push(entryPath);
			} else if (entry.isFile) {
				files.push(entryPath);
			}
		}
	}

	return files;
};

export const importDirectoryIntoVirtualFs = async (args: {
	sourcePath: string;
	destinationPath: string;
	ignore?: (relativePath: string) => boolean;
	vfsId?: string;
}) => {
	const base = path.resolve(args.sourcePath);
	const dest = normalizeVfsPath(args.destinationPath);
	const ignore = args.ignore ?? (() => false);
	const vfsId = args.vfsId;

	const walk = async (currentPath: string): Promise<void> => {
		const relative = path.relative(base, currentPath);
		if (relative && ignore(relative)) return;
		let dirents: Dirent[] = [];
		try {
			dirents = await fs.readdir(currentPath, { withFileTypes: true });
		} catch {
			dirents = [];
		}
		if (dirents.length === 0) return;

		for (const dirent of dirents) {
			const srcPath = path.join(currentPath, dirent.name);
			const relPath = path.relative(base, srcPath);
			if (ignore(relPath)) continue;
			const destPath = normalizeVfsPath(posix.join(dest, relPath.split(path.sep).join('/')));

			if (dirent.isDirectory()) {
				await mkdirVirtualFs(destPath, { recursive: true }, vfsId);
				await walk(srcPath);
				continue;
			}

			if (dirent.isSymbolicLink()) {
				let target: string | null = null;
				try {
					target = await fs.readlink(srcPath);
				} catch {
					target = null;
				}
				if (target) {
					try {
						await symlinkVirtualFs(target, destPath, vfsId);
					} catch {
						// Ignore invalid symlink entries while importing.
					}
				}
				continue;
			}

			if (dirent.isFile()) {
				let buffer: Buffer | null = null;
				try {
					buffer = await fs.readFile(srcPath);
				} catch {
					buffer = null;
				}
				if (buffer) {
					try {
						await writeVirtualFsFile(destPath, buffer, vfsId);
					} catch {
						// Ignore individual file write errors while importing.
					}
				}
			}
		}
	};

	await mkdirVirtualFs(dest, { recursive: true }, vfsId);
	await walk(base);
};

export const importPathsIntoVirtualFs = async (args: {
	sourcePath: string;
	destinationPath: string;
	relativePaths: readonly string[];
	vfsId?: string;
}) => {
	const base = path.resolve(args.sourcePath);
	const dest = normalizeVfsPath(args.destinationPath);
	const vfsId = args.vfsId;
	const uniquePaths = Array.from(
		new Set(
			args.relativePaths
				.map((relativePath) => relativePath.trim())
				.filter((relativePath) => relativePath.length > 0 && relativePath !== '.')
		)
	).sort((left, right) => left.localeCompare(right));

	await mkdirVirtualFs(dest, { recursive: true }, vfsId);

	for (const relativePath of uniquePaths) {
		const sourcePath = path.join(base, relativePath);
		const destinationPath = normalizeVfsPath(
			posix.join(dest, relativePath.split(path.sep).join('/'))
		);

		let stat: Awaited<ReturnType<typeof fs.lstat>> | null = null;
		try {
			stat = await fs.lstat(sourcePath);
		} catch {
			stat = null;
		}
		if (!stat) continue;

		await mkdirVirtualFs(posix.dirname(destinationPath), { recursive: true }, vfsId);

		if (stat.isDirectory()) {
			await mkdirVirtualFs(destinationPath, { recursive: true }, vfsId);
			continue;
		}

		if (stat.isSymbolicLink()) {
			let target: string | null = null;
			try {
				target = await fs.readlink(sourcePath);
			} catch {
				target = null;
			}
			if (!target) continue;
			try {
				await symlinkVirtualFs(target, destinationPath, vfsId);
			} catch {
				// Ignore invalid symlink entries while importing.
			}
			continue;
		}

		if (!stat.isFile()) continue;

		let buffer: Buffer | null = null;
		try {
			buffer = await fs.readFile(sourcePath);
		} catch {
			buffer = null;
		}
		if (!buffer) continue;
		try {
			await writeVirtualFsFile(destinationPath, buffer, vfsId);
		} catch {
			// Ignore individual file write errors while importing.
		}
	}
};
