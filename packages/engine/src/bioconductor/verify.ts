import { promises as fs } from 'node:fs';
import path from 'node:path';

import { parseDcf } from './dcf.ts';
import {
	BIOCONDUCTOR_METADATA_FILE,
	BIOCONDUCTOR_RESOURCE_CACHE_VERSION,
	FULL_GIT_COMMIT_PATTERN,
	inspectBioconductorArtifactPath,
	isBioconductorGitSourceMetadata,
	isSafeBioconductorRelativePath,
	parseBioconductorResourceMetadata,
	type BioconductorResourceMetadata
} from './metadata.ts';
import {
	BIOCONDUCTOR_SOURCE_DIR,
	BIOCONDUCTOR_SOURCE_MANIFEST_FILE,
	BIOCONDUCTOR_SOURCE_DIRECTORY_FILE
} from './materialize.ts';
import { resourceNameToKey } from '../resources/helpers.ts';
import { shouldKeepSourcePath, type SourceInventory } from './source-policy.ts';

export type BioconductorVerificationStatus = 'complete' | 'partial' | 'invalid';

export type BioconductorVerificationFailure = {
	readonly code: string;
	readonly message: string;
	readonly path?: string;
};

export type BioconductorVerificationResult = {
	readonly status: BioconductorVerificationStatus;
	readonly package: string;
	readonly directory: string;
	readonly failures: readonly BioconductorVerificationFailure[];
};

const existsAs = async (target: string, kind: 'file' | 'directory'): Promise<boolean> => {
	try {
		const stats = await fs.stat(target);
		return kind === 'file' ? stats.isFile() && stats.size > 0 : stats.isDirectory();
	} catch {
		return false;
	}
};

const failure = (
	code: string,
	message: string,
	relativePath?: string
): BioconductorVerificationFailure => ({ code, message, ...(relativePath ? { path: relativePath } : {}) });

const readDescription = async (
	sourceDirectory: string
): Promise<{ package?: string; version?: string }> => {
	const records = parseDcf(await fs.readFile(path.join(sourceDirectory, 'DESCRIPTION'), 'utf8'));
	return {
		package: records[0]?.['Package']?.trim(),
		version: records[0]?.['Version']?.trim()
	};
};

const validateExistingFile = async (
	directory: string,
	relativePath: string,
	missingCode: string,
	failures: BioconductorVerificationFailure[]
) => {
	const status = await inspectBioconductorArtifactPath(directory, relativePath, 'file');
	if (status === 'unsafe') {
		failures.push(
			failure('path_escape', 'Recorded path escapes the package directory.', relativePath)
		);
		return;
	}
	if (status === 'missing') {
		failures.push(failure(missingCode, 'Recorded file is missing or empty.', relativePath));
	}
};

