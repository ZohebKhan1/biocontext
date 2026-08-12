import { describe, expect, test } from 'bun:test';
import type { StreamEvent } from '@biocontext/engine/stream/types';

import { parseSSEStream } from './stream.ts';

const readEvents = async (chunks: string[]) => {
	const encoder = new TextEncoder();
	const response = new Response(
		new ReadableStream<Uint8Array>({
			start(controller) {
				for (const chunk of chunks) {
					controller.enqueue(encoder.encode(chunk));
				}
				controller.close();
			}
		})
	);

	const events: StreamEvent[] = [];
	for await (const event of parseSSEStream(response)) {
		events.push(event);
	}
	return events;
};

describe('parseSSEStream', () => {
	test('emits an event when blank-line terminator arrives in a later chunk', async () => {
		const events = await readEvents([
			'event: text.delta\n',
			'data: {"type":"text.delta","delta":"hello"}\n',
			'\n'
		]);

		expect(events).toEqual([{ type: 'text.delta', delta: 'hello' }]);
	});

	test('emits an event when a data line is split across chunks', async () => {
		const events = await readEvents(['data: {"type":"text.delta","de', 'lta":"split"}\n\n']);

		expect(events).toEqual([{ type: 'text.delta', delta: 'split' }]);
	});
});
