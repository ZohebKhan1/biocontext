import { Data } from 'effect';

export class CliError extends Data.TaggedError('CliError')<{
	readonly message: string;
	readonly hint?: string;
	readonly cause?: unknown;
}> {}

const GENERIC_EFFECT_MESSAGES = new Set([
	'An error occurred in Effect.tryPromise',
	'An error occurred in Effect.try'
]);

export const formatCliError = (error: unknown) => {
	let current: unknown = error;
	let fallbackMessage: string | undefined;
	let fallbackHint: string | undefined;
	const visited = new Set<unknown>();

	for (let depth = 0; depth < 12 && current && !visited.has(current); depth += 1) {
		visited.add(current);
		if (typeof current !== 'object') break;
		const details = current as { message?: unknown; hint?: unknown; cause?: unknown };
		const message = typeof details.message === 'string' ? details.message : undefined;
		const hint = typeof details.hint === 'string' ? details.hint : undefined;
		if (!fallbackMessage && message) fallbackMessage = message;
		if (!fallbackHint && hint) fallbackHint = hint;
		if (message && !GENERIC_EFFECT_MESSAGES.has(message)) {
			return hint ? `${message}\n\nHint: ${hint}` : message;
		}
		current = details.cause;
	}

	const message = fallbackMessage ?? String(error);
	return fallbackHint ? `${message}\n\nHint: ${fallbackHint}` : message;
};

export const formatCliCommandError = (error: unknown) => `Error: ${formatCliError(error)}`;
