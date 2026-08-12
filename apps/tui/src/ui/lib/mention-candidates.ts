import type { Repo } from '../types.ts';

export type MentionCandidate = {
	name: string;
	kind: 'resource' | 'package';
};

/**
 * Combine configured resources and Bioconductor package names for @mention
 * completion. Configured resources win case-insensitive name collisions because
 * that is also how mention resolution behaves.
 */
export const buildMentionCandidates = (
	resources: readonly Pick<Repo, 'name' | 'type' | 'package'>[],
	localPackageNames: readonly string[]
): MentionCandidate[] => {
	const seen = new Set<string>();
	const candidates: MentionCandidate[] = [];
	const localPackages = new Set(localPackageNames.map((name) => name.toLowerCase()));

	for (const resource of resources) {
		const name = resource.name.trim();
		const key = name.toLowerCase();
		const packageName = resource.package?.trim() || name;
		if (resource.type === 'bioconductor' && !localPackages.has(packageName.toLowerCase())) continue;
		if (!name || seen.has(key)) continue;
		seen.add(key);
		candidates.push({ name, kind: 'resource' });
	}

	for (const name of [...localPackageNames].sort((a, b) => a.localeCompare(b))) {
		const trimmed = name.trim();
		const key = trimmed.toLowerCase();
		if (!trimmed || seen.has(key)) continue;
		seen.add(key);
		candidates.push({ name: trimmed, kind: 'package' });
	}

	return candidates;
};

export const filterMentionCandidates = (
	candidates: readonly MentionCandidate[],
	mention: string
): MentionCandidate[] => {
	const query = mention.trim().replace(/^@/u, '').toLowerCase();
	if (!query) return [...candidates];
	return candidates.filter((candidate) => candidate.name.toLowerCase().startsWith(query));
};
