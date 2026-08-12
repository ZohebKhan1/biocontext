import { z } from 'zod';

export const ModelSchema = z.object({
	provider: z.string(),
	model: z.string()
});

export const CollectionInfoSchema = z.object({
	key: z.string(),
	path: z.string()
});

export const StreamMetaEventSchema = z.object({
	type: z.literal('meta'),
	model: ModelSchema,
	resources: z.array(z.string()),
	collection: CollectionInfoSchema
});

export const StreamTextDeltaEventSchema = z.object({
	type: z.literal('text.delta'),
	delta: z.string()
});

export const StreamReasoningDeltaEventSchema = z.object({
	type: z.literal('reasoning.delta'),
	delta: z.string()
});

export const ToolStateSchema = z.discriminatedUnion('status', [
	z.object({
		status: z.literal('pending'),
		input: z.unknown(),
		raw: z.string().optional()
	}),
	z.object({
		status: z.literal('running'),
		input: z.unknown(),
		title: z.string().optional(),
		metadata: z.record(z.unknown()).optional(),
		time: z.object({ start: z.number() }).optional()
	}),
	z.object({
		status: z.literal('completed'),
		input: z.unknown(),
		output: z.string(),
		title: z.string().optional(),
		metadata: z.record(z.unknown()).optional(),
		time: z
			.object({ start: z.number(), end: z.number(), compacted: z.number().optional() })
			.optional()
	}),
	z.object({
		status: z.literal('error'),
		input: z.unknown(),
		error: z.string(),
		metadata: z.record(z.unknown()).optional(),
		time: z.object({ start: z.number(), end: z.number() }).optional()
	})
]);

export const StreamToolUpdatedEventSchema = z.object({
	type: z.literal('tool.updated'),
	callID: z.string(),
	tool: z.string(),
	state: ToolStateSchema
});

export const StreamUsageSchema = z.object({
	inputTokens: z.number().optional(),
	cachedInputTokens: z.number().optional(),
	nonCachedInputTokens: z.number().optional(),
	cacheWriteInputTokens: z.number().optional(),
	outputTokens: z.number().optional(),
	reasoningTokens: z.number().optional(),
	totalTokens: z.number().optional(),
	modelSteps: z.number().int().nonnegative().optional(),
	maxStepInputTokens: z.number().nonnegative().optional(),
	finalStepInputTokens: z.number().nonnegative().optional(),
	compactionPasses: z.number().int().nonnegative().optional(),
	compactedResults: z.number().int().nonnegative().optional(),
	compactedBytes: z.number().int().nonnegative().optional()
});

export const ToolTelemetrySchema = z.object({
	call_id: z.string(),
	tool: z.string(),
	outcome: z.enum(['success', 'no_match', 'error']),
	duration_ms: z.number().nonnegative(),
	result_bytes: z.number().int().nonnegative()
});

export const StreamMetricsTimingSchema = z.object({
	totalMs: z.number().optional(),
	genMs: z.number().optional()
});

export const StreamMetricsThroughputSchema = z.object({
	outputTokensPerSecond: z.number().optional(),
	totalTokensPerSecond: z.number().optional()
});

export const StreamPricingRatesSchema = z.object({
	input: z.number().optional(),
	output: z.number().optional(),
	reasoning: z.number().optional(),
	cacheRead: z.number().optional(),
	cacheWrite: z.number().optional()
});

export const StreamPricingCostSchema = z.object({
	input: z.number().optional(),
	output: z.number().optional(),
	reasoning: z.number().optional(),
	total: z.number().optional()
});

export const StreamMetricsPricingSchema = z.object({
	source: z.literal('models.dev'),
	modelKey: z.string().optional(),
	ratesUsdPerMTokens: StreamPricingRatesSchema.optional(),
	costUsd: StreamPricingCostSchema.optional()
});

export const StreamMetricsSchema = z.object({
	timing: StreamMetricsTimingSchema.optional(),
	throughput: StreamMetricsThroughputSchema.optional(),
	pricing: StreamMetricsPricingSchema.optional()
});

export const EvidenceResultSchema = z.object({
	id: z.string(),
	package: z.string(),
	package_version: z.string(),
	bioc_release: z.string(),
	path: z.string(),
	line_start: z.number().int().positive(),
	line_end: z.number().int().positive(),
	source_type: z.string(),
	origin_type: z.string(),
	origin_url: z.string(),
	repository_commit: z.string().nullable(),
	content: z.string()
});

export const EvidenceEnvelopeSchema = z.discriminatedUnion('status', [
	z.object({
		status: z.literal('supported'),
		query: z.string(),
		searched_packages: z.array(z.string()),
		searched_documents: z.number().int().nonnegative(),
		results: z.array(EvidenceResultSchema).min(1)
	}),
	z.object({
		status: z.literal('insufficient_evidence'),
		query: z.string(),
		searched_packages: z.array(z.string()),
		searched_documents: z.number().int().nonnegative(),
		results: z.tuple([])
	})
]);

export const StreamDoneEventSchema = z.object({
	type: z.literal('done'),
	text: z.string(),
	reasoning: z.string(),
	tools: z.array(
		z.object({
			callID: z.string(),
			tool: z.string(),
			state: ToolStateSchema
		})
	),
	evidence: EvidenceEnvelopeSchema.optional(),
	tool_telemetry: z.array(ToolTelemetrySchema).optional(),
	usage: StreamUsageSchema.optional(),
	metrics: StreamMetricsSchema.optional()
});

export const StreamErrorEventSchema = z.object({
	type: z.literal('error'),
	tag: z.string(),
	message: z.string(),
	hint: z.string().optional()
});

export const StreamEventSchema = z.union([
	StreamMetaEventSchema,
	StreamTextDeltaEventSchema,
	StreamReasoningDeltaEventSchema,
	StreamToolUpdatedEventSchema,
	StreamDoneEventSchema,
	StreamErrorEventSchema
]);

export type StreamMetaEvent = z.infer<typeof StreamMetaEventSchema>;
export type StreamTextDeltaEvent = z.infer<typeof StreamTextDeltaEventSchema>;
export type StreamReasoningDeltaEvent = z.infer<typeof StreamReasoningDeltaEventSchema>;
export type StreamToolUpdatedEvent = z.infer<typeof StreamToolUpdatedEventSchema>;
export type ToolTelemetry = z.infer<typeof ToolTelemetrySchema>;
export type StreamDoneEvent = z.infer<typeof StreamDoneEventSchema>;
export type EvidenceEnvelope = z.infer<typeof EvidenceEnvelopeSchema>;
export type StreamErrorEvent = z.infer<typeof StreamErrorEventSchema>;
export type StreamEvent = z.infer<typeof StreamEventSchema>;
