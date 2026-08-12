import { useEffect, useMemo, useState } from 'react';
import type { TextareaRenderable } from '@opentui/core';
import { useKeyboard, useRenderer, useTerminalDimensions } from '@opentui/react';

import type { ActiveWizard, Command, InputState, WizardStep } from '../types.ts';
import { inputHistory } from '../history.ts';
import { useConfigContext } from '../context/config-context.tsx';
import { useMessagesContext } from '../context/messages-context.tsx';
import { AddResourceWizard } from './add-resource-wizard.tsx';
import { BioconductorPackageBrowser } from './bioconductor-package-browser.tsx';
import { CommandPalette } from './command-palette.tsx';
import { ConnectWizard } from './connect-wizard.tsx';
import { MainInput } from './main-input.tsx';
import { RepoMentionPalette } from './repo-mention-palette.tsx';
import { ResumeThreadModal } from './resume-thread-modal.tsx';
import { StatusBar } from './status-bar.tsx';
import {
	hasIncompleteConfiguredResourceMatch,
	isBioconductorPackageReference,
	resolveMentionResourceReference
} from '../lib/resource-mentions.ts';
import { parseResourceInput } from '../lib/input-resource-scope.ts';
import { buildMentionCandidates } from '../lib/mention-candidates.ts';
import { parseAddVerifyCommand, parseRemoveCommand } from '../commands.ts';
import { formatError } from '../lib/format-error.ts';
import { services } from '../services.ts';