const verifyParsedMetadata = async (
	directory: string,
	packageName: string,
	metadata: BioconductorResourceMetadata
): Promise<BioconductorVerificationFailure[]> => {
	const failures: BioconductorVerificationFailure[] = [];
	if (metadata.package !== packageName) {
		failures.push(
			failure(
				'package_identity_conflict',
				`Metadata identifies ${metadata.package}, expected ${packageName}.`,
				BIOCONDUCTOR_METADATA_FILE
			)
		);
	}
	if (metadata.repository.descriptionPackage !== metadata.package) {
		failures.push(
			failure(
				'package_identity_conflict',
				`Repository metadata identifies ${metadata.repository.descriptionPackage}, expected ${metadata.package}.`,
				BIOCONDUCTOR_METADATA_FILE
			)
		);
	}
	if (metadata.bioconductor.packageVersion === 'unknown') {
		failures.push(
			failure(
				'bioconductor_package_version_unknown',
				'The recorded Bioconductor package version is unavailable.',
				BIOCONDUCTOR_METADATA_FILE
			)
		);
	}
	if (
		isBioconductorGitSourceMetadata(metadata.repository) &&
		!FULL_GIT_COMMIT_PATTERN.test(metadata.repository.commit)
	) {
		failures.push(
			failure(
				'repository_commit_invalid',
				'Repository commit is not a full SHA.',
				BIOCONDUCTOR_METADATA_FILE
			)
		);
	}
	if (
		metadata.repository.descriptionVersion !== metadata.bioconductor.packageVersion ||
		metadata.versionRelationship !== 'aligned'
	) {
		failures.push(
			failure(
				'source_version_conflict',
				`Source version ${metadata.repository.descriptionVersion} does not match published version ${metadata.bioconductor.packageVersion}.`,
				BIOCONDUCTOR_METADATA_FILE
			)
		);
	}

	await validateExistingFile(directory, 'README.md', 'readme_missing', failures);
	for (const document of metadata.documents) {
		if (document.status === 'ok') {
			await validateExistingFile(directory, document.path, 'document_missing', failures);
		}
	}
	const authoritative = metadata.documents.filter(
		(document) =>
			document.sourceType === 'bioconductor' &&
			document.status === 'ok' &&
			(document.originType === 'vignette' || document.originType === 'reference_manual')
	);
	if (authoritative.length === 0) {
		failures.push(
			failure(
				'published_evidence_missing',
				'At least one successful published vignette or reference manual is required.',
				BIOCONDUCTOR_METADATA_FILE
			)
		);
	}

	const sourceDirectory = path.join(directory, BIOCONDUCTOR_SOURCE_DIR);
	const sourceStatus = await inspectBioconductorArtifactPath(directory, BIOCONDUCTOR_SOURCE_DIR, 'directory');
	if (sourceStatus !== 'ok') {
		if (sourceStatus === 'unsafe') {
			failures.push(
				failure(
					'path_escape',
					'Repository directory escapes the package directory.',
					BIOCONDUCTOR_SOURCE_DIR
				)
			);
			return failures;
		}
		failures.push(
			failure('repository_missing', 'The source repository directory is missing.', BIOCONDUCTOR_SOURCE_DIR)
		);
		return failures;
	}
	await validateExistingFile(
		directory,
		`${BIOCONDUCTOR_SOURCE_DIR}/${BIOCONDUCTOR_SOURCE_DIRECTORY_FILE}`,
		'source_directory_missing',
		failures
	);
	await validateExistingFile(
		directory,
		`${BIOCONDUCTOR_SOURCE_DIR}/${BIOCONDUCTOR_SOURCE_MANIFEST_FILE}`,
		'source_manifest_missing',
		failures
	);

	try {
		const identity = await readDescription(sourceDirectory);
		if (!identity.package || identity.package !== metadata.repository.descriptionPackage) {
			failures.push(
				failure(
					'description_package_conflict',
					`DESCRIPTION Package is ${identity.package ?? 'missing'}, metadata records ${metadata.repository.descriptionPackage}.`,
					`${BIOCONDUCTOR_SOURCE_DIR}/DESCRIPTION`
				)
			);
		}
		if (!identity.version || identity.version !== metadata.repository.descriptionVersion) {
			failures.push(
				failure(
					'description_version_conflict',
					`DESCRIPTION Version is ${identity.version ?? 'missing'}, metadata records ${metadata.repository.descriptionVersion}.`,
					`${BIOCONDUCTOR_SOURCE_DIR}/DESCRIPTION`
				)
			);
		}
	} catch (cause) {
		failures.push(
			failure(
				'description_unreadable',
				cause instanceof Error ? cause.message : String(cause),
				`${BIOCONDUCTOR_SOURCE_DIR}/DESCRIPTION`
			)
		);
	}

	try {
		const inventory = JSON.parse(
			await fs.readFile(path.join(sourceDirectory, BIOCONDUCTOR_SOURCE_MANIFEST_FILE), 'utf8')
		) as Partial<SourceInventory>;
		if (
			inventory.policyVersion !== metadata.repository.sourcePolicyVersion ||
			inventory.fileCount !== metadata.repository.fileCount ||
			inventory.bytes !== metadata.repository.bytes ||
			inventory.omittedCount !== metadata.repository.omittedCount ||
			!Array.isArray(inventory.files)
		) {
			failures.push(
				failure(
					'source_inventory_conflict',
					'Source inventory totals do not match repository metadata.',
					`${BIOCONDUCTOR_SOURCE_DIR}/${BIOCONDUCTOR_SOURCE_MANIFEST_FILE}`
				)
			);
		}
		for (const file of inventory.files ?? []) {
			if (
				typeof file !== 'string' ||
				!isSafeBioconductorRelativePath(file) ||
				!shouldKeepSourcePath(file)
			) {
				failures.push(
					failure(
						'source_inventory_path_unsafe',
						'Source manifest contains an unsafe or disallowed path.',
						`${BIOCONDUCTOR_SOURCE_DIR}/${typeof file === 'string' ? file : '<invalid>'}`
					)
				);
				continue;
			}
			await validateExistingFile(
				directory,
				`${BIOCONDUCTOR_SOURCE_DIR}/${file}`,
				'source_file_missing',
				failures
			);
		}
	} catch (cause) {
		failures.push(
			failure(
				'source_manifest_unreadable',
				cause instanceof Error ? cause.message : String(cause),
				`${BIOCONDUCTOR_SOURCE_DIR}/${BIOCONDUCTOR_SOURCE_MANIFEST_FILE}`
			)
		);
	}
	return failures;
};

