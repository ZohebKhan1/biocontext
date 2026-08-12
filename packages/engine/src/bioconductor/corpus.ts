/**
 * Locating a package inside the bundled documentation corpus.
 *
 * The corpus ships as a Git resource, so on disk it lives wherever that
 * resource was cloned. Its directory name comes from the resource's configured
 * name, which the user can change, so it is discovered by looking for the
 * corpus layout rather than by assuming a fixed path.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

import { repairPdfEncodingArtifacts } from './pdf-text.ts';
import { NUMBERED_BIOCONDUCTOR_RELEASE_PATTERN } from './release.ts';

/** Marker file at the corpus root; also the routing index the agent reads first. */
const CORPUS_MARKER = 'DIRECTORY.md';
/** Category folders are numbered, e.g. `02_differential_expression`. */
const CATEGORY_PATTERN = /^\d+_/;
/** Where the corpus sits inside a clone of the biocontext repository. */
const CORPUS_SUBPATH = path.join('resources', 'bioconductor-docs');

/** Bundled corpus location when running from a source checkout. */
export const REPO_CORPUS_PATH = path.resolve(
	import.meta.dir,
	'..',
	'..',
	'..',
	'..',
	'resources',
	'bioconductor-docs'
);

const isDirectory = async (target: string): Promise<boolean> => {
	try {
		return (await fs.stat(target)).isDirectory();
	} catch {
		return false;
	}
};

const isCorpusRoot = async (candidate: string): Promise<boolean> => {
	try {
		await fs.access(path.join(candidate, CORPUS_MARKER));
		return true;
	} catch {
		return false;
	}
};

/** Find a corpus at, or inside, one configured resource checkout. */
export const findCorpusRootWithinResource = async (
	resourceRoot: string
): Promise<string | null> => {
	for (const candidate of [resourceRoot, path.join(resourceRoot, CORPUS_SUBPATH)]) {
		if (await isCorpusRoot(candidate)) return candidate;
	}
	return null;
};

/**
 * Find the bundled corpus among the cloned resources.
 *
 * Checks both a clone of the biocontext repository (corpus nested under
 * `resources/bioconductor-docs`) and a resource pointed straight at the
 * `bioconductor-docs` repository.
 */
export const findCorpusRoot = async (
	resourcesDirectory: string,
	extraCandidates: readonly string[] = []
): Promise<string | null> => {
	for (const candidate of extraCandidates) {
		if (await isCorpusRoot(candidate)) return candidate;
	}

	let entries: string[];
	try {
		entries = await fs.readdir(resourcesDirectory);
	} catch {
		return null;
	}

	for (const entry of entries) {
		const base = path.join(resourcesDirectory, entry);
		if (!(await isDirectory(base))) continue;
		const found = await findCorpusRootWithinResource(base);
		if (found) return found;
	}

	return null;
};

export type CorpusPackage = {
	readonly directory: string;
	/** Corpus-relative path, e.g. `02_differential_expression/DESeq2`. */
	readonly relativePath: string;
	/** Markdown file names inside the package folder. */
	readonly documents: readonly string[];
	/** Per-document upstream provenance from the sibling `_metadata.yml`. */
	readonly provenance: ReadonlyMap<string, CuratedDocumentProvenance>;
};

export type CuratedDocumentProvenance = {
	readonly path: string;
	readonly originUrl: string;
	readonly originType: 'curated_document';
	readonly packageVersion: string;
	readonly bioconductorRelease: string;
};

const CuratedCorpusMetadataSchema = z.object({
	package: z.string().trim().min(1),
	documents: z
		.array(
			z.object({
				path: z
					.string()
					.trim()
					.regex(/^[^/\\]+\.md$/iu),
				origin_url: z.string().trim().min(1),
				origin_type: z.literal('curated_document'),
				package_version: z.string().trim().min(1),
				bioc_release: z
					.string()
					.trim()
					.refine(
						(value) => value === 'unknown' || NUMBERED_BIOCONDUCTOR_RELEASE_PATTERN.test(value),
						'must be a numbered release or "unknown"'
					)
			})
		)
		.min(1)
});

export type CuratedMetadataReadResult =
	| {
			success: true;
			package: string;
			documents: ReadonlyMap<string, CuratedDocumentProvenance>;
	  }
	| { success: false; issues: readonly string[] };

