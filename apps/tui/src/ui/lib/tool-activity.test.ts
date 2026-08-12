import { describe, expect, test } from 'bun:test';

import { getToolActivityVisual } from './tool-activity.ts';

describe('getToolActivityVisual', () => {
	test('pulses pending, running, and completed tools while the agent is thinking', () => {
		expect(
			getToolActivityVisual({ state: 'pending', streamActive: true, pulseFilled: true })
		).toEqual({ glyph: '●', tone: 'active-filled' });
		expect(
			getToolActivityVisual({ state: 'pending', streamActive: true, pulseFilled: false })
		).toEqual({ glyph: '○', tone: 'active-open' });
		expect(
			getToolActivityVisual({ state: 'completed', streamActive: true, pulseFilled: false })
		).toEqual({ glyph: '○', tone: 'active-open' });
	});

	test('alternates a running tool between filled and outlined green states', () => {
		expect(
			getToolActivityVisual({ state: 'running', streamActive: true, pulseFilled: true })
		).toEqual({ glyph: '●', tone: 'active-filled' });
		expect(
			getToolActivityVisual({ state: 'running', streamActive: true, pulseFilled: false })
		).toEqual({ glyph: '○', tone: 'active-open' });
	});

	test('stops pulsing when the completed tool is no longer streaming', () => {
		for (const pulseFilled of [true, false]) {
			expect(
				getToolActivityVisual({ state: 'completed', streamActive: false, pulseFilled })
			).toEqual({ glyph: '●', tone: 'completed' });
		}
	});

	test('marks stale unfinished records as interrupted instead of leaving them active', () => {
		expect(
			getToolActivityVisual({ state: 'running', streamActive: false, pulseFilled: true })
		).toEqual({ glyph: '●', tone: 'interrupted' });
		expect(
			getToolActivityVisual({ state: 'pending', streamActive: false, pulseFilled: true })
		).toEqual({ glyph: '●', tone: 'interrupted' });
	});
});
