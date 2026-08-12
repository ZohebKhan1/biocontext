import { expect, test } from 'bun:test';

import {
	CODEX_SSE_RETRY_ATTEMPTS,
	codexSseRetryBackoffMs,
	fetchCodexWithSseRetry,
	injectCodexDefaults,
	inspectEarlyCodexSse,
	isStreamingCodexPayload
} from './openai.ts';

const sseResponse = (...events: unknown[]): Response =>
	new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''), {
		headers: { 'content-type': 'text/event-stream' }
	});

test('injects OpenAI Responses instructions exactly once as a fallback', () => {
	const instructions = 'unique agent instructions';
	const init = injectCodexDefaults(
		{
			body: JSON.stringify({
				model: 'gpt-test',
				input: [
					{ type: 'item_reference', id: 'old-item' },
					{ type: 'message', role: 'user', content: 'question' }
				]
			})
		},
		instructions
	);
	const payload = JSON.parse(String(init?.body)) as Record<string, unknown>;

	expect(payload.instructions).toBe(instructions);
	expect(JSON.stringify(payload).split(instructions).length - 1).toBe(1);
	expect(payload.system).toBeUndefined();
	expect(payload.store).toBe(false);
	expect(payload.previous_response_id).toBeUndefined();
	expect(payload.input).toEqual([{ type: 'message', role: 'user', content: 'question' }]);
});

test('does not replace serialized instructions supplied by the SDK', () => {
	const supplied = 'serialized instructions';
	const fallback = 'fallback instructions';
	const init = injectCodexDefaults(
		{ body: JSON.stringify({ instructions: supplied, input: [] }) },
		fallback
	);
	const payload = JSON.parse(String(init?.body)) as Record<string, unknown>;

	expect(payload.instructions).toBe(supplied);
	expect(JSON.stringify(payload).includes(fallback)).toBe(false);
});

test('detects streaming from the request payload when the backend omits response content type', () => {
	expect(isStreamingCodexPayload({ body: JSON.stringify({ stream: true }) })).toBe(true);
	expect(isStreamingCodexPayload({ body: JSON.stringify({ stream: false }) })).toBe(false);
});

test('preserves a successful SSE stream byte for byte after its prelude', async () => {
	const response = sseResponse(
		{ type: 'response.created', sequence_number: 0 },
		{ type: 'response.output_text.delta', sequence_number: 1, delta: 'answer' }
	);
	response.headers.delete('content-type');
	const original = await response.clone().text();
	const inspected = await inspectEarlyCodexSse(response);
	expect(inspected.retryableEarlyError).toBe(false);
	expect(await inspected.response.text()).toBe(original);
});

test('retries an empty overloaded SSE step but not completed prior agent steps', async () => {
	let calls = 0;
	const sleeps: number[] = [];
	const response = await fetchCodexWithSseRetry(
		async () => {
			calls += 1;
			return calls === 1
				? sseResponse(
						{ type: 'response.created', sequence_number: 0 },
						{ type: 'response.in_progress', sequence_number: 1 },
						{
							type: 'error',
							sequence_number: 2,
							error: {
								type: 'service_unavailable_error',
								code: 'server_is_overloaded',
								message: 'Our servers are currently overloaded.'
							}
						}
					)
				: sseResponse(
						{ type: 'response.created', sequence_number: 0 },
						{ type: 'response.output_text.delta', sequence_number: 1, delta: 'recovered' }
					);
		},
		async (delayMs) => sleeps.push(delayMs)
	);
	expect(calls).toBe(2);
	expect(sleeps).toEqual([2_000]);
	expect(await response.text()).toContain('recovered');
});

test('uses a bounded retry window for persistent empty SSE overloads', async () => {
	let calls = 0;
	const sleeps: number[] = [];
	const response = await fetchCodexWithSseRetry(
		async () => {
			calls += 1;
			return sseResponse({
				type: 'error',
				error: {
					type: 'service_unavailable_error',
					code: 'server_is_overloaded',
					message: 'temporarily unavailable'
				}
			});
		},
		async (delayMs) => sleeps.push(delayMs)
	);
	expect(calls).toBe(CODEX_SSE_RETRY_ATTEMPTS);
	expect(sleeps).toEqual([2_000, 4_000, 8_000, 16_000, 30_000]);
	expect(await response.text()).toContain('server_is_overloaded');
	expect(codexSseRetryBackoffMs(10)).toBe(30_000);
});

test('does not retry a non-transient SSE error', async () => {
	let calls = 0;
	const response = await fetchCodexWithSseRetry(async () => {
		calls += 1;
		return sseResponse(
			{ type: 'response.created', sequence_number: 0 },
			{
				type: 'error',
				sequence_number: 1,
				error: { type: 'invalid_request_error', code: 'invalid_request', message: 'bad request' }
			}
		);
	});
	expect(calls).toBe(1);
	expect(await response.text()).toContain('invalid_request');
});

test('retries a backend server_error that explicitly permits retry', async () => {
	let calls = 0;
	const response = await fetchCodexWithSseRetry(
		async () => {
			calls += 1;
			return calls === 1
				? sseResponse(
						{ type: 'response.created', sequence_number: 0 },
						{
							type: 'error',
							sequence_number: 1,
							error: {
								type: 'server_error',
								code: 'server_error',
								message: 'You can retry your request.'
							}
						}
					)
				: sseResponse({ type: 'response.output_text.delta', delta: 'recovered' });
		},
		async () => {}
	);
	expect(calls).toBe(2);
	expect(await response.text()).toContain('recovered');
});
