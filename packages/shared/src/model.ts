/** Reasoning levels supported by the configured model providers. */
export const REASONING_EFFORTS = [
	'none',
	'minimal',
	'low',
	'medium',
	'high',
	'xhigh',
	'max'
] as const;

export type ReasoningEffort = (typeof REASONING_EFFORTS)[number];
