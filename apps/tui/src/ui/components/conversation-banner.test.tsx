import { describe, expect, it } from 'bun:test';
import { RGBA, TextAttributes, type ScrollBoxRenderable } from '@opentui/core';
import { testRender } from '@opentui/react/test-utils';
import { act, useState } from 'react';

import { ConversationBanner } from './conversation-banner.tsx';
import {
	BIOCONTEXT_FULL_ROWS,
	BIOCONTEXT_FULL_WIDTH,
	BIOCONTEXT_LOGO_COLORS
} from '../lib/biocontext-logo.ts';
import { colors } from '../theme.ts';

const destroyRenderer = async (renderer: { destroy: () => void }) => {
	await act(async () => {
		renderer.destroy();
	});
};

describe('ConversationBanner', () => {
	it('renders the full wordmark left-aligned at normal terminal dimensions', async () => {
		const setup = await testRender(<ConversationBanner startupSummary="Ready." />, {
			width: 80,
			height: 24,
			useThread: false
		});
		try {
			await setup.renderOnce();
			const artworkLines = setup
				.captureCharFrame()
				.split('\n')
				.filter((line) => /[▀▄█]/u.test(line));

			expect(artworkLines).toHaveLength(BIOCONTEXT_FULL_ROWS.length);
			expect(artworkLines.map((line) => line.slice(0, BIOCONTEXT_FULL_WIDTH))).toEqual(
				BIOCONTEXT_FULL_ROWS.map((row) => row.map((run) => run.text).join(''))
			);

			const spans = setup.captureSpans().lines.flatMap((line) => line.spans);
			for (const color of Object.values(BIOCONTEXT_LOGO_COLORS)) {
				const expectedColor = RGBA.fromHex(color);
				expect(
					spans.some((span) => span.fg.equals(expectedColor) || span.bg.equals(expectedColor))
				).toBe(true);
			}
			const gradientFace = spans.find(
				(span) =>
					span.fg.equals(RGBA.fromHex(BIOCONTEXT_LOGO_COLORS['context-face-mid'])) &&
					(span.attributes & TextAttributes.BOLD) === TextAttributes.BOLD
			);
			expect(gradientFace).toBeDefined();
		} finally {
			await destroyRenderer(setup.renderer);
		}
	});

	it('renders one styled, unwrapped compact line at narrow dimensions', async () => {
		const setup = await testRender(<ConversationBanner startupSummary="Ready." />, {
			width: 20,
			height: 24,
			useThread: false
		});
		try {
			await setup.renderOnce();
			const frame = setup.captureCharFrame();
			const compactLines = frame.split('\n').filter((line) => line.includes('biocontext'));
			expect(compactLines).toHaveLength(1);
			expect(compactLines[0]?.startsWith('biocontext')).toBe(true);
			expect(frame).not.toMatch(/[▀▄█]/u);

			const spans = setup.captureSpans().lines.flatMap((line) => line.spans);
			const bioSpan = spans.find((span) => span.text.includes('bio'));
			const contextSpan = spans.find((span) => span.text.includes('context'));
			expect(bioSpan?.fg.equals(RGBA.fromHex(colors.accentBright))).toBe(true);
			expect(contextSpan?.fg.equals(RGBA.fromHex(colors.text))).toBe(true);
			expect((bioSpan?.attributes ?? 0) & TextAttributes.BOLD).toBe(TextAttributes.BOLD);
			expect((contextSpan?.attributes ?? 0) & TextAttributes.BOLD).toBe(0);
		} finally {
			await destroyRenderer(setup.renderer);
		}
	});

	it('omits the banner rather than rendering partial artwork', async () => {
		const setup = await testRender(<ConversationBanner startupSummary="Ready." />, {
			width: 14,
			height: 24,
			useThread: false
		});
		try {
			await setup.renderOnce();
			const frame = setup.captureCharFrame();
			expect(frame).not.toContain('biocontext');
			expect(frame).not.toMatch(/[▀▄█]/u);
		} finally {
			await destroyRenderer(setup.renderer);
		}
	});

	it('moves out of a bottom-sticky scrollbox and remains recoverable above', async () => {
		let appendRows: (() => void) | undefined;
		let scrollbox: ScrollBoxRenderable | null = null;

		const ScrollHarness = () => {
			const [messageRows, setMessageRows] = useState(0);
			appendRows = () => setMessageRows(30);

			return (
				<scrollbox
					ref={(renderable) => {
						scrollbox = renderable;
					}}
					style={{
						width: '100%',
						height: '100%',
						rootOptions: { border: true },
						contentOptions: { flexDirection: 'column', padding: 1, gap: 2 },
						stickyScroll: true,
						stickyStart: 'bottom'
					}}
				>
					<ConversationBanner startupSummary="Startup summary" />
					<text>Startup summary</text>
					{Array.from({ length: messageRows }, (_, index) => (
						<text key={index}>{`message row ${index}`}</text>
					))}
				</scrollbox>
			);
		};

		const setup = await testRender(<ScrollHarness />, {
			width: 80,
			height: 24,
			useThread: false
		});
		try {
			await setup.renderOnce();
			expect(setup.captureCharFrame()).toContain(
				BIOCONTEXT_FULL_ROWS[0]?.map((run) => run.text).join('') ?? ''
			);

			act(() => appendRows?.());
			await setup.renderOnce();
			const bottomFrame = setup.captureCharFrame();
			expect(bottomFrame).not.toContain(
				BIOCONTEXT_FULL_ROWS[0]?.map((run) => run.text).join('') ?? ''
			);
			expect(bottomFrame).toContain('message row 29');

			act(() => {
				if (scrollbox) scrollbox.scrollTop = 0;
			});
			await setup.renderOnce();
			expect(setup.captureCharFrame()).toContain(
				BIOCONTEXT_FULL_ROWS[0]?.map((run) => run.text).join('') ?? ''
			);
		} finally {
			await destroyRenderer(setup.renderer);
		}
	});

	it('switches from full to compact when the terminal narrows', async () => {
		const setup = await testRender(<ConversationBanner startupSummary="Ready." />, {
			width: 80,
			height: 24,
			useThread: false
		});
		try {
			await setup.renderOnce();
			expect(setup.captureCharFrame()).toContain(
				BIOCONTEXT_FULL_ROWS[0]?.map((run) => run.text).join('') ?? ''
			);

			act(() => setup.resize(30, 24));
			await setup.renderOnce();
			const resizedFrame = setup.captureCharFrame();
			expect(resizedFrame).toContain('biocontext');
			expect(resizedFrame).not.toMatch(/[▀▄█]/u);
		} finally {
			await destroyRenderer(setup.renderer);
		}
	});
});
