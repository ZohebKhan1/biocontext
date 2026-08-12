/**
 * Custom Agent Loop
 * Uses AI SDK's streamText with custom tools
 */
import { streamText, tool, stepCountIs, type ModelMessage } from 'ai';

import { getModel } from '../providers/index.ts';
import type { ProviderOptions } from '../providers/registry.ts';
import { getErrorMessage } from '../errors.ts';
import { createCompactionStats, prepareCompactedStep, type CompactionStats } from './compaction.ts';
import { buildSystemPrompt } from './prompt.ts';
import type {
	ReadToolParametersType,
	ReadManyToolParametersType,
	SearchToolParametersType,
	GrepToolParametersType,
	GlobToolParametersType,
	ListToolParametersType,
	EvidenceToolParametersType
} from '../tools/index.ts';
import {
	ReadToolParameters,
	executeReadTool,
	ReadManyToolParameters,
	executeReadManyTool,
	SearchToolParameters,
	executeSearchTool,
	GrepToolParameters,
	executeGrepTool,
	GlobToolParameters,
	executeGlobTool,
	ListToolParameters,
	executeListTool,
	EvidenceToolParameters,
	executeEvidenceTool,
	finalizeEvidenceAnswer,
	type EvidenceEnvelope
} from '../tools/index.ts';

const toAgentError = (value: unknown): Error =>
	value instanceof Error ? value : new Error(getErrorMessage(value));

export type AgentEvent =
	| { type: 'text-delta'; text: string }
	| { type: 'reasoning-delta'; text: string }
	| { type: 'tool-call'; callId: string; toolName: string; input: unknown }
	| { type: 'tool-result'; callId: string; toolName: string; output: string }
	| {
			type: 'finish';
			finishReason: string;
			usage?: AgentUsage;
			text?: string;
			evidence?: EvidenceEnvelope;
			toolTelemetry?: AgentToolTelemetry[];
	  }
	| { type: 'error'; error: Error };

export type AgentToolTelemetry = {
	call_id: string;
	tool: string;
	outcome: 'success' | 'no_match' | 'error';
	duration_ms: number;
	result_bytes: number;
};

export type AgentUsage = {
	/** Gross cumulative prompt input across all model steps. */
	inputTokens?: number;
	cachedInputTokens?: number;
	nonCachedInputTokens?: number;
	cacheWriteInputTokens?: number;
	outputTokens?: number;
	reasoningTokens?: number;
	totalTokens?: number;
	modelSteps?: number;
	maxStepInputTokens?: number;
	finalStepInputTokens?: number;
	compactionPasses?: number;
	compactedResults?: number;
	compactedBytes?: number;
};

export type AgentLoopOptions = {
	providerId: string;
	modelId: string;
	collectionPath: string;
	vfsId?: string;
	agentInstructions: string;
	question: string;
	maxSteps?: number;
	providerOptions?: Partial<ProviderOptions>;
};

export type AgentLoopResult = {
	answer: string;
	model: { provider: string; model: string };
	events: AgentEvent[];
	evidence: EvidenceEnvelope;
};

