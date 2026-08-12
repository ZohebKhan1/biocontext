import { promises as fs } from 'node:fs';
import path from 'node:path';

import { z } from 'zod';

import { BIOCONDUCTOR_DOCUMENT_TYPES } from '../resources/schema.ts';
import { BIOCONDUCTOR_REPOSITORIES } from './catalog.ts';
import { NUMBERED_BIOCONDUCTOR_RELEASE_PATTERN } from './release.ts';

export const BIOCONDUCTOR_METADATA_FILE = '.bioconductor-meta.json';
export const BIOCONDUCTOR_RESOURCE_CACHE_VERSION = 10;
export const LEGACY_BIOCONDUCTOR_RESOURCE_CACHE_VERSION = 9;
export const FULL_GIT_COMMIT_PATTERN = /^[0-9a-f]{40}$/u;
export const SHA256_PATTERN = /^[0-9a-f]{64}$/u;

const nonBlank = z.string().trim().min(1);
const packageName = z.string().regex(/^[a-zA-Z][a-zA-Z0-9.]*$/u);
const provenanceIdentity = z
	.string()
	.trim()
	.refine((value) => value === 'unknown' || value.length > 0, 'must be non-blank or "unknown"');
const bioconductorRelease = z
	.string()
	.trim()
	.refine(
		(value) => value === 'unknown' || NUMBERED_BIOCONDUCTOR_RELEASE_PATTERN.test(value),
		'must be a numbered Bioconductor release or "unknown"'
	);

export const isSafeBioconductorRelativePath = (value: string): boolean => {
	if (!value.trim() || path.posix.isAbsolute(value) || value.includes('\\')) return false;
	const normalized = path.posix.normalize(value);
	return (
		normalized === value &&
		normalized !== '.' &&
		normalized !== '..' &&
		!normalized.startsWith('../')
	);
};

export type BioconductorArtifactPathStatus = 'ok' | 'missing' | 'unsafe';

/**
 * Inspect a managed artifact without following it outside the package directory.
 * This is shared by cache mounting and `/add verify` so both reject symlink and
 * traversal escapes consistently.
 */
export const inspectBioconductorArtifactPath = async (
	directory: string,
	relativePath: string,
	kind: 'file' | 'directory'
): Promise<BioconductorArtifactPathStatus> => {
	if (!isSafeBioconductorRelativePath(relativePath)) return 'unsafe';
	const target = path.resolve(directory, relativePath);
	const lexicalRelative = path.relative(directory, target);
	if (lexicalRelative.startsWith('..') || path.isAbsolute(lexicalRelative)) return 'unsafe';

	try {
		const [directoryRealPath, targetRealPath, stats] = await Promise.all([
			fs.realpath(directory),
			fs.realpath(target),
			fs.lstat(target)
		]);
		const realRelative = path.relative(directoryRealPath, targetRealPath);
		if (stats.isSymbolicLink() || realRelative.startsWith('..') || path.isAbsolute(realRelative))
			return 'unsafe';
		if (kind === 'file') return stats.isFile() && stats.size > 0 ? 'ok' : 'missing';
		return stats.isDirectory() ? 'ok' : 'missing';
	} catch (cause) {
		return (cause as NodeJS.ErrnoException).code === 'ELOOP' ? 'unsafe' : 'missing';
	}
};

const safeRelativePath = z
	.string()
	.refine(isSafeBioconductorRelativePath, 'must be a normalized package-relative path without traversal');

export const BioconductorDocumentRecordSchema = z
	.object({
		path: safeRelativePath,
		sourceType: z.enum(['bioconductor', 'curated']),
		originType: z.enum([
			'vignette',
			'vignette_script',
			'reference_manual',
			'news',
			'curated_document'
		]),
		originUrl: nonBlank,
		packageVersion: provenanceIdentity,
		bioconductorRelease,
		status: z.enum(['ok', 'failed', 'skipped']),
		error: z.string().optional()
	})
	.superRefine((document, ctx) => {
		if (document.sourceType === 'curated' && document.originType !== 'curated_document') {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['originType'],
				message: 'curated documents must use originType "curated_document"'
			});
		}
		if (document.sourceType === 'bioconductor' && document.originType === 'curated_document') {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['originType'],
				message: 'Bioconductor documents cannot use originType "curated_document"'
			});
		}
	});

