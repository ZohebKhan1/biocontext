import { describe, expect, test } from 'bun:test';

import {
	formatModelRoute,
	formatStartupSummary,
	formatSystemLabel,
	isStartupSummary
} from './startup-summary.ts';

describe('startup summary', () => {
	test('formats an unambiguous provider, model, and reasoning route', () => {
		expect(
			formatModelRoute({ provider: 'openai', model: 'gpt-5.6-luna', reasoningEffort: 'medium' })
		).toBe('openai/gpt-5.6-luna/medium');
		expect(formatSystemLabel({ provider: 'openai', model: 'gpt-5.6-luna' })).toBe(
			'biocontext◉ openai/gpt-5.6-luna/medium'
		);
	});

	test('reports local packages without repeating provider status', () => {
		expect(
			formatStartupSummary({
				localBioconductorPackageCount: 22,
				provider: 'openai',
				model: 'gpt-5.4',
				auth: { status: 'ok', authType: 'oauth' }
			})
		).toBe('Welcome to biocontext. 22 Bioconductor package resources loaded locally.');
	});

	test('uses singular resource grammar', () => {
		expect(
			formatStartupSummary({
				localBioconductorPackageCount: 1,
				provider: 'anthropic',
				model: 'claude-haiku-4-5-20251001',
				auth: { status: 'ok', authType: 'api' }
			})
		).toBe('Welcome to biocontext. 1 Bioconductor package resource loaded locally.');
	});

	test('reports default package bootstrap progress', () => {
		expect(
			formatStartupSummary({
				localBioconductorPackageCount: 3,
				defaultBioconductorPackages: { state: 'running', total: 11, ready: 3, failed: [] },
				provider: 'openai',
				model: 'gpt-5.4',
				auth: { status: 'ok', authType: 'oauth' }
			})
		).toContain('Bioconductor package setup in progress (3/11).');
	});

	test('has an honest transient state while runtime metadata loads', () => {
		const message = formatStartupSummary(null);
		expect(message).toBe('Welcome to biocontext. Loading local package resources.');
		expect(isStartupSummary(message)).toBe(true);
		expect(isStartupSummary('Generation stats: 10 tokens')).toBe(false);
	});
});
