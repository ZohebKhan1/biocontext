export type ParsedSource = {
	label: string;
	target: string;
	remote: boolean;
};

const localSourcePathPattern = String.raw`(?:\.{1,2}\/|\/)?[\w./-]+\.(?:md|r|rmd|rnw|txt|pdf|rd)(?::\d+(?:-\d+)?)?`;
const localSourcePath = new RegExp(`^${localSourcePathPattern}$`, 'iu');
const inlineLocalSource = new RegExp(`\\[(${localSourcePathPattern})\\](?!\\()`, 'giu');
const compactSource = new RegExp(`^(${localSourcePathPattern})(?:\\s+\\(([^()]*)\\))?$`, 'iu');

const isRemoteSource = (value: string): boolean => /^https?:\/\//iu.test(value);
const isLocalSourcePath = (value: string): boolean => localSourcePath.test(value);

const addSource = (sources: ParsedSource[], label: string, target: string) => {
	const trimmedTarget = target.trim();
	if (!trimmedTarget || (!isRemoteSource(trimmedTarget) && !isLocalSourcePath(trimmedTarget))) {
		return;
	}
	if (sources.some((source) => source.target === trimmedTarget)) return;
	sources.push({
		label: label.trim() || trimmedTarget,
		target: trimmedTarget,
		remote: isRemoteSource(trimmedTarget)
	});
};

const parseSourceLine = (line: string, sources: ParsedSource[]) => {
	const trimmed = line.trim();
	if (!trimmed.startsWith('-')) return;
	const value = trimmed.replace(/^-\s*/u, '').replace(/^\[E\d+\]\s*/u, '');

	const compactMatch = value.match(compactSource);
	if (compactMatch) {
		const target = compactMatch[1] ?? '';
		const identity = compactMatch[2]?.trim();
		addSource(sources, identity ? `${target} (${identity})` : target, target);
		return;
	}

	const markdownMatch = value.match(/^\[([^\]]+)\]\(([^)]+)\)(?:\s+\(([^)]+)\))?$/u);
	if (markdownMatch) {
		const label = markdownMatch[3]
			? `${markdownMatch[1] ?? ''} (${markdownMatch[3]})`
			: (markdownMatch[1] ?? '');
		addSource(sources, label, markdownMatch[2] ?? '');
		return;
	}

	const labelUrlMatch = value.match(/^(.+?)\s+\((https?:\/\/[^\s)]+)\)(?:\s+\(([^)]+)\))?$/iu);
	if (labelUrlMatch) {
		const label = labelUrlMatch[3]
			? `${labelUrlMatch[1] ?? ''} (${labelUrlMatch[3]})`
			: (labelUrlMatch[1] ?? '');
		addSource(sources, label, labelUrlMatch[2] ?? '');
		return;
	}

	addSource(sources, value, value);
};

/**
 * Keep citations out of the answer body and normalize compact local source
 * entries plus the legacy Markdown-link forms accepted by older responses.
 */
export const parseSources = (content: string): { body: string; sources: ParsedSource[] } => {
	const sources: ParsedSource[] = [];
	const bodyWithoutInlineSources = content.replace(inlineLocalSource, (_match, target: string) => {
		addSource(sources, target, target);
		return '';
	});
	const lines = bodyWithoutInlineSources.split('\n');
	const headingIndex = lines.findIndex((line) =>
		/^(?:#{1,6}\s*)?sources\s*:?\s*$/iu.test(line.trim())
	);
	if (headingIndex < 0) return { body: bodyWithoutInlineSources.trimEnd(), sources };

	const body = lines.slice(0, headingIndex).join('\n').trimEnd();
	for (const line of lines.slice(headingIndex + 1)) parseSourceLine(line, sources);
	return { body, sources };
};
