import { Effect, Cause } from 'effect';
import { HttpRouter, HttpServerRequest, HttpServerResponse } from 'effect/unstable/http';
import { z } from 'zod';
import { REASONING_EFFORTS } from '@biocontext/shared';
import packageJson from '../package.json';

import { createAgentService } from './agent/service.ts';
import {
	BioconductorCatalogError,
	describeRepository,
	loadCatalog,
	searchPackages,
	sourceArchiveUrl
} from './bioconductor/catalog.ts';
import { loadRelease } from './bioconductor/release.ts';
import { createCollectionsService } from './collections/service.ts';
import { load as loadConfig } from './config/index.ts';
import { runContext } from './context/index.ts';
import { toHttpErrorPayload } from './effect/errors.ts';
import { createServerRuntime } from './effect/runtime.ts';
import * as ServerServices from './effect/services.ts';
import { metricsError, metricsErrorInfo, metricsInfo, setQuietMetrics } from './metrics/index.ts';
import { createModelsDevPricing } from './pricing/models-dev.ts';
import { createResourcesService } from './resources/service.ts';
import {
	BioconductorResourceSchema,
	CranResourceSchema,
	GitResourceSchema,
	LocalResourceSchema,
	type ResourceDefinition
} from './resources/schema.ts';
import { startDefaultBioconductorBootstrap } from './bioconductor/defaults.ts';
import { verifyBioconductorPackage } from './bioconductor/verify.ts';
import { cleanupRemovedBioconductorPackageArtifacts } from './bioconductor/removal.ts';
import { createSseStream } from './stream/service.ts';
import type { StreamMetaEvent } from './stream/types.ts';
import {
	LIMITS,
	normalizeGitHubUrl,
	validateGitUrl,
	validateResourceReference
} from './validation/index.ts';
import { clearAllVirtualCollectionMetadata } from './collections/virtual-metadata.ts';
import { disposeAllVirtualFs } from './vfs/virtual-fs.ts';

const DEFAULT_PORT = 8080;
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : DEFAULT_PORT;
const modelsDevPricing = createModelsDevPricing();
declare const __VERSION__: string;
const VERSION = typeof __VERSION__ !== 'undefined' ? __VERSION__ : (packageJson.version ?? '0.0.0');

const RESOURCE_NAME_REGEX = /^@?[a-zA-Z0-9][a-zA-Z0-9._-]*(\/[a-zA-Z0-9][a-zA-Z0-9._-]*)*$/;
const SAFE_NAME_REGEX = /^[a-zA-Z0-9._+\-/:]+$/;

const ResourceNameField = z
	.string()
	.min(1, 'Resource name cannot be empty')
	.max(LIMITS.RESOURCE_NAME_MAX)
	.regex(RESOURCE_NAME_REGEX, 'Invalid resource name format')
	.refine((name) => !name.includes('..'), 'Resource name must not contain ".."')
	.refine((name) => !name.includes('//'), 'Resource name must not contain "//"')
	.refine((name) => !name.endsWith('/'), 'Resource name must not end with "/"');

const ResourceReferenceField = z.string().superRefine((value, ctx) => {
	const result = validateResourceReference(value);
	if (!result.valid) {
		ctx.addIssue({
			code: 'custom',
			message: result.error
		});
	}
});

const normalizeQuestionResourceReference = (reference: string): string => {
	const gitUrlResult = validateGitUrl(reference);
	if (gitUrlResult.valid) return gitUrlResult.value;
	return reference;
};

const QuestionRequestSchema = z.object({
	question: z
		.string()
		.min(1, 'Question cannot be empty')
		.max(
			LIMITS.QUESTION_MAX,
			`Question too long (max ${LIMITS.QUESTION_MAX.toLocaleString()} chars). This includes conversation history - try starting a new thread or clearing the chat.`
		),
	resources: z
		.array(ResourceReferenceField)
		.max(
			LIMITS.MAX_RESOURCES_PER_REQUEST,
			`Too many resources (max ${LIMITS.MAX_RESOURCES_PER_REQUEST})`
		)
		.optional(),
	quiet: z.boolean().optional()
});

