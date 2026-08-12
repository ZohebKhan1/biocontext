import { Data } from 'effect';
import { getErrorHint, getErrorMessage, getErrorTag } from '../errors.ts';

export class ServerError extends Data.TaggedError('ServerError')<{
	readonly message: string;
	readonly hint?: string;
	readonly cause?: unknown;
}> {}

export interface HttpErrorPayload {
	readonly error: string;
	readonly tag: string;
	readonly hint?: string;
	readonly status: number;
}

const getHttpStatusFromErrorTag = (tag: string) => {
	if (
		tag === 'RequestError' ||
		tag === 'CollectionError' ||
		tag === 'ResourceError' ||
		tag === 'BioconductorCatalogError' ||
		tag === 'ConfigError' ||
		tag === 'InvalidProviderError' ||
		tag === 'InvalidModelError' ||
		tag === 'ProviderNotAuthenticatedError' ||
		tag === 'ProviderAuthTypeError' ||
		tag === 'ProviderNotFoundError' ||
		tag === 'ProviderNotConnectedError' ||
		tag === 'ProviderOptionsError'
	) {
		return 400;
	}
	if (tag === 'RouteNotFound') return 404;
	return 500;
};

export const toHttpErrorPayload = (error: unknown): HttpErrorPayload => {
	const tag = getErrorTag(error);
	return {
		error: getErrorMessage(error),
		tag,
		hint: getErrorHint(error),
		status: getHttpStatusFromErrorTag(tag)
	};
};
