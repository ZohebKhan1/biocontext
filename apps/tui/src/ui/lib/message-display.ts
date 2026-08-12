import type { AssistantContent } from '../types.ts';

export const hasAssistantText = (content: AssistantContent): boolean => {
	if (typeof content === 'string') return content.trim().length > 0;
	if (content.type === 'text') return content.content.trim().length > 0;
	if (content.type !== 'chunks') return false;
	return content.chunks.some((chunk) => chunk.type === 'text' && chunk.text.trim().length > 0);
};

export const isAssistantContentEmpty = (content: AssistantContent): boolean => {
	if (typeof content === 'string') return content.length === 0;
	if (content.type === 'text') return content.content.length === 0;
	if (content.type === 'chunks') return content.chunks.length === 0;
	return true;
};