const invalidFailureCodes = new Set([
	'package_identity_conflict',
	'path_escape',
	'source_inventory_path_unsafe',
	'description_package_conflict',
	'description_version_conflict',
	'source_version_conflict'
]);

/** Strict, local, read-only verification for `/add verify`. */
export const verifyBioconductorPackageDirectory = async (args: {
	readonly directory: string;
	readonly package: string;
}): Promise<BioconductorVerificationResult> => {
	const result = (status: BioconductorVerificationStatus, failures: BioconductorVerificationFailure[]) => ({
		status,
		package: args.package,
		directory: args.directory,
		failures
	});
	if (!(await existsAs(args.directory, 'directory'))) {
		return result('invalid', [
			failure('package_missing', 'The managed package directory does not exist.', args.directory)
		]);
	}

	let value: unknown;
	try {
		value = JSON.parse(await fs.readFile(path.join(args.directory, BIOCONDUCTOR_METADATA_FILE), 'utf8'));
	} catch (cause) {
		return result('invalid', [
			failure(
				'metadata_malformed',
				cause instanceof Error ? cause.message : String(cause),
				BIOCONDUCTOR_METADATA_FILE
			)
		]);
	}
	const parsed = parseBioconductorResourceMetadata(value);
	if (!parsed.success) {
		const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
		const recognizable =
			record?.cacheVersion === BIOCONDUCTOR_RESOURCE_CACHE_VERSION && record.package === args.package;
		const unsafe = parsed.issues.some(
			(issue) =>
				issue.path.endsWith('.path') && /traversal|normalized package-relative/u.test(issue.message)
		);
		return result(
			recognizable && !unsafe ? 'partial' : 'invalid',
			parsed.issues.map((issue) =>
				failure(
					unsafe ? 'metadata_path_unsafe' : 'metadata_schema_invalid',
					`${issue.path || '<root>'}: ${issue.message}`,
					BIOCONDUCTOR_METADATA_FILE
				)
			)
		);
	}

	const failures = await verifyParsedMetadata(args.directory, args.package, parsed.data);
	const status = failures.some((item) => invalidFailureCodes.has(item.code))
		? 'invalid'
		: failures.length > 0
			? 'partial'
			: 'complete';
	return result(status, failures);
};

export const verifyBioconductorPackage = async (args: {
	readonly resourcesDirectory: string;
	readonly package: string;
}): Promise<BioconductorVerificationResult> =>
	verifyBioconductorPackageDirectory({
		directory: path.join(args.resourcesDirectory, resourceNameToKey(args.package)),
		package: args.package
	});