export const parseCuratedPackageMetadata = (
	value: unknown,
	markdownFiles?: readonly string[]
): CuratedMetadataReadResult => {
	const parsed = CuratedCorpusMetadataSchema.safeParse(value);
	if (!parsed.success) {
		return {
			success: false,
			issues: parsed.error.issues.map(
				(issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`
			)
		};
	}

	const issues: string[] = [];
	const provenance = new Map<string, CuratedDocumentProvenance>();
	for (const document of parsed.data.documents) {
		if (provenance.has(document.path)) {
			issues.push(`documents: duplicate entry for ${document.path}`);
			continue;
		}
		provenance.set(document.path, {
			path: document.path,
			originUrl: document.origin_url,
			originType: document.origin_type,
			packageVersion: document.package_version,
			bioconductorRelease: document.bioc_release
		});
	}

	if (markdownFiles) {
		const expected = new Set(markdownFiles);
		for (const file of markdownFiles) {
			if (!provenance.has(file)) issues.push(`documents: missing entry for ${file}`);
		}
		for (const file of provenance.keys()) {
			if (!expected.has(file)) issues.push(`documents: extra entry for ${file}`);
		}
	}

	return issues.length > 0
		? { success: false, issues }
		: { success: true, package: parsed.data.package, documents: provenance };
};

/** Parse and validate the real YAML provenance source next to curated Markdown. */
export const readCuratedPackageMetadata = async (
	directory: string,
	markdownFiles?: readonly string[]
): Promise<CuratedMetadataReadResult> => {
	let value: unknown;
	try {
		value = parseYaml(await fs.readFile(path.join(directory, '_metadata.yml'), 'utf8'));
	} catch (cause) {
		return {
			success: false,
			issues: [cause instanceof Error ? cause.message : String(cause)]
		};
	}

	return parseCuratedPackageMetadata(value, markdownFiles);
};

/** List packages with usable Markdown in a corpus, in deterministic name order. */
export const listCorpusPackageNames = async (corpusRoot: string): Promise<string[]> => {
	let categories: string[];
	try {
		categories = await fs.readdir(corpusRoot);
	} catch {
		return [];
	}

	const names: string[] = [];
	for (const category of categories.filter((entry) => CATEGORY_PATTERN.test(entry)).sort()) {
		const categoryPath = path.join(corpusRoot, category);
		let packages: string[];
		try {
			packages = await fs.readdir(categoryPath);
		} catch {
			continue;
		}

		for (const packageName of packages.sort()) {
			const directory = path.join(categoryPath, packageName);
			if (!(await isDirectory(directory))) continue;
			try {
				const files = await fs.readdir(directory);
				if (files.some((file) => file.toLowerCase().endsWith('.md'))) names.push(packageName);
			} catch {
				continue;
			}
		}
	}

	return names.sort((left, right) => left.localeCompare(right));
};

/** Locate one package's folder in the corpus. Package names are matched case-insensitively. */
export const findCorpusPackage = async (
	corpusRoot: string,
	packageName: string
): Promise<CorpusPackage | null> => {
	const target = packageName.trim().toLowerCase();
	if (!target) return null;

	let categories: string[];
	try {
		categories = await fs.readdir(corpusRoot);
	} catch {
		return null;
	}

	for (const category of categories.filter((entry) => CATEGORY_PATTERN.test(entry))) {
		const categoryPath = path.join(corpusRoot, category);
		let packages: string[];
		try {
			packages = await fs.readdir(categoryPath);
		} catch {
			continue;
		}

		const match = packages.find((entry) => entry.toLowerCase() === target);
		if (!match) continue;

		const directory = path.join(categoryPath, match);
		if (!(await isDirectory(directory))) continue;

		const documents = (await fs.readdir(directory))
			.filter((file) => file.toLowerCase().endsWith('.md'))
			.sort();
		if (documents.length === 0) return null;
		const metadata = await readCuratedPackageMetadata(directory, documents);
		if (!metadata.success) {
			throw new Error(`Invalid curated provenance for ${match}: ${metadata.issues.join('; ')}`);
		}
		if (metadata.package.toLowerCase() !== match.toLowerCase()) {
			throw new Error(
				`Invalid curated provenance for ${match}: package is recorded as ${metadata.package}`
			);
		}

		return {
			directory,
			relativePath: `${category}/${match}`,
			documents,
			provenance: metadata.documents
		};
	}

	return null;
};

/** Copy a corpus package's Markdown into `targetDirectory`, returning the file names written. */
export const copyCorpusPackage = async (
	source: CorpusPackage,
	targetDirectory: string
): Promise<string[]> => {
	await fs.mkdir(targetDirectory, { recursive: true });
	const written: string[] = [];
	for (const document of source.documents) {
		const sourcePath = path.join(source.directory, document);
		const targetPath = path.join(targetDirectory, document);
		// Curated documents may have been produced by an older PDF/HTML pipeline.
		// Apply only the narrowly scoped PDF glyph repair; all other Markdown is
		// copied byte-for-byte and no content is dropped.
		if (document.toLowerCase().endsWith('.md')) {
			const content = await fs.readFile(sourcePath, 'utf8');
			await fs.writeFile(targetPath, repairPdfEncodingArtifacts(content), 'utf8');
		} else {
			await fs.copyFile(sourcePath, targetPath);
		}
		written.push(document);
	}
	return written;
};
