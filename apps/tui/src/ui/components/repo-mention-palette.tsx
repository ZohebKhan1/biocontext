import { useEffect, useMemo, useState } from 'react';
import type { TextareaRenderable } from '@opentui/core';
import { useKeyboard } from '@opentui/react';

import { useConfigContext } from '../context/config-context.tsx';
import { buildMentionCandidates, filterMentionCandidates } from '../lib/mention-candidates.ts';
import { colors } from '../theme.ts';
import type { InputState } from '../types.ts';

interface RepoMentionPaletteProps {
	inputState: InputState;
	setInputState: (next: InputState | ((prev: InputState) => InputState)) => void;
	inputRef: TextareaRenderable | null;
	cursorPosition: number;
}

export const RepoMentionPalette = (props: RepoMentionPaletteProps) => {
	const config = useConfigContext();

	const [selectedIndex, setSelectedIndex] = useState(0);
	const maxVisible = 8;

	const getDisplayLength = (item: InputState[number]) =>
		item.type === 'pasted' ? `[~${item.lines} lines]`.length : item.content.length;

	const curInputIdx = () => {
		const currentInputIndex = props.cursorPosition;
		let curIdx = 0;
		let totalLength = 0;
		while (curIdx < props.inputState.length) {
			const curItem = props.inputState[curIdx]!;
			const maxIdx = totalLength + getDisplayLength(curItem);
			if (currentInputIndex >= totalLength && currentInputIndex <= maxIdx) {
				break;
			}
			totalLength = maxIdx;
			curIdx++;
		}
		return curIdx;
	};

	const currentMention = props.inputState[curInputIdx()]?.content ?? '';
	const filteredCandidates = useMemo(
		() =>
			filterMentionCandidates(
				buildMentionCandidates(config.repos, config.localBioconductorPackageNames),
				currentMention
			),
		[config.repos, config.localBioconductorPackageNames, currentMention]
	);

	useEffect(() => {
		setSelectedIndex(0);
	}, [currentMention]);

	useEffect(() => {
		setSelectedIndex((prev) => {
			if (filteredCandidates.length === 0) return 0;
			if (prev >= filteredCandidates.length) return filteredCandidates.length - 1;
			return prev < 0 ? 0 : prev;
		});
	}, [filteredCandidates.length]);

	const visibleRange = useMemo(() => {
		const start = Math.max(
			0,
			Math.min(selectedIndex - Math.floor(maxVisible / 2), filteredCandidates.length - maxVisible)
		);
		return {
			start,
			candidates: filteredCandidates.slice(start, start + maxVisible)
		};
	}, [selectedIndex, filteredCandidates]);

	const selectRepo = () => {
		const selectedCandidate = filteredCandidates[selectedIndex];
		if (!selectedCandidate) return;

		const idx = curInputIdx();
		const currentState = props.inputState;
		const newContent = '@' + selectedCandidate.name + ' ';
		const next: InputState = [
			...currentState.slice(0, idx),
			{ content: newContent, type: 'mention' as const },
			...currentState.slice(idx + 1)
		];
		props.setInputState(next);

		const inputRef = props.inputRef;
		if (!inputRef) return;

		let newCursorPos = 0;
		for (let i = 0; i <= idx; i++) {
			newCursorPos += i === idx ? newContent.length : getDisplayLength(currentState[i]!);
		}

		const newText = next
			.map((p) => (p.type === 'pasted' ? `[~${p.lines} lines]` : p.content))
			.join('');
		inputRef.setText(newText);
		inputRef.cursorOffset = newCursorPos;
	};

	useKeyboard((key) => {
		if (filteredCandidates.length === 0) return;
		switch (key.name) {
			case 'up':
				setSelectedIndex((prev) => (prev > 0 ? prev - 1 : filteredCandidates.length - 1));
				break;
			case 'down':
				setSelectedIndex((prev) => (prev < filteredCandidates.length - 1 ? prev + 1 : 0));
				break;
			case 'tab':
				selectRepo();
				break;
			case 'return':
				selectRepo();
				break;
			default:
				break;
		}
	});

	return (
		<box
			style={{
				position: 'absolute',
				bottom: 5,
				left: 1,
				width: 44,
				backgroundColor: colors.bgRaised,
				border: true,
				borderColor: colors.accent,
				flexDirection: 'column',
				padding: 1
			}}
		>
			<text
				fg={colors.accentBright}
				content={
					config.localBioconductorPackageNamesLoading
						? ' Select scope (loading local packages):'
						: filteredCandidates.length === 0
							? ' No local match. Use /add to install package documentation.'
							: ' Select local resource or package:'
				}
			/>
			{visibleRange.candidates.map((candidate, i) => {
				const actualIndex = visibleRange.start + i;
				const isSelected = actualIndex === selectedIndex;
				const label = `@${candidate.name}  ${candidate.kind}`;
				return (
					<text
						key={`${candidate.kind}:${candidate.name}`}
						fg={isSelected ? colors.accent : colors.text}
						content={isSelected ? `▸ ${label}` : `  ${label}`}
					/>
				);
			})}
		</box>
	);
};
