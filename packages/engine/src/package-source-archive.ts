import { promises as fs } from 'node:fs';
import path from 'node:path';

import * as tar from 'tar-stream';

import { parseDcf } from './bioconductor/dcf.ts';
import {
	BIOCONDUCTOR_SOURCE_POLICY_VERSION,
	formatSourceDirectory,
	shouldKeepSourcePath,
	type SourceInventory
} from './bioconductor/source-policy.ts';
import { isSafeBioconductorRelativePath as isSafeManagedRelativePath } from './bioconductor/metadata.ts';
import { gunzipBounded } from './cran/io.ts';

export type ExtractPackageSourceArchiveOptions = {
	readonly archive: Uint8Array;
	readonly archiveLabel: string;
	readonly package: string;
	readonly version: string;
	readonly directory: string;
	readonly manifestFile: string;
	readonly directoryFile: string;
	readonly maximumUncompressedBytes: number;
	readonly maximumRetainedFileBytes: number;
	readonly maximumRetainedTotalBytes: number;
	readonly maximumArchiveEntries: number;
};

export type ExtractedPackageSource = {
	readonly inventory: SourceInventory;
	readonly description: { package: string; version: string };
};

const normalizeArchivePath = (value: string): string =>
	value.replace(/^\.\//u, '').replace(/\/+$/u, '');

const drainEntry = async (stream: NodeJS.ReadableStream): Promise<void> => {
	for await (const _chunk of stream) {
		// tar-stream requires each entry to be fully consumed before advancing.
	}
};

const copyBytes = (value: Uint8Array): Uint8Array<ArrayBuffer> => {
	const copy = new Uint8Array(value.byteLength);
	copy.set(value);
	return copy;
};

const readEntry = async (stream: NodeJS.ReadableStream, maximumBytes: number): Promise<Buffer> => {
	const chunks: Buffer[] = [];
	let bytes = 0;
	for await (const value of stream) {
		const input: unknown = value;
		const chunk = Buffer.isBuffer(input)
			? input
			: typeof input === 'string'
				? Buffer.from(input)
				: input instanceof Uint8Array
					? Buffer.from(copyBytes(input))
					: input instanceof ArrayBuffer
						? Buffer.from(input)
						: (() => {
								throw new Error('package source archive yielded an unsupported entry chunk');
							})();
		bytes += chunk.byteLength;
		if (bytes > maximumBytes) throw new Error(`archive entry exceeds ${maximumBytes} bytes`);
		chunks.push(chunk);
	}
	return Buffer.concat(chunks, bytes);
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

/** Safely extract one exact R package source archive through the shared source policy. */
export const extractPackageSourceArchive = async (
	options: ExtractPackageSourceArchiveOptions
): Promise<ExtractedPackageSource> => {
	let uncompressed: Uint8Array;
	try {
		uncompressed = await gunzipBounded(
			options.archive,
			options.maximumUncompressedBytes,
			options.archiveLabel
		);
	} catch (cause) {
		if (cause instanceof Error && cause.message.startsWith(options.archiveLabel)) throw cause;
		throw new Error(`${options.archiveLabel} is not valid gzip data`, { cause });
	}
	if (uncompressed.byteLength === 0 || uncompressed.byteLength > options.maximumUncompressedBytes) {
		throw new Error(`${options.archiveLabel} expands to an invalid size`);
	}

	await fs.mkdir(options.directory, { recursive: true });
	const files: string[] = [];
	const seen = new Set<string>();
	let bytes = 0;
	let omittedCount = 0;
	let entryCount = 0;
	const extractor = tar.extract();

	await new Promise<void>((resolve, reject) => {
		extractor.on('entry', (header, stream, next) => {
			void (async () => {
				entryCount += 1;
				if (entryCount > options.maximumArchiveEntries) {
					throw new Error(`${options.archiveLabel} has too many entries`);
				}
				const archivePath = normalizeArchivePath(header.name);
				if (
					!archivePath ||
					path.posix.isAbsolute(archivePath) ||
					archivePath.includes('\0') ||
					header.name.includes('\\')
				) {
					throw new Error(
						`${options.archiveLabel} contains unsafe path ${JSON.stringify(header.name)}`
					);
				}
				const [root, ...segments] = archivePath.split('/');
				const relativePath = segments.join('/');
				if (
					root !== options.package ||
					(relativePath && !isSafeManagedRelativePath(relativePath))
				) {
					throw new Error(
						`${options.archiveLabel} path escapes ${options.package}: ${header.name}`
					);
				}
				if (relativePath) {
					if (seen.has(relativePath)) {
						throw new Error(`duplicate ${options.archiveLabel} entry: ${relativePath}`);
					}
					seen.add(relativePath);
				}
				if (!relativePath || header.type === 'directory') {
					await drainEntry(stream);
					return;
				}
				if (header.type !== 'file' && header.type !== 'contiguous-file') {
					omittedCount += 1;
					await drainEntry(stream);
					return;
				}
				if (!shouldKeepSourcePath(relativePath)) {
					omittedCount += 1;
					await drainEntry(stream);
					return;
				}
				const content = await readEntry(stream, options.maximumRetainedFileBytes);
				bytes += content.byteLength;
				if (bytes > options.maximumRetainedTotalBytes) {
					throw new Error(`retained ${options.archiveLabel} exceeds size limit`);
				}
				const destination = path.join(options.directory, relativePath);
				await fs.mkdir(path.dirname(destination), { recursive: true });
				await fs.writeFile(destination, content);
				files.push(relativePath);
			})().then(
				() => next(),
				(cause) => next(cause)
			);
		});
		extractor.once('finish', resolve);
		extractor.once('error', reject);
		extractor.end(
			Buffer.from(
				uncompressed.buffer as ArrayBuffer,
				uncompressed.byteOffset,
				uncompressed.byteLength
			)
		);
	});

	files.sort((left, right) => left.localeCompare(right));
	const inventory: SourceInventory = {
		policyVersion: BIOCONDUCTOR_SOURCE_POLICY_VERSION,
		files,
		fileCount: files.length,
		bytes,
		omittedCount
	};
	const missing = ['DESCRIPTION', 'NAMESPACE'].filter((file) => !seen.has(file));
	if (missing.length > 0)
		throw new Error(`${options.archiveLabel} is missing ${missing.join(' and ')}`);
	if (!files.some((file) => /^(?:R|man|vignettes|inst|tests)\//u.test(file))) {
		throw new Error(`${options.archiveLabel} has no searchable package source or documentation`);
	}
	const description = await readDescription(options.directory);
	if (description.package !== options.package || description.version !== options.version) {
		throw new Error(
			`${options.archiveLabel} DESCRIPTION identifies ${description.package} ${description.version}, expected ${options.package} ${options.version}`
		);
	}
	await fs.writeFile(
		path.join(options.directory, options.manifestFile),
		`${JSON.stringify(inventory, null, '\t')}\n`,
		'utf8'
	);
	await fs.writeFile(
		path.join(options.directory, options.directoryFile),
		formatSourceDirectory(inventory),
		'utf8'
	);
	return { inventory, description };
};
