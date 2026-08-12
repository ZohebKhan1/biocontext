import { Effect, Exit, ManagedRuntime } from 'effect';
import { makeServerLayer, makeServerServiceMap, type ServerLayerDependencies } from './layers.ts';

export interface ServerRuntime {
	runPromise: <A, E>(effect: Effect.Effect<A, E>) => Promise<A>;
	runPromiseExit: <A, E>(effect: Effect.Effect<A, E>) => Promise<Exit.Exit<A, E>>;
	services: () => Promise<ReturnType<typeof makeServerServiceMap>>;
	dispose: () => Promise<void>;
}

export const createServerRuntime = (dependencies: ServerLayerDependencies): ServerRuntime => {
	const runtime = ManagedRuntime.make(makeServerLayer(dependencies));
	return {
		runPromise: (effect) => runtime.runPromise(effect),
		runPromiseExit: (effect) => runtime.runPromiseExit(effect),
		services: () => runtime.services(),
		dispose: () => runtime.dispose()
	};
};
