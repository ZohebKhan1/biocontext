import { Effect } from 'effect';
import type { StreamEvent } from '@biocontext/engine/stream/types';

import {
	createClient,
	getConfigEffect,
	getRuntimeStatusEffect,
	getResourcesEffect,
	getProvidersEffect,
	askQuestionStreamEffect,
	updateModelEffect,
	addResourceEffect,
	updateResourceEffect,
	searchBioconductorPackagesEffect,
	getLocalBioconductorPackageNamesEffect,
	getBioconductorReleaseEffect,
	verifyBioconductorPackageEffect,
	removeResourceEffect,
	removeBioconductorPackageEffect,
	type ConfigResponse,
	type ProviderOptionsInput,
	type ResourceInput,
	type RuntimeStatusResponse,
	type LocalBioconductorPackageNamesResponse,
	type BioconductorPackagesResponse,
	type BioconductorReleaseResponse,
	type BioconductorVerificationResult,
	type BioconductorPackageRemovalResult
} from '../client/index.ts';
import { parseSSEStream } from '../client/stream.ts';
import { runCliEffect } from '../effect/runtime.ts';
import type { Repo, Chunk } from './types.ts';

// Get server URL from global (set by TUI launcher)
const getServerUrl = (): string => {
	const server = globalThis.__BIOCONTEXT_SERVER__;
	if (!server) throw new Error('Server not initialized');
	return server.url;
};

// Current request abort controller for cancellation
let currentAbortController: AbortController | null = null;

export type ChunkUpdate =
	| { type: 'add'; chunk: Chunk }
	| { type: 'update'; id: string; chunk: Partial<Chunk> };

export interface ModelUpdateResult {
	provider: string;
	model: string;
}

