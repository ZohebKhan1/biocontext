import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Effect } from 'effect';

import {
	load as loadConfig,
	DEFAULT_MAX_STEPS,
	DEFAULT_MODEL,
	DEFAULT_PROVIDER_OPTIONS,
	DEFAULT_PROVIDER,
	DEFAULT_RESOURCES
} from './index.ts';

const Config = { load: loadConfig } as const;

describe('Config', () => {
	let testDir: string;
	let originalCwd: string;
	let originalHome: string | undefined;

	beforeEach(async () => {
		testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'biocontext-config-test-'));
		originalCwd = process.cwd();
		originalHome = process.env.HOME;
		// Point HOME to test dir so global config goes there
		process.env.HOME = testDir;
	});

	afterEach(async () => {
		process.chdir(originalCwd);
		process.env.HOME = originalHome;
		await fs.rm(testDir, { recursive: true, force: true });
	});

	describe('Config.load', () => {
		it('creates default config when no config exists', async () => {
			process.chdir(testDir);

			const config = await Config.load();

			expect(config.provider).toBe(DEFAULT_PROVIDER);
			expect(config.model).toBe(DEFAULT_MODEL);
			expect(config.getProviderOptions(DEFAULT_PROVIDER)).toEqual(DEFAULT_PROVIDER_OPTIONS.openai);
			expect(config.maxSteps).toBe(DEFAULT_MAX_STEPS);
			expect(config.resources.length).toBe(DEFAULT_RESOURCES.length);
			expect(config.getResource('Bioconductor')).toBeDefined();
		});

		it('clearResources preserves unrecognized data in the resources directory', async () => {
			process.chdir(testDir);
			const config = await Config.load();
			const managedClone = path.join(config.resourcesDirectory, 'managed-repo');
			const staging = path.join(config.resourcesDirectory, 'DESeq2.partial-test');
			const userData = path.join(config.resourcesDirectory, 'user-notes');
			await fs.mkdir(path.join(managedClone, '.git'), { recursive: true });
			await fs.mkdir(staging, { recursive: true });
			await fs.mkdir(userData, { recursive: true });

			const result = await Effect.runPromise(config.clearResources());

			expect(result.cleared).toBe(2);
			expect(await fs.stat(userData)).toBeTruthy();
			await expect(fs.stat(managedClone)).rejects.toThrow();
			await expect(fs.stat(staging)).rejects.toThrow();
		});

		it('loads project config when biocontext.config.jsonc exists in cwd (merged with global)', async () => {
			const projectConfig = {
				$schema:
					'https://raw.githubusercontent.com/ZohebKhan1/biocontext/main/biocontext.schema.json',
				provider: 'test-provider',
				model: 'test-model',
				resources: [
					{
						name: 'test-resource',
						type: 'git',
						url: 'https://github.com/test/repo',
						branch: 'main'
					}
				]
			};

			await fs.writeFile(
				path.join(testDir, 'biocontext.config.jsonc'),
				JSON.stringify(projectConfig)
			);
			process.chdir(testDir);

			const config = await Config.load();

			// Project provider/model should take priority
			expect(config.provider).toBe('test-provider');
			expect(config.model).toBe('test-model');
			// Resources are merged: one project resource plus the default Bioconductor corpus.
			expect(config.resources.length).toBe(1 + DEFAULT_RESOURCES.length);
			expect(config.getResource('test-resource')).toBeDefined();
			// Default resources should still be present
			expect(config.getResource('Bioconductor')).toBeDefined();
		});

		it('handles JSONC with comments', async () => {
			const projectConfigWithComments = `{
				// This is a comment
				"$schema": "https://raw.githubusercontent.com/ZohebKhan1/biocontext/main/biocontext.schema.json",
				"provider": "commented-provider",
				"model": "commented-model",
				/* Multi-line
				   comment */
				"resources": [
					{
						"name": "commented-resource",
						"type": "git",
						"url": "https://github.com/test/repo",
						"branch": "main",
					}
				],
			}`;

			await fs.writeFile(
				path.join(testDir, 'biocontext.config.jsonc'),
				projectConfigWithComments
			);
			process.chdir(testDir);

			const config = await Config.load();

			expect(config.provider).toBe('commented-provider');
			expect(config.model).toBe('commented-model');
		});

		it('loads maxSteps when provided in config', async () => {
			const projectConfig = {
				$schema:
					'https://raw.githubusercontent.com/ZohebKhan1/biocontext/main/biocontext.schema.json',
				provider: 'test-provider',
				model: 'test-model',
				maxSteps: 80,
				resources: [
					{
						name: 'test-resource',
						type: 'git',
						url: 'https://github.com/test/repo',
						branch: 'main'
					}
				]
			};

			await fs.writeFile(
				path.join(testDir, 'biocontext.config.jsonc'),
				JSON.stringify(projectConfig)
			);
			process.chdir(testDir);

			const config = await Config.load();

			expect(config.maxSteps).toBe(80);
		});

		it('loads provider-specific reasoning options', async () => {
			const projectConfig = {
				$schema:
					'https://raw.githubusercontent.com/ZohebKhan1/biocontext/main/biocontext.schema.json',
				provider: 'openai',
				model: 'gpt-5.6-luna',
				providerOptions: {
					openai: { reasoningEffort: 'medium' }
				},
				resources: []
			};

			await fs.writeFile(
				path.join(testDir, 'biocontext.config.jsonc'),
				JSON.stringify(projectConfig)
			);
			process.chdir(testDir);

			const config = await Config.load();

			expect(config.getProviderOptions('openai')?.reasoningEffort).toBe('medium');
		});

		it('getResource returns undefined for unknown resource', async () => {
			process.chdir(testDir);

			const config = await Config.load();

			expect(config.getResource('nonexistent')).toBeUndefined();
		});

		it('throws ConfigError for invalid JSON', async () => {
			await fs.writeFile(path.join(testDir, 'biocontext.config.jsonc'), 'not valid json {{{');
			process.chdir(testDir);

			expect(Config.load()).rejects.toThrow('Failed to parse config file');
		});

		it('throws ConfigError for invalid schema', async () => {
			const invalidConfig = {
				provider: 'test'
				// missing required fields
			};

			await fs.writeFile(
				path.join(testDir, 'biocontext.config.jsonc'),
				JSON.stringify(invalidConfig)
			);
			process.chdir(testDir);

			expect(Config.load()).rejects.toThrow('Invalid config');
		});

		it('throws ConfigError for invalid maxSteps', async () => {
			const invalidConfig = {
				$schema:
					'https://raw.githubusercontent.com/ZohebKhan1/biocontext/main/biocontext.schema.json',
				provider: 'test-provider',
				model: 'test-model',
				maxSteps: 0,
				resources: [
					{
						name: 'test-resource',
						type: 'git',
						url: 'https://github.com/test/repo',
						branch: 'main'
					}
				]
			};

			await fs.writeFile(
				path.join(testDir, 'biocontext.config.jsonc'),
				JSON.stringify(invalidConfig)
			);
			process.chdir(testDir);

			expect(Config.load()).rejects.toThrow('Invalid config');
		});

		it('merges project config with global config (project takes priority)', async () => {
			// Create global config with some resources
			const globalConfigDir = path.join(testDir, '.config', 'biocontext');
			await fs.mkdir(globalConfigDir, { recursive: true });
			const globalConfig = {
				$schema:
					'https://raw.githubusercontent.com/ZohebKhan1/biocontext/main/biocontext.schema.json',
				provider: 'global-provider',
				model: 'global-model',
				resources: [
					{
						name: 'shared-resource',
						type: 'git',
						url: 'https://github.com/global/repo',
						branch: 'main'
					},
					{
						name: 'global-only-resource',
						type: 'git',
						url: 'https://github.com/global/only',
						branch: 'main'
					}
				]
			};
			await fs.writeFile(
				path.join(globalConfigDir, 'biocontext.config.jsonc'),
				JSON.stringify(globalConfig)
			);

			// Create project config that overrides some settings
			const projectDir = path.join(testDir, 'my-project');
			await fs.mkdir(projectDir, { recursive: true });
			const projectConfig = {
				$schema:
					'https://raw.githubusercontent.com/ZohebKhan1/biocontext/main/biocontext.schema.json',
				provider: 'project-provider',
				model: 'project-model',
				resources: [
					{
						name: 'shared-resource',
						type: 'git',
						url: 'https://github.com/project/repo', // Different URL - should override
						branch: 'develop'
					},
					{
						name: 'project-only-resource',
						type: 'git',
						url: 'https://github.com/project/only',
						branch: 'main'
					}
				]
			};
			await fs.writeFile(
				path.join(projectDir, 'biocontext.config.jsonc'),
				JSON.stringify(projectConfig)
			);
			process.chdir(projectDir);

			const config = await Config.load();

			// Project provider/model should take priority
			expect(config.provider).toBe('project-provider');
			expect(config.model).toBe('project-model');

			// Should have 3 resources: shared (from project), global-only, project-only
			expect(config.resources.length).toBe(3);

			// shared-resource should have project's URL (override)
			const sharedResource = config.getResource('shared-resource');
			expect(sharedResource).toBeDefined();
			expect(sharedResource?.type).toBe('git');
			if (sharedResource?.type === 'git') {
				expect(sharedResource.url).toBe('https://github.com/project/repo');
				expect(sharedResource.branch).toBe('develop');
			}

			// global-only-resource should still be present
			const globalOnlyResource = config.getResource('global-only-resource');
			expect(globalOnlyResource).toBeDefined();
			if (globalOnlyResource?.type === 'git') {
				expect(globalOnlyResource.url).toBe('https://github.com/global/only');
			}

			// project-only-resource should be present
			const projectOnlyResource = config.getResource('project-only-resource');
			expect(projectOnlyResource).toBeDefined();
			if (projectOnlyResource?.type === 'git') {
				expect(projectOnlyResource.url).toBe('https://github.com/project/only');
			}
		});

		it('uses only global config when no project config exists', async () => {
			// Create global config
			const globalConfigDir = path.join(testDir, '.config', 'biocontext');
			await fs.mkdir(globalConfigDir, { recursive: true });
			const globalConfig = {
				$schema:
					'https://raw.githubusercontent.com/ZohebKhan1/biocontext/main/biocontext.schema.json',
				provider: 'global-provider',
				model: 'global-model',
				resources: [
					{
						name: 'global-resource',
						type: 'git',
						url: 'https://github.com/global/repo',
						branch: 'main'
					}
				]
			};
			await fs.writeFile(
				path.join(globalConfigDir, 'biocontext.config.jsonc'),
				JSON.stringify(globalConfig)
			);

			// Create project directory without config
			const projectDir = path.join(testDir, 'my-project');
			await fs.mkdir(projectDir, { recursive: true });
			process.chdir(projectDir);

			const config = await Config.load();

			expect(config.provider).toBe('global-provider');
			expect(config.model).toBe('global-model');
			expect(config.resources.length).toBe(1);
			expect(config.getResource('global-resource')).toBeDefined();
		});
	});

	describe('Config mutations (resource leakage prevention)', () => {
		it('addResource only adds to project config, not global resources', async () => {
			// Create global config with some resources
			const globalConfigDir = path.join(testDir, '.config', 'biocontext');
			await fs.mkdir(globalConfigDir, { recursive: true });
			const globalConfig = {
				$schema:
					'https://raw.githubusercontent.com/ZohebKhan1/biocontext/main/biocontext.schema.json',
				provider: 'global-provider',
				model: 'global-model',
				resources: [
					{
						name: 'DESeq2',
						type: 'git',
						url: 'https://github.com/thelovelab/DESeq2',
						branch: 'main'
					},
					{
						name: 'limma',
						type: 'git',
						url: 'https://github.com/Bioconductor/limma',
						branch: 'main'
					}
				]
			};
			await fs.writeFile(
				path.join(globalConfigDir, 'biocontext.config.jsonc'),
				JSON.stringify(globalConfig)
			);

			// Create project config with one resource
			const projectDir = path.join(testDir, 'my-project');
			await fs.mkdir(projectDir, { recursive: true });
			const projectConfig = {
				$schema:
					'https://raw.githubusercontent.com/ZohebKhan1/biocontext/main/biocontext.schema.json',
				provider: 'project-provider',
				model: 'project-model',
				resources: [
					{
						name: 'myproject',
						type: 'git',
						url: 'https://github.com/test/myproject',
						branch: 'main'
					}
				]
			};
			const projectConfigPath = path.join(projectDir, 'biocontext.config.jsonc');
			await fs.writeFile(projectConfigPath, JSON.stringify(projectConfig));
			process.chdir(projectDir);

			const config = await Config.load();

			// Verify merged state: 3 resources (2 global + 1 project)
			expect(config.resources.length).toBe(3);

			// Add a new resource
			await Effect.runPromise(
				config.addResource({
					name: 'new-resource',
					type: 'git',
					url: 'https://github.com/test/new-resource',
					branch: 'main'
				})
			);

			// Verify merged state shows 4 resources
			expect(config.resources.length).toBe(4);
			expect(config.getResource('new-resource')).toBeDefined();

			// CRITICAL: Read the project config file and verify it only has project resources
			const savedProjectConfig = JSON.parse(await fs.readFile(projectConfigPath, 'utf-8'));
			expect(savedProjectConfig.resources.length).toBe(2); // myproject + new-resource
			expect(savedProjectConfig.resources.map((r: { name: string }) => r.name)).toEqual([
				'myproject',
				'new-resource'
			]);
			// Global resources should NOT be in project config
			expect(
				savedProjectConfig.resources.find((r: { name: string }) => r.name === 'DESeq2')
			).toBeUndefined();
			expect(
				savedProjectConfig.resources.find((r: { name: string }) => r.name === 'limma')
			).toBeUndefined();
		});

		it('removeResource only removes from project config, errors for global resources', async () => {
			// Create global config with some resources
			const globalConfigDir = path.join(testDir, '.config', 'biocontext');
			await fs.mkdir(globalConfigDir, { recursive: true });
			const globalConfig = {
				$schema:
					'https://raw.githubusercontent.com/ZohebKhan1/biocontext/main/biocontext.schema.json',
				provider: 'global-provider',
				model: 'global-model',
				resources: [
					{
						name: 'DESeq2',
						type: 'git',
						url: 'https://github.com/thelovelab/DESeq2',
						branch: 'main'
					},
					{
						name: 'limma',
						type: 'git',
						url: 'https://github.com/Bioconductor/limma',
						branch: 'main'
					}
				]
			};
			const globalConfigPath = path.join(globalConfigDir, 'biocontext.config.jsonc');
			await fs.writeFile(globalConfigPath, JSON.stringify(globalConfig));

			// Create project config with one resource
			const projectDir = path.join(testDir, 'my-project');
			await fs.mkdir(projectDir, { recursive: true });
			const projectConfig = {
				$schema:
					'https://raw.githubusercontent.com/ZohebKhan1/biocontext/main/biocontext.schema.json',
				provider: 'project-provider',
				model: 'project-model',
				resources: [
					{
						name: 'myproject',
						type: 'git',
						url: 'https://github.com/test/myproject',
						branch: 'main'
					}
				]
			};
			const projectConfigPath = path.join(projectDir, 'biocontext.config.jsonc');
			await fs.writeFile(projectConfigPath, JSON.stringify(projectConfig));
			process.chdir(projectDir);

			const config = await Config.load();

			// Verify merged state: 3 resources (2 global + 1 project)
			expect(config.resources.length).toBe(3);

			// Remove the project resource
			await Effect.runPromise(config.removeResource('myproject'));

			// Verify merged state shows 2 resources (only global)
			expect(config.resources.length).toBe(2);
			expect(config.getResource('myproject')).toBeUndefined();

			// CRITICAL: Read the project config file and verify it's empty
			const savedProjectConfig = JSON.parse(await fs.readFile(projectConfigPath, 'utf-8'));
			expect(savedProjectConfig.resources.length).toBe(0);
			// Global resources should NOT have leaked into project config
			expect(
				savedProjectConfig.resources.find((r: { name: string }) => r.name === 'DESeq2')
			).toBeUndefined();
			expect(
				savedProjectConfig.resources.find((r: { name: string }) => r.name === 'limma')
			).toBeUndefined();

			// Trying to remove a global resource should throw an error
			expect(Effect.runPromise(config.removeResource('DESeq2'))).rejects.toThrow(
				'Resource "DESeq2" is defined in the global config'
			);

			// Verify global config is unchanged
			const savedGlobalConfig = JSON.parse(await fs.readFile(globalConfigPath, 'utf-8'));
			expect(savedGlobalConfig.resources.length).toBe(2);
			expect(savedGlobalConfig.resources.map((r: { name: string }) => r.name)).toEqual([
				'DESeq2',
				'limma'
			]);
		});

		it('updateModel only updates project config, not global', async () => {
			// Create global config
			const globalConfigDir = path.join(testDir, '.config', 'biocontext');
			await fs.mkdir(globalConfigDir, { recursive: true });
			const globalConfig = {
				$schema:
					'https://raw.githubusercontent.com/ZohebKhan1/biocontext/main/biocontext.schema.json',
				provider: 'global-provider',
				model: 'global-model',
				resources: [
					{
						name: 'DESeq2',
						type: 'git',
						url: 'https://github.com/thelovelab/DESeq2',
						branch: 'main'
					}
				]
			};
			const globalConfigPath = path.join(globalConfigDir, 'biocontext.config.jsonc');
			await fs.writeFile(globalConfigPath, JSON.stringify(globalConfig));

			// Create project config
			const projectDir = path.join(testDir, 'my-project');
			await fs.mkdir(projectDir, { recursive: true });
			const projectConfig = {
				$schema:
					'https://raw.githubusercontent.com/ZohebKhan1/biocontext/main/biocontext.schema.json',
				provider: 'project-provider',
				model: 'project-model',
				resources: []
			};
			const projectConfigPath = path.join(projectDir, 'biocontext.config.jsonc');
			await fs.writeFile(projectConfigPath, JSON.stringify(projectConfig));
			process.chdir(projectDir);

			const config = await Config.load();

			// Update the model
			const nextProvider = 'openrouter';
			const nextModel = 'openai/gpt-4o-mini';
			await Effect.runPromise(config.updateModel(nextProvider, nextModel));

			expect(config.provider).toBe(nextProvider);
			expect(config.model).toBe(nextModel);

			// CRITICAL: Verify project config was updated
			const savedProjectConfig = JSON.parse(await fs.readFile(projectConfigPath, 'utf-8'));
			expect(savedProjectConfig.provider).toBe(nextProvider);
			expect(savedProjectConfig.model).toBe(nextModel);
			// Global resources should NOT have leaked into project config
			expect(savedProjectConfig.resources.length).toBe(0);

			// Verify global config is unchanged
			const savedGlobalConfig = JSON.parse(await fs.readFile(globalConfigPath, 'utf-8'));
			expect(savedGlobalConfig.provider).toBe('global-provider');
			expect(savedGlobalConfig.model).toBe('global-model');
		});

		it('mutations work correctly when only global config exists', async () => {
			// Create global config
			const globalConfigDir = path.join(testDir, '.config', 'biocontext');
			await fs.mkdir(globalConfigDir, { recursive: true });
			const globalConfig = {
				$schema:
					'https://raw.githubusercontent.com/ZohebKhan1/biocontext/main/biocontext.schema.json',
				provider: 'global-provider',
				model: 'global-model',
				resources: [
					{
						name: 'DESeq2',
						type: 'git',
						url: 'https://github.com/thelovelab/DESeq2',
						branch: 'main'
					}
				]
			};
			const globalConfigPath = path.join(globalConfigDir, 'biocontext.config.jsonc');
			await fs.writeFile(globalConfigPath, JSON.stringify(globalConfig));

			// Use a directory without project config
			const projectDir = path.join(testDir, 'my-project');
			await fs.mkdir(projectDir, { recursive: true });
			process.chdir(projectDir);

			const config = await Config.load();

			// Add a resource (should go to global)
			await Effect.runPromise(
				config.addResource({
					name: 'new-resource',
					type: 'git',
					url: 'https://github.com/test/new-resource',
					branch: 'main'
				})
			);

			expect(config.resources.length).toBe(2);

			// Verify global config was updated
			const savedGlobalConfig = JSON.parse(await fs.readFile(globalConfigPath, 'utf-8'));
			expect(savedGlobalConfig.resources.length).toBe(2);
			expect(savedGlobalConfig.resources.map((r: { name: string }) => r.name)).toEqual([
				'DESeq2',
				'new-resource'
			]);

			// Remove a resource (should work since we're in global-only mode)
			await Effect.runPromise(config.removeResource('DESeq2'));
			expect(config.resources.length).toBe(1);

			const savedGlobalConfig2 = JSON.parse(await fs.readFile(globalConfigPath, 'utf-8'));
			expect(savedGlobalConfig2.resources.length).toBe(1);
			expect(savedGlobalConfig2.resources[0].name).toBe('new-resource');
		});
	});
	describe('Config.removeBioconductorPackageResources', () => {
		it('removes every matching package alias and restores their original order', async () => {
			const globalConfigDir = path.join(testDir, '.config', 'biocontext');
			const globalConfigPath = path.join(globalConfigDir, 'biocontext.config.jsonc');
			await fs.mkdir(globalConfigDir, { recursive: true });
			await fs.writeFile(
				globalConfigPath,
				JSON.stringify({
					provider: 'p',
					model: 'm',
					resources: [
						{ type: 'bioconductor', name: 'deseq-docs', package: 'DESeq2' },
						{
							type: 'git',
							name: 'other',
							url: 'https://github.com/example/other',
							branch: 'main'
						},
						{ type: 'bioconductor', name: 'DESeq2', package: 'DESeq2' }
					]
				})
			);
			process.chdir(testDir);
			const config = await Config.load();

			const receipt = await Effect.runPromise(config.removeBioconductorPackageResources('deseq2'));
			expect(receipt.removedNames).toEqual(['deseq-docs', 'DESeq2']);
			expect(config.resources.map((resource) => resource.name)).toEqual(['other']);

			await Effect.runPromise(config.restoreBioconductorPackageResources(receipt));
			expect(config.resources.map((resource) => resource.name)).toEqual([
				'deseq-docs',
				'other',
				'DESeq2'
			]);
		});

		it('removes and restores a matching CRAN package resource', async () => {
			const globalConfigDir = path.join(testDir, '.config', 'biocontext');
			const globalConfigPath = path.join(globalConfigDir, 'biocontext.config.jsonc');
			await fs.mkdir(globalConfigDir, { recursive: true });
			await fs.writeFile(
				globalConfigPath,
				JSON.stringify({
					provider: 'p',
					model: 'm',
					resources: [
						{ type: 'cran', name: 'Seurat', package: 'Seurat' },
						{ type: 'local', name: 'notes', path: '/tmp/notes' }
					]
				})
			);
			process.chdir(testDir);
			const config = await Config.load();

			const receipt = await Effect.runPromise(config.removeBioconductorPackageResources('seurat'));
			expect(receipt.removedNames).toEqual(['Seurat']);
			expect(config.resources.map((resource) => resource.name)).toEqual(['notes']);

			await Effect.runPromise(config.restoreBioconductorPackageResources(receipt));
			expect(config.resources.map((resource) => resource.name)).toEqual(['Seurat', 'notes']);
		});

		it('refuses to delete a global package entry from project scope', async () => {
			const globalConfigDir = path.join(testDir, '.config', 'biocontext');
			await fs.mkdir(globalConfigDir, { recursive: true });
			await fs.writeFile(
				path.join(globalConfigDir, 'biocontext.config.jsonc'),
				JSON.stringify({
					provider: 'p',
					model: 'm',
					resources: [{ type: 'bioconductor', name: 'DESeq2', package: 'DESeq2' }]
				})
			);
			await fs.writeFile(
				path.join(testDir, 'biocontext.config.jsonc'),
				JSON.stringify({ resources: [] })
			);
			process.chdir(testDir);
			const config = await Config.load();

			await expect(Effect.runPromise(config.removeBioconductorPackageResources('DESeq2'))).rejects.toThrow(
				'configured globally'
			);
			expect(config.getResource('DESeq2')).toBeDefined();
		});
	});

	describe('Config.updateResource', () => {
		const globalOnly = async () => {
			const globalConfigDir = path.join(testDir, '.config', 'biocontext');
			await fs.mkdir(globalConfigDir, { recursive: true });
			await fs.writeFile(
				path.join(globalConfigDir, 'biocontext.config.jsonc'),
				JSON.stringify({
					provider: 'p',
					model: 'm',
					resources: [{ type: 'bioconductor', name: 'DESeq2', package: 'DESeq2' }]
				})
			);
			process.chdir(testDir);
			return Config.load();
		};

		it('normalizes legacy boolean source settings on the next config write', async () => {
			const config = await globalOnly();
			await Effect.runPromise(
				config.updateResource({ type: 'bioconductor', name: 'DESeq2', package: 'DESeq2', source: false })
			);
			const saved = JSON.parse(
				await fs.readFile(
					path.join(testDir, '.config', 'biocontext', 'biocontext.config.jsonc'),
					'utf-8'
				)
			);
			expect(saved.resources).toHaveLength(1);
			expect(saved.resources[0].source).toBeUndefined();
			expect(saved.resources[0].sourceBranch).toBeUndefined();
		});

		it('preserves explicit custom_git source and branch settings', async () => {
			const config = await globalOnly();
			await Effect.runPromise(
				config.updateResource({
					type: 'bioconductor',
					name: 'DESeq2',
					package: 'DESeq2',
					source: 'https://github.com/me/DESeq2',
					sourceBranch: 'experiment'
				})
			);
			const saved = JSON.parse(
				await fs.readFile(
					path.join(testDir, '.config', 'biocontext', 'biocontext.config.jsonc'),
					'utf-8'
				)
			);
			expect(saved.resources[0].source).toBe('https://github.com/me/DESeq2');
			expect(saved.resources[0].sourceBranch).toBe('experiment');
		});

		it('rejects an unknown resource', async () => {
			const config = await globalOnly();
			expect(
				Effect.runPromise(config.updateResource({ type: 'bioconductor', name: 'nope', package: 'nope' }))
			).rejects.toThrow('not found');
		});

		it('rejects changing a resource to a different type', async () => {
			const config = await globalOnly();
			expect(
				Effect.runPromise(config.updateResource({ type: 'local', name: 'DESeq2', path: '/tmp/x' }))
			).rejects.toThrow('Cannot change resource');
		});

		it('refuses to edit a global resource from a project config', async () => {
			// Mirrors removeResource: shadowing a global entry with a project copy
			// would make the effective config depend on the working directory.
			const globalConfigDir = path.join(testDir, '.config', 'biocontext');
			await fs.mkdir(globalConfigDir, { recursive: true });
			await fs.writeFile(
				path.join(globalConfigDir, 'biocontext.config.jsonc'),
				JSON.stringify({
					provider: 'p',
					model: 'm',
					resources: [{ type: 'bioconductor', name: 'DESeq2', package: 'DESeq2' }]
				})
			);
			await fs.writeFile(
				path.join(testDir, 'biocontext.config.jsonc'),
				JSON.stringify({ resources: [{ type: 'bioconductor', name: 'edgeR', package: 'edgeR' }] })
			);
			process.chdir(testDir);
			const config = await Config.load();
			expect(
				Effect.runPromise(
					config.updateResource({ type: 'bioconductor', name: 'DESeq2', package: 'DESeq2', source: true })
				)
			).rejects.toThrow('defined in the global config');
		});

		it('edits a project resource in the project config', async () => {
			const globalConfigDir = path.join(testDir, '.config', 'biocontext');
			await fs.mkdir(globalConfigDir, { recursive: true });
			await fs.writeFile(
				path.join(globalConfigDir, 'biocontext.config.jsonc'),
				JSON.stringify({ provider: 'p', model: 'm', resources: [] })
			);
			await fs.writeFile(
				path.join(testDir, 'biocontext.config.jsonc'),
				JSON.stringify({ resources: [{ type: 'bioconductor', name: 'edgeR', package: 'edgeR' }] })
			);
			process.chdir(testDir);
			const config = await Config.load();
			await Effect.runPromise(
				config.updateResource({ type: 'bioconductor', name: 'edgeR', package: 'edgeR', source: true })
			);
			const saved = JSON.parse(
				await fs.readFile(path.join(testDir, 'biocontext.config.jsonc'), 'utf-8')
			);
			expect(saved.resources[0].source).toBeUndefined();
		});
	});
});
