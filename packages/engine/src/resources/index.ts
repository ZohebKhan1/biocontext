export { ResourceError } from './helpers.ts';
export {
	createResourcesService,
	createAnonymousResource,
	resolveResourceDefinition
} from './service.ts';
export type { ResourcesService } from './service.ts';
export {
	GitResourceSchema,
	LocalResourceSchema,
	ResourceDefinitionSchema,
	isGitResource,
	isLocalResource,
	type GitResource,
	type LocalResource,
	type ResourceDefinition
} from './schema.ts';
export { FS_RESOURCE_SYSTEM_NOTE, type FsResource, type GitResourceArgs } from './types.ts';
