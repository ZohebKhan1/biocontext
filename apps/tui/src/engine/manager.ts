import { startServer } from '@biocontext/engine';
import { Effect } from 'effect';

export interface ServerManager {
	url: string;
	stop: () => void;
}

export interface EnsureServerOptions {
	serverUrl?: string;
	port?: number;
	timeout?: number;
	quiet?: boolean;
}

const DEFAULT_TIMEOUT = 10000;

const waitForHealthEffect = (url: string, timeout: number): Effect.Effect<void, unknown, never> =>
	Effect.gen(function* () {
		const startTime = Date.now();
		const pollInterval = 100;

		while (Date.now() - startTime < timeout) {
			const isHealthy = yield* Effect.tryPromise({
				try: async () => {
					const response = await fetch(`${url}/`);
					if (!response.ok) return false;
					const data = (await response.json()) as { ok?: boolean };
					return Boolean(data.ok);
				},
				catch: () => false
			});
			if (isHealthy) return;
			yield* Effect.tryPromise(() => Bun.sleep(pollInterval));
		}

		return yield* Effect.fail(new Error(`Server failed to start within ${timeout}ms`));
	});

/**
 * Ensure the embedded retrieval service is available.
 *
 * If serverUrl is provided, uses that server (just health checks it).
 * Otherwise, starts the server in-process.
 */
export const ensureServerEffect = (
	options: EnsureServerOptions = {}
): Effect.Effect<ServerManager, unknown, never> =>
	Effect.gen(function* () {
		const { serverUrl, timeout = DEFAULT_TIMEOUT } = options;

		if (serverUrl) {
			yield* waitForHealthEffect(serverUrl, timeout);
			return {
				url: serverUrl,
				stop: () => {
					// External server, nothing to stop
				}
			};
		}

		const port = options.port ?? 0;
		const quiet = options.quiet ?? true;
		const server = yield* Effect.tryPromise({
			try: () => startServer({ port, quiet }),
			catch: (error) => new Error(`Failed to start server: ${error}`)
		});

		return {
			url: server.url,
			stop: () => server.stop()
		};
	});

export const ensureServer = (options: EnsureServerOptions = {}) =>
	Effect.runPromise(ensureServerEffect(options));

export const withServerEffect = <A>(
	options: EnsureServerOptions,
	use: (server: ServerManager) => Effect.Effect<A, unknown, never>
): Effect.Effect<A, unknown, never> =>
	Effect.acquireUseRelease(ensureServerEffect(options), use, (server) =>
		Effect.sync(() => server.stop())
	);
