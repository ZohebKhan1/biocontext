import type { TaggedErrorOptions } from '../errors.ts';

export class ResourceError extends Error {
	readonly _tag = 'ResourceError';
	override readonly cause?: unknown;
	readonly hint?: string;

	constructor(args: TaggedErrorOptions) {
		super(args.message);
		this.cause = args.cause;
		this.hint = args.hint;
		if (args.stack) this.stack = args.stack;
	}
}

export const resourceNameToKey = (name: string): string => {
	return encodeURIComponent(name);
};

const MANAGED_BIOCONDUCTOR_CACHE_PREFIX = 'managed-bioconductor-cache:';

/** Internal reference used only after broad-scope cache discovery. */
export const managedBioconductorCacheReference = (packageName: string): string =>
	`${MANAGED_BIOCONDUCTOR_CACHE_PREFIX}${packageName}`;

export const parseManagedBioconductorCacheReference = (reference: string): string | null =>
	reference.startsWith(MANAGED_BIOCONDUCTOR_CACHE_PREFIX)
		? reference.slice(MANAGED_BIOCONDUCTOR_CACHE_PREFIX.length) || null
		: null;
