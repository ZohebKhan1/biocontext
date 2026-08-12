import type { RuntimeStatusResponse } from '../../client/index.ts';
import type { ReasoningEffort } from '@biocontext/shared';

export type ConnectionIndicatorState = 'checking' | 'ready' | 'error';

type ConnectionStatusInput = {
	provider?: string;
	model?: string;
	reasoningEffort?: ReasoningEffort;
	runtimeStatus: RuntimeStatusResponse | null;
};

const effectiveReasoningEffort = (
	model: string,
	reasoningEffort: ReasoningEffort | undefined
): ReasoningEffort | undefined =>
	reasoningEffort ?? (model === 'gpt-5.6-luna' ? 'medium' : undefined);

/**
 * Reports whether the route displayed in the header is configured for use.
 * A route mismatch is treated as transient while refreshed runtime status is
 * in flight, which avoids briefly showing a false error after configuration.
 */
export const getConnectionIndicatorState = ({
	provider,
	model,
	reasoningEffort,
	runtimeStatus
}: ConnectionStatusInput): ConnectionIndicatorState => {
	const selectedProvider = provider?.trim();
	const selectedModel = model?.trim();

	if (!selectedProvider || !selectedModel || !runtimeStatus) return 'checking';

	if (
		runtimeStatus.provider !== selectedProvider ||
		runtimeStatus.model !== selectedModel ||
		effectiveReasoningEffort(runtimeStatus.model, runtimeStatus.reasoningEffort) !==
			effectiveReasoningEffort(selectedModel, reasoningEffort)
	) {
		return 'checking';
	}

	if (runtimeStatus.auth.status === 'ok') return 'ready';

	// OpenAI-compatible endpoints may intentionally omit an API key. A stored
	// provider name means the endpoint configuration completed successfully.
	if (
		selectedProvider === 'openai-compat' &&
		runtimeStatus.auth.status === 'missing' &&
		Boolean(runtimeStatus.providerName?.trim())
	) {
		return 'ready';
	}

	return 'error';
};
