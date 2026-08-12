import { mkdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { $ } from 'bun';

const repositoryRoot = resolve(dirname(import.meta.dir));
const defaultSource = resolve(repositoryRoot, '..', 'bioconductor-docs');
const source = resolve(process.argv[2] ?? defaultSource);
const target = resolve(repositoryRoot, 'resources', 'bioconductor-docs');
const snapshotPath = resolve(repositoryRoot, 'resources', 'bioconductor-docs.snapshot.json');

const expectedTarget = resolve(repositoryRoot, 'resources', 'bioconductor-docs');
if (target !== expectedTarget) {
	throw new Error(`Refusing to sync an unexpected target: ${target}`);
}

const sourceRoot = (await $`git -C ${source} rev-parse --show-toplevel`.text()).trim();
if (resolve(sourceRoot) !== source) {
	throw new Error(`Source must be the root of a Git checkout: ${source}`);
}

const sourceCommit = (await $`git -C ${source} rev-parse HEAD`.text()).trim();
const sourceCommitDate = (await $`git -C ${source} show -s --format=%cs HEAD`.text()).trim();
const sourceRepository = (await $`git -C ${source} remote get-url origin`.text())
	.trim()
	.replace(/\.git$/, '');
const trackedFiles = (await $`git -C ${source} ls-files`.text()).split('\n').filter(Boolean);

await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
await $`git -C ${source} archive --format=tar HEAD | tar -xf - -C ${target}`;

await Bun.write(
	snapshotPath,
	`${JSON.stringify(
		{
			sourceRepository,
			sourceCommit,
			sourceCommitDate,
			copiedAt: new Date().toISOString().slice(0, 10),
			trackedFiles: trackedFiles.length
		},
		null,
		'\t'
	)}\n`
);

console.log(`Copied ${trackedFiles.length} tracked files from ${sourceCommit} into ${target}`);