export const services = {
	/**
	 * Get all configured resources for @mention autocomplete
	 */
	getRepos: async (): Promise<Repo[]> => {
		return runCliEffect(
			Effect.gen(function* () {
				const client = createClient(getServerUrl());
				const { resources } = yield* getResourcesEffect(client);
				return resources.map((r) => ({
					name: r.name,
					type: r.type,
					url:
						r.type === 'git'
							? (r.url ?? '')
							: r.type === 'bioconductor' || r.type === 'cran'
								? (r.package ?? '')
								: (r.path ?? ''),
					branch: r.type === 'git' ? (r.branch ?? 'main') : 'main',
					specialNotes: r.specialNotes ?? undefined,
					searchPath: r.type === 'git' ? (r.searchPath ?? undefined) : undefined,
					searchPaths: r.type === 'git' ? (r.searchPaths ?? undefined) : undefined,
					package: r.type === 'bioconductor' || r.type === 'cran' ? (r.package ?? undefined) : undefined,
					release: r.type === 'bioconductor' ? (r.release ?? undefined) : undefined,
					documents: r.type === 'bioconductor' ? (r.documents ?? undefined) : undefined,
					includeCurated: r.type === 'bioconductor' ? (r.includeCurated ?? undefined) : undefined,
					source: r.type === 'bioconductor' ? (r.source ?? undefined) : undefined,
					sourceBranch: r.type === 'bioconductor' ? (r.sourceBranch ?? undefined) : undefined,
					sourceCommit: r.type === 'bioconductor' ? (r.sourceCommit ?? undefined) : undefined
				}));
			})
		);
	},

	/**
	 * Get current model config
	 */
	getModel: async (): Promise<Pick<ConfigResponse, 'provider' | 'model' | 'reasoningEffort'>> => {
		return runCliEffect(
			Effect.gen(function* () {
				const client = createClient(getServerUrl());
				const config = yield* getConfigEffect(client);
				return {
					provider: config.provider,
					model: config.model,
					reasoningEffort: config.reasoningEffort
				};
			})
		);
	},

	/** Local package count plus selected model/provider authentication mode. */
	getRuntimeStatus: async (): Promise<RuntimeStatusResponse> => {
		return runCliEffect(
			Effect.gen(function* () {
				const client = createClient(getServerUrl());
				return yield* getRuntimeStatusEffect(client);
			})
		);
	},

	/**
	 * Get provider connection status
	 */
	getProviders: async () => {
		return runCliEffect(
			Effect.gen(function* () {
				const client = createClient(getServerUrl());
				return yield* getProvidersEffect(client);
			})
		);
	},

	/**
	 * Ask a question across multiple resources
	 */
	askQuestion: async (
		resourceNames: string[],
		question: string,
		onChunkUpdate: (update: ChunkUpdate) => void
	): Promise<{
		chunks: Chunk[];
		doneEvent?: Extract<StreamEvent, { type: 'done' }>;
	}> =>
		runCliEffect(
			Effect.gen(function* () {
				const serverUrl = getServerUrl();
				currentAbortController = new AbortController();
				const signal = currentAbortController.signal;
				const response = yield* askQuestionStreamEffect(serverUrl, {
					question,
					resources: resourceNames,
					quiet: true,
					signal
				});
				const chunksById = new Map<string, Chunk>();
				const chunkOrder: string[] = [];
				let doneEvent: Extract<StreamEvent, { type: 'done' }> | undefined;
				try {
					yield* Effect.tryPromise({
						try: () =>
							(async () => {
								for await (const event of parseSSEStream(response)) {
									if (signal.aborted) break;
									if (event.type === 'error') {
										throw new Error(formatTuiStreamError(event));
									}
									if (event.type === 'done') {
										doneEvent = event;
										replaceFinalText(event.text, chunksById, chunkOrder, onChunkUpdate);
										continue;
									}
									processStreamEvent(event, chunksById, chunkOrder, onChunkUpdate);
								}
							})(),
						catch: (cause) => cause
					});
				} catch (error) {
					if (!(error instanceof Error && error.name === 'AbortError')) {
						return yield* Effect.fail(error);
					}
				}
				currentAbortController = null;
				return {
					chunks: chunkOrder.map((id) => chunksById.get(id)!),
					...(doneEvent ? { doneEvent } : {})
				};
			})
		),

	/**
	 * Cancel the current request
	 */
	cancelCurrentRequest: async (): Promise<void> => {
		if (!currentAbortController) return;
		currentAbortController.abort();
		currentAbortController = null;
	},

	/**
	 * Update model configuration
	 */
	updateModel: async (
		provider: string,
		model: string,
		providerOptions?: ProviderOptionsInput
	): Promise<ModelUpdateResult> => {
		return runCliEffect(updateModelEffect(getServerUrl(), provider, model, providerOptions));
	},

	/**
	 * Add a new resource
	 */
	addResource: async (resource: ResourceInput): Promise<ResourceInput> => {
		return runCliEffect(addResourceEffect(getServerUrl(), resource));
	},

	/**
	 * Replace an existing resource definition
	 */
	updateResource: async (resource: ResourceInput): Promise<ResourceInput> => {
		return runCliEffect(updateResourceEffect(getServerUrl(), resource));
	},

	/**
	 * Current Bioconductor release series
	 */
	getBioconductorRelease: async (): Promise<BioconductorReleaseResponse> => {
		return runCliEffect(getBioconductorReleaseEffect(getServerUrl()));
	},

	/**
	 * Load package names whose documentation is already present locally.
	 */
	getLocalBioconductorPackageNames: async (): Promise<LocalBioconductorPackageNamesResponse> => {
		return runCliEffect(getLocalBioconductorPackageNamesEffect(getServerUrl()));
	},

	verifyBioconductorPackage: async (packageName: string): Promise<BioconductorVerificationResult> =>
		runCliEffect(verifyBioconductorPackageEffect(getServerUrl(), packageName)),

	removeBioconductorPackage: async (packageName: string): Promise<BioconductorPackageRemovalResult> =>
		runCliEffect(removeBioconductorPackageEffect(getServerUrl(), packageName)),

	/**
	 * Search the Bioconductor package index
	 */
	searchBioconductorPackages: async (
		query: string,
		options?: { limit?: number; refresh?: boolean }
	): Promise<BioconductorPackagesResponse> => {
		return runCliEffect(searchBioconductorPackagesEffect(getServerUrl(), query, options ?? {}));
	},

	/**
	 * Remove a resource
	 */
	removeResource: async (name: string): Promise<void> => {
		await runCliEffect(removeResourceEffect(getServerUrl(), name));
	}
};

