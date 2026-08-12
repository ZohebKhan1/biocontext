import { createOpenAI } from '@ai-sdk/openai';
import * as os from 'node:os';
import { getCredentials, setCredentials } from './auth.ts';

const CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
const ISSUER = 'https://auth.openai.com';
const CODEX_API_ENDPOINT = 'https://chatgpt.com/backend-api/codex/responses';
const USER_AGENT = `biocontext/${process.env.npm_package_version ?? 'dev'} (${os.platform()} ${os.release()}; ${os.arch()})`;
export const CODEX_SSE_RETRY_ATTEMPTS = 6;
const CODEX_SSE_PREFLIGHT_BYTES = 64 * 1024;
export const codexSseRetryBackoffMs = (failedAttempt: number): number =>
	Math.min(30_000, 2_000 * 2 ** Math.max(0, failedAttempt - 1));

type TokenResponse = {
	id_token?: string;
	access_token: string;
	refresh_token?: string;
	expires_in?: number;
};

type IdTokenClaims = {
	chatgpt_account_id?: string;
	organizations?: Array<{ id: string }>;
	email?: string;
	'https://api.openai.com/auth'?: {
		chatgpt_account_id?: string;
	};
};

const parseJwtClaims = (token: string): IdTokenClaims | undefined => {
	const parts = token.split('.');
	if (parts.length !== 3 || !parts[1]) return undefined;
	try {
		return JSON.parse(Buffer.from(parts[1], 'base64url').toString()) as IdTokenClaims;
	} catch {
		return undefined;
	}
};

const extractAccountIdFromClaims = (claims: IdTokenClaims): string | undefined =>
	claims.chatgpt_account_id ||
	claims['https://api.openai.com/auth']?.chatgpt_account_id ||
	claims.organizations?.[0]?.id;

const extractAccountId = (tokens: TokenResponse): string | undefined => {
	if (tokens.id_token) {
		const claims = parseJwtClaims(tokens.id_token);
		const accountId = claims && extractAccountIdFromClaims(claims);
		if (accountId) return accountId;
	}
	if (tokens.access_token) {
		const claims = parseJwtClaims(tokens.access_token);
		return claims ? extractAccountIdFromClaims(claims) : undefined;
	}
	return undefined;
};

const refreshAccessToken = async (refreshToken: string): Promise<TokenResponse> => {
	const response = await fetch(`${ISSUER}/oauth/token`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			grant_type: 'refresh_token',
			refresh_token: refreshToken,
			client_id: CLIENT_ID
		}).toString()
	});
	if (!response.ok) {
		throw new Error(`Token refresh failed: ${response.status}`);
	}
	return response.json() as Promise<TokenResponse>;
};

const buildHeaders = (initHeaders: unknown, accountId?: string): Headers => {
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

	if (accountId) {
		headers.set('ChatGPT-Account-Id', accountId);
	}

	return headers;
};

const rewriteUrl = (requestInput: unknown) => {
	const parsed =
		requestInput instanceof URL
			? requestInput
			: new URL(
					typeof requestInput === 'string'
						? requestInput
						: requestInput instanceof Request
							? requestInput.url
							: String(requestInput)
				);

	return parsed.pathname.includes('/v1/responses') || parsed.pathname.includes('/chat/completions')
		? new URL(CODEX_API_ENDPOINT)
		: parsed;
};

const normalizeBody = (body: unknown): string | undefined => {
	if (typeof body === 'string') return body;
	if (body instanceof Uint8Array) return new TextDecoder().decode(body);
	if (body instanceof ArrayBuffer) return new TextDecoder().decode(new Uint8Array(body));
	return undefined;
};

export const isStreamingCodexPayload = (init: RequestInit | undefined): boolean => {
	const body = normalizeBody(init?.body);
	if (!body) return false;
	try {
		return (JSON.parse(body) as Record<string, unknown>).stream === true;
	} catch {
		return false;
	}
};

