// Re-export shared types
export type {
	TextChunk,
	ReasoningChunk,
	ToolChunk,
	FileChunk,
	Chunk,
	CancelState,
	AssistantContent
} from '@biocontext/shared';

import type { AssistantContent } from '@biocontext/shared';

export interface Repo {
	name: string;
	type: 'git' | 'local' | 'bioconductor' | 'cran';
	/** Git URL, local path, or R package name, depending on `type`. */
	url: string;
	branch: string;
	specialNotes?: string | undefined;
	searchPath?: string | undefined;
	searchPaths?: string[] | undefined;
	package?: string | undefined;
	release?: string | undefined;
	documents?: ('vignettes' | 'vignetteScripts' | 'manual' | 'news')[] | undefined;
	includeCurated?: boolean | undefined;
	source?: boolean | string | undefined;
	sourceBranch?: string | undefined;
	sourceCommit?: string | undefined;
}

export type InputState = (
	| {
			type: 'text' | 'command' | 'mention';
			content: string;
	  }
	| {
			type: 'pasted';
			content: string;
			lines: number;
	  }
)[];

export type Message =
	| {
			role: 'user';
			content: InputState;
	  }
	| {
			role: 'assistant';
			content: AssistantContent;
			canceled?: boolean; // true if this response was canceled
	  }
	| {
			role: 'system';
			content: string;
	  };

export type CommandMode =
	| 'add-repo'
	| 'connect'
	| 'remove'
	| 'clear'
	| 'resume'
	| 'copy'
	| 'copy-all';

export type ActiveWizard = 'none' | 'add-repo' | 'bioconductor' | 'connect' | 'resume';

export type WizardStep =
	| 'type'
	| 'name'
	| 'url'
	| 'branch'
	| 'searchPath'
	| 'path'
	| 'package'
	| 'notes'
	| 'confirm'
	| 'provider'
	| 'auth'
	| 'api-key'
	| 'model'
	| 'model-input'
	| 'compat-base-url'
	| 'compat-name'
	| 'compat-model'
	| 'compat-api-key'
	| null;

export interface Command {
	name: string;
	description: string;
	alias?: string;
	mode: CommandMode;
}
