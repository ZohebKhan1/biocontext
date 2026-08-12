import { existsSync } from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import { ensureServerEffect, type ServerManager } from './engine/manager.ts';
import { runCliEffect } from './effect/runtime.ts';

declare global {
	var __BIOCONTEXT_SERVER__: ServerManager | undefined;
	var __BIOCONTEXT_STREAM_OPTIONS__:
		| {
				showThinking: boolean;
				showTools: boolean;
		  }
		| undefined;
}

export interface TuiOptions {
	thinking?: boolean;
	tools?: boolean;
	subAgent?: boolean;
}

let hasWarnedMissingTreeSitterWorker = false;

const resolveStandaloneTreeSitterWorkerPath = () => {
	const executableDir = path.dirname(process.execPath);
	const candidates = [
		path.join(executableDir, 'tree-sitter-worker.js'),
		path.join(executableDir, 'dist', 'tree-sitter-worker.js')
	];
	return candidates.find((candidate) => existsSync(candidate));
};

const ensureStandaloneTreeSitterWorkerPath = () => {
	if (process.env.OTUI_TREE_SITTER_WORKER_PATH) return;

	const workerPath = resolveStandaloneTreeSitterWorkerPath();
	if (workerPath) {
		process.env.OTUI_TREE_SITTER_WORKER_PATH = workerPath;
		return;
	}

	if (hasWarnedMissingTreeSitterWorker) return;
	hasWarnedMissingTreeSitterWorker = true;
	console.warn(
		'[biocontext] Standalone Tree-sitter worker asset not found. Continuing without syntax highlighting worker override.'
	);
};

const launchTuiPromise = async (options: TuiOptions): Promise<void> => {
	const server = await runCliEffect(ensureServerEffect({}));

	globalThis.__BIOCONTEXT_SERVER__ = server;
	globalThis.__BIOCONTEXT_STREAM_OPTIONS__ = {
		showThinking: options.subAgent ? false : (options.thinking ?? true),
		showTools: options.subAgent ? false : (options.tools ?? true)
	};

	ensureStandaloneTreeSitterWorkerPath();
	await runCliEffect(Effect.tryPromise(() => import('./ui/App.tsx')));
};

export const launchTui = (options: TuiOptions) =>
	Effect.tryPromise(() => launchTuiPromise(options));
