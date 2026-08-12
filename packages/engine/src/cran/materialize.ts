import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { parseDcf } from '../bioconductor/dcf.ts';
import { BIOCONDUCTOR_SOURCE_POLICY_VERSION } from '../bioconductor/source-policy.ts';
import { isSafeBioconductorRelativePath as isSafeManagedRelativePath } from '../bioconductor/metadata.ts';
import { withBioconductorPackageMutation as withPackageMutation } from '../bioconductor/package-mutation.ts';
import { extractPackageSourceArchive } from '../package-source-archive.ts';
import { cranLandingUrl, cranSourceUrl, type CranFetch, type CranPackage } from './catalog.ts';
import { readResponseBytesBounded } from './io.ts';
import {
	CRAN_METADATA_FILE,
	CRAN_RESOURCE_CACHE_VERSION,
	CranSourceInventorySchema,
	inspectCranArtifactPath,
	readCranResourceMetadata,
	type CranResourceMetadata,
	type CranSourceInventory
} from './metadata.ts';

export const CRAN_SOURCE_DIR = 'source';
export const CRAN_SOURCE_DIRECTORY_FILE = 'DIRECTORY.md';
export const CRAN_SOURCE_MANIFEST_FILE = 'MANIFEST.json';

const MAX_ARCHIVE_BYTES = 128 * 1024 * 1024;
const MAX_UNCOMPRESSED_BYTES = 512 * 1024 * 1024;
const MAX_RETAINED_FILE_BYTES = 32 * 1024 * 1024;
const MAX_RETAINED_TOTAL_BYTES = 256 * 1024 * 1024;
const MAX_ARCHIVE_ENTRIES = 100_000;

export type CranMaterializeFailure = {
	readonly code: string;
	readonly message: string;
	readonly path?: string;
};

export type CranVerificationResult = {
	readonly status: 'complete' | 'partial' | 'invalid';
	readonly package: string;
	readonly version?: string;
	readonly failures: readonly CranMaterializeFailure[];
};

const readDescription = async (
	directory: string
): Promise<{ package: string; version: string }> => {
	const record = parseDcf(await fs.readFile(path.join(directory, 'DESCRIPTION'), 'utf8'))[0];
	const packageName = record?.['Package']?.trim();
	const version = record?.['Version']?.trim();
	if (!packageName || !version) throw new Error('source DESCRIPTION is missing Package or Version');
	return { package: packageName, version };
};

type SourceInventoryReadResult =
	| { inventory: CranSourceInventory }
	| { inventory: null; unsafePath?: string };

const readSourceInventory = async (directory: string): Promise<SourceInventoryReadResult> => {
	try {
		const value: unknown = JSON.parse(
			await fs.readFile(path.join(directory, CRAN_SOURCE_MANIFEST_FILE), 'utf8')
		);
		if (value && typeof value === 'object' && Array.isArray((value as { files?: unknown }).files)) {
			const unsafePath = (value as { files: unknown[] }).files.find(
				(candidate): candidate is string =>
					typeof candidate === 'string' && !isSafeManagedRelativePath(candidate)
			);
			if (unsafePath) return { inventory: null, unsafePath };
		}
		const parsed = CranSourceInventorySchema.safeParse(value);
		return parsed.success ? { inventory: parsed.data } : { inventory: null };
	} catch {
		return { inventory: null };
	}
};

