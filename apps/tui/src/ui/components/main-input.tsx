import { useEffect, useRef, useState } from 'react';
import type { KeyEvent, TextareaRenderable } from '@opentui/core';
import { useRenderer, useTerminalDimensions } from '@opentui/react';

import { usePaste } from '../opentui-hooks.ts';
import { colors, getColor } from '../theme.ts';
import type { CancelState, InputState } from '../types.ts';
import { registerMainInputFocusHandler } from '../focus-registry.ts';
import { parseTextSegment } from '../../lib/resource-references.ts';

interface MainInputProps {
	inputState: InputState;
	setInputState: (next: InputState | ((prev: InputState) => InputState)) => void;
	cursorPosition: number;
	setCursorPosition: (next: number | ((prev: number) => number)) => void;
	inputRef: TextareaRenderable | null;
	setInputRef: (ref: TextareaRenderable | null) => void;
	focused: boolean;
	isStreaming: boolean;
	cancelState: CancelState;
	onSubmitRequest: () => void;
}

export const MainInput = (props: MainInputProps) => {
	const renderer = useRenderer();
	const terminalDimensions = useTerminalDimensions();
	const textareaRef = useRef<TextareaRenderable | null>(null);
	const ignoredContentChangeCountRef = useRef(0);
	const pendingPasteCursorSyncRef = useRef(false);

	const [displayValue, setDisplayValue] = useState('');

	const getPasteDisplay = (lines: number) => `[~${lines} lines]`;

	const getValue = () =>
		props.inputState
			.map((p) => (p.type === 'pasted' ? getPasteDisplay(p.lines) : p.content))
			.join('');

	const value = getValue();

	const isEmpty = () => value.length === 0;

	const focusInput = () => {
		const ref = textareaRef.current;
		if (!ref || !props.focused) return;
		ref.focus();
	};

	const syncCursorFromRef = () => {
		const ref = textareaRef.current;
		if (!ref) return;
		props.setCursorPosition(ref.cursorOffset);
	};

	const getPlaceholder = () => {
		if (props.isStreaming && props.cancelState === 'pending') {
			return 'confirm with esc to cancel';
		}
		if (props.isStreaming) {
			return 'press esc to cancel';
		}
		return 'Ask a Bioconductor question... or / for commands';
	};

	const getPartValueLength = (p: InputState[number]) =>
		p.type === 'pasted' ? getPasteDisplay(p.lines).length : p.content.length;

	const getAvailableWidth = () => {
		const width = terminalDimensions.width;
		return Math.max(1, width - 4);
	};

	const getLineCount = (raw: string) => {
		const availableWidth = getAvailableWidth();
		if (raw.length === 0) return 1;
		return raw
			.split('\n')
			.map((line) => Math.max(1, Math.ceil(line.length / availableWidth)))
			.reduce((sum, lineCount) => sum + lineCount, 0);
	};

	const getMaxVisibleLineCount = () => {
		const byRatio = Math.floor(terminalDimensions.height * 0.25);
		const byScreen = Math.max(3, terminalDimensions.height - 10);
		return Math.max(3, Math.min(12, byRatio, byScreen));
	};

	const lineCount = getLineCount(value);
	const maxVisibleLineCount = getMaxVisibleLineCount();
	const visibleLineCount = Math.min(lineCount, maxVisibleLineCount);
	const isOverflowing = lineCount > maxVisibleLineCount;
	const getBoxHeight = () => visibleLineCount + 2;

	const setTextProgrammatically = (ref: TextareaRenderable, value: string) => {
		ignoredContentChangeCountRef.current += 1;
		ref.setText(value);
	};

	useEffect(() => {
		setDisplayValue(value);
		const ref = textareaRef.current;
		if (ref && ref.plainText !== value) {
			setTextProgrammatically(ref, value);
		}
	}, [value]);

	useEffect(() => {
		if (props.focused) {
			focusInput();
			syncCursorFromRef();
		} else {
			textareaRef.current?.blur();
		}
	}, [props.focused]);

	useEffect(() => {
		const handleFocus = () => {
			focusInput();
			syncCursorFromRef();
		};

		renderer.on('focus', handleFocus);

		return () => {
			renderer.off('focus', handleFocus);
		};
	}, [props.focused, renderer]);

	useEffect(() => {
		const focusFromGlobalClick = () => {
			const ref = textareaRef.current;
			if (!ref) return;
			ref.focus();
		};

		registerMainInputFocusHandler(focusFromGlobalClick);
		return () => {
			registerMainInputFocusHandler(null);
		};
	}, []);

	usePaste((event) => {
		if (!props.focused) return;
		const lines = event.text.split('\n').length;
		pendingPasteCursorSyncRef.current = true;
		props.setInputState((prev) => [
			...prev,
			{ type: 'pasted' as const, content: event.text, lines }
		]);
	});

	useEffect(() => {
		if (!pendingPasteCursorSyncRef.current) return;
		pendingPasteCursorSyncRef.current = false;
		const ref = textareaRef.current;
		if (!ref) return;
		ref.gotoBufferEnd();
		props.setCursorPosition(ref.cursorOffset);
	}, [props.inputState]);

	function handleContentChange(newValue: string) {
		if (ignoredContentChangeCountRef.current > 0) {
			ignoredContentChangeCountRef.current -= 1;
			return;
		}
		setDisplayValue(newValue);
		const pastedBlocks = props.inputState.filter((p) => p.type === 'pasted');

		if (pastedBlocks.length === 0) {
			props.setInputState(parseTextSegment(newValue));
			return;
		}

		const result: InputState = [];
		let remaining = newValue;

		for (const block of pastedBlocks) {
			const display = getPasteDisplay(block.lines);
			const idx = remaining.indexOf(display);

			if (idx === -1) continue;

			const before = remaining.slice(0, idx);
			if (before) result.push(...parseTextSegment(before));
			result.push(block);
			remaining = remaining.slice(idx + display.length);
		}

		if (remaining) {
			result.push(...parseTextSegment(remaining));
		}

		props.setInputState(result);
	}

	function handleKeyDown(event: KeyEvent) {
		const inTmux = Boolean(process.env.TMUX);
		const isEnterEvent = event.name === 'return' || event.name === 'linefeed';
		const isSubmitChord = isEnterEvent && (event.ctrl || event.meta);
		const isPlainEnter =
			event.name === 'return' &&
			!event.shift &&
			!event.ctrl &&
			!event.meta &&
			!event.option &&
			!event.super &&
			!event.hyper;

		if (isEnterEvent) {
			if (isSubmitChord) {
				event.preventDefault();
				event.stopPropagation();
				props.onSubmitRequest();
				return;
			}

			if (inTmux) {
				// In tmux, keep Ctrl+J/linefeed as a deterministic newline path.
				if (event.name === 'linefeed') return;
				if (!isPlainEnter) return;
			} else if (!isPlainEnter) {
				return;
			}

			event.preventDefault();
			event.stopPropagation();
			props.onSubmitRequest();
			return;
		}

		if (event.name === 'backspace') {
			const ref = textareaRef.current;
			if (!ref) return;
			const absolutePos = ref.cursorOffset;

			let offset = 0;
			for (let i = 0; i < props.inputState.length; i++) {
				const part = props.inputState[i]!;
				const valueLen = getPartValueLength(part);

				if (absolutePos <= offset + valueLen) {
					if (part.type === 'pasted') {
						event.preventDefault();
						const next = [...props.inputState.slice(0, i), ...props.inputState.slice(i + 1)];
						props.setInputState(next);

						const newValue = next
							.map((p) => (p.type === 'pasted' ? getPasteDisplay(p.lines) : p.content))
							.join('');
						setTextProgrammatically(ref, newValue);

						ref.cursorOffset = offset;
						props.setCursorPosition(ref.cursorOffset);
						return;
					}
					break;
				}
				offset += valueLen;
			}
		}

		queueMicrotask(() => {
			const ref = textareaRef.current;
			if (!ref) return;
			props.setCursorPosition(ref.cursorOffset);
		});
	}

	return (
		<box
			style={{
				border: true,
				borderColor: props.focused ? colors.accent : colors.borderSubtle,
				backgroundColor: colors.bgInput,
				height: getBoxHeight(),
				width: '100%'
			}}
		>
			{!isOverflowing ? (
				<text
					style={{
						position: 'absolute',
						top: 0,
						left: 0,
						width: '100%',
						height: visibleLineCount,
						zIndex: 2,
						paddingLeft: 1,
						paddingRight: 1
					}}
					wrapMode="char"
					onMouseDown={(e) => {
						const ref = textareaRef.current;
						if (!ref) return;
						ref.focus();
						const availableWidth = getAvailableWidth();
						const row = e.y;
						const col = e.x - 1;
						const pos = row * availableWidth + col;
						const clampedPos = Math.min(pos, value.length);
						ref.cursorOffset = clampedPos;
						queueMicrotask(() => {
							props.setCursorPosition(clampedPos);
						});
					}}
				>
					{isEmpty() ? (
						<span style={{ fg: colors.textSubtle }}>{getPlaceholder()}</span>
					) : (
						props.inputState.map((part, i) =>
							part.type === 'pasted' ? (
								<span key={i} style={{ fg: colors.bg, bg: colors.accent }}>
									{`[~${part.lines} lines]`}
								</span>
							) : (
								<span key={i} style={{ fg: getColor(part.type) }}>
									{part.content}
								</span>
							)
						)
					)}
				</text>
			) : null}

			<textarea
				id="main-input"
				ref={(r: TextareaRenderable) => {
					textareaRef.current = r;
					props.setInputRef(r);
				}}
				initialValue=""
				wrapMode="char"
				placeholder={isOverflowing ? getPlaceholder() : null}
				focused={props.focused}
				onContentChange={() => {
					const ref = textareaRef.current;
					if (ref) {
						handleContentChange(ref.plainText);
					}
				}}
				onKeyDown={handleKeyDown}
				onCursorChange={() => {
					syncCursorFromRef();
				}}
				textColor={isOverflowing ? colors.text : 'transparent'}
				backgroundColor="transparent"
				focusedBackgroundColor="transparent"
				focusedTextColor={isOverflowing ? colors.text : 'transparent'}
				cursorColor={colors.accentBright}
				scrollMargin={1}
				scrollSpeed={2}
				style={{
					position: 'absolute',
					top: 0,
					left: 0,
					width: '100%',
					height: visibleLineCount,
					minHeight: 1,
					zIndex: isOverflowing ? 2 : 1,
					paddingLeft: 1,
					paddingRight: 1
				}}
			/>
		</box>
	);
};
