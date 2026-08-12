/**
 * Provider Abstraction Layer
 * Exports auth, registry, and model utilities
 */
export {
	getCredentials,
	getAuthStatus,
	getProviderAuthHint,
	isAuthenticated,
	getApiKey,
	getAllCredentials,
	setCredentials,
	getAuthenticatedProviders
} from './auth.ts';
export {
	getModel,
	canUseModel,
	getAvailableProviders,
	ProviderNotFoundError,
	ProviderNotAuthenticatedError,
	ProviderAuthTypeError,
	ProviderOptionsError
} from './model.ts';
export {
	PROVIDER_REGISTRY,
	isProviderSupported,
	normalizeProviderId,
	getProviderFactory,
	getSupportedProviders
} from './registry.ts';
export type { ProviderOptions } from './registry.ts';
