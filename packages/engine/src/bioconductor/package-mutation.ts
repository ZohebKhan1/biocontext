import { AsyncLocalStorage } from 'node:async_hooks';
import path from 'node:path';

const packageMutationTails = new Map<string, Promise<void>>();
const activeMutationKeys = new AsyncLocalStorage<ReadonlySet<string>>();

const mutationKey = (directory: string): string =>
	path.resolve(directory).normalize('NFC').toLowerCase();

/** Serialize mutations to one managed package directory, including nested callers. */
export const withBioconductorPackageMutation = async <T>(
	directory: string,
	operation: () => Promise<T>
): Promise<T> => {
	const key = mutationKey(directory);
	const active = activeMutationKeys.getStore();
	if (active?.has(key)) return operation();

	const previous = packageMutationTails.get(key) ?? Promise.resolve();
	const task = previous.then(() =>
		activeMutationKeys.run(new Set([...(active ?? []), key]), operation)
	);
	const tail = task.then(
		() => undefined,
		() => undefined
	);
	packageMutationTails.set(key, tail);
	try {
		return await task;
	} finally {
		if (packageMutationTails.get(key) === tail) packageMutationTails.delete(key);
	}
};
