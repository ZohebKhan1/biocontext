import { describe, expect, test } from 'bun:test';

import { hasAssistantText, isAssistantContentEmpty } from './message-display.ts';

describe('assistant message display', () => {
	test('recognizes the empty placeholder used before the first stream event', () => {
		expect(isAssistantContentEmpty({ type: 'chunks', chunks: [] })).toBe(true);
		expect(isAssistantContentEmpty({ type: 'text', content: '' })).toBe(true);
		expect(isAssistantContentEmpty('')).toBe(true);
	});

	test('keeps any streamed content visible', () => {
		expect(
			isAssistantContentEmpty({
				type: 'chunks',
				chunks: [{ type: 'text', id: 'answer', text: 'Use DESeq2.' }]
			})
		).toBe(false);
		expect(isAssistantContentEmpty({ type: 'text', content: 'Use DESeq2.' })).toBe(false);
	});

	test('only reports assistant text after a tool or reasoning chunk', () => {
		expect(
			hasAssistantText({
				type: 'chunks',
				chunks: [
					{ type: 'reasoning', id: 'reasoning', text: 'Choosing a source.' },
					{ type: 'tool', id: 'tool', toolName: 'search', state: 'running' }
				]
			})
		).toBe(false);
		expect(
			hasAssistantText({
				type: 'chunks',
				chunks: [{ type: 'text', id: 'answer', text: 'Use DESeq2.' }]
			})
		).toBe(true);
	});
});