export const verifyCranPackageDirectory = async (args: {
	readonly directory: string;
	readonly package: string;
}): Promise<CranVerificationResult> => {
	try {
		const root = await fs.lstat(args.directory);
		if (!root.isDirectory() || root.isSymbolicLink()) {
			return {
				status: 'invalid',
				package: args.package,
				failures: [
					{ code: 'unsafe_path', message: 'managed CRAN package root is not a real directory' }
				]
			};
		}
	} catch {
		return {
			status: 'invalid',
			package: args.package,
			failures: [{ code: 'metadata_invalid', message: 'managed CRAN package is absent' }]
		};
	}
	const metadataPathStatus = await inspectCranArtifactPath(
		args.directory,
		CRAN_METADATA_FILE,
		'file'
	);
	if (metadataPathStatus !== 'ok') {
		return {
			status: 'invalid',
			package: args.package,
			failures: [
				{
					code: metadataPathStatus === 'unsafe' ? 'unsafe_path' : 'metadata_invalid',
					message: `CRAN metadata is ${metadataPathStatus}`,
					path: CRAN_METADATA_FILE
				}
			]
		};
	}
	const parsed = await readCranResourceMetadata(args.directory);
	if (!parsed) {
		return {
			status: 'invalid',
			package: args.package,
			failures: [{ code: 'metadata_invalid', message: 'CRAN metadata is missing or malformed' }]
		};
	}
	if (parsed.package.toLowerCase() !== args.package.trim().toLowerCase()) {
		return {
			status: 'invalid',
			package: args.package,
			failures: [
				{
					code: 'package_identity_conflict',
					message: `metadata identifies ${parsed.package}, expected ${args.package}`,
					path: CRAN_METADATA_FILE
				}
			]
		};
	}

	const failures: CranMaterializeFailure[] = [];
	for (const [relativePath, kind] of [
		['README.md', 'file'],
		[CRAN_SOURCE_DIR, 'directory'],
		[`${CRAN_SOURCE_DIR}/${CRAN_SOURCE_MANIFEST_FILE}`, 'file'],
		[`${CRAN_SOURCE_DIR}/${CRAN_SOURCE_DIRECTORY_FILE}`, 'file']
	] as const) {
		const status = await inspectCranArtifactPath(args.directory, relativePath, kind);
		if (status !== 'ok') {
			failures.push({
				code: status === 'unsafe' ? 'unsafe_path' : 'missing_artifact',
				message: `${relativePath} is ${status}`,
				path: relativePath
			});
		}
	}
	if (failures.some((failure) => failure.code === 'unsafe_path')) {
		return {
			status: 'invalid',
			package: parsed.package,
			version: parsed.cran.version,
			failures
		};
	}

	const sourceDirectory = path.join(args.directory, CRAN_SOURCE_DIR);
	const inventoryResult = await readSourceInventory(sourceDirectory);
	const inventory = inventoryResult.inventory;
	if (!inventory) {
		failures.push({
			code: inventoryResult.unsafePath ? 'unsafe_path' : 'inventory_invalid',
			message: inventoryResult.unsafePath
				? `source inventory contains unsafe path ${inventoryResult.unsafePath}`
				: 'source inventory is missing or malformed',
			path: `${CRAN_SOURCE_DIR}/${CRAN_SOURCE_MANIFEST_FILE}`
		});
	} else {
		const uniqueFiles = new Set(inventory.files);
		if (
			uniqueFiles.size !== inventory.files.length ||
			inventory.fileCount !== inventory.files.length
		) {
			failures.push({
				code: 'inventory_count_mismatch',
				message: 'source inventory file counts are inconsistent',
				path: `${CRAN_SOURCE_DIR}/${CRAN_SOURCE_MANIFEST_FILE}`
			});
		}
		if (!inventory.files.includes('DESCRIPTION') || !inventory.files.includes('NAMESPACE')) {
			failures.push({
				code: 'inventory_required_files_missing',
				message: 'source inventory must include DESCRIPTION and NAMESPACE',
				path: `${CRAN_SOURCE_DIR}/${CRAN_SOURCE_MANIFEST_FILE}`
			});
		}
		if (!inventory.files.some((file) => /^(?:R|man|vignettes|inst|tests)\//u.test(file))) {
			failures.push({
				code: 'inventory_searchable_content_missing',
				message: 'source inventory has no searchable implementation or documentation',
				path: `${CRAN_SOURCE_DIR}/${CRAN_SOURCE_MANIFEST_FILE}`
			});
		}
		if (
			[...inventory.files]
				.sort((left, right) => left.localeCompare(right))
				.some((file, index) => file !== inventory.files[index])
		) {
			failures.push({
				code: 'inventory_order_invalid',
				message: 'source inventory paths must use deterministic lexical order',
				path: `${CRAN_SOURCE_DIR}/${CRAN_SOURCE_MANIFEST_FILE}`
			});
		}
		let bytes = 0;
		for (const relativePath of inventory.files) {
			const packageRelativePath = `${CRAN_SOURCE_DIR}/${relativePath}`;
			const status = await inspectCranArtifactPath(args.directory, packageRelativePath, 'file');
			if (status !== 'ok') {
				failures.push({
					code: status === 'unsafe' ? 'unsafe_path' : 'missing_source_file',
					message: `${packageRelativePath} is ${status}`,
					path: packageRelativePath
				});
				continue;
			}
			bytes += (await fs.stat(path.join(sourceDirectory, relativePath))).size;
		}
		if (bytes !== inventory.bytes || bytes !== parsed.source.bytes) {
			failures.push({
				code: 'inventory_bytes_mismatch',
				message: 'source inventory byte counts are inconsistent',
				path: `${CRAN_SOURCE_DIR}/${CRAN_SOURCE_MANIFEST_FILE}`
			});
		}
		if (
			inventory.fileCount !== parsed.source.fileCount ||
			inventory.omittedCount !== parsed.source.omittedCount ||
			inventory.policyVersion !== parsed.source.sourcePolicyVersion
		) {
			failures.push({
				code: 'inventory_metadata_mismatch',
				message: 'source inventory does not match CRAN metadata',
				path: `${CRAN_SOURCE_DIR}/${CRAN_SOURCE_MANIFEST_FILE}`
			});
		}
	}

	try {
		const description = await readDescription(sourceDirectory);
		if (description.package !== parsed.package || description.version !== parsed.cran.version) {
			failures.push({
				code: 'description_identity_conflict',
				message: `DESCRIPTION identifies ${description.package} ${description.version}`,
				path: `${CRAN_SOURCE_DIR}/DESCRIPTION`
			});
		}
	} catch (cause) {
		failures.push({
			code: 'description_invalid',
			message: cause instanceof Error ? cause.message : String(cause),
			path: `${CRAN_SOURCE_DIR}/DESCRIPTION`
		});
	}

	const invalidCodes = new Set([
		'unsafe_path',
		'package_identity_conflict',
		'description_identity_conflict'
	]);
	return {
		status: failures.some((failure) => invalidCodes.has(failure.code))
			? 'invalid'
			: failures.length > 0
				? 'partial'
				: 'complete',
		package: parsed.package,
		version: parsed.cran.version,
		failures
	};
};

export const isCompleteCranResourceCache = async (
	directory: string,
	metadata: CranResourceMetadata
): Promise<boolean> =>
	(await verifyCranPackageDirectory({ directory, package: metadata.package })).status ===
	'complete';

const renderReadme = (metadata: CranResourceMetadata): string =>
	[
		`# ${metadata.package}`,
		'',
		`Searchable CRAN package source for ${metadata.package} ${metadata.cran.version}.`,
		'',
		`- CRAN landing page: ${metadata.cran.landingUrl}`,
		`- Exact source archive: ${metadata.cran.sourceUrl}`,
		`- Source SHA-256: \`${metadata.cran.sourceSha256}\``,
		`- Included files: ${metadata.source.fileCount}`,
		`- Included size: ${metadata.source.bytes} bytes`,
		`- Omitted files: ${metadata.source.omittedCount}`,
		'',
		'## Research routing',
		'',
		'- `source/man/` contains exact Rd reference documentation.',
		'- `source/R/` contains the package implementation.',
		'- `source/vignettes/` and `source/inst/doc/` contain authored workflows when the CRAN source publishes them.',
		'- `source/tests/` contains focused textual tests retained by the source policy.',
		'- `source/DIRECTORY.md` and `source/MANIFEST.json` describe the deterministic inventory and are routing files, not evidence.',
		'',
		'CRAN source packages are versioned release snapshots. They do not imply that the package is hosted by Bioconductor.',
		''
	].join('\n');

const readDirectoryEntries = async (directory: string): Promise<string[] | null> => {
	try {
		const stat = await fs.lstat(directory);
		if (!stat.isDirectory() || stat.isSymbolicLink()) {
			throw new Error(`${directory} is not a safe managed CRAN directory`);
		}
		return fs.readdir(directory);
	} catch (cause) {
		if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return null;
		throw cause;
	}
};

const assertReplaceableDirectory = async (
	directory: string,
	packageName: string
): Promise<boolean> => {
	const entries = await readDirectoryEntries(directory);
	if (entries === null) return false;
	if (entries.length === 0) return true;
	const metadata = await readCranResourceMetadata(directory);
	if (!metadata || metadata.package.toLowerCase() !== packageName.toLowerCase()) {
		throw new Error(
			`Refusing to replace ${directory}: it is not a managed CRAN resource for ${packageName}`
		);
	}
	return true;
};

const recoverInterruptedReplacement = async (
	directory: string,
	packageName: string
): Promise<void> => {
	const previous = `${directory}.previous`;
	const targetExists = await assertReplaceableDirectory(directory, packageName);
	const previousExists = await assertReplaceableDirectory(previous, packageName);
	if (!previousExists) return;
	if (!targetExists) {
		await fs.rename(previous, directory);
		return;
	}
	await fs.rm(previous, { recursive: true, force: true });
};

const replaceDirectory = async (
	staging: string,
	directory: string,
	packageName: string
): Promise<void> => {
	await recoverInterruptedReplacement(directory, packageName);
	await assertReplaceableDirectory(directory, packageName);
	const previous = `${directory}.previous`;
	let movedExisting = false;
	try {
		await fs.rename(directory, previous);
		movedExisting = true;
	} catch (cause) {
		if ((cause as NodeJS.ErrnoException).code !== 'ENOENT') throw cause;
	}
	try {
		await fs.rename(staging, directory);
	} catch (cause) {
		if (movedExisting) {
			await fs.rm(directory, { recursive: true, force: true });
			await fs.rename(previous, directory);
		}
		throw cause;
	}
	if (movedExisting) await fs.rm(previous, { recursive: true, force: true });
};

export type MaterializeCranOptions = {
	readonly pkg: CranPackage;
	readonly directory: string;
	readonly refresh?: boolean;
	readonly quiet?: boolean;
};

export type MaterializeCranDependencies = {
	readonly fetch?: CranFetch;
	readonly now?: () => Date;
};

export type MaterializeCranResult = {
	readonly directory: string;
	readonly metadata: CranResourceMetadata;
	readonly downloaded: boolean;
};

const materializeCranPackageOnce = async (
	options: MaterializeCranOptions,
	dependencies: MaterializeCranDependencies
): Promise<MaterializeCranResult> => {
	await recoverInterruptedReplacement(options.directory, options.pkg.name);
	const existing = await readCranResourceMetadata(options.directory);
	if (existing && !options.refresh && existing.cran.version === options.pkg.version) {
		if (await isCompleteCranResourceCache(options.directory, existing)) {
			return { directory: options.directory, metadata: existing, downloaded: false };
		}
	}
	const staging = `${options.directory}.partial-${crypto.randomUUID()}`;
	await fs.mkdir(staging, { recursive: true });
	try {
		const sourceUrl = cranSourceUrl(options.pkg);
		const fetchImpl: CranFetch = dependencies.fetch ?? globalThis.fetch;
		const response = await fetchImpl(sourceUrl, {
			headers: { accept: 'application/gzip, application/octet-stream' },
			signal: AbortSignal.timeout(300_000)
		});
		if (!response.ok) throw new Error(`CRAN source archive returned HTTP ${response.status}`);
		const archive = await readResponseBytesBounded(
			response,
			MAX_ARCHIVE_BYTES,
			'CRAN source archive'
		);
		if (archive.byteLength === 0 || archive.byteLength > MAX_ARCHIVE_BYTES) {
			throw new Error('CRAN source archive has an invalid size');
		}
		if (archive[0] !== 0x1f || archive[1] !== 0x8b) {
			throw new Error('CRAN source archive is not gzip data');
		}
		const md5 = createHash('md5').update(archive).digest('hex');
		if (options.pkg.md5 && md5 !== options.pkg.md5) {
			throw new Error(
				`CRAN source archive MD5 does not match the package index for ${options.pkg.name}`
			);
		}
		const sourceSha256 = createHash('sha256').update(archive).digest('hex');
		const extracted = await extractPackageSourceArchive({
			archive,
			archiveLabel: 'CRAN source archive',
			package: options.pkg.name,
			version: options.pkg.version,
			directory: path.join(staging, CRAN_SOURCE_DIR),
			manifestFile: CRAN_SOURCE_MANIFEST_FILE,
			directoryFile: CRAN_SOURCE_DIRECTORY_FILE,
			maximumUncompressedBytes: MAX_UNCOMPRESSED_BYTES,
			maximumRetainedFileBytes: MAX_RETAINED_FILE_BYTES,
			maximumRetainedTotalBytes: MAX_RETAINED_TOTAL_BYTES,
			maximumArchiveEntries: MAX_ARCHIVE_ENTRIES
		});
		const metadata: CranResourceMetadata = {
			cacheVersion: CRAN_RESOURCE_CACHE_VERSION,
			package: options.pkg.name,
			cran: {
				version: options.pkg.version,
				repository: 'CRAN',
				landingUrl: cranLandingUrl(options.pkg.name),
				sourceUrl,
				sourceSha256,
				...(options.pkg.md5 ? { md5: options.pkg.md5 } : {}),
				...(options.pkg.published ? { published: options.pkg.published } : {})
			},
			source: {
				descriptionPackage: extracted.description.package,
				descriptionVersion: extracted.description.version,
				sourcePolicyVersion: BIOCONDUCTOR_SOURCE_POLICY_VERSION,
				fileCount: extracted.inventory.fileCount,
				bytes: extracted.inventory.bytes,
				omittedCount: extracted.inventory.omittedCount
			},
			fetchedAt: (dependencies.now?.() ?? new Date()).toISOString()
		};
		await fs.writeFile(path.join(staging, 'README.md'), renderReadme(metadata), 'utf8');
		await fs.writeFile(
			path.join(staging, CRAN_METADATA_FILE),
			`${JSON.stringify(metadata, null, '\t')}\n`,
			'utf8'
		);
		const staged = await verifyCranPackageDirectory({
			directory: staging,
			package: options.pkg.name
		});
		if (staged.status !== 'complete') {
			throw new Error(
				`${options.pkg.name} staging directory failed verification: ${staged.failures.map((failure) => failure.message).join('; ')}`
			);
		}
		await fs.mkdir(path.dirname(options.directory), { recursive: true });
		await replaceDirectory(staging, options.directory, options.pkg.name);
		return { directory: options.directory, metadata, downloaded: true };
	} finally {
		await fs.rm(staging, { recursive: true, force: true });
	}
};

export const materializeCranPackage = async (
	options: MaterializeCranOptions,
	dependencies: MaterializeCranDependencies = {}
): Promise<MaterializeCranResult> =>
	withPackageMutation(options.directory, () => materializeCranPackageOnce(options, dependencies));
