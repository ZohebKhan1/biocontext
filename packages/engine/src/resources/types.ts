export const FS_RESOURCE_SYSTEM_NOTE =
	'This is a biocontext resource: a searchable knowledge source the agent can reference.';

export type FsResource = {
	readonly _tag: 'fs-based';
	readonly name: string;
	readonly fsName: string;
	readonly type: 'git' | 'local' | 'bioconductor' | 'cran';
	readonly repoSubPaths: readonly string[];
	readonly specialAgentInstructions: string;
	readonly getAbsoluteDirectoryPath: () => Promise<string>;
	readonly cleanup?: () => Promise<void>;
};

export type GitResourceArgs = {
	readonly type: 'git';
	readonly name: string;
	readonly url: string;
	readonly branch: string;
	readonly repoSubPaths: readonly string[];
	readonly resourcesDirectoryPath: string;
	readonly specialAgentInstructions: string;
	readonly quiet: boolean;
	readonly ephemeral?: boolean;
	readonly localDirectoryKey?: string;
};

export type LocalResourceArgs = {
	readonly type: 'local';
	readonly name: string;
	readonly path: string;
	readonly specialAgentInstructions: string;
};

export type BioconductorResourceArgs = {
	readonly type: 'bioconductor';
	readonly name: string;
	readonly package: string;
	/** True when the reference was resolved from an inline package mention. */
	readonly anonymous?: boolean;
	readonly release?: string;
	/** Which published documents to download; omitted means all. */
	readonly documents?: readonly ('vignettes' | 'vignetteScripts' | 'manual' | 'news')[];
	/** Include the bundled curated corpus; disable for clean release/source snapshots. */
	readonly includeCurated?: boolean;
	/** `true` auto-detects the repository; a string pins one. */
	readonly source?: boolean | string;
	readonly sourceBranch?: string;
	/** Optional immutable source commit; when supplied the checkout is detached at this SHA. */
	readonly sourceCommit?: string;
	/** Where downloaded package documentation is cached. */
	readonly resourcesDirectoryPath: string;
	/** Where the Bioconductor package index is cached. */
	readonly dataDirectoryPath: string;
	/** Extra places to look for the bundled corpus, e.g. a repository checkout. */
	readonly corpusCandidates?: readonly string[];
	readonly specialAgentInstructions: string;
	readonly quiet: boolean;
	readonly refresh?: boolean;
};

export type CranResourceArgs = {
	readonly type: 'cran';
	readonly name: string;
	readonly package: string;
	readonly resourcesDirectoryPath: string;
	readonly dataDirectoryPath: string;
	readonly specialAgentInstructions: string;
	readonly quiet: boolean;
	readonly refresh?: boolean;
};
