import path from 'node:path';

import { Effect, ServiceMap } from 'effect';
import type { ReasoningEffort } from '@biocontext/shared';
import type { AgentService as AgentServiceShape } from '../agent/service.ts';
import type { CollectionsService as CollectionsServiceShape } from '../collections/service.ts';
import { getCollectionKey } from '../collections/types.ts';
import type { ConfigService as ConfigServiceShape } from '../config/index.ts';
import { loadBioconductorResource } from '../resources/impls/bioconductor.ts';
import { loadCranResource } from '../resources/impls/cran.ts';
import { isBioconductorResource, isCranResource, type ResourceDefinition } from '../resources/schema.ts';
import { resourceNameToKey } from '../resources/helpers.ts';
import { discoverLocalBioconductorPackageNames, resolveResourceSelection } from '../resources/selection.ts';
import { getAuthStatus, type AuthType } from '../providers/auth.ts';
import { getDefaultBioconductorBootstrapStatus } from '../bioconductor/defaults.ts';
import {
	removeInstalledBioconductorPackage,
	setBioconductorPackageRemoved,
	type BioconductorPackageRemovalResult
} from '../bioconductor/removal.ts';
import { withBioconductorPackageMutation } from '../bioconductor/package-mutation.ts';

export class ConfigService extends ServiceMap.Service<ConfigService, ConfigServiceShape>()(
	'@biocontext/engine/effect/ConfigService'
) {}

export class CollectionsService extends ServiceMap.Service<
	CollectionsService,
	CollectionsServiceShape
>()('@biocontext/engine/effect/CollectionsService') {}

export class AgentService extends ServiceMap.Service<AgentService, AgentServiceShape>()(
	'@biocontext/engine/effect/AgentService'
) {}

const configService = Effect.service(ConfigService);
const collectionsService = Effect.service(CollectionsService);
const agentService = Effect.service(AgentService);

export type ConfigSnapshot = {
	provider: string;
	model: string;
	reasoningEffort?: ReasoningEffort;
	providerTimeoutMs: number | null;
	maxSteps: number;
	resourcesDirectory: string;
	resourceCount: number;
};

export type RuntimeStatusSnapshot = {
	localBioconductorPackageCount: number;
	defaultBioconductorPackages?: {
		state: 'idle' | 'running' | 'complete' | 'partial';
		total: number;
		ready: number;
		failed: readonly string[];
	};
	provider: string;
	providerName?: string;
	model: string;
	reasoningEffort?: ReasoningEffort;
	auth:
		| { status: 'ok'; authType: AuthType }
		| { status: 'missing' }
		| { status: 'invalid'; authType: AuthType };
};

export type ResourcesSnapshot = {
	resources: Array<{
		name: string;
		type: 'git' | 'local' | 'bioconductor' | 'cran';
		url?: string;
		branch?: string;
		path?: string;
		package?: string;
		release?: string | null;
		includeCurated?: boolean | null;
		source?: boolean | string | null;
		sourceBranch?: string | null;
		sourceCommit?: string | null;
		searchPath?: string | null;
		searchPaths?: string[] | null;
		specialNotes?: string | null;
	}>;
};

export const getConfigSnapshot: Effect.Effect<ConfigSnapshot, never, ConfigService> = Effect.map(
	configService,
	(config) => ({
		provider: config.provider,
		model: config.model,
		...(config.getProviderOptions(config.provider)?.reasoningEffort
			? { reasoningEffort: config.getProviderOptions(config.provider)?.reasoningEffort }
			: {}),
		providerTimeoutMs: config.providerTimeoutMs ?? null,
		maxSteps: config.maxSteps,
		resourcesDirectory: config.resourcesDirectory,
		resourceCount: config.resources.length
	})
);

/** Startup status with no credentials or account identifiers in the response. */
export const getRuntimeStatus: Effect.Effect<RuntimeStatusSnapshot, never, ConfigService> =
	Effect.flatMap(configService, (config) =>
		Effect.promise(async () => {
			const providerName = config.getProviderOptions(config.provider)?.name?.trim();
			const [localPackages, authStatus] = await Promise.all([
				discoverLocalBioconductorPackageNames(config.resourcesDirectory),
				getAuthStatus(config.provider)
			]);
			const auth =
				authStatus.status === 'ok'
					? { status: 'ok' as const, authType: authStatus.authType }
					: authStatus.status === 'invalid'
						? { status: 'invalid' as const, authType: authStatus.authType }
						: { status: 'missing' as const };
			return {
				localBioconductorPackageCount: localPackages.length,
				defaultBioconductorPackages: getDefaultBioconductorBootstrapStatus(config),
				provider: config.provider,
				...(providerName ? { providerName } : {}),
				model: config.model,
				...(config.getProviderOptions(config.provider)?.reasoningEffort
					? { reasoningEffort: config.getProviderOptions(config.provider)?.reasoningEffort }
					: {}),
				auth
			};
		})
	);