const BioconductorSourceInventoryMetadataSchema = z.object({
	descriptionPackage: packageName,
	descriptionVersion: provenanceIdentity,
	sourcePolicyVersion: z.number().int().nonnegative(),
	fileCount: z.number().int().nonnegative(),
	bytes: z.number().int().nonnegative(),
	omittedCount: z.number().int().nonnegative()
});

const BioconductorGitSourceMetadataSchema = BioconductorSourceInventoryMetadataSchema.extend({
	kind: z.enum(['github', 'bioconductor_git', 'custom_git']),
	url: nonBlank,
	branch: nonBlank,
	commit: z.string().regex(FULL_GIT_COMMIT_PATTERN, 'must be a full 40-character Git commit'),
	requestedCommit: z
		.string()
		.regex(FULL_GIT_COMMIT_PATTERN, 'must be a full 40-character Git commit')
		.optional()
});

const BioconductorArchiveSourceMetadataSchema = BioconductorSourceInventoryMetadataSchema.extend({
	kind: z.literal('bioconductor_archive'),
	url: nonBlank,
	sha256: z.string().regex(SHA256_PATTERN, 'must be a lowercase SHA-256 digest')
});

export const BioconductorRepositoryMetadataSchema = z.discriminatedUnion('kind', [
	BioconductorArchiveSourceMetadataSchema,
	BioconductorGitSourceMetadataSchema
]);

const LegacyBioconductorResourceMetadataSchema = z
	.object({
		cacheVersion: z.literal(LEGACY_BIOCONDUCTOR_RESOURCE_CACHE_VERSION),
		package: packageName,
		bioconductor: z.object({
			release: z.string().regex(NUMBERED_BIOCONDUCTOR_RELEASE_PATTERN, 'must be a numbered release'),
			packageVersion: provenanceIdentity,
			repository: z.enum(BIOCONDUCTOR_REPOSITORIES),
			landingUrl: nonBlank
		}),
		repository: BioconductorGitSourceMetadataSchema,
		versionRelationship: z.enum(['aligned', 'different', 'unknown']),
		documents: z.array(BioconductorDocumentRecordSchema),
		requestedDocuments: z.array(z.enum(BIOCONDUCTOR_DOCUMENT_TYPES)),
		curatedFrom: safeRelativePath.optional(),
		fetchedAt: z.string().datetime()
	})
	.superRefine((metadata, ctx) => {
		const expected = getVersionRelationship(
			metadata.bioconductor.packageVersion,
			metadata.repository.descriptionVersion
		);
		if (metadata.versionRelationship !== expected) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['versionRelationship'],
				message: `must be "${expected}" for the recorded package versions`
			});
		}
	});

export const BioconductorResourceMetadataSchema = z
	.object({
		cacheVersion: z.literal(BIOCONDUCTOR_RESOURCE_CACHE_VERSION),
		package: packageName,
		bioconductor: z.object({
			release: z.string().regex(NUMBERED_BIOCONDUCTOR_RELEASE_PATTERN, 'must be a numbered release'),
			packageVersion: provenanceIdentity,
			repository: z.enum(BIOCONDUCTOR_REPOSITORIES),
			landingUrl: nonBlank
		}),
		repository: BioconductorRepositoryMetadataSchema,
		versionRelationship: z.enum(['aligned', 'different', 'unknown']),
		documents: z.array(BioconductorDocumentRecordSchema),
		requestedDocuments: z.array(z.enum(BIOCONDUCTOR_DOCUMENT_TYPES)),
		curatedFrom: safeRelativePath.optional(),
		fetchedAt: z.string().datetime()
	})
	.superRefine((metadata, ctx) => {
		const bioconductorVersion = metadata.bioconductor.packageVersion.trim();
		const sourceVersion = metadata.repository.descriptionVersion.trim();
		const expected =
			bioconductorVersion === 'unknown' || sourceVersion === 'unknown'
				? 'unknown'
				: bioconductorVersion === sourceVersion
					? 'aligned'
					: 'different';
		if (metadata.versionRelationship !== expected) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['versionRelationship'],
				message: `must be "${expected}" for the recorded package versions`
			});
		}
		if (metadata.versionRelationship !== 'aligned') {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['versionRelationship'],
				message: 'managed Bioconductor source must match the published package version'
			});
		}
	});

