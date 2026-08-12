import { StreamEventSchema, type StreamEvent } from '@biocontext/engine/stream/types';

/**
 * Parse a Server-Sent Events stream from a Response
 */
export async function* parseSSEStream(response: Response): AsyncGenerator<StreamEvent> {
	if (!response.body) {
		throw new Error('Response body is null');
	}

	const decoder = new TextDecoder();
	let buffer = '';
	let eventDataLines: string[] = [];

	const reader = (
		response.body as unknown as { getReader: () => ReadableStreamDefaultReader<Uint8Array> }
	).getReader();

	const parseEvent = (eventData: string) => {
		try {
			const parsed = JSON.parse(eventData);
			return StreamEventSchema.parse(parsed);
		} catch (error) {
			console.error('Failed to parse SSE event:', error);
			return null;
		}
	};

	const processLine = (rawLine: string) => {
		const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
		if (line.startsWith('data: ')) {
			eventDataLines.push(line.slice(6));
			return null;
		}
		if (line === '' && eventDataLines.length > 0) {
			const eventData = eventDataLines.join('\n');
			eventDataLines = [];
			return parseEvent(eventData);
		}
		return null;
	};

	try {
		while (true) {
			const { value, done } = await reader.read();
			if (done) break;
			buffer += decoder.decode(value ?? new Uint8Array(), { stream: true });

			// Process complete events from buffer
			const lines = buffer.split('\n');
			buffer = lines.pop() ?? ''; // Keep incomplete line in buffer

			for (const line of lines) {
				const parsedEvent = processLine(line);
				if (parsedEvent) {
					yield parsedEvent;
				}
			}
		}
	} finally {
		reader.releaseLock();
	}

	buffer += decoder.decode();

	// Process any remaining lines in buffer.
	for (const line of buffer.split('\n')) {
		const parsedEvent = processLine(line);
		if (parsedEvent) {
			yield parsedEvent;
		}
	}

	// If stream ended without trailing blank line, still emit buffered event data.
	if (eventDataLines.length > 0) {
		const parsedEvent = parseEvent(eventDataLines.join('\n'));
		if (parsedEvent) yield parsedEvent;
	}
}
