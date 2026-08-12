import { createOpenAI } from '@ai-sdk/openai';
import * as os from 'node:os';

const DEFAULT_BASE_URL = 'https://api.githubcopilot.com';
const USER_AGENT = `biocontext/${process.env.npm_package_version ?? 'dev'} (${os.platform()} ${os.release()}; ${os.arch()})`;

const normalizeBody = (body: unknown) => {
	if (typeof body === 'string') return body;
	if (body instanceof Uint8Array) return new TextDecoder().decode(body);
	if (body instanceof ArrayBuffer) return new TextDecoder().decode(new Uint8Array(body));
	return undefined;
};

const parseBody = (bodyText?: string) => {
	if (!bodyText) return undefined;
	try {
		return JSON.parse(bodyText) as Record<string, unknown>;
	} catch {
		return undefined;
	}
};

const hasImageUrl = (content: unknown) =>
	Array.isArray(content) &&
	content.some((part) => part && typeof part === 'object' && part.type === 'image_url');

const hasInputImage = (content: unknown) =>
	Array.isArray(content) &&
	content.some((part) => part && typeof part === 'object' && part.type === 'input_image');

const hasMessageImage = (content: unknown) =>
	Array.isArray(content) &&
	content.some((part) => {
		if (!part || typeof part !== 'object') return false;
		if (part.type === 'image') return true;
		if (part.type !== 'tool_result') return false;
		const nested = (part as { content?: unknown }).content;
		return (
			Array.isArray(nested) &&
			nested.some((item) => item && typeof item === 'object' && item.type === 'image')
		);
	});

const detectFromCompletions = (body: Record<string, unknown>, url: string) => {
	if (!url.includes('completions')) return;
	const messages = body.messages;
	if (!Array.isArray(messages) || messages.length === 0) return;
	const last = messages[messages.length - 1] as { role?: string } | undefined;
	return {
		isVision: messages.some((msg) => hasImageUrl((msg as { content?: unknown }).content)),
		isAgent: last?.role !== 'user'
	};
};

const detectFromResponses = (body: Record<string, unknown>) => {
	const input = body.input;
	if (!Array.isArray(input) || input.length === 0) return;
	const last = input[input.length - 1] as { role?: string } | undefined;
	return {
		isVision: input.some((item) => hasInputImage((item as { content?: unknown }).content)),
		isAgent: last?.role !== 'user'
	};
};

const detectFromMessages = (body: Record<string, unknown>) => {
	const messages = body.messages;
	if (!Array.isArray(messages) || messages.length === 0) return;
	const last = messages[messages.length - 1] as { role?: string; content?: unknown } | undefined;
	const hasNonToolCalls =
		Array.isArray(last?.content) &&
		last.content.some((part) => part && typeof part === 'object' && part.type !== 'tool_result');
	return {
		isVision: messages.some((msg) => hasMessageImage((msg as { content?: unknown }).content)),
		isAgent: !(last?.role === 'user' && hasNonToolCalls)
	};
};

const detectInitiator = (url: string, body?: Record<string, unknown>) => {
	if (!body) return { isAgent: false, isVision: false };
	return (
		detectFromCompletions(body, url) ||
		detectFromResponses(body) ||
		detectFromMessages(body) || { isAgent: false, isVision: false }
	);
};

const buildHeaders = (initHeaders: unknown) => {
	const headers = new Headers();

	if (initHeaders instanceof Headers) {
		initHeaders.forEach((value, key) => headers.set(key, value));
	} else if (Array.isArray(initHeaders)) {
		for (const [key, value] of initHeaders) {
			if (value !== undefined) headers.set(key, String(value));
		}
	} else if (initHeaders && typeof initHeaders === 'object') {
		for (const [key, value] of Object.entries(initHeaders as Record<string, unknown>)) {
			if (value !== undefined) headers.set(key, String(value));
		}
	}

	return headers;
};

const shouldUseResponsesApi = (modelId: string) => {
	const lower = modelId.toLowerCase();
	return lower.startsWith('gpt-5') && !lower.startsWith('gpt-5-mini');
};

export const createCopilotProvider = (
	options: {
		apiKey?: string;
		baseURL?: string;
		headers?: Record<string, string>;
		name?: string;
	} = {}
) => {
	const customFetch = (async (requestInput, init) => {
		const url =
			requestInput instanceof Request ? requestInput.url : new URL(String(requestInput)).toString();
		const bodyText = normalizeBody(init?.body);
		const parsedBody = parseBody(bodyText);
		const { isAgent, isVision } = detectInitiator(url, parsedBody);

		const headerSource =
			init?.headers ?? (requestInput instanceof Request ? requestInput.headers : undefined);
		const headers = buildHeaders(headerSource);
		headers.set('x-initiator', isAgent ? 'agent' : 'user');
		headers.set('User-Agent', USER_AGENT);
		headers.set('Openai-Intent', 'conversation-edits');
		headers.delete('x-api-key');
		headers.delete('authorization');
		if (options.apiKey) {
			headers.set('Authorization', `Bearer ${options.apiKey}`);
		}
		if (isVision) {
			headers.set('Copilot-Vision-Request', 'true');
		}

		return fetch(requestInput, { ...init, headers });
	}) as typeof fetch;

	if (fetch.preconnect) {
		customFetch.preconnect = fetch.preconnect.bind(fetch);
	}

	const provider = createOpenAI({
		apiKey: options.apiKey,
		baseURL: options.baseURL ?? DEFAULT_BASE_URL,
		headers: options.headers,
		name: options.name,
		fetch: customFetch
	}) as ReturnType<typeof createOpenAI> & {
		chat?: (modelId: string) => unknown;
		responses: (modelId: string) => unknown;
	};

	return (modelId: string) =>
		shouldUseResponsesApi(modelId)
			? provider.responses(modelId)
			: provider.chat
				? provider.chat(modelId)
				: provider(modelId);
};
