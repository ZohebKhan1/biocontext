import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { useRenderer } from '@opentui/react';
import type { PasteEvent, Selection } from '@opentui/core';

const useEffectEvent = <TArgs extends unknown[], TResult>(handler: (...args: TArgs) => TResult) => {
	const handlerRef = useRef(handler);
	useLayoutEffect(() => {
		handlerRef.current = handler;
	});
	return useCallback((...args: TArgs) => handlerRef.current(...args), []);
};

export const usePaste = (handler: (event: PasteEvent) => void) => {
	const renderer = useRenderer();
	const stableHandler = useEffectEvent(handler);

	useEffect(() => {
		renderer.keyInput.on('paste', stableHandler);
		return () => {
			renderer.keyInput.off('paste', stableHandler);
		};
	}, [renderer, stableHandler]);
};

export const useSelectionHandler = (handler: (selection: Selection) => void) => {
	const renderer = useRenderer();
	const stableHandler = useEffectEvent(handler);

	useEffect(() => {
		renderer.on('selection', stableHandler);
		return () => {
			renderer.off('selection', stableHandler);
		};
	}, [renderer, stableHandler]);
};
