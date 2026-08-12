import * as path from 'node:path';

import { existsInVirtualFs, realpathVirtualFs, statVirtualFs } from '../vfs/virtual-fs.ts';

const posix = path.posix;

export class PathEscapeError extends Error {
	readonly _tag = 'PathEscapeError';
	readonly requestedPath: string;
	readonly basePath: string;

	constructor(requestedPath: string, basePath: string) {
		super(`Path "${requestedPath}" is outside the allowed directory "${basePath}". Access denied.`);
		this.requestedPath = requestedPath;
		this.basePath = basePath;
	}
}

export class PathNotFoundError extends Error {
	readonly _tag = 'PathNotFoundError';
	readonly requestedPath: string;

	constructor(requestedPath: string) {
		super(`Path "${requestedPath}" does not exist.`);
		this.requestedPath = requestedPath;
	}
}

export const resolveSandboxPath = (basePath: string, requestedPath: string): string => {
	const normalizedBase = posix.resolve('/', basePath);
	const resolved = posix.isAbsolute(requestedPath)
		? posix.resolve(requestedPath)
		: posix.resolve(normalizedBase, requestedPath);
	const normalized = posix.normalize(resolved);
	const relative = posix.relative(normalizedBase, normalized);

	if (relative.startsWith('..') || posix.isAbsolute(relative)) {
		throw new PathEscapeError(requestedPath, basePath);
	}

	return normalized;
};

const assertCanonicalPathInsideBase = (
	requestedPath: string,
	basePath: string,
	canonicalBase: string,
	canonicalPath: string
) => {
	const relative = posix.relative(canonicalBase, canonicalPath);
	if (relative.startsWith('..') || posix.isAbsolute(relative)) {
		throw new PathEscapeError(requestedPath, basePath);
	}
};

export const resolveSandboxPathWithSymlinks = async (
	basePath: string,
	requestedPath: string,
	vfsId?: string
) => {
	const resolved = resolveSandboxPath(basePath, requestedPath);
	let canonicalBase = posix.resolve('/', basePath);
	try {
		canonicalBase = await realpathVirtualFs(canonicalBase, vfsId);
	} catch {
		// Keep the lexical base if the VFS cannot canonicalize it.
	}
	try {
		const canonicalPath = await realpathVirtualFs(resolved, vfsId);
		assertCanonicalPathInsideBase(requestedPath, basePath, canonicalBase, canonicalPath);
		return canonicalPath;
	} catch (cause) {
		if (cause instanceof PathEscapeError) throw cause;
	}

	// The requested leaf may not exist yet. Canonicalize its nearest existing
	// ancestor so a missing child below an escaping symlink cannot bypass the
	// boundary check or leak sibling names through error suggestions.
	let ancestor = resolved;
	const missingSegments: string[] = [];
	while (ancestor !== '/') {
		missingSegments.unshift(posix.basename(ancestor));
		ancestor = posix.dirname(ancestor);
		try {
			const canonicalAncestor = await realpathVirtualFs(ancestor, vfsId);
			const canonicalPath = posix.join(canonicalAncestor, ...missingSegments);
			assertCanonicalPathInsideBase(requestedPath, basePath, canonicalBase, canonicalPath);
			return canonicalPath;
		} catch (cause) {
			if (cause instanceof PathEscapeError) throw cause;
		}
	}
	return resolved;
};

export const sandboxPathExists = async (
	basePath: string,
	requestedPath: string,
	vfsId?: string
) => {
	try {
		const resolved = resolveSandboxPath(basePath, requestedPath);
		return await existsInVirtualFs(resolved, vfsId);
	} catch {
		return false;
	}
};

export const sandboxPathIsDirectory = async (
	basePath: string,
	requestedPath: string,
	vfsId?: string
) => {
	try {
		const resolved = resolveSandboxPath(basePath, requestedPath);
		const stats = await statVirtualFs(resolved, vfsId);
		return stats.isDirectory;
	} catch {
		return false;
	}
};

export const sandboxPathIsFile = async (
	basePath: string,
	requestedPath: string,
	vfsId?: string
) => {
	try {
		const resolved = resolveSandboxPath(basePath, requestedPath);
		const stats = await statVirtualFs(resolved, vfsId);
		return stats.isFile;
	} catch {
		return false;
	}
};

export const validateSandboxPath = async (
	basePath: string,
	requestedPath: string,
	vfsId?: string
) => {
	const resolved = resolveSandboxPath(basePath, requestedPath);
	if (!(await existsInVirtualFs(resolved, vfsId))) {
		throw new PathNotFoundError(requestedPath);
	}
	return resolved;
};

export const getSandboxRelativePath = (basePath: string, resolvedPath: string): string =>
	posix.relative(basePath, resolvedPath);
