import { describe, expect, test } from 'bun:test';

import { formatStreamStats } from './stream-stats.ts';

describe('stream stats', () => {
	test('keeps the compact token, cost, and total-time summary', () => {
		const result = formatStreamStats({
			usage: {
				inputTokens: 23617,
				outputTokens: 593,
				reasoningTokens: 120,
				totalTokens: 24210
			},
			metrics: {
				timing: { totalMs: 14150, genMs: 12000 },
				throughput: { outputTokensPerSecond: 41.9, totalTokensPerSecond: 1000 },
				pricing: {
					source: 'models.dev',
					costUsd: { input: 0.02, output: 0.01, reasoning: 0.001, total: 0.031 }
				}
			}
		});

		expect(result).toBe(
			'Generation stats: tokens in 23,617 | out 593 | tokens total 24,210 | cost $0.031 || time total 14.15s'
		);
		expect(result).not.toContain('reasoning');
		expect(result).not.toContain('time gen');
		expect(result).not.toContain('tps');
	});
});