export type BioconductorDocumentRecord = z.infer<typeof BioconductorDocumentRecordSchema>;
export type BioconductorRepositoryMetadata = z.infer<typeof BioconductorRepositoryMetadataSchema>;
export type BioconductorGitSourceMetadata = z.infer<typeof BioconductorGitSourceMetadataSchema>;
export type BioconductorResourceMetadata = z.infer<typeof BioconductorResourceMetadataSchema>;
export type LegacyBioconductorResourceMetadata = z.infer<typeof LegacyBioconductorResourceMetadataSchema>;
export type BioconductorMetadataIssue = {
	readonly path: string;
	readonly code: string;
	readonly message: string;
};

export type BioconductorMetadataParseResult =
	| { readonly success: true; readonly data: BioconductorResourceMetadata }
	| { readonly success: false; readonly issues: readonly BioconductorMetadataIssue[] };

export const parseBioconductorResourceMetadata = (value: unknown): BioconductorMetadataParseResult => {
	const parsed = BioconductorResourceMetadataSchema.safeParse(value);
	if (parsed.success) return { success: true, data: parsed.data };
	return {
		success: false,
		issues: parsed.error.issues.map((issue) => ({
			path: issue.path.join('.'),
			code: issue.code,
			message: issue.message
		}))
	};
};

/**
 * Recognize only the immediately previous managed-cache schema. Legacy data is
 * never mounted through this parser; it is used only to select safe upgrade
 * candidates for a fresh exact-version materialization.
 */
export const parseLegacyBioconductorResourceMetadata = (
	value: unknown
):
	| { readonly success: true; readonly data: LegacyBioconductorResourceMetadata }
	| { readonly success: false } => {
	const parsed = LegacyBioconductorResourceMetadataSchema.safeParse(value);
	return parsed.success ? { success: true, data: parsed.data } : { success: false };
};

export const formatBioconductorMetadataIssues = (issues: readonly BioconductorMetadataIssue[]): string =>
	issues.map((issue) => `${issue.path || '<root>'}: ${issue.message}`).join('; ');

export type BioconductorMetadataFileResult =
	| { readonly success: true; readonly data: BioconductorResourceMetadata }
	| {
			readonly success: false;
			readonly kind: 'missing' | 'malformed_json' | 'invalid_schema';
			readonly issues: readonly BioconductorMetadataIssue[];
	  };

/** The only parser used for managed metadata on disk. */
export const readBioconductorResourceMetadataFile = async (
	directory: string
): Promise<BioconductorMetadataFileResult> => {
	let raw: string;
	try {
		raw = await fs.readFile(path.join(directory, BIOCONDUCTOR_METADATA_FILE), 'utf8');
	} catch (cause) {
		return {
			success: false,
			kind: 'missing',
			issues: [
				{
					path: BIOCONDUCTOR_METADATA_FILE,
					code: (cause as NodeJS.ErrnoException).code ?? 'read_error',
					message: cause instanceof Error ? cause.message : String(cause)
				}
			]
		};
	}

	let value: unknown;
	try {
		value = JSON.parse(raw);
	} catch (cause) {
		return {
			success: false,
			kind: 'malformed_json',
			issues: [
				{
					path: BIOCONDUCTOR_METADATA_FILE,
					code: 'invalid_json',
					message: cause instanceof Error ? cause.message : String(cause)
				}
			]
		};
	}

	const parsed = parseBioconductorResourceMetadata(value);
	return parsed.success
		? parsed
		: { success: false, kind: 'invalid_schema', issues: parsed.issues };
};

export const readBioconductorResourceMetadata = async (
	directory: string
): Promise<BioconductorResourceMetadata | null> => {
	const result = await readBioconductorResourceMetadataFile(directory);
	return result.success ? result.data : null;
};

export const getVersionRelationship = (
	bioconductorVersion: string | undefined,
	descriptionVersion: string | undefined
): BioconductorResourceMetadata['versionRelationship'] => {
	const published = bioconductorVersion?.trim();
	const source = descriptionVersion?.trim();
	if (!published || !source || published === 'unknown' || source === 'unknown') return 'unknown';
	return published === source ? 'aligned' : 'different';
};

export const isBioconductorGitSourceMetadata = (
	metadata: BioconductorRepositoryMetadata
): metadata is BioconductorGitSourceMetadata => metadata.kind !== 'bioconductor_archive';
