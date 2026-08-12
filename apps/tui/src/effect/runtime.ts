import { Effect, Exit, Layer, ManagedRuntime } from 'effect';

const RuntimeLayer = Layer.empty;

export interface CliRuntime {
	runPromise: <A, E>(effect: Effect.Effect<A, E>) => Promise<A>;
	runPromiseExit: <A, E>(effect: Effect.Effect<A, E>) => Promise<Exit.Exit<A, E>>;
	dispose: () => Promise<void>;
}

export const createCliRuntime = (): CliRuntime => {
	const runtime = ManagedRuntime.make(RuntimeLayer);
	return {
		runPromise: (effect) => runtime.runPromise(effect),
		runPromiseExit: (effect) => runtime.runPromiseExit(effect),
		dispose: () => runtime.dispose()
	};
};

const defaultCliRuntime = createCliRuntime();

export const runCliEffect = <A, E>(effect: Effect.Effect<A, E>) =>
	defaultCliRuntime.runPromise(effect);