const createTools = (basePath: string, vfsId?: string) => ({
	search: tool({
		description:
			'Primary bounded retrieval tool. Search the mounted local corpus once with the complete question, optional package filters, and up to twelve distinct API/requirement targets. Results are grouped so each target gets a strong candidate instead of letting one frequent symbol dominate. Exact excerpts marked evidence_ready=true may go directly into evidence; read only for wider context or evidence_ready=false. Use at most one follow-up search for a concrete gap and use before raw grep.',
		inputSchema: SearchToolParameters,
		execute: async (params: SearchToolParametersType) => {
			const result = await executeSearchTool(params, { basePath, vfsId });
			return result.output;
		}
	}),

	read: tool({
		description:
			'Read one text file range or a single image/PDF inside the current tool root. Use read_many when two or more independent text ranges are already known.',
		inputSchema: ReadToolParameters,
		execute: async (params: ReadToolParametersType) => {
			const result = await executeReadTool(params, { basePath, vfsId });
			return result.output;
		}
	}),

	read_many: tool({
		description:
			'Read 1–8 independent, already-discovered text-file ranges in one round trip. Use root-relative paths and narrow ranges. The batch has a shared output budget and reports per-range truncation.',
		inputSchema: ReadManyToolParameters,
		execute: async (params: ReadManyToolParametersType) => {
			const result = await executeReadManyTool(params, { basePath, vfsId });
			return result.output;
		}
	}),

	grep: tool({
		description:
			'Fallback/refinement search over text files using a regular expression. Use after primary search when an exact symbol, phrase, path, or narrower source family still needs refinement.',
		inputSchema: GrepToolParameters,
		execute: async (params: GrepToolParametersType) => {
			const result = await executeGrepTool(params, { basePath, vfsId });
			return result.output;
		}
	}),

	glob: tool({
		description:
			'Find files by a root-relative glob pattern (for example "**/*.md" or "source/R/*.R"). Returns deterministic path-sorted results.',
		inputSchema: GlobToolParameters,
		execute: async (params: GlobToolParametersType) => {
			const result = await executeGlobTool(params, { basePath, vfsId });
			return result.output;
		}
	}),

	list: tool({
		description:
			'List one directory inside the current tool root. Use it for shallow navigation, not recursive discovery.',
		inputSchema: ListToolParameters,
		execute: async (params: ListToolParametersType) => {
			const result = await executeListTool(params, { basePath, vfsId });
			return result.output;
		}
	}),

	evidence: tool({
		description:
			'Issue authoritative evidence for 1–12 independent exact spans covered by a prior read or an evidence-ready search excerpt. Grep and routing excerpts are discovery-only. Use returned evidence IDs in the final answer as [[E1]].',
		inputSchema: EvidenceToolParameters,
		execute: async (params: EvidenceToolParametersType) => {
			const result = await executeEvidenceTool(params, { basePath, vfsId });
			return result.output;
		}
	})
});

const partCallId = (part: unknown, fallback: string): string => {
	const value = part as { toolCallId?: unknown };
	return typeof value.toolCallId === 'string' && value.toolCallId.length > 0
		? value.toolCallId
		: fallback;
};

const toolOutcome = (output: string): AgentToolTelemetry['outcome'] => {
	if (/^(?:no matches found\.|no_strong_match)/iu.test(output.trim())) return 'no_match';
	if (
		/^(?:error|invalid regex|file not found|directory not found|path is not)/iu.test(output.trim())
	)
		return 'error';
	return 'success';
};

const getInitialContext = async (collectionPath: string, vfsId?: string) => {
	const result = await executeListTool({ path: '.' }, { basePath: collectionPath, vfsId });
	return `Current tool-root contents:\n${result.output}`;
};

const buildOpenAIProviderOptions = (
	providerId: string,
	providerOptions: Partial<ProviderOptions> | undefined,
	systemPrompt: string
) => {
	if (providerId !== 'openai') return undefined;

	return {
		openai: {
			instructions: systemPrompt,
			store: false,
			...(providerOptions?.reasoningEffort
				? { reasoningEffort: providerOptions.reasoningEffort }
				: {})
		}
	};
};

export const createAgentStreamTextOptions = (args: {
	providerId: string;
	model: Awaited<ReturnType<typeof getModel>>;
	messages: ModelMessage[];
	tools: ReturnType<typeof createTools>;
	systemPrompt: string;
	providerOptions: Partial<ProviderOptions> | undefined;
	stopWhen: ReturnType<typeof stepCountIs>;
	compactionStats: CompactionStats;
}) => {
	const base = {
		model: args.model,
		messages: args.messages,
		tools: args.tools,
		stopWhen: args.stopWhen,
		prepareStep: ({ stepNumber, messages }: { stepNumber: number; messages: ModelMessage[] }) => {
			const compacted = prepareCompactedStep({
				stepNumber,
				messages,
				stats: args.compactionStats
			});
			return compacted ? { messages: compacted } : undefined;
		}
	};
	if (args.providerId === 'openai') {
		return {
			...base,
			providerOptions: buildOpenAIProviderOptions(
				args.providerId,
				args.providerOptions,
				args.systemPrompt
			)
		};
	}
	return { ...base, system: args.systemPrompt };
};

