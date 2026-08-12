import { colors } from './theme.ts';
import { Header } from './components/header.tsx';
import { InputSection } from './components/input-section.tsx';
import { Messages } from './components/messages.tsx';
import { useToast } from './context/toast-context.tsx';

const Toast = () => {
	const toast = useToast();
	if (!toast.message) return null;

	return (
		<box
			style={{
				position: 'absolute',
				top: 3,
				right: 2,
				backgroundColor: colors.bgRaised,
				border: true,
				borderColor: colors.accentBright,
				padding: 1,
				paddingLeft: 2,
				paddingRight: 2
			}}
		>
			<text fg={colors.text}>{toast.message}</text>
		</box>
	);
};

export const MainUi = (props: { heightPercent: `${number}%` }) => {
	return (
		<box
			width="100%"
			height={props.heightPercent}
			style={{
				flexDirection: 'column',
				backgroundColor: colors.bg
			}}
		>
			<Header />
			<Messages />
			<InputSection />
			<Toast />
		</box>
	);
};
