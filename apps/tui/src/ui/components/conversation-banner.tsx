import { TextAttributes } from '@opentui/core';
import { useTerminalDimensions } from '@opentui/react';

import {
	BIOCONTEXT_LOGO_COLORS,
	BIOCONTEXT_FULL_ROWS,
	selectBiocontextLogoVariant,
	type BiocontextLogoRun,
	type BiocontextLogoTone
} from '../lib/biocontext-logo.ts';
import { colors } from '../theme.ts';

const boldTones = new Set<BiocontextLogoTone>([
	'bio-face-high',
	'bio-face-mid',
	'bio-face-low',
	'context-face-high',
	'context-face-mid',
	'context-face-low'
]);

const runStyle = (run: BiocontextLogoRun) => ({
	...(run.foreground ? { fg: BIOCONTEXT_LOGO_COLORS[run.foreground] } : {}),
	...(run.background ? { bg: BIOCONTEXT_LOGO_COLORS[run.background] } : {}),
	...(run.foreground && boldTones.has(run.foreground) ? { attributes: TextAttributes.BOLD } : {})
});

export const ConversationBanner = (props: { startupSummary: string }) => {
	const terminalDimensions = useTerminalDimensions();
	const variant = selectBiocontextLogoVariant({
		terminalWidth: terminalDimensions.width,
		terminalHeight: terminalDimensions.height,
		startupSummary: props.startupSummary
	});

	if (variant === 'hidden') return null;

	if (variant === 'compact') {
		return (
			<text selectable={false} wrapMode="none">
				<span style={{ fg: colors.accentBright, attributes: TextAttributes.BOLD }}>bio</span>
				<span style={{ fg: colors.text }}>context</span>
			</text>
		);
	}

	return (
		<box style={{ flexDirection: 'column', gap: 0 }}>
			{BIOCONTEXT_FULL_ROWS.map((row, rowIndex) => (
				<text key={rowIndex} selectable={false} wrapMode="none">
					{row.map((run, runIndex) => (
						<span key={runIndex} style={runStyle(run)}>
							{run.text}
						</span>
					))}
				</text>
			))}
		</box>
	);
};
