import { mkdir, readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { AssistantContent } from '@biocontext/shared';

const THREADS_DIR = join(homedir(), '.local', 'share', 'biocontext', 'threads');
const INDEX_FILE = join(THREADS_DIR, 'index.json');

export type LocalThreadMessage =
	| {
			role: 'user';
			content: string;
			createdAt: number;
	  }
	| {
			role: 'assistant';
			content: AssistantContent;
			canceled?: boolean;
			createdAt: number;
	  }
	| {
			role: 'system';
			content: string;
			createdAt: number;
	  };

export type LocalThread = {
	id: string;
	title?: string;
	createdAt: number;
	lastActivityAt: number;
	resources: string[];
	messages: LocalThreadMessage[];
};

export type ThreadSummary = {
	id: string;
	title?: string;
	createdAt: number;
	lastActivityAt: number;
};

type ThreadIndex = {
	threads: ThreadSummary[];
};

const defaultIndex = (): ThreadIndex => ({ threads: [] });

const readJson = async <T>(path: string) => {
	const file = Bun.file(path);
	if (!(await file.exists())) return null;
	try {
		return (await file.json()) as T;
	} catch {
		return null;
	}
};

const writeJson = async (path: string, value: unknown) => {
	await Bun.write(path, JSON.stringify(value, null, 2));
};

const ensureStoreDir = async () => {
	await mkdir(THREADS_DIR, { recursive: true });
	const index = Bun.file(INDEX_FILE);
	if (!(await index.exists())) {
		await writeJson(INDEX_FILE, defaultIndex());
	}
};

const deriveTitle = (thread: LocalThread) => {
	if (thread.title?.trim()) return thread.title.trim();
	const firstUser = thread.messages.find((m) => m.role === 'user');
	if (!firstUser || typeof firstUser.content !== 'string') return 'Untitled thread';
	const line = firstUser.content.split('\n')[0]?.trim();
	if (!line) return 'Untitled thread';
	return line.length > 80 ? `${line.slice(0, 77)}...` : line;
};

const upsertIndex = async (summary: ThreadSummary) => {
	const index = (await readJson<ThreadIndex>(INDEX_FILE)) ?? defaultIndex();
	const existing = index.threads.findIndex((t) => t.id === summary.id);
	if (existing >= 0) {
		index.threads[existing] = summary;
	} else {
		index.threads.push(summary);
	}
	await writeJson(INDEX_FILE, index);
};

const rebuildIndex = async () => {
	const files = await readdir(THREADS_DIR);
	const threads: ThreadSummary[] = [];
	for (const file of files) {
		if (!file.endsWith('.json')) continue;
		if (file === 'index.json') continue;
		const thread = await readJson<LocalThread>(join(THREADS_DIR, file));
		if (!thread) continue;
		threads.push({
			id: thread.id,
			title: thread.title,
			createdAt: thread.createdAt,
			lastActivityAt: thread.lastActivityAt
		});
	}
	const index = { threads };
	await writeJson(INDEX_FILE, index);
	return index;
};

export const ensureThreadStore = async () => {
	await ensureStoreDir();
};

export const createThread = () => {
	const now = Date.now();
	return {
		id: crypto.randomUUID(),
		createdAt: now,
		lastActivityAt: now,
		resources: ['Bioconductor'],
		messages: []
	};
};

export const saveThread = async (thread: LocalThread) => {
	await ensureStoreDir();
	const now = Date.now();
	const title = deriveTitle(thread);
	const toSave = {
		...thread,
		title,
		lastActivityAt: now
	};
	await writeJson(join(THREADS_DIR, `${thread.id}.json`), toSave);
	await upsertIndex({
		id: thread.id,
		title,
		createdAt: thread.createdAt,
		lastActivityAt: toSave.lastActivityAt
	});
};

export const loadThread = async (id: string) => {
	await ensureStoreDir();
	const file = join(THREADS_DIR, `${id}.json`);
	return readJson<LocalThread>(file);
};

export const listThreads = async () => {
	await ensureStoreDir();
	const index = await readJson<ThreadIndex>(INDEX_FILE);
	if (!index) {
		return (await rebuildIndex()).threads;
	}
	if (!Array.isArray(index.threads)) {
		return (await rebuildIndex()).threads;
	}
	return index.threads;
};
