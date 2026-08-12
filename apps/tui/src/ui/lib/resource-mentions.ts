export {
	extractMentionTokens,
	stripMentionTokens,
	resolveConfiguredResourceName,
	isGitUrlReference,
	isBioconductorPackageReference,
	isAnonymousResourceReference,
	hasIncompleteConfiguredResourceMatch,
	resolveResourceReference as resolveMentionResourceReference
} from '../../lib/resource-references.ts';
