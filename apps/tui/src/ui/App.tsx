import { useEffect, useState } from 'react';
import { createRoot, useKeyboard, useRenderer } from '@opentui/react';
import { ConsolePosition, addDefaultParsers, createCliRenderer } from '@opentui/core';

import { copyToClipboard } from './clipboard.ts';
import { MainUi } from './index.tsx';
import { ConfigProvider } from './context/config-context.tsx';
import { MessagesProvider } from './context/messages-context.tsx';
import { ToastProvider, useToast } from './context/toast-context.tsx';
import { focusMainInput } from './focus-registry.ts';
import { useSelectionHandler } from './opentui-hooks.ts';
import { parsers } from './parsers-config.ts';

addDefaultParsers(parsers);

const App = () => {
	const renderer = useRenderer();
	const toast = useToast();

	const [heightPercent, setHeightPercent] = useState<`${number}%`>('100%');

	useSelectionHandler((selection) => {
		const text = selection.getSelectedText();
		if (text && text.length > 0) {
			void copyToClipboard(text);
			toast.show('Copied to clipboard');
		}
	});

	useKeyboard((key) => {
		// Debug console toggle
		if (key.raw === '\x00') {
			if (heightPercent === '100%') {
				setHeightPercent('80%');
				renderer.console.show();
			} else {
				setHeightPercent('100%');
				renderer.console.hide();
			}
			return;
		}

		// Ctrl+Q to quit
		if (key.name === 'q' && key.ctrl) {
			globalThis.__BIOCONTEXT_SERVER__?.stop();
			renderer.destroy();
			return;
		}
	});

	useEffect(() => {
		const handleMouseInput = (sequence: string) => {
			if (!sequence.startsWith('\x1b[<')) return false;
			focusMainInput();
			return false;
		};

		renderer.prependInputHandler(handleMouseInput);
		return () => {
			renderer.removeInputHandler(handleMouseInput);
		};
	}, [renderer]);

	return <MainUi heightPercent={heightPercent} />;
};

const renderer = await createCliRenderer({
	targetFps: 30,
	consoleOptions: {
		position: ConsolePosition.BOTTOM,
		sizePercent: 20,
		maxStoredLogs: 500
	},
	exitOnCtrlC: false
});

createRoot(renderer).render(
	<ConfigProvider>
		<MessagesProvider>
			<ToastProvider>
				<App />
			</ToastProvider>
		</MessagesProvider>
	</ConfigProvider>
);