const UpdateModelRequestSchema = z.object({
	provider: z
		.string()
		.min(1, 'Provider name cannot be empty')
		.max(LIMITS.PROVIDER_NAME_MAX)
		.regex(SAFE_NAME_REGEX, 'Invalid provider name format'),
	model: z
		.string()
		.min(1, 'Model name cannot be empty')
		.max(LIMITS.MODEL_NAME_MAX)
		.regex(SAFE_NAME_REGEX, 'Invalid model name format'),
	providerOptions: z
		.object({
			baseURL: z.string().optional(),
			name: z.string().optional(),
			reasoningEffort: z.enum(REASONING_EFFORTS).optional()
		})
		.optional()
});

const AddGitResourceRequestSchema = z.object({
	type: z.literal('git'),
	name: GitResourceSchema.shape.name,
	url: GitResourceSchema.shape.url,
	branch: GitResourceSchema.shape.branch.optional().default('main'),
	searchPath: GitResourceSchema.shape.searchPath,
	searchPaths: GitResourceSchema.shape.searchPaths,
	specialNotes: GitResourceSchema.shape.specialNotes
});

const isWsl = () =>
	process.platform === 'linux' &&
	(Boolean(process.env.WSL_DISTRO_NAME) ||
		Boolean(process.env.WSL_INTEROP) ||
		Boolean(process.env.WSLENV));

const normalizeWslPath = (value: string) => {
	if (!isWsl()) return value;
	const match = value.match(/^([a-zA-Z]):\\(.*)$/);
	if (!match) return value;
	const drive = match[1]!.toLowerCase();
	const rest = match[2]!.replace(/\\/g, '/');
	return `/mnt/${drive}/${rest}`;
};

const LocalPathRequestSchema = z.preprocess(
	(value) => (typeof value === 'string' ? normalizeWslPath(value) : value),
	LocalResourceSchema.shape.path
) as z.ZodType<string>;

const AddLocalResourceRequestSchema = z.object({
	type: z.literal('local'),
	name: LocalResourceSchema.shape.name,
	path: LocalPathRequestSchema,
	specialNotes: LocalResourceSchema.shape.specialNotes
});

const AddBioconductorResourceRequestSchema = z.object({
	type: z.literal('bioconductor'),
	name: BioconductorResourceSchema.shape.name,
	package: BioconductorResourceSchema.shape.package,
	release: BioconductorResourceSchema.shape.release,
	documents: BioconductorResourceSchema.shape.documents,
	includeCurated: BioconductorResourceSchema.shape.includeCurated,
	source: BioconductorResourceSchema.shape.source,
	sourceBranch: BioconductorResourceSchema.shape.sourceBranch,
	sourceCommit: BioconductorResourceSchema.shape.sourceCommit,
	specialNotes: BioconductorResourceSchema.shape.specialNotes
});

const AddCranResourceRequestSchema = z.object({
	type: z.literal('cran'),
	name: CranResourceSchema.shape.name,
	package: CranResourceSchema.shape.package,
	specialNotes: CranResourceSchema.shape.specialNotes
});

const AddResourceRequestSchema = z.discriminatedUnion('type', [
	AddGitResourceRequestSchema,
	AddLocalResourceRequestSchema,
	AddBioconductorResourceRequestSchema,
	AddCranResourceRequestSchema
]);

// The request decoder yields the schema's input type, so defaults (such as the
// git branch) may still be absent here and are applied below.
type AddResourceRequest = z.input<typeof AddResourceRequestSchema>;

