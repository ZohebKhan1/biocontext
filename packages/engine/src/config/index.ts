import { promises as fs } from 'node:fs';
import type { Dirent } from 'node:fs';
import path from 'node:path';

import { parseJsonc, REASONING_EFFORTS } from '@biocontext/shared';
import { Effect } from 'effect';
import { z } from 'zod';

import { CommonHints, type TaggedErrorOptions } from '../errors.ts';
import { metricsInfo } from '../metrics/index.ts';
import { getSupportedProviders, isProviderSupported } from '../providers/index.ts';
import { readBioconductorResourceMetadata } from '../bioconductor/materialize.ts';
import { ResourceDefinitionSchema, type ResourceDefinition } from '../resources/schema.ts';

export const GLOBAL_CONFIG_DIR = '~/.config/biocontext';
export const GLOBAL_CONFIG_FILENAME = 'biocontext.config.jsonc';
export const GLOBAL_DATA_DIR = '~/.local/share/biocontext';
export const PROJECT_CONFIG_FILENAME = 'biocontext.config.jsonc';
export const CONFIG_SCHEMA_URL =
	'https://raw.githubusercontent.com/ZohebKhan1/biocontext/main/biocontext.schema.json';

export const DEFAULT_MODEL = 'gpt-5.6-luna';
export const DEFAULT_PROVIDER = 'openai';
export const DEFAULT_PROVIDER_OPTIONS = {
	openai: { reasoningEffort: 'medium' as const }
};
export const DEFAULT_PROVIDER_TIMEOUT_MS = 300_000;
export const DEFAULT_MAX_STEPS = 40;

export const DEFAULT_RESOURCES: ResourceDefinition[] = [
	{
		name: 'Bioconductor',
		specialNotes:
			'Bundled Bioconductor package documentation. Within this resource, read DIRECTORY.md in the configured focus path before searching package files. Prefer reference.md for APIs, guides and vignettes for workflows, and papers for method rationale. Cite exact repository paths and distinguish documented behavior from inference.',
		type: 'git',
		url: 'https://github.com/ZohebKhan1/biocontext',
		branch: 'main',
		searchPath: 'resources/bioconductor-docs'
	}
];

const ProviderOptionsSchema = z.object({
	baseURL: z.string().optional(),
	name: z.string().optional(),
	// Provider-specific reasoning control. OpenAI uses this as `reasoning.effort`.
	reasoningEffort: z.enum(REASONING_EFFORTS).optional()
});

const ProviderOptionsMapSchema = z.record(z.string(), ProviderOptionsSchema);

const StoredConfigSchema = z.object({
	$schema: z.string().optional(),
	dataDirectory: z.string().optional(),
	providerTimeoutMs: z.number().int().positive().optional(),
	maxSteps: z.number().int().positive().optional(),
	resources: z.array(ResourceDefinitionSchema),
	// Provider and model are optional - defaults are applied when loading
	model: z.string().optional(),
	provider: z.string().optional(),
	providerOptions: ProviderOptionsMapSchema.optional()
});

type StoredConfig = z.infer<typeof StoredConfigSchema>;
type ProviderOptionsConfig = z.infer<typeof ProviderOptionsSchema>;
type ProviderOptionsMap = z.infer<typeof ProviderOptionsMapSchema>;
type ConfigScope = 'project' | 'global';

export type ConfigBioconductorRemovalReceipt = {
	readonly scope: ConfigScope;
	readonly removedNames: readonly string[];
	readonly entries: readonly {
		readonly index: number;
		readonly resource: ResourceDefinition;
	}[];
};

/** Legacy boolean source flags are accepted on read but never retained. */
const normalizeStoredConfig = (stored: StoredConfig): StoredConfig => ({
	...stored,
	resources: stored.resources.map((resource) => {
		if (resource.type !== 'bioconductor') return resource;
		return {
			type: resource.type,
			name: resource.name,
			package: resource.package,
			...(resource.release ? { release: resource.release } : {}),
			...(resource.documents ? { documents: resource.documents } : {}),
			...(resource.includeCurated === undefined ? {} : { includeCurated: resource.includeCurated }),
			...(typeof resource.source === 'string' ? { source: resource.source } : {}),
			...(resource.sourceBranch ? { sourceBranch: resource.sourceBranch } : {}),
			...(resource.sourceCommit ? { sourceCommit: resource.sourceCommit } : {}),
			...(resource.specialNotes ? { specialNotes: resource.specialNotes } : {})
		};
	})
});

