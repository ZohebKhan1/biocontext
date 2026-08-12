import {
	createContext,
	useCallback,
	useContext,
	useMemo,
	useRef,
	useState,
	type ReactNode
} from 'react';

type ToastState = {
	message: string | null;
	show: (message: string, durationMs?: number) => void;
};

const ToastContext = createContext<ToastState | null>(null);

export const useToast = () => {
	const context = useContext(ToastContext);
	if (!context) throw new Error('useToast must be used within ToastProvider');
	return context;
};

export const ToastProvider = (props: { children: ReactNode }) => {
	const [message, setMessage] = useState<string | null>(null);
	const timeoutIdRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const show = useCallback((msg: string, durationMs = 1500) => {
		if (timeoutIdRef.current) {
			clearTimeout(timeoutIdRef.current);
		}
		setMessage(msg);
		timeoutIdRef.current = setTimeout(() => {
			setMessage(null);
			timeoutIdRef.current = null;
		}, durationMs);
	}, []);

	const value = useMemo(() => ({ message, show }), [message, show]);
	return <ToastContext.Provider value={value}>{props.children}</ToastContext.Provider>;
};
