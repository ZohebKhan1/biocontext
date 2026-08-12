import { promises as fs } from 'node:fs';
import path from 'node:path';

import {
	CranCatalogError,
	findCranPackage,
	loadCranCatalog,
	suggestCranPackageNames
} from '../../cran/catalog.ts';
import { materializeCranPackage, verifyCranPackageDirectory } from '../../cran/materialize.ts';
import {
	CRAN_METADATA_FILE,
	readCranResourceMetadata,
	type CranResourceMetadata
} from '../../cran/metadata.ts';
import { ResourceError, resourceNameToKey } from '../helpers.ts';
import type { CranResourceArgs, FsResource } from '../types.ts';

const describePackage = (packageName: string, suggestions: readonly string[]): string =>
	suggestions.length > 0
		? `"${packageName}" is not a current CRAN package. Did you mean ${suggestions.map((name) => `"${name}"`).join(', ')}?`
		: `"${packageName}" is not a current CRAN package.`;

const assertDirectoryAvailable = async (directory: string, packageName: string): Promise<void> => {
	try {
		const stat = await fs.lstat(directory);
		if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('not a safe directory');
		const entries = await fs.readdir(directory);
		if (entries.length === 0) return;
		if (entries.includes(CRAN_METADATA_FILE)) {
			const metadata = await readCranResourceMetadata(directory);
			if (metadata?.package.toLowerCase() === packageName.toLowerCase()) return;
		}
		throw new ResourceError({
			message: `Cannot store CRAN package "${packageName}": "${directory}" already belongs to another resource.`,
			hint: 'Rename or remove the conflicting resource, then try again.'
		});
	} catch (cause) {
		if (cause instanceof ResourceError) throw cause;
		if ((cause as NodeJS.ErrnoException).code !== 'ENOENT') {
			throw new ResourceError({
				message: `Cannot safely use CRAN resource directory "${directory}".`,
				hint: 'Rename or remove the conflicting path, then try again.',
				cause
			});
		}
	}
};

const toCranFsResource = (args: {
	metadata: CranResourceMetadata;
	directory: string;
	name: string;
	specialAgentInstructions?: string;
}): FsResource => ({
	_tag: 'fs-based',
	name: args.name,
	fsName: resourceNameToKey(args.name),
	type: 'cran',
	repoSubPaths: [],
	specialAgentInstructions: [
		args.specialAgentInstructions ?? '',
		`This resource is the exact CRAN source release for ${args.metadata.package} ${args.metadata.cran.version}.`,
		'Use source/man/ for Rd reference documentation, source/R/ for implementation, and authored source/vignettes/, source/inst/doc/, or source/tests/ when present.',
		`The authoritative source archive is ${args.metadata.cran.sourceUrl}, with SHA-256 ${args.metadata.cran.sourceSha256}.`,
		'This CRAN identity does not imply Bioconductor publication or GitHub branch identity. State the package version when behavior is version-specific.'
	]
		.filter((line) => line.trim().length > 0)
		.join(' '),
	getAbsoluteDirectoryPath: async () => args.directory
});

const findInstalledCranPackage = async (
	resourcesDirectory: string,
	packageName: string
): Promise<{ directory: string; metadata: CranResourceMetadata } | null> => {
	const direct = path.join(resourcesDirectory, resourceNameToKey(packageName));
	const directMetadata = await readCranResourceMetadata(direct);
	if (directMetadata?.package.toLowerCase() === packageName.toLowerCase()) {
		return { directory: direct, metadata: directMetadata };
	}
	let entries: Array<{ name: string; isDirectory: () => boolean }>;
	try {
		entries = await fs.readdir(resourcesDirectory, { withFileTypes: true });
	} catch {
		return null;
	}
	for (const entry of entries) {
		if (
			!entry.isDirectory() ||
			entry.name.endsWith('.partial') ||
			entry.name.endsWith('.previous')
		) {
			continue;
		}
		const directory = path.join(resourcesDirectory, entry.name);
		const metadata = await readCranResourceMetadata(directory);
		if (metadata?.package.toLowerCase() === packageName.toLowerCase()) {
			return { directory, metadata };
		}
	}
	return null;
};

/** Mount an already installed CRAN package without network access or cache mutation. */
export const loadInstalledCranResource = async (args: CranResourceArgs): Promise<FsResource> => {
	const installed = await findInstalledCranPackage(args.resourcesDirectoryPath, args.package);
	if (!installed) {
		throw new ResourceError({
			message: `CRAN package resource "${args.package}" is not installed locally.`,
			hint: `Use /add, choose CRAN package, and add ${args.package}.`
		});
	}
	const verification = await verifyCranPackageDirectory({
		directory: installed.directory,
		package: installed.metadata.package
	});
	if (verification.status !== 'complete') {
		throw new ResourceError({
			message: `CRAN package resource "${installed.metadata.package}" is ${verification.status}.`,
			hint: 'Update this resource through /add to replace it from the authoritative CRAN source archive.'
		});
	}
	return toCranFsResource({
		metadata: installed.metadata,
		directory: installed.directory,
		name: args.name,
		specialAgentInstructions: args.specialAgentInstructions
	});
};

/** Resolve, download, validate, and atomically publish the current CRAN source release. */
export const loadCranResource = async (args: CranResourceArgs): Promise<FsResource> => {
	try {
		const catalog = await loadCranCatalog({
			dataDirectory: args.dataDirectoryPath,
			...(args.refresh ? { refresh: true } : {})
		});
		const pkg = findCranPackage(catalog, args.package);
		if (!pkg) {
			throw new ResourceError({
				message: describePackage(args.package, suggestCranPackageNames(catalog, args.package)),
				hint: 'Use /add and enter the exact current CRAN package name.'
			});
		}
		const directory = path.join(args.resourcesDirectoryPath, resourceNameToKey(pkg.name));
		await assertDirectoryAvailable(directory, pkg.name);
		const result = await materializeCranPackage({
			pkg,
			directory,
			...(args.refresh ? { refresh: true } : {}),
			quiet: args.quiet
		});
		return toCranFsResource({
			metadata: result.metadata,
			directory,
			name: args.name,
			specialAgentInstructions: args.specialAgentInstructions
		});
	} catch (cause) {
		if (cause instanceof ResourceError) throw cause;
		if (cause instanceof CranCatalogError) {
			throw new ResourceError({ message: cause.message, hint: cause.hint, cause });
		}
		throw new ResourceError({
			message: `Failed to install CRAN package resource "${args.package}".`,
			hint: 'The previous complete resource, if any, was preserved. Check CRAN availability and try /add again.',
			cause
		});
	}
};