export class ConfigError extends Error {
	readonly _tag = 'ConfigError';
	override readonly cause?: unknown;
	readonly hint?: string;

	constructor(args: TaggedErrorOptions) {
		super(args.message);
		this.cause = args.cause;
		this.hint = args.hint;
	}
}

export type ConfigService = {
	resourcesDirectory: string;
	/** Root data directory; caches that are not per-resource live here. */
	dataDirectory: string;
	resources: readonly ResourceDefinition[];
	model: string;
	provider: string;
	providerTimeoutMs?: number;
	maxSteps: number;
	configPath: string;
	getProviderOptions: (providerId: string) => ProviderOptionsConfig | undefined;
	getResource: (name: string) => ResourceDefinition | undefined;
	updateModel: (
		provider: string,
		model: string,
		providerOptions?: ProviderOptionsConfig
	) => Effect.Effect<{ provider: string; model: string; savedTo: ConfigScope }, unknown>;
	addResource: (resource: ResourceDefinition) => Effect.Effect<ResourceDefinition, unknown>;
	updateResource: (resource: ResourceDefinition) => Effect.Effect<ResourceDefinition, unknown>;
	removeResource: (name: string) => Effect.Effect<void, unknown>;
	removeBioconductorPackageResources: (
		packageName: string
	) => Effect.Effect<ConfigBioconductorRemovalReceipt, unknown>;
	restoreBioconductorPackageResources: (receipt: ConfigBioconductorRemovalReceipt) => Effect.Effect<void, unknown>;
	clearResources: () => Effect.Effect<{ cleared: number }, unknown>;
	reload: () => Effect.Effect<void, unknown>;
};

export type Service = ConfigService;

const expandHome = (path: string): string => {
	const home = process.env.HOME ?? process.env.USERPROFILE ?? '';
	if (path.startsWith('~/')) return home + path.slice(1);
	return path;
};

const resolveDataDirectory = (rawPath: string, baseDir: string): string => {
	const expanded = expandHome(rawPath);
	if (path.isAbsolute(expanded)) return expanded;
	return path.resolve(baseDir, expanded);
};

const readConfigText = async (configPath: string) => {
	try {
		return await Bun.file(configPath).text();
	} catch (cause) {
		throw new ConfigError({
			message: `Failed to read config file: "${configPath}"`,
			hint: 'Check that the file exists and you have read permissions.',
			cause
		});
	}
};

const parseConfigText = (configPath: string, content: string) => {
	try {
		return parseJsonc(content);
	} catch (cause) {
		throw new ConfigError({
			message: 'Failed to parse config file - invalid JSON syntax',
			hint: `Check "${configPath}" for syntax errors like missing commas, brackets, or quotes.`,
			cause
		});
	}
};

const validateStoredConfig = (parsed: unknown): StoredConfig => {
	const result = StoredConfigSchema.safeParse(parsed);
	if (result.success) return normalizeStoredConfig(result.data);
	const issues = result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
	throw new ConfigError({
		message: `Invalid config structure:\n${issues}`,
		hint: `${CommonHints.CHECK_CONFIG} Required fields: "resources" (array), "model" (string), "provider" (string).`,
		cause: result.error
	});
};

const writeConfigFile = async (
	configPath: string,
	stored: StoredConfig,
	message: string,
	hint: string
) => {
	try {
		await Bun.write(configPath, JSON.stringify(normalizeStoredConfig(stored), null, 2));
	} catch (cause) {
		throw new ConfigError({
			message,
			hint,
			cause
		});
	}
};

const loadConfigFromPath = async (configPath: string): Promise<StoredConfig> => {
	const content = await readConfigText(configPath);
	const parsed = parseConfigText(configPath, content);
	return validateStoredConfig(parsed);
};

