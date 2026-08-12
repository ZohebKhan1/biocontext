import { promises as fs } from 'node:fs';
import path from 'node:path';

import { resourceNameToKey } from '../resources/helpers.ts';
import { parseDcf } from './dcf.ts';
import {
	BIOCONDUCTOR_METADATA_FILE,
	inspectBioconductorArtifactPath,
	parseLegacyBioconductorResourceMetadata,
	type LegacyBioconductorResourceMetadata
} from './metadata.ts';
import { shouldKeepSourcePath, type SourceInventory } from './source-policy.ts';

const requiredLegacyArtifacts = [
	'README.md',
	'source',
	'source/DIRECTORY.md',
	'source/MANIFEST.json'
] as const;

const isRealDirectoryWithin = async (root: string, candidate: string): Promise<boolean> => {
	try {
		const [rootRealPath, candidateRealPath, stats] = await Promise.all([
			fs.realpath(root),
			fs.realpath(candidate),
			fs.lstat(candidate)
		]);
		const relative = path.relative(rootRealPath, candidateRealPath);
		return (
			stats.isDirectory() &&
			!stats.isSymbolicLink() &&
			!relative.startsWith('..') &&
			!path.isAbsolute(relative)
		);
	} catch {
		return false;
	}
};

const hasLegacyManagedArtifacts = async (
	directory: string,
	metadata: LegacyBioconductorResourceMetadata
): Promise<boolean> => {
	for (const relativePath of requiredLegacyArtifacts) {
		const kind = relativePath === 'source' ? 'directory' : 'file';
		if ((await inspectBioconductorArtifactPath(directory, relativePath, kind)) !== 'ok') return false;
	}
	for (const document of metadata.documents) {
		if (document.status !== 'ok') continue;
		if ((await inspectBioconductorArtifactPath(directory, document.path, 'file')) !== 'ok') return false;
	}
	if (
		!metadata.documents.some(
			(document) =>
				document.sourceType === 'bioconductor' &&
				document.status === 'ok' &&
				(document.originType === 'vignette' || document.originType === 'reference_manual')
		)
	)
		return false;

	try {
		const sourceDirectory = path.join(directory, 'source');
		const inventory = JSON.parse(
			await fs.readFile(path.join(sourceDirectory, 'MANIFEST.json'), 'utf8')
		) as Partial<SourceInventory>;
		if (
			inventory.policyVersion !== metadata.repository.sourcePolicyVersion ||
			inventory.fileCount !== metadata.repository.fileCount ||
			inventory.bytes !== metadata.repository.bytes ||
			inventory.omittedCount !== metadata.repository.omittedCount ||
			!Array.isArray(inventory.files) ||
			inventory.files.length !== inventory.fileCount ||
			!inventory.files.includes('DESCRIPTION') ||
			!inventory.files.includes('NAMESPACE') ||
			inventory.files.some((file) => typeof file !== 'string' || !shouldKeepSourcePath(file))
		)
			return false;
		for (const file of inventory.files) {
			if ((await inspectBioconductorArtifactPath(directory, `source/${file}`, 'file')) !== 'ok')
				return false;
		}
		const description = parseDcf(
			await fs.readFile(path.join(sourceDirectory, 'DESCRIPTION'), 'utf8')
		)[0];
		return (
			description?.['Package']?.trim() === metadata.repository.descriptionPackage &&
			description?.['Version']?.trim() === metadata.repository.descriptionVersion
		);
	} catch {
		return false;
	}
};

/**
 * Find schema-valid version-9 caches that need an exact-source upgrade.
 *
 * Recognition is deliberately stricter than looking for a folder or marker:
 * the directory must be canonical, confined, non-symlinked, schema-valid, and
 * contain the generated inventory that identifies a managed cache.
 */
export const discoverLegacyBioconductorPackageNames = async (
	resourcesDirectory: string
): Promise<string[]> => {
	let entries: Array<{ readonly name: string; readonly isDirectory: () => boolean }>;
	try {
		entries = await fs.readdir(resourcesDirectory, { withFileTypes: true });
	} catch {
		return [];
	}

	const packages: string[] = [];
	for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
		if (!entry.isDirectory() || entry.name.endsWith('.partial') || entry.name.endsWith('.previous'))
			continue;
		const directory = path.join(resourcesDirectory, entry.name);
		if (!(await isRealDirectoryWithin(resourcesDirectory, directory))) continue;
		let value: unknown;
		try {
			value = JSON.parse(await fs.readFile(path.join(directory, BIOCONDUCTOR_METADATA_FILE), 'utf8'));
		} catch {
			continue;
		}
		const parsed = parseLegacyBioconductorResourceMetadata(value);
		if (!parsed.success) continue;
		if (entry.name !== resourceNameToKey(parsed.data.package)) continue;
		if (!(await hasLegacyManagedArtifacts(directory, parsed.data))) continue;
		packages.push(parsed.data.package);
	}

	return packages.filter(
		(packageName, index) =>
			packages.findIndex((candidate) => candidate.toLowerCase() === packageName.toLowerCase()) ===
			index
	);
};
