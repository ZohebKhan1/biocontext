import { readVirtualFsFileBuffer } from '../vfs/virtual-fs.ts';

export type CachedFile = {
	status: 'text' | 'binary' | 'missing';
	bytes: Uint8Array | null;
	text: string | null;
	lines: string[] | null;
};

type QueryFileCache = Map<string, Promise<CachedFile>>;

const caches = new Map<string, QueryFileCache>();
const decoder = new TextDecoder('utf-8', { fatal: true });

const cacheKey = (vfsId: string | undefined) => vfsId ?? '__default__';

const decodeText = (bytes: Uint8Array): string | null => {
	if (bytes.includes(0)) return null;
	try {
		return decoder.decode(bytes);
	} catch {
		return null;
	}
};

export const getQueryFile = async (filePath: string, vfsId?: string): Promise<CachedFile> => {
	const key = cacheKey(vfsId);
	let cache = caches.get(key);
	if (!cache) {
		cache = new Map();
		caches.set(key, cache);
	}
	const existing = cache.get(filePath);
	if (existing) return existing;
	const pending = readVirtualFsFileBuffer(filePath, vfsId)
		.then((bytes) => {
			const text = decodeText(bytes);
			return {
				status: text === null ? 'binary' : 'text',
				bytes,
				text,
				lines:
					text === null
						? null
						: text.split('\n').map((line) => (line.endsWith('\r') ? line.slice(0, -1) : line))
			} satisfies CachedFile;
		})
		.catch(
			() => ({ status: 'missing', bytes: null, text: null, lines: null }) satisfies CachedFile
		);
	cache.set(filePath, pending);
	return pending;
};

export const clearQueryFileCache = (vfsId?: string): void => {
	if (vfsId) {
		caches.delete(vfsId);
		return;
	}
	caches.delete('__default__');
};

export const clearAllQueryFileCaches = (): void => caches.clear();