export const InputSection = () => {
	const messages = useMessagesContext();
	const config = useConfigContext();
	const terminalDimensions = useTerminalDimensions();
	const renderer = useRenderer();

	const [inputState, setInputState] = useState<InputState>([]);
	const [cursorPosition, setCursorPosition] = useState(0);
	const [inputRef, setInputRef] = useState<TextareaRenderable | null>(null);

	const [activeWizard, setActiveWizard] = useState<ActiveWizard>('none');
	const [currentWizardStep, setCurrentWizardStep] = useState<WizardStep>(null);

	const isAnyWizardOpen = activeWizard !== 'none';

	useEffect(() => {
		inputHistory.init();
	}, []);

	const cursorIsCurrentlyIn = useMemo(() => {
		let minIdx = 0;
		for (const item of inputState) {
			const displayLen =
				item.type === 'pasted' ? `[~${item.lines} lines]`.length : item.content.length;
			const maxIdx = minIdx + displayLen;
			if (cursorPosition >= minIdx && cursorPosition <= maxIdx) return item.type;
			minIdx = maxIdx;
		}
		return 'text';
	}, [inputState, cursorPosition]);

	const inputDisplayLineCount = useMemo(() => {
		const value = inputState
			.map((item) => (item.type === 'pasted' ? `[~${item.lines} lines]` : item.content))
			.join('');
		const availableWidth = Math.max(1, terminalDimensions.width - 4);
		if (value.length === 0) return 1;
		return value
			.split('\n')
			.map((line) => Math.max(1, Math.ceil(line.length / availableWidth)))
			.reduce((sum, lineCount) => sum + lineCount, 0);
	}, [inputState, terminalDimensions.width]);

	const shouldUseArrowHistory = inputDisplayLineCount <= 1;

	const resolveResourceReference = (input: string): string | null =>
		resolveMentionResourceReference(input, config.repos, config.localBioconductorPackageNames);
	const mentionCandidates = useMemo(
		() => buildMentionCandidates(config.repos, config.localBioconductorPackageNames),
		[config.repos, config.localBioconductorPackageNames]
	);

	const currentInputIndex = useMemo(() => {
		let minIdx = 0;
		for (let i = 0; i < inputState.length; i++) {
			const item = inputState[i]!;
			const maxIdx =
				minIdx + (item.type === 'pasted' ? `[~${item.lines} lines]`.length : item.content.length);
			if (cursorPosition >= minIdx && cursorPosition <= maxIdx) {
				return i;
			}
			minIdx = maxIdx;
		}
		return inputState.length;
	}, [inputState, cursorPosition]);

	const currentMentionToken = useMemo(() => {
		if (cursorIsCurrentlyIn !== 'mention' || currentInputIndex >= inputState.length) return '';
		const currentInput = inputState[currentInputIndex];
		if (!currentInput || currentInput.type !== 'mention') return '';
		return currentInput.content;
	}, [cursorIsCurrentlyIn, currentInputIndex, inputState]);

	const isCurrentMentionResolved = useMemo(() => {
		const token = currentMentionToken.trim().replace(/^@/u, '');
		const isExactConfiguredResource = config.repos.some(
			(resource) => resource.name.toLowerCase() === token.toLowerCase()
		);
		const isWaitingForPackageNames =
			config.localBioconductorPackageNamesLoading &&
			!isExactConfiguredResource &&
			isBioconductorPackageReference(currentMentionToken);

		return (
			resolveResourceReference(currentMentionToken) !== null &&
			!hasIncompleteConfiguredResourceMatch(currentMentionToken, mentionCandidates) &&
			!isWaitingForPackageNames &&
			cursorIsCurrentlyIn === 'mention'
		);
	}, [
		currentMentionToken,
		cursorIsCurrentlyIn,
		config.repos,
		config.localBioconductorPackageNamesLoading,
		mentionCandidates,
		resolveResourceReference
	]);

	const maxResumeThreadItems = useMemo(() => {
		const inputHeight = 3; // default from MainInput when empty
		const headerHeight = 3;
		const statusBarHeight = 1;
		const messagesHeight = Math.max(
			1,
			terminalDimensions.height - headerHeight - statusBarHeight - inputHeight
		);
		const modalHeight = Math.max(8, Math.floor(messagesHeight / 2));
		return Math.max(1, modalHeight - 3);
	}, [terminalDimensions.height]);

	const handleSubmit = async () => {
		const inputText = inputState
			.map((s) => s.content)
			.join('')
			.trim();
		if (!inputText) return;
		const removeCommand = parseRemoveCommand(inputText);
		if (removeCommand.matched) {
			if (messages.isStreaming) return;
			if (!removeCommand.success) {
				messages.addSystemMessage(removeCommand.error);
				return;
			}
			if (!removeCommand.confirmed) {
				messages.addSystemMessage(
					`Removing ${removeCommand.package} deletes its validated managed package cache and matching Bioconductor or CRAN config entries. Confirm with /remove ${removeCommand.package} --yes.`
				);
				return;
			}

			const currentInput = inputState;
			await inputHistory.add(currentInput);
			setInputState([]);
			try {
				const result = await services.removeBioconductorPackage(removeCommand.package);
				for (const resourceName of result.removedConfigResources) {
					config.removeRepo(resourceName);
				}
				messages.removeThreadResources([result.package, ...result.removedConfigResources]);
				await Promise.all([config.refreshLocalBioconductorPackageNames(), config.refreshRuntimeStatus()]);
				messages.addSystemMessage(
					result.cleanupPending
						? `Removed ${result.package}'s managed installation and config. Residual cache cleanup will retry on the next launch.`
						: `Removed ${result.package} and its managed local package data. Bundled corpus documentation, when present, is unchanged; reinstall it with /add.`
				);
			} catch (cause) {
				messages.addSystemMessage(`Error: ${formatError(cause)}`);
			}
			return;
		}
		const verifyCommand = parseAddVerifyCommand(inputText);
		if (verifyCommand.matched) {
			if (messages.isStreaming) return;
			if (!verifyCommand.success) {
				messages.addSystemMessage(verifyCommand.error);
				return;
			}
			const currentInput = inputState;
			await inputHistory.add(currentInput);
			setInputState([]);
			try {
				const verification = await services.verifyBioconductorPackage(verifyCommand.package);
				messages.addSystemMessage(JSON.stringify(verification, null, 2));
			} catch (cause) {
				messages.addSystemMessage(`Error: ${formatError(cause)}`);
			}
			return;
		}
		if (
			cursorIsCurrentlyIn === 'command' ||
			(cursorIsCurrentlyIn === 'mention' && !isCurrentMentionResolved)
		)
			return;
		if (messages.isStreaming) return;

		const parsed = parseResourceInput(inputState);
		const existingResources = messages.threadResources;

		if (parsed.resources.length === 0 && existingResources.length === 0) {
			messages.addSystemMessage(
				'The Bioconductor corpus is unavailable. Restore the Bioconductor resource in biocontext.config.jsonc or use @resource.'
			);
			return;
		}
		if (!parsed.hasQuestionContent) {
			messages.addSystemMessage(
				parsed.resources.length > 0
					? 'Please enter a question after the @mention.'
					: 'Please enter a question.'
			);
			return;
		}

		const validNewResources: string[] = [];
		const invalidResources: string[] = [];
		for (const resourceName of parsed.resources) {
			const resolved = resolveResourceReference(resourceName);
			if (resolved) validNewResources.push(resolved);
			else invalidResources.push(resourceName);
		}
		if (invalidResources.length > 0) {
			messages.addSystemMessage(
				`Resource(s) not available locally: ${invalidResources.join(', ')}. Use /add to install package documentation, or select a configured resource.`
			);
			return;
		}

		const currentInput = inputState;
		await inputHistory.add(currentInput);

		setInputState([]);
		await messages.send(currentInput, validNewResources, parsed.question);
	};

	const closeWizard = () => {
		setActiveWizard('none');
		setCurrentWizardStep(null);
	};

	const handleCommandExecute = (command: Command) => {
		setInputState([]);
		switch (command.mode) {
			case 'connect':
				setActiveWizard('connect');
				setCurrentWizardStep('provider');
				break;
			case 'add-repo':
				setActiveWizard('add-repo');
				setCurrentWizardStep('type');
				break;
			case 'remove': {
				const value = '/remove ';
				setInputState([
					{ type: 'command', content: '/remove' },
					{ type: 'text', content: ' ' }
				]);
				queueMicrotask(() => {
					if (!inputRef) return;
					inputRef.setText(value);
					inputRef.editBuffer.setCursor(0, value.length);
					setCursorPosition(value.length);
				});
				break;
			}
			case 'clear':
				messages.clearMessages();
				messages.addSystemMessage('Chat cleared.');
				break;
			case 'resume':
				if (messages.isStreaming) {
					messages.addSystemMessage('Cannot resume while streaming.');
					return;
				}
				setActiveWizard('resume');
				break;
			case 'copy':
				void messages.copyLastMessage();
				break;
			case 'copy-all':
				void messages.copyAllMessages();
				break;
		}
	};

	const setInputFromHistory = (entry: InputState | null) => {
		if (entry === null) return;
		setInputState(entry);
		queueMicrotask(() => {
			if (!inputRef) return;
			inputRef.gotoBufferEnd();
			setCursorPosition(inputRef.cursorOffset);
		});
	};

	useKeyboard((key) => {
		if (key.name === 'escape') {
			if (messages.isStreaming) {
				if (messages.cancelState === 'none') {
					messages.requestCancel();
				} else {
					void messages.confirmCancel();
				}
				return;
			}
			if (isAnyWizardOpen) {
				closeWizard();
				return;
			}
			if (cursorIsCurrentlyIn === 'command' || cursorIsCurrentlyIn === 'mention') {
				setInputState([]);
			}
		}

		if (key.name === 'c' && key.ctrl) {
			if (inputState.length > 0) {
				setInputState([]);
				inputHistory.reset();
				setCursorPosition(0);
				if (inputRef) {
					inputRef.setText('');
					inputRef.cursorOffset = 0;
				}
			} else {
				globalThis.__BIOCONTEXT_SERVER__?.stop();
				renderer.destroy();
			}
		}

		if (
			key.name === 'up' &&
			!isAnyWizardOpen &&
			!messages.isStreaming &&
			shouldUseArrowHistory &&
			cursorIsCurrentlyIn !== 'command' &&
			(cursorIsCurrentlyIn !== 'mention' || isCurrentMentionResolved)
		) {
			const entry = inputHistory.navigateUp(inputState);
			setInputFromHistory(entry);
		}

		if (
			key.name === 'down' &&
			!isAnyWizardOpen &&
			!messages.isStreaming &&
			shouldUseArrowHistory &&
			cursorIsCurrentlyIn !== 'command' &&
			(cursorIsCurrentlyIn !== 'mention' || isCurrentMentionResolved)
		) {
			const entry = inputHistory.navigateDown();
			setInputFromHistory(entry);
		}
	});

	return (
		<>
			<MainInput
				inputState={inputState}
				setInputState={setInputState}
				cursorPosition={cursorPosition}
				setCursorPosition={setCursorPosition}
				inputRef={inputRef}
				setInputRef={setInputRef}
				focused={!isAnyWizardOpen && !messages.isStreaming}
				isStreaming={messages.isStreaming}
				cancelState={messages.cancelState}
				onSubmitRequest={() => {
					if (
						cursorIsCurrentlyIn === 'text' ||
						cursorIsCurrentlyIn === 'pasted' ||
						(cursorIsCurrentlyIn === 'mention' && isCurrentMentionResolved)
					) {
						void handleSubmit();
					}
				}}
			/>

			{cursorIsCurrentlyIn === 'mention' &&
			!isCurrentMentionResolved &&
			!isAnyWizardOpen &&
			!messages.isStreaming ? (
				<RepoMentionPalette
					inputState={inputState}
					setInputState={setInputState}
					inputRef={inputRef}
					cursorPosition={cursorPosition}
				/>
			) : null}

			{cursorIsCurrentlyIn === 'command' && !isAnyWizardOpen && !messages.isStreaming ? (
				<CommandPalette
					inputState={inputState}
					setInputState={setInputState}
					inputRef={inputRef}
					onExecute={handleCommandExecute}
				/>
			) : null}

			{activeWizard === 'connect' ? (
				<ConnectWizard onClose={closeWizard} onStepChange={setCurrentWizardStep} />
			) : null}

			{activeWizard === 'add-repo' ? (
				<AddResourceWizard
					onClose={closeWizard}
						onSelectBioconductor={() => {
						setActiveWizard('bioconductor');
						setCurrentWizardStep(null);
					}}
					onStepChange={setCurrentWizardStep}
				/>
			) : null}

			{activeWizard === 'bioconductor' ? <BioconductorPackageBrowser onClose={closeWizard} /> : null}

			{activeWizard === 'resume' ? (
				<ResumeThreadModal
					maxVisibleItems={maxResumeThreadItems}
					onClose={closeWizard}
					onSelect={async (threadId) => {
						await messages.resumeThread(threadId);
						closeWizard();
					}}
				/>
			) : null}

			<StatusBar
				cursorIn={cursorIsCurrentlyIn}
				isStreaming={messages.isStreaming}
				cancelState={messages.cancelState}
				threadResources={messages.threadResources}
				activeWizard={activeWizard}
				wizardStep={currentWizardStep}
			/>
		</>
	);
};
