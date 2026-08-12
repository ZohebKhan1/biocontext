import { Effect } from 'effect';
import type { ReasoningEffort } from '@biocontext/shared';
import type { EvidenceEnvelope } from '@biocontext/engine/stream/types';

export type Client = {
	baseUrl: string;
};

export type ConfigResponse = {
	provider: string;
	model: string;
	reasoningEffort?: ReasoningEffort;
	providerTimeoutMs: number | null;
	maxSteps: number;
	resourcesDirectory: string;
	resourceCount: number;
};

export type RuntimeStatusResponse = {
	localBioconductorPackageCount: number;
	defaultBioconductorPackages?: {
		state: 'idle' | 'running' | 'complete' | 'partial';
		total: number;
		ready: number;
		failed: string[];
	};
	provider: string;
	providerName?: string;
	model: string;
	reasoningEffort?: ReasoningEffort;
	auth:
		| { status: 'ok'; authType: 'api' | 'oauth' | 'wellknown' }
		| { status: 'missing' }
		| { status: 'invalid'; authType: 'api' | 'oauth' | 'wellknown' };
};

export type ResourceRecord =
	| {
			type: 'git';
			name: string;
			url: string;
			branch: string;
			searchPath?: string | null;
			searchPaths?: string[] | null;
			specialNotes?: string | null;
	  }
	| {
			type: 'local';
			name: string;
			path: string;
			specialNotes?: string | null;
	  }
	| {
			type: 'bioconductor';
			name: string;
			package: string;
			release?: string | null;
			documents?: BioconductorDocumentType[] | null;
			includeCurated?: boolean | null;
			source?: boolean | string | null;
			sourceBranch?: string | null;
			sourceCommit?: string | null;
			specialNotes?: string | null;
	  }
	| {
			type: 'cran';
			name: string;
			package: string;
			specialNotes?: string | null;
	  };

export type ResourcesResponse = {
	resources: ResourceRecord[];
};

export type ProvidersResponse = {
	all: Array<{ id: string; models: Record<string, unknown> }>;
	connected: string[];
};

/**
 * Custom error class that carries hints from the server.
 */
export class EngineError extends Error {
	readonly hint?: string;
	readonly tag?: string;

	constructor(message: string, options?: { hint?: string; tag?: string }) {
		super(message);
		this.name = 'EngineError';
		this.hint = options?.hint;
		this.tag = options?.tag;
	}
}

/**
 * Parse error response from server and create a EngineError.
 */
const parseErrorResponse = (
	res: Response,
	fallbackMessage: string
): Effect.Effect<EngineError, never> => {
	const normalizeMessage = (message: string) => {
		if (message.startsWith('Unhandled exception:')) {
			const stripped = message.slice('Unhandled exception:'.length).trim();
			if (stripped.length > 0) return stripped;
		}
		if (message === 'match err handler threw' || message === 'match ok handler threw') {
			return 'Internal error while processing a result. Check the server logs for details.';
		}
		return message;
	};

	return Effect.match(
		Effect.tryPromise(() => res.json() as Promise<unknown>),
		{
			onFailure: () => new EngineError(fallbackMessage),
			onSuccess: (body) => {
				if (!body || typeof body !== 'object') {
					return new EngineError(fallbackMessage);
				}
				const parsed = body as { error?: string; hint?: string; tag?: string };
				return new EngineError(normalizeMessage(parsed.error ?? fallbackMessage), {
					hint: parsed.hint,
					tag: parsed.tag
				});
			}
		}
	);
};

const requestJson = <T>(
	url: string,
	init: RequestInit | undefined,
	fallbackMessage: string
): Effect.Effect<T, EngineError> =>
	Effect.gen(function* () {
		const response = yield* Effect.tryPromise({
			try: () => fetch(url, init),
			catch: (error) => new EngineError(String(error))
		});
		if (!response.ok) {
			const parsedError = yield* parseErrorResponse(
				response,
				`${fallbackMessage}: ${response.status}`
			);
			return yield* Effect.fail(parsedError);
		}
		return (yield* Effect.tryPromise({
			try: () => response.json() as Promise<T>,
			catch: (error) => new EngineError(String(error))
		})) as T;
	});

/**
 * Create a client descriptor for the embedded retrieval service.
 */
export function createClient(baseUrl: string): Client {
	return { baseUrl };
}

/**
 * Get server configuration
 */
export const getConfigEffect = (client: Client): Effect.Effect<ConfigResponse, EngineError> =>
	requestJson<ConfigResponse>(`${client.baseUrl}/config`, undefined, 'Failed to get config');

export const getConfig = (client: Client) => Effect.runPromise(getConfigEffect(client));

export const getRuntimeStatusEffect = (
	client: Client
): Effect.Effect<RuntimeStatusResponse, EngineError> =>
	requestJson<RuntimeStatusResponse>(
		`${client.baseUrl}/status`,
		undefined,
		'Failed to get runtime status'
	);

/**
 * Get available resources
 */