type CodexSseInspection = {
	response: Response;
	retryableEarlyError: boolean;
};

const sseData = (frame: string): string =>
	frame
		.replaceAll('\r\n', '\n')
		.split('\n')
		.filter((line) => line.startsWith('data:'))
		.map((line) => line.slice(5).trimStart())
		.join('\n');

const inspectCodexSseFrame = (frame: string): 'prelude' | 'retry' | 'pass' => {
	const data = sseData(frame);
	if (!data) return 'prelude';
	if (data === '[DONE]') return 'pass';
	try {
		const event = JSON.parse(data) as Record<string, unknown>;
		if (
			['response.created', 'response.in_progress', 'response.queued'].includes(String(event.type))
		)
			return 'prelude';
		if (event.type !== 'error' || !event.error || typeof event.error !== 'object') return 'pass';
		const error = event.error as Record<string, unknown>;
		const code = String(error.code ?? '');
		const type = String(error.type ?? '');
		const message = String(error.message ?? '');
		return code === 'server_is_overloaded' ||
			code === 'server_error' ||
			code === 'internal_server_error' ||
			type === 'service_unavailable_error' ||
			type === 'server_error' ||
			type === 'internal_server_error' ||
			/temporarily unavailable|server(?:_is_)?_?overloaded|retry your request/iu.test(message)
			? 'retry'
			: 'pass';
	} catch {
		return 'pass';
	}
};