/** Shared by POST and PUT so both write identically shaped definitions. */
const toResourceDefinition = (decoded: AddResourceRequest): ResourceDefinition => {
	if (decoded.type === 'git') {
		const git: ResourceDefinition = {
			type: 'git' as const,
			name: decoded.name,
			url: normalizeGitHubUrl(decoded.url),
			branch: decoded.branch ?? 'main',
			...(decoded.searchPath && { searchPath: decoded.searchPath }),
			...(decoded.searchPaths && { searchPaths: decoded.searchPaths }),
			...(decoded.specialNotes && { specialNotes: decoded.specialNotes })
		};
		return git;
	}
	if (decoded.type === 'bioconductor') {
		return {
			type: 'bioconductor' as const,
			name: decoded.name,
			package: decoded.package,
			...(decoded.release ? { release: decoded.release } : {}),
			...(decoded.documents ? { documents: decoded.documents } : {}),
			...(decoded.includeCurated === undefined ? {} : { includeCurated: decoded.includeCurated }),
			...(typeof decoded.source === 'string' ? { source: decoded.source } : {}),
			...(decoded.sourceBranch ? { sourceBranch: decoded.sourceBranch } : {}),
			...(decoded.sourceCommit ? { sourceCommit: decoded.sourceCommit } : {}),
			...(decoded.specialNotes ? { specialNotes: decoded.specialNotes } : {})
		};
	}
	if (decoded.type === 'cran') {
		return {
			type: 'cran' as const,
			name: decoded.name,
			package: decoded.package,
			...(decoded.specialNotes ? { specialNotes: decoded.specialNotes } : {})
		};
	}
	return {
		type: 'local' as const,
		name: decoded.name,
		path: decoded.path,
		...(decoded.specialNotes && { specialNotes: decoded.specialNotes })
	};
};

const RemoveResourceRequestSchema = z.object({
	name: ResourceNameField
});

const RemoveBioconductorPackageRequestSchema = z.object({
	package: BioconductorResourceSchema.shape.package,
	confirmed: z.literal(true)
});

class RequestError extends Error {
	readonly _tag = 'RequestError';

	constructor(message: string, cause?: unknown) {
		super(message, cause ? { cause } : undefined);
	}
}

const decodeJson = <T>(
	request: HttpServerRequest.HttpServerRequest,
	schema: z.ZodType<T>
): Effect.Effect<T, RequestError> =>
	Effect.gen(function* () {
		const body = yield* Effect.mapError(request.json, (cause) => {
			return new RequestError('Failed to parse request JSON', cause);
		});
		const parsed = schema.safeParse(body);
		if (!parsed.success) {
			return yield* Effect.fail(new RequestError('Invalid request body', parsed.error));
		}
		return parsed.data;
	});

