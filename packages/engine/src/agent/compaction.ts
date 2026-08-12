import type { ModelMessage } from 'ai';

export const COMPACTION_START_STEP = 4;
export const TOOL_RESULT_COMPACTION_THRESHOLD_BYTES = 80 * 1024;

const DISCOVERY_TOOLS = new Set(['search', 'grep', 'glob', 'list']);

export type CompactionStats = {
	passes: number;
	compactedResults: number;
	compactedBytes: number;
};

export type CompactionResult = {
	messages: ModelMessage[];
	compacted: boolean;
	compactedResults: number;
	compactedBytes: number;
	toolResultBytes: number;
};

type ToolCallInfo = {
	toolName: string;
	input: unknown;
};

type ToolResultRef = {
	messageIndex: number;
	contentIndex: number;
	toolName: string;
	toolCallId: string | undefined;
	output: unknown;
	path: string | undefined;
	range: { start: number; end: number } | undefined;
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
	value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;

const toolOutputValue = (value: unknown): unknown => {
	const record = asRecord(value);
	if (!record || typeof record.type !== 'string') return value;

	switch (record.type) {
		case 'text':
		case 'error-text':
			return record.value ?? '';
		case 'json':
		case 'error-json':
			return record.value;
		case 'content':
			return record.value;
		case 'execution-denied':
			return record.reason ?? '';
		default:
			return value;
	}
};

const outputText = (value: unknown): string => {
	const unwrapped = toolOutputValue(value);
	if (typeof unwrapped === 'string') return unwrapped;
	try {
		return JSON.stringify(unwrapped) ?? String(unwrapped);
	} catch {
		return String(unwrapped);
	}
};

const outputBytes = (value: unknown): number => Buffer.byteLength(outputText(value), 'utf8');

const normalizedPath = (value: unknown): string | undefined => {
	if (typeof value !== 'string' || value.trim().length === 0) return undefined;
	return value.trim();
};

const inputPaths = (input: unknown): string[] => {
	const record = asRecord(input);
	const single = normalizedPath(record?.path);
	if (single) return [single];
	if (!Array.isArray(record?.spans)) return [];
	return record.spans.flatMap((span) => {
		const spanRecord = asRecord(span);
		const spanPath = normalizedPath(spanRecord?.path);
		return spanPath ? [spanPath] : [];
	});
};

/** Read inputs are 0-based `offset` plus `limit`; evidence and callers use 1-based lines. */
const inputRange = (input: unknown): { start: number; end: number } | undefined => {
	const record = asRecord(input);
	if (!record) return undefined;
	const offset = typeof record.offset === 'number' ? record.offset : 0;
	const limit = typeof record.limit === 'number' ? record.limit : undefined;
	if (limit === undefined || limit <= 0) return undefined;
	return { start: offset + 1, end: offset + limit };
};

const toolResultContent = (message: ModelMessage): unknown[] => {
	if (message.role !== 'tool' || !Array.isArray(message.content)) return [];
	return message.content.filter((part) => asRecord(part)?.type === 'tool-result');
};

const collectToolCalls = (messages: readonly ModelMessage[]): Map<string, ToolCallInfo> => {
	const calls = new Map<string, ToolCallInfo>();
	for (const message of messages) {
		if (message.role !== 'assistant' || !Array.isArray(message.content)) continue;
		for (const part of message.content) {
			const record = asRecord(part);
			if (record?.type !== 'tool-call' || typeof record.toolCallId !== 'string') continue;
			if (typeof record.toolName === 'string') {
				calls.set(record.toolCallId, { toolName: record.toolName, input: record.input });
			}
		}
	}
	return calls;
};

const evidencePaths = (messages: readonly ModelMessage[], calls: Map<string, ToolCallInfo>) => {
	const paths = new Set<string>();
	for (const message of messages) {
		for (const part of toolResultContent(message)) {
			const result = asRecord(part);
			if (!result || result.toolName !== 'evidence') continue;
			const call = typeof result.toolCallId === 'string' ? calls.get(result.toolCallId) : undefined;
			for (const path of inputPaths(call?.input)) paths.add(path);
			const outputValue = toolOutputValue(result.output);
			const output = asRecord(outputValue);
			const outputPath = normalizedPath(output?.path);
			if (outputPath) paths.add(outputPath);
			if (typeof outputValue === 'string') {
				try {
					const parsed = asRecord(JSON.parse(outputValue));
					for (const path of inputPaths(parsed)) paths.add(path);
				} catch {
					// Evidence output is opaque if it is not JSON.
				}
			}
		}
	}
	return paths;
};

/**
 * The placeholder is the only record the model keeps of a compacted read, so it
 * states which lines were already inspected. The previous "re-read if needed"
 * wording invited the model to re-read ranges it still had citation rights to,
 * which drove a compact/re-read loop that cost more context than it saved.
 */
const placeholder = (
	toolName: string,
	filePath: string | undefined,
	range: { start: number; end: number } | undefined
): string => {
	if (toolName !== 'read') {
		return `[compacted ${toolName} result; its findings are already reflected above. Re-run ${toolName} only for a genuinely new query.]`;
	}
	const location = filePath
		? `${filePath}${range ? ` lines ${range.start}-${range.end}` : ''}`
		: 'this file';
	return `[compacted read of ${location}. These lines count as inspected: cite them directly with evidence. Re-read only to see different lines.]`;
};

const compactedToolOutput = (output: unknown, value: string): unknown => {
	const record = asRecord(output);
	// AI SDK tool results are typed output objects. Keep that wrapper intact so
	// provider adapters can always serialize a valid function_call_output.
	if (record && typeof record.type === 'string') {
		return { type: 'text', value };
	}
	// Keep compatibility with the small raw ModelMessage fixtures and any
	// legacy callers that supplied a string directly.
	return value;
};

const collectToolResults = (
	messages: readonly ModelMessage[],
	calls: Map<string, ToolCallInfo>
): ToolResultRef[] => {
	const refs: ToolResultRef[] = [];
	for (let messageIndex = 0; messageIndex < messages.length; messageIndex += 1) {
		const message = messages[messageIndex]!;
		if (!Array.isArray(message.content)) continue;
		for (let contentIndex = 0; contentIndex < message.content.length; contentIndex += 1) {
			const record = asRecord(message.content[contentIndex]);
			if (record?.type !== 'tool-result') continue;
			const toolCallId = typeof record.toolCallId === 'string' ? record.toolCallId : undefined;
			const call = toolCallId ? calls.get(toolCallId) : undefined;
			const toolName =
				typeof record.toolName === 'string' ? record.toolName : (call?.toolName ?? 'unknown');
			const input = asRecord(call?.input);
			refs.push({
				messageIndex,
				contentIndex,
				toolName,
				toolCallId,
				output: record.output,
				path: inputPaths(input)[0],
				range: inputRange(input)
			});
		}
	}
	return refs;
};

const resultBatchIndexes = (refs: readonly ToolResultRef[]): Set<number> => {
	const indexes = [...new Set(refs.map((ref) => ref.messageIndex))];
	return new Set(indexes.slice(-2));
};

/**
 * Compact only deterministic tool output. The original message roles, tool
 * call IDs, and all non-output structure remain intact, which keeps the model's
 * tool protocol valid after a context rewrite.
 */
export const compactToolResultMessages = (
	messages: readonly ModelMessage[],
	thresholdBytes = TOOL_RESULT_COMPACTION_THRESHOLD_BYTES
): CompactionResult => {
	const calls = collectToolCalls(messages);
	const refs = collectToolResults(messages, calls);
	const toolResultBytes = refs.reduce((total, ref) => total + outputBytes(ref.output), 0);
	if (toolResultBytes <= thresholdBytes || refs.length === 0) {
		return {
			messages: [...messages],
			compacted: false,
			compactedResults: 0,
			compactedBytes: 0,
			toolResultBytes
		};
	}

	const latestBatches = resultBatchIndexes(refs);
	const latestReads = new Set(
		refs
			.filter((ref) => ref.toolName === 'read')
			.slice(-4)
			.map((ref) => `${ref.messageIndex}:${ref.contentIndex}`)
	);
	const citedPaths = evidencePaths(messages, calls);
	const replacements = new Map<string, string>();
	for (const ref of refs) {
		if (latestBatches.has(ref.messageIndex)) continue;
		if (ref.toolName === 'evidence') continue;
		if (ref.toolName === 'read') {
			if (
				!ref.path ||
				!citedPaths.has(ref.path) ||
				latestReads.has(`${ref.messageIndex}:${ref.contentIndex}`)
			) {
				continue;
			}
		} else if (!DISCOVERY_TOOLS.has(ref.toolName)) {
			continue;
		}
		replacements.set(
			`${ref.messageIndex}:${ref.contentIndex}`,
			placeholder(ref.toolName, ref.path, ref.range)
		);
	}

	if (replacements.size === 0) {
		return {
			messages: [...messages],
			compacted: false,
			compactedResults: 0,
			compactedBytes: 0,
			toolResultBytes
		};
	}

	let compactedBytes = 0;
	const nextMessages = messages.map((message, messageIndex) => {
		if (!Array.isArray(message.content)) return message;
		let changed = false;
		const content = message.content.map((part, contentIndex) => {
			const nextOutput = replacements.get(`${messageIndex}:${contentIndex}`);
			if (nextOutput === undefined) return part;
			changed = true;
			const ref = refs.find(
				(candidate) =>
					candidate.messageIndex === messageIndex && candidate.contentIndex === contentIndex
			)!;
			compactedBytes += Math.max(
				0,
				outputBytes(ref.output) - Buffer.byteLength(nextOutput, 'utf8')
			);
			return { ...asRecord(part), output: compactedToolOutput(ref.output, nextOutput) };
		});
		return changed ? { ...message, content } : message;
	}) as unknown as ModelMessage[];

	return {
		messages: nextMessages,
		compacted: true,
		compactedResults: replacements.size,
		compactedBytes,
		toolResultBytes
	};
};

export const createCompactionStats = (): CompactionStats => ({
	passes: 0,
	compactedResults: 0,
	compactedBytes: 0
});

export const prepareCompactedStep = (args: {
	stepNumber: number;
	messages: readonly ModelMessage[];
	stats: CompactionStats;
	thresholdBytes?: number;
}): ModelMessage[] | undefined => {
	if (args.stepNumber < COMPACTION_START_STEP) return undefined;
	const result = compactToolResultMessages(args.messages, args.thresholdBytes);
	if (!result.compacted) return undefined;
	args.stats.passes += 1;
	args.stats.compactedResults += result.compactedResults;
	args.stats.compactedBytes += result.compactedBytes;
	return result.messages;
};