const concatenateBytes = (chunks: Uint8Array[], length: number): Uint8Array => {
	const combined = new Uint8Array(length);
	let offset = 0;
	for (const chunk of chunks) {
		combined.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return combined;
};

const rebuildResponse = (
	response: Response,
	reader: ReadableStreamDefaultReader<Uint8Array>,
	prefix: Uint8Array
): Response => {
	const body = new ReadableStream<Uint8Array>({
		start(controller) {
			controller.enqueue(prefix);
			const pump = async () => {
				try {
					while (true) {
						const next = await reader.read();
						if (next.done) break;
						controller.enqueue(next.value);
					}
					controller.close();
				} catch (error) {
					controller.error(error);
				}
			};
			void pump();
		},
		cancel(reason) {
			return reader.cancel(reason);
		}
	});
	return new Response(body, {
		status: response.status,
		statusText: response.statusText,
		headers: response.headers
	});
};

/**
 * The Codex backend can report transient capacity as an HTTP-200 SSE error after
 * only response.created/in_progress events. Buffer that tiny prelude so the
 * transport can retry an otherwise empty model step without replaying the
 * agent's completed tool steps. Once any content event appears, pass through
 * immediately and never retry a partially generated response.
 */
export const inspectEarlyCodexSse = async (response: Response): Promise<CodexSseInspection> => {
	if (!response.body) return { response, retryableEarlyError: false };
	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	const chunks: Uint8Array[] = [];
	let length = 0;
	let decoded = '';
	let retryableEarlyError = false;
	let pass = false;
	while (length < CODEX_SSE_PREFLIGHT_BYTES && !retryableEarlyError && !pass) {
		const next = await reader.read();
		if (next.done) break;
		chunks.push(next.value);
		length += next.value.byteLength;
		decoded += decoder.decode(next.value, { stream: true });
		const frames = decoded.split(/\r?\n\r?\n/u);
		decoded = frames.pop() ?? '';
		for (const frame of frames) {
			const decision = inspectCodexSseFrame(frame);
			if (decision === 'retry') retryableEarlyError = true;
			else if (decision === 'pass') pass = true;
		}
	}
	const rebuilt = rebuildResponse(response, reader, concatenateBytes(chunks, length));
	return { response: rebuilt, retryableEarlyError };
};

export const fetchCodexWithSseRetry = async (
	request: () => Promise<Response>,
	sleep: (delayMs: number) => Promise<unknown> = Bun.sleep
): Promise<Response> => {
	for (let attempt = 1; attempt <= CODEX_SSE_RETRY_ATTEMPTS; attempt += 1) {
		const inspected = await inspectEarlyCodexSse(await request());
		if (!inspected.retryableEarlyError || attempt === CODEX_SSE_RETRY_ATTEMPTS)
			return inspected.response;
		await inspected.response.body?.cancel();
		await sleep(codexSseRetryBackoffMs(attempt));
	}
	throw new Error('unreachable Codex SSE retry state');
};

const sanitizeCodexPayload = (parsed: Record<string, unknown>) => {
	parsed.store = false;
	if ('previous_response_id' in parsed) {
		delete parsed.previous_response_id;
	}
	const input = parsed.input;
	if (!Array.isArray(input)) return;
	parsed.input = input
		.filter(
			(item) =>
				!(item && typeof item === 'object' && 'type' in item && item.type === 'item_reference')
		)
		.map((item) => {
			if (!item || typeof item !== 'object') return item;
			// Strip item IDs to avoid referencing non-persisted items when store=false.
			const { id: _unused, ...rest } = item as Record<string, unknown>;
			return rest;
		});
};

export const injectCodexDefaults = (
	init: RequestInit | undefined,
	instructions?: string
): RequestInit | undefined => {
	if (!instructions) return init;
	const bodyText = normalizeBody(init?.body);
	if (!bodyText) return init;

	try {
		const parsed = JSON.parse(bodyText) as Record<string, unknown>;
		if (parsed.instructions == null) {
			parsed.instructions = instructions;
		}
		sanitizeCodexPayload(parsed);
		return { ...init, body: JSON.stringify(parsed) };
	} catch {
		return init;
	}
};

export function createOpenAICodex(
	options: {
		apiKey?: string;
		accountId?: string;
		baseURL?: string;
		headers?: Record<string, string>;
		name?: string;
		instructions?: string;
		sessionId?: string;
	} = {}
) {
	const customFetch = (async (requestInput, init) => {
		const storedAuth = await getCredentials('openai');
		let accessToken = options.apiKey;
		let accountId = options.accountId;

		if (storedAuth?.type === 'oauth') {
			accessToken = storedAuth.access;
			accountId = storedAuth.accountId ?? accountId;

			if (!storedAuth.access || storedAuth.expires < Date.now()) {
				const tokens = await refreshAccessToken(storedAuth.refresh);
				const refreshedAccountId = extractAccountId(tokens) ?? accountId;
				accessToken = tokens.access_token;
				accountId = refreshedAccountId;
				await setCredentials('openai', {
					type: 'oauth',
					refresh: tokens.refresh_token ?? storedAuth.refresh,
					access: tokens.access_token,
					expires: Date.now() + (tokens.expires_in ?? 3600) * 1000,
					...(refreshedAccountId ? { accountId: refreshedAccountId } : {})
				});
			}
		}

		const url = rewriteUrl(requestInput);
		const headerSource =
			init?.headers ?? (requestInput instanceof Request ? requestInput.headers : undefined);
		const headers = buildHeaders(headerSource, accountId);
		const fallbackInstructions =
			options.instructions ??
			'You are biocontext, a source-grounded Bioconductor package research agent.';
		const nextInit = injectCodexDefaults(init, fallbackInstructions);
		headers.set('originator', 'opencode');
		headers.set('User-Agent', USER_AGENT);
		if (options.sessionId) {
			headers.set('session_id', options.sessionId);
		}
		if (accessToken) {
			headers.set('authorization', `Bearer ${accessToken}`);
		}
		const request = () => fetch(url, { ...nextInit, headers });
		return isStreamingCodexPayload(nextInit) ? fetchCodexWithSseRetry(request) : request();
	}) as typeof fetch;

	if (fetch.preconnect) {
		customFetch.preconnect = fetch.preconnect.bind(fetch);
	}

	return createOpenAI({
		apiKey: options.apiKey,
		baseURL: options.baseURL,
		headers: options.headers,
		name: options.name,
		fetch: customFetch
	});
}
