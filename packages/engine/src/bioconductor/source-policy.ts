/**
 * Deterministic retrieval policy for a Bioconductor/R package source snapshot.
 *
 * The source snapshot is evidence for the agent, not a build tree. Keep the
 * package implementation, authored documentation, focused tests, and the
 * small amount of build/CI configuration that explains supported behavior,
 * while leaving out generated sites, rendered assets, packaged data, and
 * test fixtures.
 */

import path from 'node:path';

export const BIOCONDUCTOR_SOURCE_POLICY_VERSION = 3;

const ROOT_FILES = [
	'DESCRIPTION',
	'NAMESPACE',
	'README',
	'NEWS',
	'LICENSE',
	'LICENCE',
	'CODE_OF_CONDUCT.md',
	'CONTRIBUTING.md',
	'index.md',
	'.Rbuildignore',
	'configure',
	'configure.ac',
	'configure.win',
	'cleanup',
	'cleanup.R',
	'Makefile',
	'Makevars',
	'Makevars.in',
	'Makevars.win'
] as const;

/** Top-level authored areas worth mounting in a retrieval snapshot. */
export const SOURCE_ROOT_DIRECTORIES = new Set([
	'R',
	'man',
	'vignettes',
	'src',
	'inst',
	'tests',
	'.github'
]);

/** Directory names which are never useful in the retrieval checkout. */
const EXCLUDED_DIRECTORY_NAMES = new Set([
	'.git',
	'docs',
	'pkgdown',
	'revdep',
	'outdated',
	'data',
	'extdata',
	'assets',
	'images',
	'figures',
	'pdf',
	'testdata',
	'fixtures',
	'README_files',
	'logo'
]);

const SOURCE_EXTENSIONS = new Set([
	'.r',
	'.rmd',
	'.rnw',
	'.rd',
	'.md',
	'.txt',
	'.bib',
	'.tex',
	'.c',
	'.cc',
	'.cpp',
	'.h',
	'.hh',
	'.hpp',
	'.f',
	'.f90',
	'.f95',
	'.sh',
	'.py',
	'.jl',
	'.yml',
	'.yaml',
	'.json'
]);

const normalizeRelativePath = (value: string): string =>
	value
		.replaceAll('\\', '/')
		.replace(/^\.\//u, '')
		.replace(/\/{2,}/gu, '/');

const baseName = (relativePath: string): string => path.posix.basename(relativePath);

const pathSegments = (relativePath: string): string[] => relativePath.split('/');

/** Whether a path is inside a deliberately excluded generated/data area. */
export const isExcludedSourcePath = (value: string): boolean =>
	pathSegments(normalizeRelativePath(value)).some((segment) =>
		EXCLUDED_DIRECTORY_NAMES.has(segment)
	);

/** Whether a path starts in one of the retained authored source areas. */
export const isSourceRootPath = (value: string): boolean =>
	SOURCE_ROOT_DIRECTORIES.has(pathSegments(normalizeRelativePath(value))[0] ?? '');

const hasSourceExtension = (relativePath: string): boolean => {
	const extension = path.posix.extname(relativePath).toLowerCase();
	return SOURCE_EXTENSIONS.has(extension);
};

const isRootMetadataFile = (relativePath: string): boolean => {
	if (relativePath.includes('/')) return false;
	const name = baseName(relativePath);
	return ROOT_FILES.some((rootFile) =>
		rootFile === 'README' || rootFile === 'NEWS' || rootFile === 'LICENSE' || rootFile === 'LICENCE'
			? name.toUpperCase().startsWith(rootFile)
			: name === rootFile
	);
};

/** Whether a path belongs in the source retrieval snapshot. */
export const shouldKeepSourcePath = (value: string): boolean => {
	const relativePath = normalizeRelativePath(value);
	if (!relativePath || relativePath.startsWith('../') || relativePath.includes('/../'))
		return false;
	const segments = pathSegments(relativePath);
	if (isExcludedSourcePath(relativePath)) return false;
	if (isRootMetadataFile(relativePath)) return true;
	if (segments[0] === '.github') {
		// GitHub workflows are compact, authored evidence of supported R/Bioconductor
		// versions and CI checks. Other repository automation and templates add
		// noise without helping package-level scientific answers.
		return (
			segments[1] === 'workflows' &&
			['.yml', '.yaml'].includes(path.posix.extname(relativePath).toLowerCase())
		);
	}
	if (!isSourceRootPath(relativePath)) return false;
	return hasSourceExtension(relativePath);
};

const SPARSE_TEXT_EXTENSIONS = [
	'R',
	'r',
	'Rmd',
	'rmd',
	'Rnw',
	'rnw',
	'Rd',
	'rd',
	'md',
	'txt',
	'bib',
	'tex',
	'c',
	'cc',
	'cpp',
	'h',
	'hh',
	'hpp',
	'f',
	'f90',
	'f95',
	'sh',
	'py',
	'jl',
	'yml',
	'yaml',
	'json'
] as const;

/** Sparse-checkout patterns used before the post-checkout safety filter. */
export const sourceSparseCheckoutPatterns = [
	'/DESCRIPTION',
	'/NAMESPACE',
	'/README*',
	'/NEWS*',
	'/LICENSE*',
	'/LICENCE*',
	'/CODE_OF_CONDUCT.md',
	'/CONTRIBUTING.md',
	'/index.md',
	'/.Rbuildignore',
	'/configure',
	'/configure.ac',
	'/configure.win',
	'/cleanup',
	'/cleanup.R',
	'/Makefile',
	'/Makevars',
	'/Makevars.in',
	'/Makevars.win',
	'/R/*.R',
	'/R/**/*.R',
	'/R/*.r',
	'/R/**/*.r',
	'/src/**',
	...(['man', 'vignettes', 'inst', 'tests'] as const).flatMap((directory) =>
		SPARSE_TEXT_EXTENSIONS.flatMap((extension) => [
			`/${directory}/*.${extension}`,
			`/${directory}/**/*.${extension}`
		])
	),
	'/.github/workflows/*.yml',
	'/.github/workflows/**/*.yml',
	'/.github/workflows/*.yaml',
	'/.github/workflows/**/*.yaml'
];

export type SourceInventory = {
	readonly policyVersion: number;
	readonly files: readonly string[];
	readonly fileCount: number;
	readonly bytes: number;
	readonly omittedCount: number;
};

export const formatSourceDirectory = (inventory: SourceInventory): string => {
	const lines = [
		'# Package source',
		'',
		`This source snapshot was filtered by biocontext source policy v${inventory.policyVersion}.`,
		'It contains authored package code, documentation, focused tests, build configuration, and selected CI workflows; generated sites, rendered assets, packaged data, and test fixtures were omitted.',
		'',
		`- Included files: ${inventory.fileCount}`,
		`- Included size: ${inventory.bytes} bytes`,
		`- Omitted files: ${inventory.omittedCount}`,
		'',
		'## Included paths',
		'',
		...inventory.files.map((file) => `- \`${file}\``),
		''
	];
	return lines.join('\n');
};
