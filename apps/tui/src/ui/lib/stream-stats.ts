type StreamStatsDone = {
	usage?: {
		inputTokens?: number;
		outputTokens?: number;
		reasoningTokens?: number;
		totalTokens?: number;
	};
	metrics?: {
		timing?: { totalMs?: number; genMs?: number };
		throughput?: { outputTokensPerSecond?: number; totalTokensPerSecond?: number };
		pricing?: {
			source: 'models.dev';
			modelKey?: string;
			ratesUsdPerMTokens?: { input?: number; output?: number; reasoning?: number };
			costUsd?: { input?: number; output?: number; reasoning?: number; total?: number };
		};
	};
};

const formatUsd = (value: number) => {
	const abs = Math.abs(value);
	const decimals = abs >= 1 ? 2 : abs >= 0.01 ? 4 : 6;
	const fixed = value.toFixed(decimals);
	return `$${fixed.replace(/\.?0+$/u, '')}`;
};

/** Format only the compact, user-facing completion summary shown in the TUI. */
export const formatStreamStats = (done: StreamStatsDone): string | null => {
	const parts: string[] = [];
	const pricing = done.metrics?.pricing;
	const costUsd =
		pricing?.costUsd?.total ??
		(() => {
			const pieces = pricing?.costUsd;
			if (!pieces) return undefined;
			const input = pieces.input ?? 0;
			const output = pieces.output ?? 0;
			const reasoning = pieces.reasoning ?? 0;
			const hasAny = pieces.input != null || pieces.output != null || pieces.reasoning != null;
			return hasAny ? input + output + reasoning : undefined;
		})();

	const inTok = done.usage?.inputTokens;
	const outTok = done.usage?.outputTokens;
	const totalTok = done.usage?.totalTokens;
	if (inTok != null || outTok != null || totalTok != null) {
		parts.push(
			[
				`tokens in ${inTok?.toLocaleString() ?? '?'}`,
				`out ${outTok?.toLocaleString() ?? '?'}`,
				`tokens total ${totalTok?.toLocaleString() ?? '?'}`,
				costUsd == null ? undefined : `cost ${formatUsd(costUsd)}`
			]
				.filter(Boolean)
				.join(' | ')
		);
	} else if (costUsd != null) {
		parts.push(`cost ${formatUsd(costUsd)}`);
	}

	const totalMs = done.metrics?.timing?.totalMs;
	if (totalMs != null) parts.push(`time total ${(totalMs / 1000).toFixed(2)}s`);

	return parts.length > 0 ? `Generation stats: ${parts.join(' || ')}` : null;
};
