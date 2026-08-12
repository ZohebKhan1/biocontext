import { AsyncLocalStorage } from 'node:async_hooks';

export type ContextStore = {
	requestId: string;
	txDepth: number;
};

const storage = new AsyncLocalStorage<ContextStore>();

export const runContext = <T>(store: ContextStore, fn: () => Promise<T> | T): Promise<T> =>
	Promise.resolve(storage.run(store, fn));

export const getContext = (): ContextStore | undefined => storage.getStore();

export const requireContext = (): ContextStore =>
	storage.getStore() ?? { requestId: 'unknown', txDepth: 0 };

export const requestId = (): string => storage.getStore()?.requestId ?? 'unknown';
