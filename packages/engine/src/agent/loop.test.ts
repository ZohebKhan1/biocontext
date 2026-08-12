import { expect, test } from 'bun:test';
import { stepCountIs, type LanguageModel, type ModelMessage } from 'ai';

import { createAgentStreamTextOptions } from './loop.ts';

const common = {
	model: {} as LanguageModel,
	messages: [{ role: 'user', content: 'question' }] as ModelMessage[],
	tools: {} as never,
	providerOptions: { reasoningEffort: 'medium' as const },
	stopWhen: stepCountIs(4),
	compactionStats: { passes: 0, compactedResults: 0, compactedBytes: 0 }
};

test('uses one Responses instructions field for OpenAI and system for other providers', () => {
	const prompt = 'the complete serialized instructions';
	const openai = createAgentStreamTextOptions({
		...common,
		providerId: 'openai',
		systemPrompt: prompt
	});
	const other = createAgentStreamTextOptions({
		...common,
		providerId: 'anthropic',
		systemPrompt: prompt
	});

	expect('system' in openai).toBe(false);
	expect(
		((openai as Record<string, unknown>).providerOptions as { openai: { instructions: string } })
			.openai.instructions
	).toBe(prompt);
	expect((other as Record<string, unknown>).system).toBe(prompt);
});