/** Canonical package names whose searchable documentation is already local. */
export const getLocalBioconductorPackageNames: Effect.Effect<string[], never, ConfigService> =
	Effect.flatMap(configService, (config) =>
		Effect.promise(() => discoverLocalBioconductorPackageNames(config.resourcesDirectory))
	);

export const getResourcesSnapshot: Effect.Effect<ResourcesSnapshot, never, ConfigService> =
	Effect.map(configService, (config) => ({
		resources: config.resources.map((resource) => {
			if (resource.type === 'git') {
				return {
					name: resource.name,
					type: resource.type,
					url: resource.url,
					branch: resource.branch,
					searchPath: resource.searchPath ?? null,
					searchPaths: resource.searchPaths ?? null,
					specialNotes: resource.specialNotes ?? null
				};
			}
			if (resource.type === 'bioconductor') {
				return {
					name: resource.name,
					type: resource.type,
					package: resource.package,
					release: resource.release ?? null,
					includeCurated: resource.includeCurated ?? null,
					source: resource.source ?? null,
					sourceBranch: resource.sourceBranch ?? null,
					sourceCommit: resource.sourceCommit ?? null,
					specialNotes: resource.specialNotes ?? null
				};
			}
			if (resource.type === 'cran') {
				return {
					name: resource.name,
					type: resource.type,
					package: resource.package,
					specialNotes: resource.specialNotes ?? null
				};
			}
			return {
				name: resource.name,
				type: resource.type,
				path: resource.path,
				specialNotes: resource.specialNotes ?? null
			};
		})
	}));

export const getDataDirectory: Effect.Effect<string, never, ConfigService> = Effect.map(
	configService,
	(config) => config.dataDirectory
);

export const getResourcesDirectory: Effect.Effect<string, never, ConfigService> = Effect.map(
	configService,
	(config) => config.resourcesDirectory
);

export const getDefaultResourceNames: Effect.Effect<string[], never, ConfigService> = Effect.map(
	configService,
	(config) => config.resources.map((resource) => resource.name)
);

export const resolveQuestionResourceSelection = (requested?: readonly string[]) =>
	Effect.flatMap(configService, (config) =>
		Effect.promise(() =>
			resolveResourceSelection({
				...(requested ? { requested } : {}),
				configuredResources: config.resources,
				resourcesDirectory: config.resourcesDirectory
			})
		)
	);

export const reloadConfig: Effect.Effect<void, unknown, ConfigService> = Effect.flatMap(
	configService,
	(config) => config.reload()
);

export const listProviders = Effect.flatMap(agentService, (agent) => agent.listProviders());

export const loadCollection = (args: {
	resourceNames: readonly string[];
	quiet?: boolean;
	scope?: 'broad' | 'focused';
}): Effect.Effect<
	Awaited<ReturnType<CollectionsServiceShape['loadPromise']>>,
	unknown,
	CollectionsService
> => Effect.flatMap(collectionsService, (collections) => collections.load(args));

export const askQuestion = (args: {
	collection: Awaited<ReturnType<CollectionsServiceShape['loadPromise']>>;
	question: string;
}) => Effect.flatMap(agentService, (agent) => agent.ask(args));

export const askQuestionStream = (args: {
	collection: Awaited<ReturnType<CollectionsServiceShape['loadPromise']>>;
	question: string;
}) => Effect.flatMap(agentService, (agent) => agent.askStream(args));

export const updateModelConfig = (args: {
	provider: string;
	model: string;
	providerOptions?: Parameters<ConfigServiceShape['updateModel']>[2];
}) =>
	Effect.flatMap(configService, (config) =>
		config.updateModel(args.provider, args.model, args.providerOptions)
	);