const usageFromTotal = (
	totalUsage: {
		inputTokens?: number;
		inputTokenDetails?: {
			noCacheTokens?: number;
			cacheReadTokens?: number;
			cacheWriteTokens?: number;
		};
		outputTokens?: number;
		outputTokenDetails?: { reasoningTokens?: number };
		reasoningTokens?: number;
		totalTokens?: number;
	},
	stepInputs: number[],
	compactionStats: CompactionStats
): AgentUsage => {
	const effectiveStepInputs =
		stepInputs.length > 0
			? stepInputs
			: totalUsage.inputTokens == null
				? []
				: [totalUsage.inputTokens];
	return {
		inputTokens: totalUsage.inputTokens,
		cachedInputTokens: totalUsage.inputTokenDetails?.cacheReadTokens,
		nonCachedInputTokens: totalUsage.inputTokenDetails?.noCacheTokens,
		cacheWriteInputTokens: totalUsage.inputTokenDetails?.cacheWriteTokens,
		outputTokens: totalUsage.outputTokens,
		reasoningTokens: totalUsage.outputTokenDetails?.reasoningTokens ?? totalUsage.reasoningTokens,
		totalTokens: totalUsage.totalTokens,
		modelSteps: effectiveStepInputs.length,
		maxStepInputTokens:
			effectiveStepInputs.length > 0 ? Math.max(...effectiveStepInputs) : undefined,
		finalStepInputTokens: effectiveStepInputs.at(-1),
		compactionPasses: compactionStats.passes,
		compactedResults: compactionStats.compactedResults,
		compactedBytes: compactionStats.compactedBytes
	};
};

export const runAgentLoop = async (options: AgentLoopOptions): Promise<AgentLoopResult> => {
	const {
		providerId,
		modelId,
		collectionPath,
		vfsId,
		agentInstructions,
		question,
		maxSteps = 40
	} = options;

	const systemPrompt = buildSystemPrompt(agentInstructions);
	const sessionId = crypto.randomUUID();

	const mergedProviderOptions =
		providerId === 'openai'
			? { ...options.providerOptions, instructions: systemPrompt, sessionId }
			: options.providerOptions;

	const model = await getModel(providerId, modelId, {
		providerOptions: mergedProviderOptions,
		allowMissingAuth: providerId === 'openai-compat'
	});

	const initialContext = await getInitialContext(collectionPath, vfsId);
	const messages: ModelMessage[] = [
		{
			role: 'user',
			content: `${initialContext}\n\nQuestion: ${question}`
		}
	];

	const tools = createTools(collectionPath, vfsId);
	const events: AgentEvent[] = [];
	const toolStarts = new Map<string, { tool: string; startedAt: number }>();
	const toolTelemetry: AgentToolTelemetry[] = [];
	let fullText = '';
	const compactionStats = createCompactionStats();
	const stepInputs: number[] = [];

	const result = streamText(
		createAgentStreamTextOptions({
			providerId,
			model,
			messages,
			tools,
			systemPrompt,
			providerOptions: options.providerOptions,
			stopWhen: stepCountIs(maxSteps),
			compactionStats
		})
	);

	for await (const part of result.fullStream) {
		switch (part.type) {
			case 'text-delta':
				fullText += part.text;
				events.push({ type: 'text-delta', text: part.text });
				break;
			case 'reasoning-delta':
				events.push({ type: 'reasoning-delta', text: part.text });
				break;
			case 'tool-call': {
				const callId = partCallId(part, `tool-${toolStarts.size + 1}`);
				toolStarts.set(callId, { tool: part.toolName, startedAt: performance.now() });
				events.push({ type: 'tool-call', callId, toolName: part.toolName, input: part.input });
				break;
			}
			case 'tool-result': {
				const callId = partCallId(
					part,
					[...toolStarts.keys()].find((id) => toolStarts.get(id)?.tool === part.toolName) ??
						`tool-${toolTelemetry.length + 1}`
				);
				const output =
					typeof part.output === 'string'
						? part.output
						: (JSON.stringify(part.output) ?? String(part.output));
				const started = toolStarts.get(callId);
				toolTelemetry.push({
					call_id: callId,
					tool: part.toolName,
					outcome: toolOutcome(output),
					duration_ms: Math.round(performance.now() - (started?.startedAt ?? performance.now())),
					result_bytes: Buffer.byteLength(output, 'utf8')
				});
				events.push({
					type: 'tool-result',
					callId,
					toolName: part.toolName,
					output
				});
				break;
			}
			case 'finish-step':
				if (part.usage.inputTokens != null) stepInputs.push(part.usage.inputTokens);
				break;
			case 'finish':
				events.push({
					type: 'finish',
					finishReason: part.finishReason ?? 'unknown',
					usage: usageFromTotal(part.totalUsage, stepInputs, compactionStats),
					toolTelemetry
				});
				break;
			case 'error':
				events.push({
					type: 'error',
					error: toAgentError(part.error)
				});
				break;
		}
	}

	const finalized = finalizeEvidenceAnswer({ vfsId, query: question, draft: fullText.trim() });
	return {
		answer: finalized.text,
		model: { provider: providerId, model: modelId },
		events,
		evidence: finalized.evidence
	};
};

