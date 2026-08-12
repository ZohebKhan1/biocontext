import { colors } from '../theme.ts';
import { useConfigContext } from '../context/config-context.tsx';
import { formatModelRoute } from '../lib/startup-summary.ts';
import { getConnectionIndicatorState } from '../lib/connection-status.ts';

export const Header = () => {
	const config = useConfigContext();
	const provider = config.selectedProvider || config.runtimeStatus?.provider;
	const model = config.selectedModel || config.runtimeStatus?.model;
	const reasoningEffort = config.selectedReasoningEffort ?? config.runtimeStatus?.reasoningEffort;
	const connectionState = getConnectionIndicatorState({
		provider,
		model,
		reasoningEffort,
		runtimeStatus: config.runtimeStatus
	});
	const connectionColor =
		connectionState === 'ready'
			? colors.success
			: connectionState === 'error'
				? colors.error
				: colors.textFaint;

	return (
		<box
			style={{
				height: 3,
				width: '100%',
				backgroundColor: colors.bgSubtle,
				border: true,
				borderColor: colors.borderSubtle,
				flexDirection: 'row',
				justifyContent: 'space-between',
				alignItems: 'center',
				paddingLeft: 2,
				paddingRight: 2
			}}
		>
			<text>
				<span
					style={{
						fg: colors.accentBright
					}}
				>
					{'◆'}
				</span>
				<span
					style={{
						fg: colors.text
					}}
				>
					{' biocontext'}
				</span>
				<span
					style={{
						fg: colors.textMuted
					}}
				>
					{' - Bioconductor package research'}
				</span>
			</text>
			<text>
				<span style={{ fg: connectionColor }}>{'●'}</span>
				<span style={{ fg: colors.textMuted }}>
					{` ${formatModelRoute({ provider, model, reasoningEffort })}`}
				</span>
			</text>
		</box>
	);
};