const createApp = () => {
	const withHttpErrorHandling = <R>(
		effect: Effect.Effect<HttpServerResponse.HttpServerResponse, unknown, R>
	): Effect.Effect<HttpServerResponse.HttpServerResponse, never, R> =>
		Effect.catchCause(effect, (cause) => {
			const error = Cause.squash(cause);
			metricsError('http.error', { error: metricsErrorInfo(error) });
			const payload = toHttpErrorPayload(error);
			return Effect.succeed(
				HttpServerResponse.jsonUnsafe(
					{ error: payload.error, tag: payload.tag, ...(payload.hint && { hint: payload.hint }) },
					{ status: payload.status }
				)
			);
		});

	return HttpRouter.addAll([
		HttpRouter.route(
			'GET',
			'/',
			HttpServerResponse.jsonUnsafe({
				ok: true,
				service: '@biocontext/engine',
				version: VERSION
			})
		),
		HttpRouter.route(
			'GET',
			'/config',
			withHttpErrorHandling(
				Effect.map(ServerServices.getConfigSnapshot, (snapshot) =>
					HttpServerResponse.jsonUnsafe(snapshot)
				)
			)
		),
		HttpRouter.route(
			'GET',
			'/status',
			withHttpErrorHandling(
				Effect.map(ServerServices.getRuntimeStatus, (status) =>
					HttpServerResponse.jsonUnsafe(status)
				)
			)
		),
		HttpRouter.route(
			'GET',
			'/resources',
			withHttpErrorHandling(
				Effect.map(ServerServices.getResourcesSnapshot, (snapshot) =>
					HttpServerResponse.jsonUnsafe(snapshot)
				)
			)
		),
		HttpRouter.route(
			'GET',
			'/providers',
			withHttpErrorHandling(
				Effect.gen(function* () {
					const providers = yield* ServerServices.listProviders;
					return HttpServerResponse.jsonUnsafe(providers);
				})
			)
		),
		HttpRouter.route(
			'POST',
			'/reload-config',
			withHttpErrorHandling(
				Effect.gen(function* () {
					yield* ServerServices.reloadConfig;
					const resources = yield* ServerServices.getDefaultResourceNames;
					return HttpServerResponse.jsonUnsafe({
						ok: true,
						resources
					});
				})
			)
		),
		HttpRouter.route('POST', '/question', (request) =>
			withHttpErrorHandling(
				Effect.gen(function* () {
					const decoded = yield* decodeJson(request, QuestionRequestSchema);
					const selection = yield* ServerServices.resolveQuestionResourceSelection(
						decoded.resources?.map(normalizeQuestionResourceReference)
					);
					const resourceNames = selection.resourceNames;

					const collectionKey = ServerServices.loadedResourceCollectionKey(
						resourceNames,
						selection.mode
					);
					metricsInfo('question.received', {
						stream: false,
						quiet: decoded.quiet ?? false,
						questionLength: decoded.question.length,
						resources: resourceNames,
						collectionKey
					});

					const collection = yield* ServerServices.loadCollection({
						resourceNames,
						quiet: decoded.quiet,
						scope: selection.mode
					});
					metricsInfo('collection.ready', { collectionKey, path: collection.path });

					const result = yield* ServerServices.askQuestion({
						collection,
						question: decoded.question
					});
					metricsInfo('question.done', {
						collectionKey,
						answerLength: result.answer.length,
						model: result.model
					});

					return HttpServerResponse.jsonUnsafe({
						answer: result.answer,
						evidence: result.evidence,
						model: result.model,
						resources: resourceNames,
						collection: { key: collectionKey, path: collection.path }
					});
				})
			)
		),
		HttpRouter.route('POST', '/question/stream', (request) =>
			withHttpErrorHandling(
				Effect.gen(function* () {
					const requestStartMs = performance.now();
					const decoded = yield* decodeJson(request, QuestionRequestSchema);
					const selection = yield* ServerServices.resolveQuestionResourceSelection(
						decoded.resources?.map(normalizeQuestionResourceReference)
					);
					const resourceNames = selection.resourceNames;

					const collectionKey = ServerServices.loadedResourceCollectionKey(
						resourceNames,
						selection.mode
					);
					metricsInfo('question.received', {
						stream: true,
						quiet: decoded.quiet ?? false,
						questionLength: decoded.question.length,
						resources: resourceNames,
						collectionKey
					});

					const collection = yield* ServerServices.loadCollection({
						resourceNames,
						quiet: decoded.quiet,
						scope: selection.mode
					});
					metricsInfo('collection.ready', { collectionKey, path: collection.path });

					const { stream: eventStream, model } = yield* ServerServices.askQuestionStream({
						collection,
						question: decoded.question
					});

					const meta = {
						type: 'meta',
						model,
						resources: resourceNames,
						collection: {
							key: collectionKey,
							path: collection.path
						}
					} satisfies StreamMetaEvent;

					metricsInfo('question.stream.start', { collectionKey });
					modelsDevPricing.prefetch();
					const stream = createSseStream({
						meta,
						eventStream,
						question: decoded.question,
						requestStartMs,
						pricing: modelsDevPricing
					});

					return HttpServerResponse.raw(
						new Response(stream, {
							headers: {
								'content-type': 'text/event-stream',
								'cache-control': 'no-cache',
								connection: 'keep-alive'
							}
						})
					);
				})
			)
		),
		HttpRouter.route('PUT', '/config/model', (request) =>
			withHttpErrorHandling(
				Effect.gen(function* () {
					const decoded = yield* decodeJson(request, UpdateModelRequestSchema);
					const result = yield* ServerServices.updateModelConfig({
						provider: decoded.provider,
						model: decoded.model,
						providerOptions: decoded.providerOptions
					});
					return HttpServerResponse.jsonUnsafe(result);
				})
			)
		),
		HttpRouter.route('POST', '/config/resources', (request) =>
			withHttpErrorHandling(
				Effect.gen(function* () {
					const decoded = yield* decodeJson(request, AddResourceRequestSchema);
					const added = yield* ServerServices.addConfigResource(toResourceDefinition(decoded));
					return HttpServerResponse.jsonUnsafe(added, { status: 201 });
				})
			)
		),
		HttpRouter.route('PUT', '/config/resources', (request) =>
			withHttpErrorHandling(
				Effect.gen(function* () {
					const decoded = yield* decodeJson(request, AddResourceRequestSchema);
					const updated = yield* ServerServices.updateConfigResource(toResourceDefinition(decoded));
					return HttpServerResponse.jsonUnsafe(updated, { status: 200 });
				})
			)
		),
		HttpRouter.route('DELETE', '/config/resources', (request) =>
			withHttpErrorHandling(
				Effect.gen(function* () {
					const decoded = yield* decodeJson(request, RemoveResourceRequestSchema);
					yield* ServerServices.removeConfigResource(decoded.name);
					return HttpServerResponse.jsonUnsafe({ success: true, name: decoded.name });
				})
			)
		),
		HttpRouter.route(
			'GET',
			'/bioconductor/release',
			withHttpErrorHandling(
				Effect.gen(function* () {
					const dataDirectory = yield* ServerServices.getDataDirectory;
					const release = yield* Effect.promise(() => loadRelease({ dataDirectory }));
					return HttpServerResponse.jsonUnsafe({ release });
				})
			)
		),
		HttpRouter.route(
			'GET',
			'/bioconductor/local-package-names',
			withHttpErrorHandling(
				Effect.gen(function* () {
					const packages = yield* ServerServices.getLocalBioconductorPackageNames;
					return HttpServerResponse.jsonUnsafe({
						packages
					});
				})
			)
		),
		HttpRouter.route('GET', '/bioconductor/verify', (request) =>
			withHttpErrorHandling(
				Effect.gen(function* () {
					const url = new URL(HttpServerRequest.toURL(request) ?? 'http://localhost');
					const packageName = url.searchParams.get('package') ?? '';
					const parsedPackage = BioconductorResourceSchema.shape.package.safeParse(packageName);
					if (!parsedPackage.success) {
						throw new RequestError('A valid Bioconductor package name is required.');
					}
					const resourcesDirectory = yield* ServerServices.getResourcesDirectory;
					const verification = yield* Effect.promise(() =>
						verifyBioconductorPackage({
							resourcesDirectory,
							package: parsedPackage.data
						})
					);
					return HttpServerResponse.jsonUnsafe(verification);
				})
			)
		),
		HttpRouter.route('DELETE', '/bioconductor/packages', (request) =>
			withHttpErrorHandling(
				Effect.gen(function* () {
					const decoded = yield* decodeJson(request, RemoveBioconductorPackageRequestSchema);
					const result = yield* ServerServices.removeBioconductorPackage(decoded.package);
					return HttpServerResponse.jsonUnsafe(result);
				})
			)
		),
		HttpRouter.route('GET', '/bioconductor/packages', (request) =>
			withHttpErrorHandling(
				Effect.gen(function* () {
					const url = new URL(HttpServerRequest.toURL(request) ?? 'http://localhost');
					const query = url.searchParams.get('q') ?? '';
					const limit = Math.min(
						Math.max(Number.parseInt(url.searchParams.get('limit') ?? '25', 10) || 25, 1),
						100
					);
					const refresh = url.searchParams.get('refresh') === 'true';

					const dataDirectory = yield* ServerServices.getDataDirectory;
					const catalog = yield* Effect.tryPromise({
						try: () => loadCatalog({ dataDirectory, refresh }),
						catch: (cause) =>
							cause instanceof BioconductorCatalogError
								? cause
								: new BioconductorCatalogError(
										'Could not load the Bioconductor package index',
										'Check your network connection, then try again.',
										{ cause }
									)
					});

					const matches = query.trim()
						? searchPackages(catalog, query, limit)
						: catalog.packages.slice(0, limit);

					return HttpServerResponse.jsonUnsafe({
						release: catalog.release,
						fetchedAt: catalog.fetchedAt,
						total: catalog.packages.length,
						packages: matches.map((pkg) => {
							return {
								name: pkg.name,
								version: pkg.version,
								title: pkg.title,
								repository: pkg.repository,
								repositoryLabel: describeRepository(pkg.repository),
								vignetteCount: pkg.vignettes.length,
								sourceUrl: sourceArchiveUrl(pkg, catalog.release),
								sourceKind: 'bioconductor_archive'
							};
						})
					});
				})
			)
		),
		HttpRouter.route(
			'POST',
			'/clear',
			withHttpErrorHandling(
				Effect.gen(function* () {
					const result = yield* ServerServices.clearConfigResources;
					return HttpServerResponse.jsonUnsafe(result);
				})
			)
		)
	]);
};