const createDefaultConfig = async (configPath: string): Promise<StoredConfig> => {
	const configDir = configPath.slice(0, configPath.lastIndexOf('/'));

	const defaultStored: StoredConfig = {
		$schema: CONFIG_SCHEMA_URL,
		resources: DEFAULT_RESOURCES,
		model: DEFAULT_MODEL,
		provider: DEFAULT_PROVIDER,
		providerOptions: DEFAULT_PROVIDER_OPTIONS,
		providerTimeoutMs: DEFAULT_PROVIDER_TIMEOUT_MS,
		maxSteps: DEFAULT_MAX_STEPS
	};

	try {
		await fs.mkdir(configDir, { recursive: true });
	} catch (cause) {
		throw new ConfigError({
			message: `Failed to create config directory: "${configDir}"`,
			hint: 'Check that you have write permissions to the parent directory.',
			cause
		});
	}
	await writeConfigFile(
		configPath,
		defaultStored,
		`Failed to write default config to: "${configPath}"`,
		'Check that you have write permissions to the config directory.'
	);
	return defaultStored;
};

const saveConfig = async (configPath: string, stored: StoredConfig): Promise<void> => {
	await writeConfigFile(
		configPath,
		stored,
		`Failed to save config to: "${configPath}"`,
		'Check that you have write permissions and the disk is not full.'
	);
};

/**
 * Create a config service.
 *
 * When both global and project configs exist, mutations (add/remove resource, update model)
 * only modify the project config. The merged view is computed on-the-fly for reads.
 *
 * @param globalConfig - The global config (always present)
 * @param projectConfig - The project config (null if not using project-level config)
 * @param dataDirectory - Root data directory
 * @param configPath - Path to the config file to save (project if exists, else global)
 */
