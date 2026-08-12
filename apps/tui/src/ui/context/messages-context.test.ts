import { describe, expect, it } from 'bun:test';

import {
	shouldShowConversationBannerForThread,
	toStoredMessages,
	withoutRemovedThreadResources
} from './messages-context.tsx';

describe('thread evidence persistence', () => {
	it('stores finalized prose but not tool evidence payloads or reasoning chunks', () => {
		const stored = toStoredMessages([
			{
				role: 'assistant',
				content: {
					type: 'chunks',
					chunks: [
						{ type: 'reasoning', id: 'reasoning', text: 'private draft' },
						{
							type: 'tool',
							id: 'tool',
							toolName: 'evidence',
							state: 'completed',
							input: { content: 'duplicated excerpt' }
						},
						{
							type: 'text',
							id: '__text__',
							text: 'Final answer. [E1]\n\nSources:\n- [E1] canonical'
						}
					]
				}
			}
		]);
		expect(stored[0]?.content).toBe('Final answer. [E1]\n\nSources:\n- [E1] canonical');
		expect(JSON.stringify(stored)).not.toContain('duplicated excerpt');
		expect(JSON.stringify(stored)).not.toContain('private draft');
		expect(JSON.stringify(stored)).not.toContain('showConversationBanner');
		expect(JSON.stringify(stored)).not.toContain('████');
	});
});

describe('conversation banner thread visibility', () => {
	it('shows for empty and system-only threads', () => {
		expect(shouldShowConversationBannerForThread([])).toBe(true);
		expect(shouldShowConversationBannerForThread([{ role: 'system' }])).toBe(true);
	});

	it('stays absent once a stored thread contains a user message', () => {
		expect(
			shouldShowConversationBannerForThread([
				{ role: 'system' },
				{ role: 'user' },
				{ role: 'assistant' }
			])
		).toBe(false);
	});
});

describe('removed package thread scope', () => {
	it('removes package aliases and preserves unrelated resources', () => {
		expect(
			withoutRemovedThreadResources(['bioconductor:DESeq2', 'custom-docs'], ['DESeq2', 'deseq-docs'])
		).toEqual(['custom-docs']);
	});

	it('falls back to broad Bioconductor scope when the removed package was the only scope', () => {
		expect(withoutRemovedThreadResources(['@DESeq2'], ['DESeq2'])).toEqual(['Bioconductor']);
	});
});
