import { $ } from 'bun';
import { dirname, join } from 'node:path';
import packageJson from '../package.json';
import reactCompilerPlugin from './react-compiler-bun-plugin.ts';

const VERSION = packageJson.version;
const DIST_DIR = 'dist';
const STANDALONE_TREE_SITTER_FILES = {
	worker: 'tree-sitter-worker.js',
	runtime: 'tree-sitter.js',
	wasm: 'tree-sitter.wasm'
} as const;

const targets = ['bun-darwin-arm64', 'bun-darwin-x64'] as const;

const parseTargets = () => {
	const raw = process.env.BIOCONTEXT_TARGETS?.trim();
	if (!raw) return targets;
	const requested = raw
		.split(',')
		.map((entry) => entry.trim())
		.filter((entry) => entry.length > 0);
	const unknown = requested.filter((entry) => !targets.includes(entry as (typeof targets)[number]));
	if (unknown.length) {
		console.error(`[biocontext] Unknown build targets: ${unknown.join(', ')}`);
		process.exit(1);
	}
	return targets.filter((target) => requested.includes(target));
};

const outputNames: Record<(typeof targets)[number], string> = {
	'bun-darwin-arm64': 'biocontext-darwin-arm64',
	'bun-darwin-x64': 'biocontext-darwin-x64'
};

const resolveModulePath = (specifier: string) => Bun.fileURLToPath(import.meta.resolve(specifier));

const replaceExactlyOnce = (
	source: string,
	pattern: RegExp,
	replacement: string,
	description: string
) => {
	const matchCount = [...source.matchAll(pattern)].length;
	if (matchCount !== 1) {
		throw new Error(
			`[biocontext] Expected exactly one ${description} in parser.worker.js, found ${matchCount}.`
		);
	}
	return source.replace(pattern, replacement);
};

const packStandaloneTreeSitterAssets = async () => {
	const opentuiEntryPath = resolveModulePath('@opentui/core');
	const workerSourcePath = join(dirname(opentuiEntryPath), 'parser.worker.js');
	const treeSitterRuntimePath = resolveModulePath('web-tree-sitter');
	const treeSitterWasmPath = resolveModulePath('web-tree-sitter/tree-sitter.wasm');

	const workerSource = await Bun.file(workerSourcePath).text();
	const patchedWorkerImport = replaceExactlyOnce(
		workerSource,
		/from ["']web-tree-sitter["']/g,
		'from "./tree-sitter.js"',
		'"from web-tree-sitter" import'
	);
	const patchedWorker = replaceExactlyOnce(
		patchedWorkerImport,
		/import\(["']web-tree-sitter\/tree-sitter\.wasm["']/g,
		'import("./tree-sitter.wasm"',
		'"web-tree-sitter/tree-sitter.wasm" dynamic import'
	);

	await Bun.write(join(DIST_DIR, STANDALONE_TREE_SITTER_FILES.worker), patchedWorker);
	await Bun.write(
		join(DIST_DIR, STANDALONE_TREE_SITTER_FILES.runtime),
		Bun.file(treeSitterRuntimePath)
	);
	await Bun.write(join(DIST_DIR, STANDALONE_TREE_SITTER_FILES.wasm), Bun.file(treeSitterWasmPath));

	console.log(
		`Packed standalone Tree-sitter assets: ${STANDALONE_TREE_SITTER_FILES.worker}, ${STANDALONE_TREE_SITTER_FILES.runtime}, ${STANDALONE_TREE_SITTER_FILES.wasm}`
	);
};

async function main() {
	// Install OpenTUI native dependencies for supported macOS architectures.
	const opentuiCoreVersion = packageJson.devDependencies['@opentui/core'];

	console.log('Installing OpenTUI for macOS...');
	await $`bun install --os="darwin" --cpu="*" @opentui/core@${opentuiCoreVersion}`;
	console.log('Done installing OpenTUI for macOS');

	await Bun.file('dist')
		.exists()
		.catch(() => false);
	await $`mkdir -p ${DIST_DIR}`;
	await packStandaloneTreeSitterAssets();

	for (const target of parseTargets()) {
		const outfile = `${DIST_DIR}/${outputNames[target]}`;
		console.log(`Building ${target} -> ${outfile} (v${VERSION})`);
		const result = await Bun.build({
			entrypoints: ['src/index.ts'],
			target: 'bun',
			plugins: [reactCompilerPlugin],
			define: {
				__VERSION__: JSON.stringify(VERSION)
			},
			compile: {
				target,
				outfile,
				// Disable bunfig.toml autoloading - the React compiler plugin transforms JSX at build time
				// and we don't want the binary to pick up bunfig.toml from the cwd
				autoloadBunfig: false
			}
		});
		if (!result.success) {
			console.error(`Build failed for ${target}:`, result.logs);
			process.exit(1);
		}
	}

	console.log('Done building macOS targets');
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
