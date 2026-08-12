const requiredFiles = [
	'biocontext-darwin-arm64',
	'biocontext-darwin-x64',
	'tree-sitter-worker.js',
	'tree-sitter.js',
	'tree-sitter.wasm'
];

const distDir = new URL('../dist/', import.meta.url);
const missing = [] as string[];

for (const file of requiredFiles) {
	const fileUrl = new URL(file, distDir);
	const exists = await Bun.file(fileUrl).exists();
	if (!exists) {
		missing.push(file);
	}
}

if (missing.length) {
	console.error('[biocontext] Missing required dist artifacts:');
	for (const file of missing) {
		console.error(`- ${file}`);
	}
	process.exit(1);
}

const workerContent = await Bun.file(new URL('tree-sitter-worker.js', distDir)).text();
const expectedWorkerReferences = ['./tree-sitter.js', './tree-sitter.wasm'];
const missingWorkerReferences = expectedWorkerReferences.filter(
	(reference) => !workerContent.includes(reference)
);

if (missingWorkerReferences.length) {
	console.error('[biocontext] tree-sitter-worker.js is not patched for standalone asset loading.');
	console.error('[biocontext] Missing worker references:');
	for (const reference of missingWorkerReferences) {
		console.error(`- ${reference}`);
	}
	process.exit(1);
}

console.log('[biocontext] All required dist artifacts are present.');
