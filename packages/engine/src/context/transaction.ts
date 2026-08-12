import { metricsError, metricsErrorInfo, metricsInfo } from '../metrics/index.ts';
import { requireContext } from './index.ts';

export const runTransaction = async <T>(name: string, fn: () => Promise<T>): Promise<T> => {
	const store = requireContext();
	const depth = store.txDepth;
	store.txDepth = depth + 1;

	const start = performance.now();
	metricsInfo('tx.start', { name, depth });
	try {
		const value = await fn();
		metricsInfo('tx.commit', { name, depth, ms: Math.round(performance.now() - start) });
		return value;
	} catch (cause) {
		metricsError('tx.rollback', {
			name,
			depth,
			ms: Math.round(performance.now() - start),
			error: metricsErrorInfo(cause)
		});
		throw cause;
	} finally {
		store.txDepth = depth;
	}
};
