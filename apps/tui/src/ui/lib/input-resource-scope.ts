import type { InputState } from '../types.ts';
import { extractMentionTokens } from '../../lib/resource-references.ts';

const uniqueCaseInsensitive = (values: readonly string[]): string[] => {
	const seen = new Set<string>();
	return values.filter((value) => {
		const key = value.toLowerCase();
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
};

/**
 * Read mentions only from lexer-classified typed segments. Pasted/code content
 * remains part of the question and is never interpreted as resource syntax.
 */
export const parseResourceInput = (input: InputState) => {
	const resources = uniqueCaseInsensitive(
		input.flatMap((part) => (part.type === 'mention' ? extractMentionTokens(part.content) : []))
	);
	const question = input
		.map((part) => (part.type === 'mention' ? part.content.replace(/^@/u, '') : part.content))
		.join('')
		.trim();
	const questionWithoutMentions = input
		.map((part) => (part.type === 'mention' ? '' : part.content))
		.join('')
		.trim();
	return {
		resources,
		question,
		hasQuestionContent: /[\p{L}\p{N}]/u.test(questionWithoutMentions)
	};
};

/** Explicit mentions replace the active scope; a mention-free follow-up keeps it. */
export const selectActiveResources = (
	currentResources: readonly string[],
	mentionedResources: readonly string[]
): string[] =>
	mentionedResources.length > 0
		? uniqueCaseInsensitive(mentionedResources)
		: uniqueCaseInsensitive(currentResources);
