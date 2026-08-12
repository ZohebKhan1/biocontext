import type { ToolChunk } from '../types.ts';

export type ToolActivityTone =
	| 'pending'
	| 'active-open'
	| 'active-filled'
	| 'completed'
	| 'interrupted';

export type ToolActivityVisual = {
	glyph: '○' | '●';
	tone: ToolActivityTone;
};

/**
 * Converts persisted tool state plus live stream state into a terminal-safe
 * indicator. A stale running state is terminal rather than animated forever.
 */
export const getToolActivityVisual = ({
	state,
	streamActive,
	pulseFilled
}: {
	state: ToolChunk['state'];
	streamActive: boolean;
	pulseFilled: boolean;
}): ToolActivityVisual => {
	if (streamActive) {
		return pulseFilled
			? { glyph: '●', tone: 'active-filled' }
			: { glyph: '○', tone: 'active-open' };
	}
	if (state === 'completed') return { glyph: '●', tone: 'completed' };
	return { glyph: '●', tone: 'interrupted' };
};
