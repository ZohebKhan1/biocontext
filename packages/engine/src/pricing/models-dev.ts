type ModelsDevCost = {
	input?: number;
	output?: number;
	reasoning?: number;
	cache_read?: number;
	cache_write?: number;
};

type ModelsDevModel = {
	id?: string;
	cost?: ModelsDevCost;
};

type ModelsDevApi = Record<string, { models?: Record<string, ModelsDevModel> }>;

const MODELS_DEV_URL = 'https://models.dev/api.json';

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number) => {
	const timeout = (async () => {
		await sleep(timeoutMs);
		throw new Error('timeout');
	})();
	return Promise.race([promise, timeout]);
};

const safeNumber = (value: unknown) =>
	typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const toRates = (cost: ModelsDevCost | undefined) => ({
	input: safeNumber(cost?.input),
	output: safeNumber(cost?.output),
	reasoning: safeNumber(cost?.reasoning),
	cacheRead: safeNumber(cost?.cache_read),
	cacheWrite: safeNumber(cost?.cache_write)
});

const hasAnyRate = (rates: ReturnType<typeof toRates>) =>
	rates.input != null ||
	rates.output != null ||
	rates.reasoning != null ||
	rates.cacheRead != null ||
	rates.cacheWrite != null;

export type RatesUsdPerMTokens = {
	input?: number;
	output?: number;
	reasoning?: number;
	cacheRead?: number;
	cacheWrite?: number;
};

export type Pricing = {
	source: 'models.dev';
	modelKey: string;
	ratesUsdPerMTokens: RatesUsdPerMTokens;
};

export type ModelsDevPricingService = {
	prefetch: () => void;
	lookup: (args: {
		providerId: string;
		modelId: string;
		timeoutMs?: number;
	}) => Promise<Pricing | null>;
};

type PricingIndex = {
	byProviderAndModel: Map<string, Pricing>;
	byId: Map<string, Pricing>;
};

const buildPricingIndex = (api: ModelsDevApi): PricingIndex => {
	const byProviderAndModel = new Map<string, Pricing>();
	const byId = new Map<string, Pricing>();

	for (const [providerKey, provider] of Object.entries(api)) {
		const models = provider.models ?? {};
		for (const [modelKey, model] of Object.entries(models)) {
			const ratesUsdPerMTokens = toRates(model.cost);
			if (!hasAnyRate(ratesUsdPerMTokens)) continue;

			const pricing: Pricing = {
				source: 'models.dev',
				modelKey: (typeof model.id === 'string' && model.id.trim().length > 0
					? model.id
					: modelKey
				).trim(),
				ratesUsdPerMTokens
			};

			byProviderAndModel.set(`${providerKey}\0${modelKey}`, pricing);
			if (!byId.has(modelKey)) byId.set(modelKey, pricing);
			if (typeof model.id === 'string' && model.id.trim().length > 0 && !byId.has(model.id)) {
				byId.set(model.id, pricing);
			}
			if (!byId.has(`${providerKey}/${modelKey}`)) byId.set(`${providerKey}/${modelKey}`, pricing);
		}
	}

	return { byProviderAndModel, byId };
};

export const createModelsDevPricing = (
	args: { ttlMs?: number; url?: string } = {}
): ModelsDevPricingService => {
	const ttlMs = args.ttlMs ?? 60 * 60 * 1000;
	const url = args.url ?? MODELS_DEV_URL;

	let cached:
		| {
				fetchedAtMs: number;
				index: PricingIndex;
		  }
		| undefined;

	let inFlight: Promise<PricingIndex> | undefined;

	const fetchIndex = async () => {
		const res = await fetch(url);
		if (!res.ok) throw new Error(`models.dev fetch failed: ${res.status}`);
		const json = (await res.json()) as ModelsDevApi;
		return buildPricingIndex(json);
	};

	const getIndex = async () => {
		const now = Date.now();
		if (cached && now - cached.fetchedAtMs < ttlMs) return cached.index;

		if (!inFlight) {
			inFlight = fetchIndex().finally(() => {
				inFlight = undefined;
			});
		}

		const index = await inFlight;
		cached = { fetchedAtMs: now, index };
		return index;
	};

	const lookup: ModelsDevPricingService['lookup'] = async ({ providerId, modelId, timeoutMs }) => {
		if (!providerId || !modelId) return null;

		const index = await (timeoutMs ? withTimeout(getIndex(), timeoutMs) : getIndex()).catch(
			() => null
		);
		if (!index) return null;

		const direct = index.byProviderAndModel.get(`${providerId}\0${modelId}`);
		if (direct) return direct;

		const byId = index.byId;
		const exact = byId.get(modelId);
		if (exact) return exact;

		const combined = byId.get(`${providerId}/${modelId}`);
		if (combined) return combined;

		return null;
	};

	const prefetch = () => {
		void getIndex().catch(() => undefined);
	};

	return { prefetch, lookup };
};