export async function* streamAgentLoop(options: AgentLoopOptions): AsyncGenerator<AgentEvent> {
	const {
		providerId,
		modelId,
		collectionPath,
		vfsId,
		agentInstructions,
		question,
		maxSteps = 40
	} = options;

	const systemPrompt = buildSystemPrompt(agentInstructions);
	const sessionId = crypto.randomUUID();

	const mergedProviderOptions =
		providerId === 'openai'
			? { ...options.providerOptions, instructions: systemPrompt, sessionId }
			: options.providerOptions;

	const model = await getModel(providerId, modelId, {
		providerOptions: mergedProviderOptions,
		allowMissingAuth: providerId === 'openai-compat'
	});

	const initialContext = await getInitialContext(collectionPath, vfsId);
	const messages: ModelMessage[] = [
		{
			role: 'user',
			content: `${initialContext}\n\nQuestion: ${question}`
		}
	];

	const tools = createTools(collectionPath, vfsId);
	let fullText = '';
	const compactionStats = createCompactionStats();
	const stepInputs: number[] = [];
	const toolStarts = new Map<string, { tool: string; startedAt: number }>();
	const toolTelemetry: AgentToolTelemetry[] = [];
	const result = streamText(
		createAgentStreamTextOptions({
			providerId,
			model,
			messages,
			tools,
			systemPrompt,
			providerOptions: options.providerOptions,
			stopWhen: stepCountIs(maxSteps),
			compactionStats
		})
	);

	for await (const part of result.fullStream) {
		switch (part.type) {
			case 'text-delta':
				fullText += part.text;
				yield { type: 'text-delta', text: part.text };
				break;
			case 'reasoning-delta':
				yield { type: 'reasoning-delta', text: part.text };
				break;
			case 'tool-call': {
				const callId = partCallId(part, `tool-${toolStarts.size + 1}`);
				toolStarts.set(callId, { tool: part.toolName, startedAt: performance.now() });
				yield { type: 'tool-call', callId, toolName: part.toolName, input: part.input };
				break;
			}
			case 'tool-result': {
				const callId = partCallId(
					part,
					[...toolStarts.keys()].find((id) => toolStarts.get(id)?.tool === part.toolName) ??
						`tool-${toolTelemetry.length + 1}`
				);
				const output =
					typeof part.output === 'string'
						? part.output
						: (JSON.stringify(part.output) ?? String(part.output));
				const started = toolStarts.get(callId);
				toolTelemetry.push({
					call_id: callId,
					tool: part.toolName,
					outcome: toolOutcome(output),
					duration_ms: Math.round(performance.now() - (started?.startedAt ?? performance.now())),
					result_bytes: Buffer.byteLength(output, 'utf8')
				});
				yield {
					type: 'tool-result',
					callId,
					toolName: part.toolName,
					output
				};
				break;
			}
			case 'finish-step':
				if (part.usage.inputTokens != null) stepInputs.push(part.usage.inputTokens);
				break;
			case 'finish':
				const finalized = finalizeEvidenceAnswer({
					vfsId,
					query: question,
					draft: fullText.trim()
				});
				yield {
					type: 'finish',
					finishReason: part.finishReason ?? 'unknown',
					text: finalized.text,
					evidence: finalized.evidence,
					usage: usageFromTotal(part.totalUsage, stepInputs, compactionStats),
					toolTelemetry
				};
				break;
			case 'error':
				yield {
					type: 'error',
					error: toAgentError(part.error)
				};
				break;
		}
	}
}
