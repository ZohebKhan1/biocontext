import type { TaggedErrorOptions } from '../errors.ts';
import { resourceNameToKey } from '../resources/helpers.ts';

export type CollectionResult = {
	path: string;
	agentInstructions: string;
	vfsId?: string;
	cleanup?: () => Promise<void>;
};

export class CollectionError extends Error {
	readonly _tag = 'CollectionError';
	override readonly cause?: unknown;
	readonly hint?: string;

	constructor(args: TaggedErrorOptions) {
		super(args.message);
		this.cause = args.cause;
		this.hint = args.hint;
	}
}

export const getCollectionKey = (
	resourceNames: readonly string[],
	scope: 'broad' | 'focused' = 'focused'
): string => {
	return `${scope}:${[...resourceNames].map(resourceNameToKey).sort().join('+')}`;
};
