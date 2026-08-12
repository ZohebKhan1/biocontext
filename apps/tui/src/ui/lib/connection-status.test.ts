import { describe, expect, test } from 'bun:test';
import type { RuntimeStatusResponse } from '../../client/index.ts';
import { getConnectionIndicatorState } from './connection-status.ts';

const status = (overrides: Partial<RuntimeStatusResponse> = {}): RuntimeStatusResponse => ({
	localBioconductorPackageCount: 30,
	provider: 'openai',
	model: 'gpt-5.6-luna',
	reasoningEffort: 'medium',
	auth: { status: 'ok', authType: 'oauth' },
	...overrides
});

describe('getConnectionIndicatorState', () => {
	test('waits for authoritative runtime status', () => {
		expect(
			getConnectionIndicatorState({
				provider: 'openai',
				model: 'gpt-5.6-luna',
				reasoningEffort: 'medium',
				runtimeStatus: null
			})
		).toBe('checking');
	});

	test('reports a configured route as ready', () => {
		expect(
			getConnectionIndicatorState({
				provider: 'openai',
				model: 'gpt-5.6-luna',
				reasoningEffort: 'medium',
				runtimeStatus: status()
			})
		).toBe('ready');
	});

	test('reports missing and invalid credentials as errors', () => {
		for (const auth of [
			{ status: 'missing' as const },
			{ status: 'invalid' as const, authType: 'oauth' as const }
		]) {
			expect(
				getConnectionIndicatorState({
					provider: 'openai',
					model: 'gpt-5.6-luna',
					reasoningEffort: 'medium',
					runtimeStatus: status({ auth })
				})
			).toBe('error');
		}
	});

	test('accepts a configured OpenAI-compatible endpoint without an optional key', () => {
		expect(
			getConnectionIndicatorState({
				provider: 'openai-compat',
				model: 'custom-model',
				runtimeStatus: status({
					provider: 'openai-compat',
					providerName: 'Local gateway',
					model: 'custom-model',
					reasoningEffort: undefined,
					auth: { status: 'missing' }
				})
			})
		).toBe('ready');

		expect(
			getConnectionIndicatorState({
				provider: 'openai-compat',
				model: 'custom-model',
				runtimeStatus: status({
					provider: 'openai-compat',
					model: 'custom-model',
					reasoningEffort: undefined,
					auth: { status: 'missing' }
				})
			})
		).toBe('error');
	});

	test('treats route changes as transient while status refreshes', () => {
		expect(
			getConnectionIndicatorState({
				provider: 'anthropic',
				model: 'gpt-5.6-sol',
				reasoningEffort: 'high',
				runtimeStatus: status()
			})
		).toBe('checking');
	});

	test('normalizes Luna default reasoning before comparing routes', () => {
		expect(
			getConnectionIndicatorState({
				provider: 'openai',
				model: 'gpt-5.6-luna',
				runtimeStatus: status({ reasoningEffort: undefined })
			})
		).toBe('ready');
	});
});
