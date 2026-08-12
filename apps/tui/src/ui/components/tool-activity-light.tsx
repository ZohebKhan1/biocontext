import { useEffect, useState } from 'react';
import { useRenderer } from '@opentui/react';

import type { ToolChunk } from '../types.ts';
import { getToolActivityVisual, type ToolActivityTone } from '../lib/tool-activity.ts';
import { colors } from '../theme.ts';

export const TOOL_ACTIVITY_PULSE_MS = 360;
export const TOOL_ACTIVITY_MIN_VISIBLE_MS = TOOL_ACTIVITY_PULSE_MS * 3;

const toneColor = (tone: ToolActivityTone): string => {
	switch (tone) {
		case 'active-filled':
			return colors.success;
		case 'active-open':
			return colors.success;
		case 'completed':
			return colors.success;
		case 'interrupted':
			return colors.error;
		default:
			return colors.textFaint;
	}
};

export const ToolActivityLight = (props: {
	state: ToolChunk['state'];
	streamActive: boolean;
	startedAt?: number;
	completedAt?: number;
}) => {
	const renderer = useRenderer();
	const now = Date.now();
	const minimumVisibleUntil =
		props.startedAt === undefined ? 0 : props.startedAt + TOOL_ACTIVITY_MIN_VISIBLE_MS;
	const activityVisible =
		props.streamActive ||
		(props.state === 'completed' && now < Math.max(minimumVisibleUntil, props.completedAt ?? 0));
	const shouldPulse = activityVisible;
	const [pulseFilled, setPulseFilled] = useState(true);

	useEffect(() => {
		if (!shouldPulse) {
			setPulseFilled(true);
			return;
		}
		const interval = setInterval(() => {
			setPulseFilled((current) => !current);
			// The renderer is normally invalidated by React state updates, but an
			// explicit request keeps timer-driven cell changes visible in an idle
			// terminal where OpenTUI is not running its continuous frame loop.
			renderer.requestRender();
		}, TOOL_ACTIVITY_PULSE_MS);
		return () => clearInterval(interval);
	}, [renderer, shouldPulse]);

	const visual = getToolActivityVisual({
		state: props.state,
		streamActive: activityVisible,
		pulseFilled
	});

	return <text fg={toneColor(visual.tone)}>{visual.glyph}</text>;
};