export const getResourcesEffect = (client: Client): Effect.Effect<ResourcesResponse, EngineError> =>
	requestJson<ResourcesResponse>(
		`${client.baseUrl}/resources`,
		undefined,
		'Failed to get resources'
	);

export const getResources = (client: Client) => Effect.runPromise(getResourcesEffect(client));

export const getProvidersEffect = (client: Client): Effect.Effect<ProvidersResponse, EngineError> =>
	requestJson<ProvidersResponse>(
		`${client.baseUrl}/providers`,
		undefined,
		'Failed to get providers'
	);

export const getProviders = (client: Client) => Effect.runPromise(getProvidersEffect(client));

/**
 * Ask a question (non-streaming)
 */
export const askQuestionEffect = (
	client: Client,
	options: {
		question: string;
		resources?: string[];
		quiet?: boolean;
	}
): Effect.Effect<
	{ answer: string; evidence: EvidenceEnvelope; model: { provider: string; model: string } },
	EngineError
> =>
	requestJson<{
		answer: string;
		evidence: EvidenceEnvelope;
		model: { provider: string; model: string };
	}>(
		`${client.baseUrl}/question`,
		{
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				question: options.question,
				resources: options.resources,
				quiet: options.quiet
			})
		},
		'Failed to ask question'
	);

export const askQuestion = (
	client: Client,
	options: {
		question: string;
		resources?: string[];
		quiet?: boolean;
	}
) => Effect.runPromise(askQuestionEffect(client, options));

/**
 * Ask a question (streaming) - returns the raw Response for SSE parsing
 */
export const askQuestionStreamEffect = (
	baseUrl: string,
	options: {
		question: string;
		resources?: string[];
		quiet?: boolean;
		signal?: AbortSignal;
	}
): Effect.Effect<Response, EngineError> =>
	Effect.gen(function* () {
		const response = yield* Effect.tryPromise({
			try: () =>
				fetch(`${baseUrl}/question/stream`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json'
					},
					body: JSON.stringify({
						question: options.question,
						resources: options.resources,
						quiet: options.quiet
					}),
					signal: options.signal
				}),
			catch: (error) => new EngineError(String(error))
		});

		if (!response.ok) {
			const parsedError = yield* parseErrorResponse(
				response,
				`Failed to ask question: ${response.status}`
			);
			return yield* Effect.fail(parsedError);
		}

		return response;
	});

export const askQuestionStream = (
	baseUrl: string,
	options: {
		question: string;
		resources?: string[];
		quiet?: boolean;
		signal?: AbortSignal;
	}
) => Effect.runPromise(askQuestionStreamEffect(baseUrl, options));

/**
 * Update model configuration
 */
export type ProviderOptionsInput = {
	baseURL?: string;
	name?: string;
	reasoningEffort?: ReasoningEffort;
};

export type ModelUpdateResult = {
	provider: string;
	model: string;
	savedTo: 'project' | 'global';
};

export const updateModelEffect = (
	baseUrl: string,
	provider: string,
	model: string,
	providerOptions?: ProviderOptionsInput
): Effect.Effect<ModelUpdateResult, EngineError> =>
	requestJson<ModelUpdateResult>(
		`${baseUrl}/config/model`,
		{
			method: 'PUT',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				provider,
				model,
				...(providerOptions ? { providerOptions } : {})
			})
		},
		'Failed to update model'
	);

export const updateModel = (
	baseUrl: string,
	provider: string,
	model: string,
	providerOptions?: ProviderOptionsInput
) => Effect.runPromise(updateModelEffect(baseUrl, provider, model, providerOptions));

export interface GitResourceInput {
	type: 'git';
	name: string;
	url: string;
	branch?: string;
	searchPath?: string;
	searchPaths?: string[];
	specialNotes?: string;
}

export interface LocalResourceInput {
	type: 'local';
	name: string;
	path: string;
	specialNotes?: string;
}

export type BioconductorDocumentType = 'vignettes' | 'vignetteScripts' | 'manual' | 'news';

export interface BioconductorResourceInput {
	type: 'bioconductor';
	name: string;
	package: string;
	release?: string;
	/** Which published documents to download; omitted means all. */
	documents?: BioconductorDocumentType[];
	includeCurated?: boolean;
	/** A string selects custom_git; booleans are accepted only for legacy config compatibility. */
	source?: boolean | string;
	sourceBranch?: string;
	sourceCommit?: string;
	specialNotes?: string;
}

export interface CranResourceInput {
	type: 'cran';
	name: string;
	package: string;
	specialNotes?: string;
}

export type ResourceInput =
	| GitResourceInput
	| LocalResourceInput
	| BioconductorResourceInput
	| CranResourceInput;

export type BioconductorPackageSummary = {
	name: string;
	version: string;
	title: string;
	repository: string;
	repositoryLabel: string;
	vignetteCount: number;
	/** Exact versioned source archive selected for this package. */
	sourceUrl: string;
	sourceKind: 'bioconductor_archive';
};

