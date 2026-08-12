import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
	type ReactNode
} from 'react';
import { Effect } from 'effect';
import type { ReasoningEffort } from '@biocontext/shared';
import { runCliEffect } from '../../effect/runtime.ts';
import type { RuntimeStatusResponse } from '../../client/index.ts';
import type { Repo } from '../types.ts';
import { services } from '../services.ts';

type ConfigState = {
	selectedModel: string;
	selectedProvider: string;
	selectedReasoningEffort?: ReasoningEffort;
	setModel: (model: string) => void;
	setProvider: (provider: string) => void;
	setReasoningEffort: (effort?: ReasoningEffort) => void;
	repos: Repo[];
	localBioconductorPackageNames: string[];
	localBioconductorPackageNamesLoading: boolean;
	refreshLocalBioconductorPackageNames: () => Promise<void>;
	runtimeStatus: RuntimeStatusResponse | null;
	refreshRuntimeStatus: () => Promise<void>;
	addRepo: (repo: Repo) => void;
	removeRepo: (name: string) => void;
	loading: boolean;
};

const ConfigContext = createContext<ConfigState | null>(null);

export const useConfigContext = () => {
	const context = useContext(ConfigContext);
	if (!context) throw new Error('useConfigContext must be used within ConfigProvider');
	return context;
};

const fetchInitialConfig = async () => {
	const [reposList, modelConfig] = await runCliEffect(
		Effect.all([
			Effect.tryPromise(() => services.getRepos()),
			Effect.tryPromise(() => services.getModel())
		])
	);
	return {
		repos: reposList,
		provider: modelConfig.provider,
		model: modelConfig.model,
		reasoningEffort: modelConfig.reasoningEffort
	};
};

export const ConfigProvider = (props: { children: ReactNode }) => {
	const [selectedModel, setSelectedModel] = useState('');
	const [selectedProvider, setSelectedProvider] = useState('');
	const [selectedReasoningEffort, setSelectedReasoningEffort] = useState<ReasoningEffort>();
	const [repos, setRepos] = useState<Repo[]>([]);
	const [localBioconductorPackageNames, setLocalBioconductorPackageNames] = useState<string[]>([]);
	const [localBioconductorPackageNamesLoading, setLocalBioconductorPackageNamesLoading] = useState(true);
	const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatusResponse | null>(null);
	const [loading, setLoading] = useState(true);

	const mountedRef = useRef(true);
	useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
		};
	}, []);

	const refreshRuntimeStatus = useCallback(async () => {
		const response = await services.getRuntimeStatus().catch(() => null);
		if (mountedRef.current && response) setRuntimeStatus(response);
	}, []);

	useEffect(() => {
		void refreshRuntimeStatus();
	}, [refreshRuntimeStatus]);

	const refreshLocalBioconductorPackageNames = useCallback(async () => {
		const response = await services.getLocalBioconductorPackageNames().catch(() => null);
		if (!mountedRef.current) return;
		if (response) setLocalBioconductorPackageNames(response.packages);
		setLocalBioconductorPackageNamesLoading(false);
	}, []);

	useEffect(() => {
		void refreshLocalBioconductorPackageNames();
	}, [refreshLocalBioconductorPackageNames]);

	useEffect(() => {
		const bootstrapState = runtimeStatus?.defaultBioconductorPackages?.state;
		if (bootstrapState !== 'idle' && bootstrapState !== 'running') return;

		const interval = setInterval(() => {
			void refreshRuntimeStatus();
			void refreshLocalBioconductorPackageNames();
		}, 1500);
		return () => clearInterval(interval);
	}, [
		refreshLocalBioconductorPackageNames,
		refreshRuntimeStatus,
		runtimeStatus?.defaultBioconductorPackages?.state
	]);

	useEffect(() => {
		void (async () => {
			setLoading(true);
			const config = await fetchInitialConfig().catch(() => null);
			if (!mountedRef.current) return;
			if (config) {
				setSelectedModel(config.model);
				setSelectedProvider(config.provider);
				setSelectedReasoningEffort(config.reasoningEffort);
				setRepos(config.repos);
			}
			setLoading(false);
		})();
	}, []);

	const addRepo = useCallback(
		(repo: Repo) =>
			setRepos((prev) => {
				const index = prev.findIndex((item) => item.name.toLowerCase() === repo.name.toLowerCase());
				if (index < 0) return [...prev, repo];
				return prev.map((item, itemIndex) => (itemIndex === index ? repo : item));
			}),
		[]
	);
	const removeRepo = useCallback(
		(name: string) => setRepos((prev) => prev.filter((r) => r.name !== name)),
		[]
	);

	const state = useMemo<ConfigState>(
		() => ({
			selectedModel,
			selectedProvider,
			selectedReasoningEffort,
			setModel: setSelectedModel,
			setProvider: setSelectedProvider,
			setReasoningEffort: setSelectedReasoningEffort,
			repos,
			localBioconductorPackageNames,
			localBioconductorPackageNamesLoading,
			refreshLocalBioconductorPackageNames,
			runtimeStatus,
			refreshRuntimeStatus,
			addRepo,
			removeRepo,
			loading
		}),
		[
			selectedModel,
			selectedProvider,
			selectedReasoningEffort,
			repos,
			localBioconductorPackageNames,
			localBioconductorPackageNamesLoading,
			refreshLocalBioconductorPackageNames,
			runtimeStatus,
			refreshRuntimeStatus,
			addRepo,
			removeRepo,
			loading
		]
	);

	return <ConfigContext.Provider value={state}>{props.children}</ConfigContext.Provider>;
};