function replaceFinalText(
	text: string,
	chunksById: Map<string, Chunk>,
	chunkOrder: string[],
	onChunkUpdate: (update: ChunkUpdate) => void
): void {
	const textChunkId = '__text__';
	const existing = chunksById.get(textChunkId);
	if (existing?.type === 'text') {
		existing.text = text;
		onChunkUpdate({ type: 'update', id: textChunkId, chunk: { text } });
		return;
	}
	const chunk: Chunk = { type: 'text', id: textChunkId, text };
	chunksById.set(textChunkId, chunk);
	chunkOrder.push(textChunkId);
	onChunkUpdate({ type: 'add', chunk });
}

function processStreamEvent(
	event: StreamEvent,
	chunksById: Map<string, Chunk>,
	chunkOrder: string[],
	onChunkUpdate: (update: ChunkUpdate) => void
): void {
	const streamOptions = globalThis.__BIOCONTEXT_STREAM_OPTIONS__ ?? {
		showThinking: true,
		showTools: true
	};

	switch (event.type) {
		case 'text.delta': {
			// Accumulate text deltas into a single text chunk
			const textChunkId = '__text__';
			const existing = chunksById.get(textChunkId);
			if (existing && existing.type === 'text') {
				existing.text += event.delta;
				onChunkUpdate({ type: 'update', id: textChunkId, chunk: { text: existing.text } });
			} else {
				const chunk: Chunk = { type: 'text', id: textChunkId, text: event.delta };
				chunksById.set(textChunkId, chunk);
				chunkOrder.push(textChunkId);
				onChunkUpdate({ type: 'add', chunk });
			}
			break;
		}

		case 'reasoning.delta': {
			if (!streamOptions.showThinking) return;
			// Accumulate reasoning deltas
			const reasoningChunkId = '__reasoning__';
			const existing = chunksById.get(reasoningChunkId);
			if (existing && existing.type === 'reasoning') {
				existing.text += event.delta;
				onChunkUpdate({ type: 'update', id: reasoningChunkId, chunk: { text: existing.text } });
			} else {
				const chunk: Chunk = { type: 'reasoning', id: reasoningChunkId, text: event.delta };
				chunksById.set(reasoningChunkId, chunk);
				chunkOrder.push(reasoningChunkId);
				onChunkUpdate({ type: 'add', chunk });
			}
			break;
		}

		case 'tool.updated': {
			if (!streamOptions.showTools) return;
			const existing = chunksById.get(event.callID);
			const activityTime = Date.now();
			const state =
				event.state.status === 'pending'
					? 'pending'
					: event.state.status === 'running'
						? 'running'
						: 'completed';

			if (existing && existing.type === 'tool') {
				existing.state = state;
				if (state === 'running') {
					existing.startedAt ??= activityTime;
				} else if (state === 'completed') {
					existing.completedAt = activityTime;
				}
				onChunkUpdate({
					type: 'update',
					id: event.callID,
					chunk: {
						state,
						input: event.state.input,
						...(state === 'running'
							? { startedAt: existing.startedAt }
							: state === 'completed'
								? { completedAt: existing.completedAt }
								: {})
					}
				});
			} else {
				const chunk: Chunk = {
					type: 'tool',
					id: event.callID,
					toolName: event.tool,
					state,
					input: event.state.input,
					...(state === 'running'
						? { startedAt: activityTime }
						: state === 'completed'
							? { completedAt: activityTime }
							: {})
				};
				chunksById.set(event.callID, chunk);
				chunkOrder.push(event.callID);
				onChunkUpdate({ type: 'add', chunk });
			}
			break;
		}

		case 'meta':
		case 'done':
		case 'error':
			// Handled elsewhere or informational
			break;
	}
}

const formatTuiStreamError = (event: Extract<StreamEvent, { type: 'error' }>) => {
	const authError =
		event.tag === 'ProviderNotAuthenticatedError' || event.message.includes('is not authenticated');
	const hint = authError
		? 'Run /connect to authenticate this provider, then try again.'
		: event.hint;
	return hint ? `${event.message}\n\nHint: ${hint}` : event.message;
};

export type Services = typeof services;
