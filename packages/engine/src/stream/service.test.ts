import { describe, it, expect } from 'bun:test';

import { createSseStream } from './service.ts';
import type { StreamEvent } from './types.ts';
import type { AgentEvent } from '../agent/loop.ts';

const readStream = async (stream: ReadableStream<Uint8Array>) => {
	const decoder = new TextDecoder();
	let output = '';
	for await (const chunk of stream) {
		output += decoder.decode(chunk, { stream: true });
	}
	output += decoder.decode();
	return output;
};

const parseSseEvents = (payload: string) =>
	payload
		.split('\n\n')
		.map((chunk) => chunk.trim())
		.filter(Boolean)
		.map((chunk) => chunk.split('\n').find((line) => line.startsWith('data: ')))
		.filter((line): line is string => Boolean(line))
		.map((line) => JSON.parse(line.slice(6)) as StreamEvent);

describe('createSseStream', () => {
	it('uses finalized prose and evidence in done after streaming draft text', async () => {
		const evidence = {
			status: 'supported' as const,
			query: 'What?',
			searched_packages: ['DESeq2'],
			searched_documents: 1,
			results: [
				{
					id: 'E1',
					package: 'DESeq2',
					package_version: '1.52.0',
					bioc_release: '3.23',
					path: 'vignettes/DESeq2.md',
					line_start: 1,
					line_end: 2,
					source_type: 'bioconductor' as const,
					origin_type: 'vignette' as const,
					origin_url: 'https://example.org/vignette',
					repository_commit: null,
					content: 'evidence'
				}
			]
		};
		const eventStream = (async function* (): AsyncGenerator<AgentEvent> {
			yield { type: 'text-delta', text: 'Draft [[E1]]' } as const;
			yield {
				type: 'finish',
				finishReason: 'stop',
				text: 'Final [E1]\n\nSources:\n- [E1] canonical',
				evidence
			} as const;
		})();
		const stream = createSseStream({
			meta: {
				type: 'meta',
				model: { provider: 'test', model: 'test-model' },
				resources: ['DESeq2'],
				collection: { key: 'test', path: '/tmp' }
			},
			eventStream,
			question: 'What?'
		});
		const events = parseSseEvents(await readStream(stream));
		const done = events.find((event) => event.type === 'done');
		expect(done?.text).toBe('Final [E1]\n\nSources:\n- [E1] canonical');
		expect(done?.evidence).toEqual(evidence);
	});

	it('streams reasoning deltas and includes final reasoning in done', async () => {
		const eventStream = (async function* () {
			yield { type: 'reasoning-delta', text: 'First ' } as const;
			yield { type: 'reasoning-delta', text: 'Second' } as const;
			yield { type: 'text-delta', text: 'Answer' } as const;
			yield { type: 'finish', finishReason: 'stop' } as const;
		})();

		const stream = createSseStream({
			meta: {
				type: 'meta',
				model: { provider: 'test', model: 'test-model' },
				resources: ['DESeq2'],
				collection: { key: 'test', path: '/tmp' }
			},
			eventStream,
			question: 'What?'
		});

		const payload = await readStream(stream);
		const events = parseSseEvents(payload);

		const reasoningDeltaText = events
			.filter((event) => event.type === 'reasoning.delta')
			.map((event) => event.delta)
			.join('');
		expect(reasoningDeltaText).toBe('First Second');

		const doneEvent = events.find((event) => event.type === 'done');
		expect(doneEvent?.reasoning).toBe('First Second');
	});

	it('pairs tool updates by provider call ID and forwards actionable telemetry', async () => {
		const eventStream = (async function* (): AsyncGenerator<AgentEvent> {
			yield {
				type: 'tool-call',
				callId: 'provider-2',
				toolName: 'read',
				input: { path: 'a.md' }
			} as const;
			yield {
				type: 'tool-call',
				callId: 'provider-1',
				toolName: 'read',
				input: { path: 'b.md' }
			} as const;
			yield { type: 'tool-result', callId: 'provider-1', toolName: 'read', output: 'B' } as const;
			yield { type: 'tool-result', callId: 'provider-2', toolName: 'read', output: 'A' } as const;
			yield {
				type: 'finish',
				finishReason: 'stop',
				toolTelemetry: [
					{
						call_id: 'provider-1',
						tool: 'read',
						outcome: 'success',
						duration_ms: 4,
						result_bytes: 1
					}
				]
			} as const;
		})();
		const stream = createSseStream({
			meta: {
				type: 'meta',
				model: { provider: 'test', model: 'test-model' },
				resources: ['DESeq2'],
				collection: { key: 'test', path: '/tmp' }
			},
			eventStream,
			question: 'What?'
		});
		const events = parseSseEvents(await readStream(stream));
		const updates = events.filter(
			(event): event is Extract<StreamEvent, { type: 'tool.updated' }> =>
				event.type === 'tool.updated'
		);
		expect(updates.filter((event) => event.callID === 'provider-1').at(-1)?.state).toMatchObject({
			status: 'completed',
			output: 'B'
		});
		expect(updates.filter((event) => event.callID === 'provider-2').at(-1)?.state).toMatchObject({
			status: 'completed',
			output: 'A'
		});
		expect(events.find((event) => event.type === 'done')).toMatchObject({
			tool_telemetry: [{ call_id: 'provider-1' }]
		});
	});

	it('includes usage, timing, throughput, and pricing on done when available', async () => {
		const eventStream = (async function* () {
			yield { type: 'text-delta', text: 'Answer' } as const;
			await new Promise<void>((resolve) => setTimeout(resolve, 10));
			yield {
				type: 'finish',
				finishReason: 'stop',
				usage: {
					inputTokens: 1_000_000,
					outputTokens: 2_000_000,
					reasoningTokens: 250_000,
					totalTokens: 3_250_000
				}
			} as const;
		})();

		const stream = createSseStream({
			meta: {
				type: 'meta',
				model: { provider: 'openrouter', model: 'openai/gpt-4o-mini' },
				resources: ['DESeq2'],
				collection: { key: 'test', path: '/tmp' }
			},
			eventStream,
			requestStartMs: performance.now() - 50,
			pricing: {
				lookup: async () => ({
					source: 'models.dev' as const,
					modelKey: 'openai/gpt-4o-mini',
					ratesUsdPerMTokens: { input: 1, output: 2, reasoning: 0.5 }
				})
			}
		});

		const payload = await readStream(stream);
		const events = parseSseEvents(payload);

		const doneEvent = events.find((event) => event.type === 'done');
		expect(doneEvent && doneEvent.type).toBe('done');

		if (doneEvent?.type !== 'done') throw new Error('missing done event');

		expect(doneEvent.usage?.inputTokens).toBe(1_000_000);
		expect(doneEvent.usage?.outputTokens).toBe(2_000_000);
		expect(doneEvent.usage?.reasoningTokens).toBe(250_000);
		expect(doneEvent.usage?.totalTokens).toBe(3_250_000);

		expect(typeof doneEvent.metrics?.timing?.totalMs).toBe('number');
		expect(typeof doneEvent.metrics?.timing?.genMs).toBe('number');
		expect((doneEvent.metrics?.timing?.genMs ?? 0) > 0).toBe(true);

		expect(typeof doneEvent.metrics?.throughput?.outputTokensPerSecond).toBe('number');
		expect(typeof doneEvent.metrics?.throughput?.totalTokensPerSecond).toBe('number');

		expect(doneEvent.metrics?.pricing?.source).toBe('models.dev');
		expect(doneEvent.metrics?.pricing?.modelKey).toBe('openai/gpt-4o-mini');
		expect(doneEvent.metrics?.pricing?.ratesUsdPerMTokens?.input).toBe(1);

		// cost = (1.0 * 1) + (2.0 * 2) + (0.25 * 0.5) = 5.125
		expect(doneEvent.metrics?.pricing?.costUsd?.total).toBeCloseTo(5.125, 8);
	});

	it('does not throw if the client cancels before an error is emitted', async () => {
		const eventStream = (async function* () {
			await new Promise<void>((resolve) => setTimeout(resolve, 5));
			yield { type: 'error', error: new Error('boom') } as const;
			yield { type: 'finish', finishReason: 'stop' } as const;
		})();

		const stream = createSseStream({
			meta: {
				type: 'meta',
				model: { provider: 'test', model: 'test-model' },
				resources: ['DESeq2'],
				collection: { key: 'test', path: '/tmp' }
			},
			eventStream
		});

		const reader = stream.getReader();
		await reader.read(); // meta
		await reader.cancel();

		// Let the async event loop run; the test will fail if it triggers an unhandled throw/rejection.
		await new Promise<void>((resolve) => setTimeout(resolve, 25));

		expect(true).toBe(true);
	});

	it('prices cache-read and cache-write input separately when provider rates exist', async () => {
		const eventStream = (async function* () {
			yield {
				type: 'finish',
				finishReason: 'stop',
				usage: {
					inputTokens: 1_000_000,
					cachedInputTokens: 400_000,
					nonCachedInputTokens: 500_000,
					cacheWriteInputTokens: 100_000,
					outputTokens: 0,
					totalTokens: 1_000_000
				}
			} as const;
		})();
		const stream = createSseStream({
			meta: {
				type: 'meta',
				model: { provider: 'openrouter', model: 'cached-model' },
				resources: ['DESeq2'],
				collection: { key: 'test', path: '/tmp' }
			},
			eventStream,
			pricing: {
				lookup: async () => ({
					source: 'models.dev' as const,
					modelKey: 'cached-model',
					ratesUsdPerMTokens: { input: 2, cacheRead: 0.5, cacheWrite: 0.1 }
				})
			}
		});
		const events = parseSseEvents(await readStream(stream));
		const done = events.find((event) => event.type === 'done');
		if (done?.type !== 'done') throw new Error('missing done event');
		expect(done.usage?.cachedInputTokens).toBe(400_000);
		expect(done.metrics?.pricing?.costUsd?.input).toBeCloseTo(1.21, 8);
		expect(done.metrics?.pricing?.costUsd?.total).toBeCloseTo(1.21, 8);
	});
});
