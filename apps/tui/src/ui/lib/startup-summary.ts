import type { RuntimeStatusResponse } from '../../client/index.ts';

const WELCOME_PREFIX = 'Welcome to biocontext.';

export type ModelRoute = {
	provider?: string;
	model?: string;
	reasoningEffort?: string;
};

/**
 * Format the technical model route used by the TUI chrome.
 *
 * Keep this separate from the human-readable startup summary: the route is
 * intended to be unambiguous and stable for future providers and reasoning
 * levels (for example, openai/gpt-5.6-luna/medium).
 */
export const formatModelRoute = (route: ModelRoute): string => {
	const provider = route.provider?.trim();
	const model = route.model?.trim();
	const base = [provider, model].filter((part): part is string => Boolean(part)).join('/');
	if (!base) return 'loading model';

	const reasoningEffort =
		route.reasoningEffort ?? (model === 'gpt-5.6-luna' ? 'medium' : undefined);
	return reasoningEffort ? `${base}/${reasoningEffort}` : base;
};

export const formatSystemLabel = (route: ModelRoute): string =>
	`biocontext◉ ${formatModelRoute(route)}`;

export const formatStartupSummary = (status: RuntimeStatusResponse | null): string => {
	if (!status) {
		return `${WELCOME_PREFIX} Loading local package resources.`;
	}

	const noun = status.localBioconductorPackageCount === 1 ? 'resource' : 'resources';
	const bootstrap = status.defaultBioconductorPackages;
	const setupNote =
		bootstrap?.state === 'running'
			? ` Bioconductor package setup in progress (${bootstrap.ready}/${bootstrap.total}).`
			: bootstrap?.state === 'partial'
				? ` Bioconductor package setup incomplete (${bootstrap.ready}/${bootstrap.total}); use /add to retry failed packages.`
				: '';
	return `${WELCOME_PREFIX} ${status.localBioconductorPackageCount} Bioconductor package ${noun} loaded locally.${setupNote}`;
};

export const isStartupSummary = (value: string): boolean => value.startsWith(WELCOME_PREFIX);
