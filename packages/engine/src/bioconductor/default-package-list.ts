/**
 * Canonical packages prepared for a fresh biocontext installation.
 *
 * Keep names in the spelling used by Bioconductor. In particular, the package
 * names are `apeglm` and `AnnotationDbi`, not the common misspellings.
 */
export const DEFAULT_BIOCONDUCTOR_PACKAGE_NAMES = [
	'edgeR',
	'DESeq2',
	'limma',
	'fgsea',
	'ComplexHeatmap',
	'tximport',
	'tximeta',
	'apeglm',
	'AnnotationDbi',
	'biomaRt',
	'SummarizedExperiment'
] as const;

export const DEFAULT_BIOCONDUCTOR_PACKAGE_COUNT = DEFAULT_BIOCONDUCTOR_PACKAGE_NAMES.length;

export const isDefaultBioconductorPackage = (packageName: string): boolean =>
	DEFAULT_BIOCONDUCTOR_PACKAGE_NAMES.some(
		(candidate) => candidate.toLowerCase() === packageName.trim().toLowerCase()
	);
