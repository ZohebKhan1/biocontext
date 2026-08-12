import { promises as fs } from 'node:fs';
import path from 'node:path';

import { z } from 'zod';

import {
	inspectBioconductorArtifactPath as inspectManagedArtifactPath,
	isSafeBioconductorRelativePath as isSafeManagedRelativePath
} from '../bioconductor/metadata.ts';
import { BIOCONDUCTOR_SOURCE_POLICY_VERSION } from '../bioconductor/source-policy.ts';

export const CRAN_METADATA_FILE = '.cran-meta.json';
export const CRAN_RESOURCE_CACHE_VERSION = 1;
export const SHA256_PATTERN = /^[0-9a-f]{64}$/u;

const nonBlank = z.string().trim().min(1);
const packageName = z.string().regex(/^[A-Za-z][A-Za-z0-9.]*$/u);
const httpsUrl = z
	.string()
	.url()
	.refine((value) => new URL(value).protocol === 'https:');
const safeRelativePath = z
	.string()
	.refine(
		isSafeManagedRelativePath,
		'must be a normalized package-relative path without traversal'
	);

export const CranSourceInventorySchema = z.object({
	policyVersion: z.literal(BIOCONDUCTOR_SOURCE_POLICY_VERSION),
	files: z.array(safeRelativePath),
	fileCount: z.number().int().nonnegative(),
	bytes: z.number().int().nonnegative(),
	omittedCount: z.number().int().nonnegative()
});

export const CranResourceMetadataSchema = z
	.object({
		cacheVersion: z.literal(CRAN_RESOURCE_CACHE_VERSION),
		package: packageName,
		cran: z.object({
			version: nonBlank,
			repository: z.literal('CRAN'),
			landingUrl: httpsUrl,
			sourceUrl: httpsUrl,
			sourceSha256: z.string().regex(SHA256_PATTERN, 'must be a lowercase SHA-256 digest'),
			md5: z
				.string()
				.regex(/^[0-9a-f]{32}$/u)
				.optional(),
			published: nonBlank.optional()
		}),
		source: z.object({
			descriptionPackage: packageName,
			descriptionVersion: nonBlank,
			sourcePolicyVersion: z.literal(BIOCONDUCTOR_SOURCE_POLICY_VERSION),
			fileCount: z.number().int().nonnegative(),
			bytes: z.number().int().nonnegative(),
			omittedCount: z.number().int().nonnegative()
		}),
		fetchedAt: z.string().datetime()
	})
	.superRefine((metadata, ctx) => {
		const expectedLandingUrl = `https://cloud.r-project.org/web/packages/${encodeURIComponent(metadata.package)}/index.html`;
		const expectedSourceUrl = `https://cloud.r-project.org/src/contrib/${encodeURIComponent(metadata.package)}_${encodeURIComponent(metadata.cran.version)}.tar.gz`;
		if (metadata.cran.landingUrl !== expectedLandingUrl) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['cran', 'landingUrl'],
				message: `must equal the official CRAN landing URL for ${metadata.package}`
			});
		}
		if (metadata.cran.sourceUrl !== expectedSourceUrl) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['cran', 'sourceUrl'],
				message: `must equal the official CRAN source URL for ${metadata.package} ${metadata.cran.version}`
			});
		}
		if (metadata.package !== metadata.source.descriptionPackage) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['source', 'descriptionPackage'],
				message: `must equal package ${metadata.package}`
			});
		}
		if (metadata.cran.version !== metadata.source.descriptionVersion) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['source', 'descriptionVersion'],
				message: `must equal CRAN version ${metadata.cran.version}`
			});
		}
	});

export type CranSourceInventory = z.infer<typeof CranSourceInventorySchema>;
export type CranResourceMetadata = z.infer<typeof CranResourceMetadataSchema>;

export type CranMetadataIssue = {
	readonly path: string;
	readonly code: string;
	readonly message: string;
};

export type CranMetadataParseResult =
	| { readonly success: true; readonly data: CranResourceMetadata }
	| { readonly success: false; readonly issues: readonly CranMetadataIssue[] };

export const parseCranResourceMetadata = (value: unknown): CranMetadataParseResult => {
	const parsed = CranResourceMetadataSchema.safeParse(value);
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

export type CranMetadataFileResult =
	| { readonly success: true; readonly data: CranResourceMetadata }
	| {
			readonly success: false;
			readonly kind: 'missing' | 'malformed_json' | 'invalid_schema';
			readonly issues: readonly CranMetadataIssue[];
	  };

export const readCranResourceMetadataFile = async (
	directory: string
): Promise<CranMetadataFileResult> => {
	let raw: string;
	try {
		raw = await fs.readFile(path.join(directory, CRAN_METADATA_FILE), 'utf8');
	} catch (cause) {
		return {
			success: false,
			kind: 'missing',
			issues: [
				{
					path: CRAN_METADATA_FILE,
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
					path: CRAN_METADATA_FILE,
					code: 'invalid_json',
					message: cause instanceof Error ? cause.message : String(cause)
				}
			]
		};
	}
	const parsed = parseCranResourceMetadata(value);
	return parsed.success
		? parsed
		: { success: false, kind: 'invalid_schema', issues: parsed.issues };
};

export const readCranResourceMetadata = async (
	directory: string
): Promise<CranResourceMetadata | null> => {
	const parsed = await readCranResourceMetadataFile(directory);
	return parsed.success ? parsed.data : null;
};

export const inspectCranArtifactPath = inspectManagedArtifactPath;
