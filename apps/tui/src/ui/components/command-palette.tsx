import { useEffect, useMemo, useState } from 'react';
import type { TextareaRenderable } from '@opentui/core';
import { useKeyboard } from '@opentui/react';

import { COMMANDS, filterCommands } from '../commands.ts';
import { colors } from '../theme.ts';
import type { Command, InputState } from '../types.ts';

interface CommandPaletteProps {
	inputState: InputState;
	setInputState: (next: InputState | ((prev: InputState) => InputState)) => void;
	inputRef: TextareaRenderable | null;
	onExecute: (command: Command) => void;
}

export const CommandPalette = (props: CommandPaletteProps) => {
	const input = props.inputState[0]?.content;
	const trimmedInput = input?.toLowerCase().trim().slice(1) ?? '';

	const filteredCommands = useMemo(() => {
		if (!input) return COMMANDS;
		return filterCommands(trimmedInput);
	}, [input]);

	const [selectedIndex, setSelectedIndex] = useState(0);
	const getDisplayLabel = (cmd: Command) => {
		const isAliasMatch = cmd.alias?.toLowerCase().startsWith(trimmedInput);
		return isAliasMatch ? `/${cmd.name} (${cmd.alias})` : `/${cmd.name}`;
	};

	useEffect(() => {
		setSelectedIndex((prev) => {
			if (filteredCommands.length === 0) return 0;
			if (prev >= filteredCommands.length) return filteredCommands.length - 1;
			return prev < 0 ? 0 : prev;
		});
	}, [filteredCommands.length]);

	useKeyboard((key) => {
		switch (key.name) {
			case 'up':
				setSelectedIndex((prev) => (prev > 0 ? prev - 1 : filteredCommands.length - 1));
				break;
			case 'down':
				setSelectedIndex((prev) => (prev < filteredCommands.length - 1 ? prev + 1 : 0));
				break;
			case 'tab': {
				const curSelectedCommand = filteredCommands[selectedIndex];
				if (curSelectedCommand) {
					props.setInputState([{ content: '/' + curSelectedCommand.name, type: 'command' }]);
					const inputRef = props.inputRef;
					if (inputRef) {
						const newText = '/' + curSelectedCommand.name;
						inputRef.setText(newText);
						inputRef.editBuffer.setCursor(0, newText.length);
					}
				}
				break;
			}
			case 'return': {
				const selectedCommand = filteredCommands[selectedIndex];
				if (selectedCommand) {
					props.onExecute(selectedCommand);
				}
				break;
			}
			case 'escape':
				props.setInputState([]);
				break;
			default:
				break;
		}
	});

	if (filteredCommands.length === 0) {
		return (
			<box
				style={{
					position: 'absolute',
					bottom: 4,
					left: 0,
					width: '100%',
					zIndex: 100,
					backgroundColor: colors.bgRaised,
					border: true,
					borderColor: colors.border,
					padding: 1
				}}
			>
				<text fg={colors.textSubtle} content="No matching commands" />
			</box>
		);
	}

	return (
		<box
			style={{
				position: 'absolute',
				bottom: 4,
				left: 0,
				width: '100%',
				zIndex: 100,
				backgroundColor: colors.bgRaised,
				border: true,
				borderColor: colors.accent,
				flexDirection: 'column',
				padding: 1
			}}
		>
			<text fg={colors.accentBright} content=" Commands" />
			<text content="" style={{ height: 1 }} />
			{filteredCommands.map((cmd, i) => {
				const isSelected = i === selectedIndex;
				return (
					<box key={cmd.name} style={{ flexDirection: 'row' }}>
						<text
							fg={isSelected ? colors.accent : colors.text}
							content={isSelected ? `▸ ${getDisplayLabel(cmd)}` : `  ${getDisplayLabel(cmd)}`}
							style={{ width: 24 }}
						/>
						<text fg={colors.textMuted} content={` ${cmd.description}`} />
					</box>
				);
			})}
		</box>
	);
};