const makeService = (
	globalConfig: StoredConfig,
	projectConfig: StoredConfig | null,
	dataDirectory: string,
	configPath: string
): ConfigService => {
	const resourcesDirectory = `${dataDirectory}/resources`;
	// Track configs separately to avoid resource leakage
	let currentGlobalConfig = globalConfig;
	let currentProjectConfig = projectConfig;

	// Compute merged resources on-the-fly
	const getMergedResources = (): readonly ResourceDefinition[] => {
		if (!currentProjectConfig) {
			return currentGlobalConfig.resources;
		}
		// Merge: global first, then project overrides by name
		const resourceMap = new Map<string, ResourceDefinition>();
		for (const resource of currentGlobalConfig.resources) {
			resourceMap.set(resource.name, resource);
		}
		for (const resource of currentProjectConfig.resources) {
			resourceMap.set(resource.name, resource);
		}
		return Array.from(resourceMap.values());
	};

	const mergeProviderOptions = (
		globalConfigValue: StoredConfig,
		projectConfigValue: StoredConfig | null
	): ProviderOptionsMap => {
		const merged: ProviderOptionsMap = {};
		const globalOptions = globalConfigValue.providerOptions ?? {};
		const projectOptions = projectConfigValue?.providerOptions ?? {};

		for (const [providerId, options] of Object.entries(globalOptions)) {
			merged[providerId] = { ...options };
		}

		for (const [providerId, options] of Object.entries(projectOptions)) {
			merged[providerId] = { ...(merged[providerId] ?? {}), ...options };
		}

		return merged;
	};

	const getMergedProviderOptions = (): ProviderOptionsMap =>
		mergeProviderOptions(currentGlobalConfig, currentProjectConfig);

	// Get the config that should be used for model/provider
	const getActiveConfig = (): StoredConfig => {
		return currentProjectConfig ?? currentGlobalConfig;
	};

	// Get the config that should be mutated
	const getMutableConfig = (): StoredConfig => {
		return currentProjectConfig ?? currentGlobalConfig;
	};

	// Update the mutable config
	const setMutableConfig = (config: StoredConfig): void => {
		if (currentProjectConfig) {
			currentProjectConfig = config;
		} else {
			currentGlobalConfig = config;
		}
	};

	const updateModelPromise = async (
		provider: string,
		model: string,
		providerOptions?: ProviderOptionsConfig
	): Promise<{ provider: string; model: string; savedTo: ConfigScope }> => {
		if (!isProviderSupported(provider)) {
			const available = getSupportedProviders();
			throw new ConfigError({
				message: `Provider "${provider}" is not supported`,
				hint: `Available providers: ${available.join(', ')}. Open an issue to request this provider: https://github.com/ZohebKhan1/biocontext/issues.`
			});
		}
		const mutableConfig = getMutableConfig();
		const existingProviderOptions = mutableConfig.providerOptions ?? {};
		const nextProviderOptions = providerOptions
			? {
					...existingProviderOptions,
					[provider]: {
						...(existingProviderOptions[provider] ?? {}),
						...providerOptions
					}
				}
			: existingProviderOptions;
		const updated = {
			...mutableConfig,
			provider,
			model,
			...(providerOptions ? { providerOptions: nextProviderOptions } : {})
		};

		if (provider === 'openai-compat') {
			const merged = currentProjectConfig
				? mergeProviderOptions(currentGlobalConfig, updated)
				: mergeProviderOptions(updated, null);
			const compat = merged['openai-compat'];
			const baseURL = compat?.baseURL?.trim();
			const name = compat?.name?.trim();
			if (!baseURL || !name) {
				throw new ConfigError({
					message: 'openai-compat requires baseURL and name',
					hint: 'Run biocontext and use /connect to configure baseURL and name.'
				});
			}
		}
		setMutableConfig(updated);
		await saveConfig(configPath, updated);
		metricsInfo('config.model.updated', { provider, model });
		return {
			provider,
			model,
			savedTo: currentProjectConfig ? 'project' : 'global'
		};
	};

	const addResourcePromise = async (resource: ResourceDefinition): Promise<ResourceDefinition> => {
		const mergedResources = getMergedResources();
		if (mergedResources.some((r) => r.name === resource.name)) {
			throw new ConfigError({
				message: `Resource "${resource.name}" already exists`,
				hint: `Choose a different name or remove the existing resource from biocontext first.`
			});
		}

		const mutableConfig = getMutableConfig();
		const updated = {
			...mutableConfig,
			resources: [...mutableConfig.resources, resource]
		};
		setMutableConfig(updated);
		await saveConfig(configPath, updated);
		metricsInfo('config.resource.added', { name: resource.name, type: resource.type });
		return resource;
	};

	/**
	 * Replace an existing resource definition in place.
	 *
	 * Mirrors `removeResource`'s scoping rules: a project config can only edit
	 * its own entries, and a resource that lives in the global config must be
	 * edited there. Silently shadowing a global entry with a project copy would
	 * make the effective config depend on the working directory.
	 */
	const updateResourcePromise = async (
		resource: ResourceDefinition
	): Promise<ResourceDefinition> => {
		const mergedResources = getMergedResources();
		const existing = mergedResources.find((r) => r.name === resource.name);
		if (!existing) {
			const available = mergedResources.map((r) => r.name);
			throw new ConfigError({
				message: `Resource "${resource.name}" not found`,
				hint:
					available.length > 0
						? `Available resources: ${available.join(', ')}. ${CommonHints.LIST_RESOURCES}`
						: `No resources configured. ${CommonHints.ADD_RESOURCE}`
			});
		}

		if (existing.type !== resource.type) {
			throw new ConfigError({
				message: `Cannot change resource "${resource.name}" from type "${existing.type}" to "${resource.type}"`,
				hint: 'Remove the resource and add it again with the new type.'
			});
		}

		if (currentProjectConfig) {
			const isInProject = currentProjectConfig.resources.some((r) => r.name === resource.name);
			if (!isInProject) {
				throw new ConfigError({
					message: `Resource "${resource.name}" is defined in the global config`,
					hint: `To change this resource globally, edit the global config at "${expandHome(GLOBAL_CONFIG_DIR)}/${GLOBAL_CONFIG_FILENAME}" or run the command without a project config present.`
				});
			}
			const updated = {
				...currentProjectConfig,
				resources: currentProjectConfig.resources.map((r) =>
					r.name === resource.name ? resource : r
				)
			};
			currentProjectConfig = updated;
			await saveConfig(configPath, updated);
			metricsInfo('config.resource.updated', { name: resource.name, from: 'project' });
			return resource;
		}

		const mutableConfig = getMutableConfig();
		const updated = {
			...mutableConfig,
			resources: mutableConfig.resources.map((r) => (r.name === resource.name ? resource : r))
		};
		setMutableConfig(updated);
		await saveConfig(configPath, updated);
		metricsInfo('config.resource.updated', { name: resource.name, from: 'global' });
		return resource;
	};

	const removeResourcePromise = async (name: string): Promise<void> => {
		const mergedResources = getMergedResources();
		const exists = mergedResources.some((r) => r.name === name);
		if (!exists) {
			const available = mergedResources.map((r) => r.name);
			throw new ConfigError({
				message: `Resource "${name}" not found`,
				hint:
					available.length > 0
						? `Available resources: ${available.join(', ')}. ${CommonHints.LIST_RESOURCES}`
						: `No resources configured. ${CommonHints.ADD_RESOURCE}`
			});
		}

		const mutableConfig = getMutableConfig();
		const isInMutableConfig = mutableConfig.resources.some((r) => r.name === name);

		if (currentProjectConfig) {
			const isInGlobal = currentGlobalConfig.resources.some((r) => r.name === name);
			const isInProject = currentProjectConfig.resources.some((r) => r.name === name);

			if (isInProject) {
				const updated = {
					...currentProjectConfig,
					resources: currentProjectConfig.resources.filter((r) => r.name !== name)
				};
				currentProjectConfig = updated;
				await saveConfig(configPath, updated);
				metricsInfo('config.resource.removed', { name, from: 'project' });
			} else if (isInGlobal) {
				throw new ConfigError({
					message: `Resource "${name}" is defined in the global config`,
					hint: `To remove this resource globally, edit the global config at "${expandHome(GLOBAL_CONFIG_DIR)}/${GLOBAL_CONFIG_FILENAME}" or run the command without a project config present.`
				});
			}
		} else {
			if (!isInMutableConfig) {
				throw new ConfigError({
					message: `Resource "${name}" not found in config`,
					hint: CommonHints.LIST_RESOURCES
				});
			}
			const updated = {
				...mutableConfig,
				resources: mutableConfig.resources.filter((r) => r.name !== name)
			};
			setMutableConfig(updated);
			await saveConfig(configPath, updated);
			metricsInfo('config.resource.removed', { name, from: 'global' });
		}
	};

	const packageMatches = (resource: ResourceDefinition, packageName: string): boolean =>
		(resource.type === 'bioconductor' || resource.type === 'cran') &&
		resource.package.trim().toLowerCase() === packageName.trim().toLowerCase();

	/** Remove every active config entry that points at one managed package cache. */
	const removeBioconductorPackageResourcesPromise = async (
		packageName: string
	): Promise<ConfigBioconductorRemovalReceipt> => {
		const scope: ConfigScope = currentProjectConfig ? 'project' : 'global';
		if (currentProjectConfig) {
			const globalMatches = currentGlobalConfig.resources.filter((resource) =>
				packageMatches(resource, packageName)
			);
			if (globalMatches.length > 0) {
				throw new ConfigError({
					message: `${packageName} is configured globally and cannot be removed from a project-scoped session`,
					hint: `Run biocontext outside a directory containing ${PROJECT_CONFIG_FILENAME}, then use /remove ${packageName} --yes.`
				});
			}
		}

		const mutableConfig = getMutableConfig();
		const entries = mutableConfig.resources.flatMap((resource, index) =>
			packageMatches(resource, packageName) ? [{ index, resource }] : []
		);
		if (entries.length === 0) return { scope, removedNames: [], entries: [] };

		const updated = {
			...mutableConfig,
			resources: mutableConfig.resources.filter(
				(resource) => !packageMatches(resource, packageName)
			)
		};
		setMutableConfig(updated);
		try {
			await saveConfig(configPath, updated);
		} catch (cause) {
			setMutableConfig(mutableConfig);
			throw cause;
		}
		const removedNames = entries.map((entry) => entry.resource.name);
		metricsInfo('config.bioconductor_package.removed', { package: packageName, removedNames, scope });
		return { scope, removedNames, entries };
	};

	const restoreBioconductorPackageResourcesPromise = async (
		receipt: ConfigBioconductorRemovalReceipt
	): Promise<void> => {
		if (receipt.entries.length === 0) return;
		const currentScope: ConfigScope = currentProjectConfig ? 'project' : 'global';
		if (receipt.scope !== currentScope) {
			throw new ConfigError({
				message: 'Cannot restore Bioconductor config resources into a different config scope',
				hint: `Restore the affected entries in "${configPath}" manually.`
			});
		}

		const mutableConfig = getMutableConfig();
		const occupied = new Set(
			mutableConfig.resources.map((resource) => resource.name.trim().toLowerCase())
		);
		const collision = receipt.entries.find((entry) =>
			occupied.has(entry.resource.name.trim().toLowerCase())
		);
		if (collision) {
			throw new ConfigError({
				message: `Cannot restore resource "${collision.resource.name}" because that name is already in use`,
				hint: `Restore the original entry in "${configPath}" manually.`
			});
		}

		const resources = [...mutableConfig.resources];
		for (const entry of [...receipt.entries].sort((left, right) => left.index - right.index)) {
			resources.splice(Math.min(entry.index, resources.length), 0, entry.resource);
		}
		const restored = { ...mutableConfig, resources };
		setMutableConfig(restored);
		try {
			await saveConfig(configPath, restored);
		} catch (cause) {
			setMutableConfig(mutableConfig);
			throw cause;
		}
		metricsInfo('config.bioconductor_package.restored', {
			removedNames: receipt.removedNames,
			scope: receipt.scope
		});
	};

	const clearResourcesPromise = async (): Promise<{ cleared: number }> => {
		let resourcesDir: Dirent[] = [];
		try {
			resourcesDir = await fs.readdir(resourcesDirectory, { withFileTypes: true });
		} catch {
			resourcesDir = [];
		}

		let clearedCount = 0;
		for (const item of resourcesDir) {
			// Never recursively remove arbitrary user data from the cache root. Only
			// delete directories that biocontext can positively identify as a
			// managed Bioconductor cache, a Git checkout, or an internal staging dir.
			if (item.isSymbolicLink() || !item.isDirectory()) continue;
			const target = path.join(resourcesDirectory, item.name);
			const isStagingDirectory =
				item.name === '.tmp' || item.name.includes('.partial-') || item.name.endsWith('.previous');
			let isManaged = isStagingDirectory;
			if (!isManaged) {
				isManaged = (await readBioconductorResourceMetadata(target)) !== null;
			}
			if (!isManaged) {
				try {
					isManaged = (await fs.stat(path.join(target, '.git'))).isDirectory();
				} catch {
					isManaged = false;
				}
			}
			if (!isManaged) continue;
			try {
				await fs.rm(target, { recursive: true, force: true });
				clearedCount++;
			} catch {
				continue;
			}
		}

		metricsInfo('config.resources.cleared', { count: clearedCount });
		return { cleared: clearedCount };
	};

	const reloadPromise = async (): Promise<void> => {
		metricsInfo('config.reload.start', { configPath });

		const configExists = await Bun.file(configPath).exists();
		if (!configExists) {
			metricsInfo('config.reload.skipped', { reason: 'file not found', configPath });
			return;
		}

		const reloaded = await loadConfigFromPath(configPath);

		if (currentProjectConfig !== null) {
			currentProjectConfig = reloaded;
		} else {
			currentGlobalConfig = reloaded;
		}

		metricsInfo('config.reload.done', {
			resources: reloaded.resources.length,
			configPath
		});
	};

	const service: ConfigService = {
		resourcesDirectory,
		dataDirectory,
		configPath,
		get resources() {
			return getMergedResources();
		},
		get model() {
			return getActiveConfig().model ?? DEFAULT_MODEL;
		},
		get provider() {
			return getActiveConfig().provider ?? DEFAULT_PROVIDER;
		},
		get providerTimeoutMs() {
			return getActiveConfig().providerTimeoutMs;
		},
		get maxSteps() {
			return getActiveConfig().maxSteps ?? DEFAULT_MAX_STEPS;
		},
		getProviderOptions: (providerId: string) => getMergedProviderOptions()[providerId],
		getResource: (name: string) => getMergedResources().find((r) => r.name === name),

		updateModel: (provider, model, providerOptions) =>
			Effect.tryPromise({
				try: () => updateModelPromise(provider, model, providerOptions),
				catch: (cause) => cause
			}),
		addResource: (resource) =>
			Effect.tryPromise({
				try: () => addResourcePromise(resource),
				catch: (cause) => cause
			}),
		updateResource: (resource) =>
			Effect.tryPromise({
				try: () => updateResourcePromise(resource),
				catch: (cause) => cause
			}),
		removeResource: (name) =>
			Effect.tryPromise({
				try: () => removeResourcePromise(name),
				catch: (cause) => cause
			}),
		removeBioconductorPackageResources: (packageName) =>
			Effect.tryPromise({
				try: () => removeBioconductorPackageResourcesPromise(packageName),
				catch: (cause) => cause
			}),
		restoreBioconductorPackageResources: (receipt) =>
			Effect.tryPromise({
				try: () => restoreBioconductorPackageResourcesPromise(receipt),
				catch: (cause) => cause
			}),
		clearResources: () =>
			Effect.tryPromise({
				try: () => clearResourcesPromise(),
				catch: (cause) => cause
			}),
		reload: () =>
			Effect.tryPromise({
				try: () => reloadPromise(),
				catch: (cause) => cause
			})
	};

	return service;
};

