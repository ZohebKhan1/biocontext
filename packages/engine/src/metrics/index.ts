import { requestId } from '../context/index.ts';
import { getErrorMessage, getErrorTag } from '../errors.ts';

type LogLevel = 'info' | 'error';

let quietMode = false;

export type MetricsFields = Record<string, unknown>;

export const setQuietMetrics = (quiet: boolean) => {
	quietMode = quiet;
};

export const isMetricsQuiet = () => quietMode;

export const metricsErrorInfo = (cause: unknown) => ({
	tag: getErrorTag(cause),
	message: getErrorMessage(cause)
});

const emitMetrics = (level: LogLevel, event: string, fields?: MetricsFields) => {
	if (quietMode) return;

	const payload = {
		ts: new Date().toISOString(),
		level,
		event,
		requestId: requestId(),
		...fields
	};
	const line = JSON.stringify(payload);
	if (level === 'error') console.error(line);
	else console.log(line);
};

export const metricsInfo = (event: string, fields?: MetricsFields) =>
	emitMetrics('info', event, fields);
export const metricsError = (event: string, fields?: MetricsFields) =>
	emitMetrics('error', event, fields);

export const withMetricsSpan = async <T>(
	name: string,
	fn: () => Promise<T>,
	fields?: MetricsFields
): Promise<T> => {
	const start = performance.now();
	try {
		const value = await fn();
		const ms = Math.round(performance.now() - start);
		metricsInfo('span.ok', { name, ms, ...fields });
		return value;
	} catch (errorCause) {
		const ms = Math.round(performance.now() - start);
		metricsError('span.err', { name, ms, ...fields, error: metricsErrorInfo(errorCause) });
		throw errorCause;
	}
};
