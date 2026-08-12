let focusMainInputHandler: (() => void) | null = null;

export const registerMainInputFocusHandler = (handler: (() => void) | null) => {
	focusMainInputHandler = handler;
};

export const focusMainInput = () => {
	focusMainInputHandler?.();
};