export type AppType = {
	readonly _tag: 'effect-http-app';
};

export interface ServerInstance {
	port: number;
	url: string;
	stop: () => void;
}

export interface StartServerOptions {
	port?: number;
	quiet?: boolean;
	/** Skip the background default-package materialization used by the TUI. */
	bootstrapDefaults?: boolean;
}

export const startServer = async (options: StartServerOptions = {}): Promise<ServerInstance> => {
	if (options.quiet) {
		setQuietMetrics(true);
	}

	const requestedPort = options.port ?? PORT;
	metricsInfo('server.starting', { port: requestedPort });

	const config = await loadConfig();
	await cleanupRemovedBioconductorPackageArtifacts({
		dataDirectory: config.dataDirectory,
		resourcesDirectory: config.resourcesDirectory
	}).catch((cause) => {
		metricsError('bioconductor.package.remove.cleanup_startup_failed', {
			error: cause instanceof Error ? cause.message : String(cause)
		});
	});
	// Prepare defaults and upgrade recognized legacy managed caches in the
	// background. The server remains available; package failures are isolated
	// and surfaced through /status so the TUI can refresh local autocomplete.
	if (options.bootstrapDefaults !== false) {
		startDefaultBioconductorBootstrap(config);
	}
	metricsInfo('config.ready', {
		provider: config.provider,
		model: config.model,
		maxSteps: config.maxSteps,
		resources: config.resources.map((resource) => resource.name),
		resourcesDirectory: config.resourcesDirectory
	});

	const resources = createResourcesService(config);
	const collections = createCollectionsService({ config, resources });
	const agent = createAgentService(config);
	const runtime = createServerRuntime({ config, collections, agent });
	const appLayer = createApp();
	const { handler, dispose } = HttpRouter.toWebHandler(appLayer, {
		disableLogger: options.quiet === true
	});
	const requestContext = await runtime.services();

	const server = Bun.serve({
		port: requestedPort,
		fetch: (request, bunServer) => {
			if (new URL(request.url).pathname === '/question/stream') {
				bunServer.timeout(request, 0);
			}
			return runContext({ requestId: crypto.randomUUID(), txDepth: 0 }, () =>
				handler(request, requestContext)
			);
		},
		idleTimeout: 60
	});

	const actualPort = server.port ?? requestedPort;
	metricsInfo('server.started', { port: actualPort });

	return {
		port: actualPort,
		url: `http://localhost:${actualPort}`,
		stop: () => {
			disposeAllVirtualFs();
			clearAllVirtualCollectionMetadata();
			server.stop();
			void dispose();
			void runtime.dispose();
		}
	};
};

export type { StreamEvent, StreamMetaEvent } from './stream/types.ts';

if (import.meta.main) {
	const server = await startServer({ port: PORT });
	const shutdown = () => {
		metricsInfo('server.shutdown', { reason: 'signal' });
		server.stop();
		process.exit(0);
	};
	process.on('SIGINT', shutdown);
	process.on('SIGTERM', shutdown);
}