export const load = async (): Promise<ConfigService> => {
	const cwd = process.cwd();
	metricsInfo('config.load.start', { cwd });

	const globalConfigPath = `${expandHome(GLOBAL_CONFIG_DIR)}/${GLOBAL_CONFIG_FILENAME}`;
	const projectConfigPath = `${cwd}/${PROJECT_CONFIG_FILENAME}`;

	// First, load or create the global config
	let globalConfig: StoredConfig;
	const globalExists = await Bun.file(globalConfigPath).exists();

	if (!globalExists) {
		metricsInfo('config.load.global', { source: 'default', path: globalConfigPath });
		globalConfig = await createDefaultConfig(globalConfigPath);
	} else {
		metricsInfo('config.load.global', { source: 'existing', path: globalConfigPath });
		globalConfig = await loadConfigFromPath(globalConfigPath);
	}

	// Now check for project config and merge if it exists
	const projectExists = await Bun.file(projectConfigPath).exists();
	if (projectExists) {
		metricsInfo('config.load.project', { source: 'project', path: projectConfigPath });
		const projectConfig = await loadConfigFromPath(projectConfigPath);

		metricsInfo('config.load.merged', {
			globalResources: globalConfig.resources.length,
			projectResources: projectConfig.resources.length
		});

		// Use project paths for data storage when project config exists
		// Pass both configs separately to avoid resource leakage on mutations
		const projectDataDir =
			projectConfig.dataDirectory ?? globalConfig.dataDirectory ?? expandHome(GLOBAL_DATA_DIR);

		const resolvedProjectDataDir = resolveDataDirectory(projectDataDir, cwd);
		return makeService(globalConfig, projectConfig, resolvedProjectDataDir, projectConfigPath);
	}

	// No project config, use global only
	metricsInfo('config.load.source', { source: 'global', path: globalConfigPath });
	const globalDataDir = globalConfig.dataDirectory ?? expandHome(GLOBAL_DATA_DIR);
	const resolvedGlobalDataDir = resolveDataDirectory(globalDataDir, expandHome(GLOBAL_CONFIG_DIR));
	return makeService(globalConfig, null, resolvedGlobalDataDir, globalConfigPath);
};
