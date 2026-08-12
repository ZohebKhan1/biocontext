type NamedResource = { name: string; type?: 'git' | 'local' | 'bioconductor' | 'cran'; package?: string };

export type ParsedInputSegment = {
	type: 'text' | 'command' | 'mention';
	content: string;
};

const MENTION_REGEX = /(^|[^\w@])@(\S*)/g;
const TRAILING_MENTION_PUNCTUATION_REGEX = /[!?.,;:)\]}>'"`]+$/u;

const splitMentionToken = (token: string) => {
	const normalized = token.replace(TRAILING_MENTION_PUNCTUATION_REGEX, '');
	return {
		normalized,
		suffix: token.slice(normalized.length)
	};
};

export const extractMentionTokens = (input: string): string[] => {
	const mentions: string[] = [];
	const seen = new Set<string>();
	let match: RegExpExecArray | null;

	while ((match = MENTION_REGEX.exec(input)) !== null) {
		const token = match[2] ? splitMentionToken(match[2].trim()).normalized : '';
		const key = token.toLowerCase();
		if (token && !seen.has(key)) {
			mentions.push(token);
			seen.add(key);
		}
	}

	return mentions;
};

/**
 * Classify typed text with the same mention grammar used at submission time.
 * Pasted blocks are represented separately by InputState and never pass through
 * this lexer, so Roxygen tags and code examples cannot become resources.
 */
export const parseTextSegment = (value: string): ParsedInputSegment[] => {
	if (!value) return [];
	if (value.startsWith('/')) {
		const spaceIndex = value.indexOf(' ');
		return spaceIndex === -1
			? [{ type: 'command', content: value }]
			: [
					{ type: 'command', content: value.slice(0, spaceIndex) },
					{ type: 'text', content: value.slice(spaceIndex) }
				];
	}

	const parts: ParsedInputSegment[] = [];
	const pushPart = (part: ParsedInputSegment) => {
		const previous = parts.at(-1);
		if (previous?.type === part.type) {
			previous.content += part.content;
			return;
		}
		parts.push(part);
	};
	const regex = new RegExp(MENTION_REGEX.source, MENTION_REGEX.flags);
	let lastIndex = 0;
	let match: RegExpExecArray | null;

	while ((match = regex.exec(value)) !== null) {
		const prefix = match[1] ?? '';
		const rawToken = match[2] ?? '';
		const { normalized, suffix } = splitMentionToken(rawToken);

		const mentionStart = match.index + prefix.length;
		if (mentionStart > lastIndex) {
			pushPart({ type: 'text', content: value.slice(lastIndex, mentionStart) });
		}
		if (!normalized) {
			pushPart({ type: 'mention', content: '@' });
			lastIndex = regex.lastIndex;
			continue;
		}
		pushPart({ type: 'mention', content: `@${normalized}` });
		if (suffix) pushPart({ type: 'text', content: suffix });
		lastIndex = regex.lastIndex;
	}

	if (lastIndex < value.length) pushPart({ type: 'text', content: value.slice(lastIndex) });
	return parts;
};

export const stripMentionTokens = (input: string): string =>
	input
		.replace(MENTION_REGEX, (match, prefix, token) => {
			const { normalized, suffix } = splitMentionToken(token);
			return normalized ? `${prefix}${suffix}` : match;
		})
		.trim()
		.replace(/\s+/g, ' ');

export const stripResolvedMentionTokens = (
	input: string,
	resolvedReferences: readonly string[]
): string => {
	const resolvedSet = new Set(resolvedReferences.map((reference) => reference.toLowerCase()));
	return input
		.replace(MENTION_REGEX, (match, prefix, mention) => {
			const { normalized, suffix } = splitMentionToken(mention);
			return resolvedSet.has(normalized.toLowerCase()) ? `${prefix}${suffix}` : match;
		})
		.replace(/\s+/g, ' ')
		.trim();
};

export const resolveConfiguredResourceName = (
	input: string,
	available: readonly NamedResource[]
): string | null => {
	const target = input.toLowerCase();
	const direct = available.find((resource) => resource.name.toLowerCase() === target);
	if (direct) return direct.name;

	if (target.startsWith('@')) {
		const withoutAt = target.slice(1);
		const withoutAtMatch = available.find((resource) => resource.name.toLowerCase() === withoutAt);
		if (withoutAtMatch) return withoutAtMatch.name;
	}

	const withAt = `@${target}`;
	const withAtMatch = available.find((resource) => resource.name.toLowerCase() === withAt);
	return withAtMatch?.name ?? null;
};

export const isGitUrlReference = (input: string): boolean => {
	try {
		const parsed = new URL(input);
		return parsed.protocol === 'https:';
	} catch {
		return false;
	}
};

/**
 * R package naming rules: start with a letter, then letters, digits, and dots.
 *
 * Shape validation remains independent of availability. Callers additionally
 * provide the locally installed package names before a package reference is
 * accepted; /add owns remote discovery and installation.
 */
const BIOCONDUCTOR_PACKAGE_REGEX = /^[a-zA-Z][a-zA-Z0-9.]*$/;
const BIOCONDUCTOR_PREFIX = 'bioconductor:';

export const isBioconductorPackageReference = (input: string): boolean => {
	const trimmed = input.trim();
	const candidate = trimmed.toLowerCase().startsWith(BIOCONDUCTOR_PREFIX)
		? trimmed.slice(BIOCONDUCTOR_PREFIX.length)
		: trimmed;
	return candidate.length > 0 && BIOCONDUCTOR_PACKAGE_REGEX.test(candidate);
};

export const isAnonymousResourceReference = (input: string): boolean =>
	isGitUrlReference(input) || isBioconductorPackageReference(input);

export const resolveResourceReference = (
	input: string,
	available: readonly NamedResource[],
	localPackageNames: readonly string[] = []
): string | null => {
	const trimmed = input.trim();
	if (!trimmed) return null;
	const token = trimmed.startsWith('@') ? trimmed.slice(1) : trimmed;
	if (!token) return null;
	const localPackages = new Map(
		localPackageNames.map((name) => [name.toLowerCase(), name] as const)
	);
	const availableLocally = available.filter((resource) => {
		if (resource.type !== 'bioconductor') return true;
		return localPackages.has((resource.package ?? resource.name).toLowerCase());
	});

	const configured = resolveConfiguredResourceName(token, availableLocally);
	if (configured) return configured;

	if (isGitUrlReference(token)) return token;
	if (!isBioconductorPackageReference(token)) return null;

	const explicitBioc = token.toLowerCase().startsWith(BIOCONDUCTOR_PREFIX);
	const packageName = explicitBioc ? token.slice(BIOCONDUCTOR_PREFIX.length) : token;
	const canonical = localPackages.get(packageName.toLowerCase());
	if (!canonical) return null;
	return explicitBioc ? `${BIOCONDUCTOR_PREFIX}${canonical}` : canonical;
};

/** True while a typed mention is still a prefix of a known resource or package. */
export const hasIncompleteConfiguredResourceMatch = (
	input: string,
	available: readonly NamedResource[]
): boolean => {
	const token = input.trim().replace(/^@/, '').toLowerCase();
	if (!token) return available.length > 0;
	const names = available.map((resource) => resource.name.toLowerCase());
	if (names.includes(token)) return false;
	return names.some((name) => name.startsWith(token));
};
