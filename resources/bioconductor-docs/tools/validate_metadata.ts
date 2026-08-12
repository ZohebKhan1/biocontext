import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { parse as parseYaml } from 'yaml';

type DocumentRecord = {
	path?: unknown;
	origin_url?: unknown;
	origin_type?: unknown;
	package_version?: unknown;
	bioc_release?: unknown;
};

const root = path.resolve(import.meta.dir, '..');
const numberedRelease = /^\d+\.\d+$/u;
const failures: string[] = [];

const nonBlank = (value: unknown): value is string =>
	typeof value === 'string' && value.trim().length > 0;

for (const category of (await readdir(root, { withFileTypes: true })).filter(
	(entry) => entry.isDirectory() && /^\d+_/u.test(entry.name)
)) {
	for (const packageEntry of (await readdir(path.join(root, category.name), {
		withFileTypes: true
	})).filter((entry) => entry.isDirectory())) {
		const packageDirectory = path.join(root, category.name, packageEntry.name);
		const label = path.relative(root, packageDirectory);
		const markdown = (await readdir(packageDirectory))
			.filter((name) => name.endsWith('.md') && name !== 'DIRECTORY.md')
			.sort();
		let metadata: { package?: unknown; documents?: unknown };
		try {
			metadata = parseYaml(await readFile(path.join(packageDirectory, '_metadata.yml'), 'utf8'));
		} catch (error) {
			failures.push(`${label}: cannot parse _metadata.yml (${String(error)})`);
			continue;
		}
		if (metadata.package !== packageEntry.name) {
			failures.push(`${label}: package identity must equal ${packageEntry.name}`);
		}
		if (!Array.isArray(metadata.documents)) {
			failures.push(`${label}: documents must be an array`);
			continue;
		}
		const records = metadata.documents as DocumentRecord[];
		const recordedPaths = records.map((record) => record.path).filter(nonBlank).sort();
		if (new Set(recordedPaths).size !== recordedPaths.length) {
			failures.push(`${label}: document paths must be unique`);
		}
		if (JSON.stringify(recordedPaths) !== JSON.stringify(markdown)) {
			failures.push(
				`${label}: Markdown/metadata mismatch (files=${markdown.join(', ')}; records=${recordedPaths.join(', ')})`
			);
		}
		for (const [index, record] of records.entries()) {
			for (const field of [
				'path',
				'origin_url',
				'origin_type',
				'package_version',
				'bioc_release'
			] as const) {
				if (!nonBlank(record[field])) {
					failures.push(`${label}: documents[${index}].${field} must not be blank`);
				}
			}
			if (record.origin_type !== 'curated_document') {
				failures.push(`${label}: documents[${index}].origin_type must be curated_document`);
			}
			if (
				nonBlank(record.bioc_release) &&
				record.bioc_release !== 'unknown' &&
				!numberedRelease.test(record.bioc_release)
			) {
				failures.push(`${label}: documents[${index}].bioc_release must be numbered or unknown`);
			}
		}
	}
}

if (failures.length > 0) {
	for (const failure of failures) console.error(failure);
	process.exit(1);
}

console.log('Curated document metadata is complete and valid.');