const installManagedPackage = (
	resource: ResourceDefinition,
	config: ConfigServiceShape,
	refresh = false
): Effect.Effect<void, unknown> => {
	if (isCranResource(resource)) {
		return Effect.asVoid(
			Effect.tryPromise(() =>
				loadCranResource({
					type: 'cran',
					name: resource.name,
					package: resource.package,
					resourcesDirectoryPath: config.resourcesDirectory,
					dataDirectoryPath: config.dataDirectory,
					specialAgentInstructions: resource.specialNotes ?? '',
					quiet: true,
					...(refresh ? { refresh: true } : {})
				})
			)
		);
	}
	if (!isBioconductorResource(resource)) return Effect.void;
	return Effect.asVoid(
		Effect.tryPromise(() =>
			loadBioconductorResource({
				type: 'bioconductor',
				name: resource.name,
				package: resource.package,
				...(resource.release ? { release: resource.release } : {}),
				...(resource.documents ? { documents: resource.documents } : {}),
				...(resource.includeCurated === undefined
					? {}
					: { includeCurated: resource.includeCurated }),
				...(typeof resource.source === 'string' ? { source: resource.source } : {}),
				...(resource.sourceBranch ? { sourceBranch: resource.sourceBranch } : {}),
				...(resource.sourceCommit ? { sourceCommit: resource.sourceCommit } : {}),
				resourcesDirectoryPath: config.resourcesDirectory,
				dataDirectoryPath: config.dataDirectory,
				specialAgentInstructions: resource.specialNotes ?? '',
				quiet: true,
				...(refresh ? { refresh: true } : {})
			})
		)
	);
};

const mutateConfigResource = (
	resource: ResourceDefinition,
	config: ConfigServiceShape,
	operation: () => Effect.Effect<ResourceDefinition, unknown>,
	refresh = false
): Effect.Effect<ResourceDefinition, unknown> =>
	Effect.tryPromise(async () => {
		const mutate = async () => {
			const wasRemovalCleared = isBioconductorResource(resource)
				? await setBioconductorPackageRemoved(config.dataDirectory, resource.package, false)
				: false;
			try {
				await Effect.runPromise(installManagedPackage(resource, config, refresh));
				return await Effect.runPromise(operation());
			} catch (cause) {
				if (wasRemovalCleared && isBioconductorResource(resource)) {
					await setBioconductorPackageRemoved(config.dataDirectory, resource.package, true).catch(
						() => undefined
					);
				}
				throw cause;
			}
		};
		if (!isBioconductorResource(resource) && !isCranResource(resource)) return mutate();
		return withBioconductorPackageMutation(
			path.join(config.resourcesDirectory, resourceNameToKey(resource.package)),
			mutate
		);
	});

export const addConfigResource = (
	resource: ResourceDefinition
): Effect.Effect<ResourceDefinition, unknown, ConfigService> =>
	Effect.flatMap(configService, (config) =>
		mutateConfigResource(resource, config, () => config.addResource(resource))
	);

export const updateConfigResource = (
	resource: ResourceDefinition
): Effect.Effect<ResourceDefinition, unknown, ConfigService> =>
	Effect.flatMap(configService, (config) =>
		mutateConfigResource(resource, config, () => config.updateResource(resource), true)
	);

export const removeConfigResource = (name: string): Effect.Effect<void, unknown, ConfigService> =>
	Effect.flatMap(configService, (config) => config.removeResource(name));

export const removeBioconductorPackage = (
	packageName: string
): Effect.Effect<BioconductorPackageRemovalResult, unknown, ConfigService> =>
	Effect.flatMap(configService, (config) =>
		Effect.tryPromise(() =>
			removeInstalledBioconductorPackage({
				package: packageName,
				resourcesDirectory: config.resourcesDirectory,
				dataDirectory: config.dataDirectory,
				removeConfigResources: (canonicalPackage) =>
					Effect.runPromise(config.removeBioconductorPackageResources(canonicalPackage)),
				restoreConfigResources: (receipt) =>
					Effect.runPromise(config.restoreBioconductorPackageResources(receipt))
			})
		)
	);

export const clearConfigResources = Effect.flatMap(configService, (config) =>
	config.clearResources()
);

export const loadedResourceCollectionKey = (
	resourceNames: readonly string[],
	scope: 'broad' | 'focused' = 'focused'
) => getCollectionKey(resourceNames, scope);