export type BioconductorPackagesResponse = {
	release: string;
	fetchedAt: string;
	total: number;
	packages: BioconductorPackageSummary[];
};

export type LocalBioconductorPackageNamesResponse = {
	packages: string[];
};

export type BioconductorVerificationResult = {
	status: 'complete' | 'partial' | 'invalid';
	package: string;
	directory: string;
	failures: Array<{ code: string; message: string; path?: string }>;
};

export type BioconductorPackageRemovalResult = {
	package: string;
	removedConfigResources: readonly string[];
	cleanupPending: boolean;
};

export type BioconductorReleaseResponse = {
	release: {
		release: string;
		devel?: string;
		rVersion?: string;
		fetchedAt: string;
	} | null;
};

/** Current Bioconductor release series, for display. Cached daily by the engine. */
export const getBioconductorReleaseEffect = (
	baseUrl: string
): Effect.Effect<BioconductorReleaseResponse, EngineError> =>
	requestJson<BioconductorReleaseResponse>(
		`${baseUrl}/bioconductor/release`,
		{ method: 'GET' },
		'Failed to read the Bioconductor release'
	);

/** Canonical locally available package names for @mention autocomplete. */
export const getLocalBioconductorPackageNamesEffect = (
	baseUrl: string
): Effect.Effect<LocalBioconductorPackageNamesResponse, EngineError> =>
	requestJson<LocalBioconductorPackageNamesResponse>(
		`${baseUrl}/bioconductor/local-package-names`,
		{ method: 'GET' },
		'Failed to load local Bioconductor package names'
	);

export const verifyBioconductorPackageEffect = (
	baseUrl: string,
	packageName: string
): Effect.Effect<BioconductorVerificationResult, EngineError> =>
	requestJson<BioconductorVerificationResult>(
		`${baseUrl}/bioconductor/verify?package=${encodeURIComponent(packageName)}`,
		{ method: 'GET' },
		'Failed to verify the Bioconductor package'
	);

/** Remove one validated managed package cache without network access. */
export const removeBioconductorPackageEffect = (
	baseUrl: string,
	packageName: string
): Effect.Effect<BioconductorPackageRemovalResult, EngineError> =>
	requestJson<BioconductorPackageRemovalResult>(
		`${baseUrl}/bioconductor/packages`,
		{
			method: 'DELETE',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ package: packageName, confirmed: true })
		},
		'Failed to remove the managed package'
	);

/**
 * Search the Bioconductor package index.
 *
 * The engine caches the index on disk, so only the first call in a week
 * reaches bioconductor.org.
 */
export const searchBioconductorPackagesEffect = (
	baseUrl: string,
	query: string,
	options: { limit?: number; refresh?: boolean } = {}
): Effect.Effect<BioconductorPackagesResponse, EngineError> => {
	const params = new URLSearchParams();
	if (query.trim()) params.set('q', query.trim());
	if (options.limit) params.set('limit', String(options.limit));
	if (options.refresh) params.set('refresh', 'true');
	const suffix = params.size > 0 ? `?${params.toString()}` : '';
	return requestJson<BioconductorPackagesResponse>(
		`${baseUrl}/bioconductor/packages${suffix}`,
		{ method: 'GET' },
		'Failed to search Bioconductor packages'
	);
};

/**
 * Add a new resource
 */
export const addResourceEffect = (
	baseUrl: string,
	resource: ResourceInput
): Effect.Effect<ResourceInput, EngineError> =>
	requestJson<ResourceInput>(
		`${baseUrl}/config/resources`,
		{
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(resource)
		},
		'Failed to add resource'
	);

export const addResource = (baseUrl: string, resource: ResourceInput) =>
	Effect.runPromise(addResourceEffect(baseUrl, resource));

/** Replace an existing resource definition, keeping its name. */
export const updateResourceEffect = (
	baseUrl: string,
	resource: ResourceInput
): Effect.Effect<ResourceInput, EngineError> =>
	requestJson<ResourceInput>(
		`${baseUrl}/config/resources`,
		{
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(resource)
		},
		'Failed to update resource'
	);

/**
 * Remove a resource
 */
export const removeResourceEffect = (
	baseUrl: string,
	name: string
): Effect.Effect<void, EngineError> =>
	Effect.asVoid(
		requestJson<{ success: boolean }>(
			`${baseUrl}/config/resources`,
			{
				method: 'DELETE',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ name })
			},
			'Failed to remove resource'
		)
	);

export const removeResource = (baseUrl: string, name: string) =>
	Effect.runPromise(removeResourceEffect(baseUrl, name));

/**
 * Clear all locally cloned resources
 */
export const clearResourcesEffect = (
	baseUrl: string
): Effect.Effect<{ cleared: number }, EngineError> =>
	requestJson<{ cleared: number }>(
		`${baseUrl}/clear`,
		{
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			}
		},
		'Failed to clear resources'
	);

export const clearResources = (baseUrl: string) => Effect.runPromise(clearResourcesEffect(baseUrl));
