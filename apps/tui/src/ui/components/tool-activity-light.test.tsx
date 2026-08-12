import { expect, test } from 'bun:test';
import { RGBA } from '@opentui/core';
import { testRender } from '@opentui/react/test-utils';
import { act, useState } from 'react';

import {
	ToolActivityLight,
	TOOL_ACTIVITY_MIN_VISIBLE_MS,
	TOOL_ACTIVITY_PULSE_MS
} from './tool-activity-light.tsx';
import { colors } from '../theme.ts';
import type { ToolChunk } from '../types.ts';

test('tool dots pulse through completion while the agent is thinking, then settle', async () => {
	let complete: (() => void) | undefined;
	let finishStream: (() => void) | undefined;

	const Harness = () => {
		const [state, setState] = useState<ToolChunk['state']>('running');
		const [streamActive, setStreamActive] = useState(true);
		complete = () => setState('completed');
		finishStream = () => setStreamActive(false);
		return <ToolActivityLight state={state} streamActive={streamActive} />;
	};

	const setup = await testRender(<Harness />, {
		width: 4,
		height: 2,
		useThread: false
	});
	const dotSpan = () =>
		setup
			.captureSpans()
			.lines.flatMap((line) => line.spans)
			.find((span) => span.text.includes('●') || span.text.includes('○'));
	const dotGlyph = () => dotSpan()?.text;

	try {
		await setup.renderOnce();
		expect(dotSpan()?.fg?.equals(RGBA.fromHex(colors.success))).toBe(true);
		const initialGlyph = dotGlyph();
		expect(
			setup
				.captureSpans()
				.lines.flatMap((line) => line.spans)
				.some((span) => span.text.includes('●'))
		).toBe(true);

		await act(async () => {
			await Bun.sleep(TOOL_ACTIVITY_PULSE_MS + 60);
		});
		await setup.renderOnce();
		const runningGlyph = dotGlyph();
		expect(runningGlyph).not.toBe(initialGlyph);
		expect(
			setup
				.captureSpans()
				.lines.flatMap((line) => line.spans)
				.some((span) => span.text.includes('○'))
		).toBe(true);
		expect(dotSpan()?.fg?.equals(RGBA.fromHex(colors.success))).toBe(true);

		act(() => complete?.());
		await setup.renderOnce();
		expect(dotSpan()?.fg?.equals(RGBA.fromHex(colors.success))).toBe(true);
		const completedGlyph = dotGlyph();

		await act(async () => {
			await Bun.sleep(TOOL_ACTIVITY_PULSE_MS + 60);
		});
		await setup.renderOnce();
		expect(dotGlyph()).not.toBe(completedGlyph);

		act(() => finishStream?.());
		await setup.renderOnce();
		expect(dotSpan()?.fg?.equals(RGBA.fromHex(colors.success))).toBe(true);
		expect(
			setup
				.captureSpans()
				.lines.flatMap((line) => line.spans)
				.some((span) => span.text.includes('●'))
		).toBe(true);

		await act(async () => {
			await Bun.sleep(TOOL_ACTIVITY_PULSE_MS + 60);
		});
		await setup.renderOnce();
		expect(
			setup
				.captureSpans()
				.lines.flatMap((line) => line.spans)
				.some((span) => span.text.includes('●'))
		).toBe(true);
	} finally {
		await act(async () => {
			setup.renderer.destroy();
		});
	}
});

test('a fast completed tool keeps its activity pulse visible briefly', async () => {
	const startedAt = Date.now();
	const setup = await testRender(
		<ToolActivityLight
			state="completed"
			streamActive={false}
			startedAt={startedAt}
			completedAt={startedAt}
		/>,
		{
			width: 4,
			height: 2,
			useThread: false
		}
	);
	const dotSpan = () =>
		setup
			.captureSpans()
			.lines.flatMap((line) => line.spans)
			.find((span) => span.text.includes('●') || span.text.includes('○'));

	try {
		await setup.renderOnce();
		expect(dotSpan()?.fg?.equals(RGBA.fromHex(colors.success))).toBe(true);

		await act(async () => {
			await Bun.sleep(TOOL_ACTIVITY_PULSE_MS + 60);
		});
		await setup.renderOnce();
		expect(
			setup
				.captureSpans()
				.lines.flatMap((line) => line.spans)
				.some((span) => span.text.includes('○'))
		).toBe(true);

		await act(async () => {
			await Bun.sleep(TOOL_ACTIVITY_MIN_VISIBLE_MS);
		});
		await setup.renderOnce();
		expect(dotSpan()?.fg?.equals(RGBA.fromHex(colors.success))).toBe(true);
	} finally {
		await act(async () => {
			setup.renderer.destroy();
		});
	}
});
