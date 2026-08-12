import { useMemo } from 'react';

import packageJson from '../../../package.json';
import { colors } from '../theme.ts';
import type { CancelState, ActiveWizard, WizardStep } from '../types.ts';

// Version is injected at build time via Bun's define option
// Falls back to package.json for dev mode, or 0.0.0 if unavailable
// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
const VERSION =
	(globalThis as { __VERSION__?: string }).__VERSION__ ?? packageJson.version ?? '0.0.0';

export interface StatusBarProps {
	cursorIn: string;
	isStreaming: boolean;
	cancelState: CancelState;
	threadResources: string[];
	activeWizard?: ActiveWizard;
	wizardStep?: WizardStep;
}

type StatusHint = {
	key: string;
	label: string;
};

export const formatScopeLabel = (threadResources: string[]): string => {
	const resources = threadResources
		.map((resource) => resource.trim())
		.filter((resource) => resource.length > 0)
		.map((resource) => (resource.startsWith('@') ? resource : `@${resource}`));
	return resources.length > 0 ? resources.join(' ') : '@Bioconductor';
};

const HintLine = (props: { hints: StatusHint[] }) => (
	<text>
		{props.hints.map((hint, index) => (
			<span key={`${hint.key}:${hint.label}`}>
				{index > 0 ? '  ' : ''}
				<span style={{ fg: colors.accentBright }}>{hint.key}</span>
				<span style={{ fg: colors.textSubtle }}>{` ${hint.label}`}</span>
			</span>
		))}
	</text>
);

export const StatusBar = (props: StatusBarProps) => {
	const inTmux = Boolean(process.env.TMUX);

	const getHints = (): StatusHint[] => {
		if (props.isStreaming) {
			if (props.cancelState === 'pending') {
				return [{ key: '[Esc]', label: 'Confirm cancel' }];
			}
			return [{ key: '…', label: 'Streaming · [Esc] Cancel' }];
		}

		// Wizard-specific help
		if (props.activeWizard === 'add-repo') {
			if (props.wizardStep === 'confirm') {
				return [
					{ key: '[Enter]', label: 'Get config snippet' },
					{ key: '[Esc]', label: 'Cancel' }
				];
			}
			return [
				{ key: '[Enter]', label: 'Next step' },
				{ key: '[Esc]', label: 'Cancel' }
			];
		}

		if (props.activeWizard === 'connect') {
			if (props.wizardStep === 'api-key' || props.wizardStep === 'model-input') {
				return [
					{ key: '[Enter]', label: 'Submit' },
					{ key: '[Esc]', label: 'Cancel' }
				];
			}
			if (props.wizardStep === 'auth') {
				return [{ key: '…', label: 'Waiting for authentication · [Esc] Cancel' }];
			}
			return [
				{ key: '[Up/Down]', label: 'Navigate' },
				{ key: '[Enter]', label: 'Select' },
				{ key: '[Esc]', label: 'Cancel' }
			];
		}

		if (props.activeWizard === 'bioconductor') {
			return [
				{ key: '[Type]', label: 'Search' },
				{ key: '[Up/Down]', label: 'Select' },
				{ key: '[Enter]', label: 'Install' },
				{ key: '[Esc]', label: 'Cancel' }
			];
		}

		if (props.activeWizard === 'resume') {
			return [
				{ key: '[Up/Down]', label: 'Navigate' },
				{ key: '[Enter]', label: 'Resume' },
				{ key: '[Esc]', label: 'Cancel' }
			];
		}

		if (props.cursorIn === 'command') {
			return [
				{ key: '[Up/Down]', label: 'Navigate' },
				{ key: '[Enter]', label: 'Select' },
				{ key: '[Esc]', label: 'Cancel' }
			];
		}

		if (props.cursorIn === 'mention') {
			return [
				{ key: '[Up/Down]', label: 'Navigate' },
				{ key: '[Tab/Enter]', label: 'Select' },
				{ key: '[Esc]', label: 'Cancel' }
			];
		}

		const hints: StatusHint[] = [
			{ key: '[@resource]', label: 'Switch scope' },
			{ key: '[/]', label: 'Commands' },
			{ key: '[Ctrl+Q]', label: 'Quit' }
		];
		if (inTmux) {
			hints.splice(1, 0, { key: '[Enter]', label: 'Send' }, { key: '[Ctrl+J]', label: 'New line' });
		}
		return hints;
	};

	const hints = useMemo(
		() => getHints(),
		[
			inTmux,
			props.activeWizard,
			props.cancelState,
			props.cursorIn,
			props.isStreaming,
			props.wizardStep
		]
	);
	const scopeLabel = formatScopeLabel(props.threadResources);

	return (
		<box
			style={{
				height: 1,
				width: '100%',
				backgroundColor: colors.bgMuted,
				flexDirection: 'row',
				justifyContent: 'space-between',
				paddingLeft: 1,
				paddingRight: 1
			}}
		>
			<HintLine hints={hints} />
			<box style={{ flexDirection: 'row', gap: 2 }}>
				<text fg={colors.accentBright} content={scopeLabel} />
				<text fg={colors.textSubtle} content={`v${VERSION}`} />
			</box>
		</box>
	);
};
