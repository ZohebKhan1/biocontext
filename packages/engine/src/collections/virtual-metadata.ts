import type { BioconductorResourceMetadata } from '../bioconductor/metadata.ts';
import type { CranResourceMetadata } from '../cran/metadata.ts';

export type VirtualResourceMetadata = {
	name: string;
	fsName: string;
	type: 'git' | 'local' | 'bioconductor' | 'cran';
	path: string;
	repoSubPaths: readonly string[];
	url?: string;
	branch?: string;
	commit?: string;
	package?: string;
	version?: string;
	bioconductorRelease?: string;
	curatedFrom?: string;
	sourceRepositoryUrl?: string;
	sourceRepositoryKind?: 'bioconductor_archive' | 'github' | 'bioconductor_git' | 'custom_git';
	sourceBranch?: string;
	sourceCommit?: string;
	descriptionVersion?: string;
	bioconductorMetadata?: BioconductorResourceMetadata;
	cranMetadata?: CranResourceMetadata;
	loadedAt: string;
};

export type VirtualCollectionMetadata = {
	vfsId: string;
	collectionKey: string;
	createdAt: string;
	resources: VirtualResourceMetadata[];
	trace: QueryEvidenceTrace;
};

export type EvidenceResult = {
	id: string;
	package: string;
	package_version: string;
	bioc_release: string;
	path: string;
	line_start: number;
	line_end: number;
	source_type: 'bioconductor' | 'curated' | 'repository' | 'git' | 'local' | 'cran';
	origin_type:
		| 'vignette'
		| 'vignette_script'
		| 'reference_manual'
		| 'news'
		| 'curated_document'
		| 'repository_file'
		| 'cran_package_file'
		| 'git_file'
		| 'local_file';
	origin_url: string;
	repository_commit: string | null;
	content: string;
};

export type QueryEvidenceTrace = {
	searchedPackages: Set<string>;
	inspectedDocuments: Set<string>;
	inspectedPaths: Set<string>;
	inspectedRanges: Map<string, Array<{ start: number; end: number }>>;
	evidence: Map<string, EvidenceResult>;
	nextEvidenceId: number;
};

export const createQueryEvidenceTrace = (): QueryEvidenceTrace => ({
	searchedPackages: new Set(),
	inspectedDocuments: new Set(),
	inspectedPaths: new Set(),
	inspectedRanges: new Map(),
	evidence: new Map(),
	nextEvidenceId: 1
});

const metadataByVfsId = new Map<string, VirtualCollectionMetadata>();

export const setVirtualCollectionMetadata = (
	metadata: Omit<VirtualCollectionMetadata, 'trace'> & { trace?: QueryEvidenceTrace }
) => {
	metadataByVfsId.set(metadata.vfsId, {
		...metadata,
		trace: metadata.trace ?? createQueryEvidenceTrace()
	});
};

export const getVirtualCollectionMetadata = (vfsId: string) => metadataByVfsId.get(vfsId);

const inferPackageFromPath = (
	metadata: VirtualCollectionMetadata,
	absolutePath: string
): string | undefined => {
	const normalized = absolutePath.replace(/^\/+|\/+$/gu, '');
	const resource = metadata.resources.find(
		(item) => normalized === item.fsName || normalized.startsWith(`${item.fsName}/`)
	);
	if (resource?.package) return resource.package;
	const segments = normalized.split('/');
	const categoryIndex = segments.findIndex((segment) => /^\d+_/u.test(segment));
	return categoryIndex >= 0 ? segments[categoryIndex + 1] : undefined;
};

export const recordQueryInspection = (
	vfsId: string | undefined,
	absolutePath: string,
	range?: { start: number; end: number }
) => {
	if (!vfsId) return;
	const metadata = metadataByVfsId.get(vfsId);
	if (!metadata) return;
	metadata.trace.inspectedPaths.add(absolutePath);
	metadata.trace.inspectedDocuments.add(absolutePath);
	if (range && range.start > 0 && range.end >= range.start) {
		const ranges = metadata.trace.inspectedRanges.get(absolutePath) ?? [];
		ranges.push(range);
		metadata.trace.inspectedRanges.set(absolutePath, ranges);
	}
	const packageName = inferPackageFromPath(metadata, absolutePath);
	if (packageName) metadata.trace.searchedPackages.add(packageName);
};

export const recordQuerySearch = (
	vfsId: string | undefined,
	absoluteSearchPath: string,
	matchedPaths: readonly string[] = []
) => {
	if (!vfsId) return;
	const metadata = metadataByVfsId.get(vfsId);
	if (!metadata) return;
	for (const candidate of [absoluteSearchPath, ...matchedPaths]) {
		const packageName = inferPackageFromPath(metadata, candidate);
		if (packageName) metadata.trace.searchedPackages.add(packageName);
	}
};

export const clearVirtualCollectionMetadata = (vfsId: string) => metadataByVfsId.delete(vfsId);

export const clearAllVirtualCollectionMetadata = () => {
	metadataByVfsId.clear();
};
