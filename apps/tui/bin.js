#!/usr/bin/env bun

if (typeof Bun === 'undefined') {
	console.error('[biocontext] This CLI requires Bun. Install it: https://bun.sh');
	console.error('[biocontext] Then run: bun add -g biocontext');
	process.exit(1);
}

import path from 'node:path';
import { chmod, stat } from 'node:fs/promises';

const PLATFORM_ARCH = `${process.platform}-${process.arch}`;

const TARGET_MAP = {
	'darwin-arm64': 'biocontext-darwin-arm64',
	'darwin-x64': 'biocontext-darwin-x64'
};

const binaryName = TARGET_MAP[PLATFORM_ARCH];

if (!binaryName) {
	console.error(
		`[biocontext] Unsupported platform: ${PLATFORM_ARCH}. ` +
			'This release supports macOS on Apple Silicon and Intel only.'
	);
	process.exit(1);
}

const __dirname = path.dirname(Bun.fileURLToPath(import.meta.url));
const binPath = path.join(__dirname, 'dist', binaryName);
const binFile = Bun.file(binPath);
const standaloneWorkerPath = path.join(__dirname, 'dist', 'tree-sitter-worker.js');

// Running from a checkout rather than an install: no binary has been built, but
// the sources are right there. Published tarballs ship only bin.js and dist/,
// so this path never triggers for an installed copy.
const entrypoint = path.join(__dirname, 'src', 'index.ts');
if (!(await binFile.exists()) && (await Bun.file(entrypoint).exists())) {
	const fromSource = Bun.spawnSync(
		[process.execPath, 'run', entrypoint, ...process.argv.slice(2)],
		{
			stdout: 'inherit',
			stderr: 'inherit',
			stdin: 'inherit',
			env: process.env
		}
	);
	if (fromSource.error) {
		console.error(`[biocontext] Failed to start from source: ${fromSource.error}`);
		process.exit(1);
	}
	process.exit(fromSource.exitCode ?? 1);
}

if (!(await binFile.exists())) {
	const glob = new Bun.Glob('dist/*');
	const entries = [];
	for await (const entry of glob.scan({ cwd: __dirname })) {
		entries.push(entry.replace(/^dist\//, ''));
	}
	const available = entries.length
		? `Available binaries: ${entries.join(', ')}`
		: 'No binaries found in dist/.';
	console.error(`[biocontext] Prebuilt binary not found for ${PLATFORM_ARCH} (${binaryName}).`);
	console.error(`[biocontext] ${available}`);
	console.error('[biocontext] Try reinstalling, or open an issue if the problem persists.');
	process.exit(1);
}

if (process.platform !== 'win32') {
	try {
		const fileStats = await stat(binPath);
		if ((fileStats.mode & 0o111) === 0) {
			await chmod(binPath, fileStats.mode | 0o111);
		}
	} catch {
		try {
			await chmod(binPath, 0o755);
		} catch {
			// If chmod fails, continue and let spawn report the error.
		}
	}
}

const env = { ...process.env };
if (!env.OTUI_TREE_SITTER_WORKER_PATH && (await Bun.file(standaloneWorkerPath).exists())) {
	env.OTUI_TREE_SITTER_WORKER_PATH = standaloneWorkerPath;
}

const result = Bun.spawnSync([binPath, ...process.argv.slice(2)], {
	stdout: 'inherit',
	stderr: 'inherit',
	stdin: 'inherit',
	env
});

if (result.error) {
	console.error(`[biocontext] Failed to start binary: ${result.error}`);
	process.exit(1);
}

process.exit(result.exitCode ?? 1);
