import type { FiletypeParserOptions } from '@opentui/core';

export const parsers = [
	{
		filetype: 'r',
		wasm: 'https://github.com/r-lib/tree-sitter-r/releases/download/v1.3.0/tree-sitter-r.wasm',
		queries: {
			highlights: [
				'https://raw.githubusercontent.com/r-lib/tree-sitter-r/v1.3.0/queries/highlights.scm'
			]
		}
	},
	{
		filetype: 'diff',
		wasm: 'https://github.com/tree-sitter-grammars/tree-sitter-diff/releases/download/v0.1.0/tree-sitter-diff.wasm',
		queries: {
			highlights: [
				'https://raw.githubusercontent.com/tree-sitter-grammars/tree-sitter-diff/v0.1.0/queries/highlights.scm'
			]
		}
	},
	{
		filetype: 'json',
		wasm: 'https://cdn.jsdelivr.net/npm/tree-sitter-json@0.24.8/tree-sitter-json.wasm',
		queries: {
			highlights: ['https://cdn.jsdelivr.net/npm/tree-sitter-json@0.24.8/queries/highlights.scm']
		}
	},
	{
		filetype: 'python',
		wasm: 'https://unpkg.com/tree-sitter-python@0.25.0/tree-sitter-python.wasm',
		queries: {
			highlights: ['https://unpkg.com/tree-sitter-python@0.25.0/queries/highlights.scm']
		}
	},
	{
		filetype: 'sql',
		wasm: 'https://raw.githubusercontent.com/m-novikov/tree-sitter-sql/587f30d184b058450be2a2330878210c5f33b3f9/docs/tree-sitter-sql.wasm',
		queries: {
			highlights: [
				'https://raw.githubusercontent.com/m-novikov/tree-sitter-sql/587f30d184b058450be2a2330878210c5f33b3f9/queries/highlights.scm'
			]
		}
	},
	{
		filetype: 'yaml',
		wasm: 'https://unpkg.com/@tree-sitter-grammars/tree-sitter-yaml@0.7.1/tree-sitter-yaml.wasm',
		queries: {
			highlights: [
				'https://unpkg.com/@tree-sitter-grammars/tree-sitter-yaml@0.7.1/queries/highlights.scm'
			]
		}
	},
	{
		filetype: 'bash',
		wasm: 'https://unpkg.com/tree-sitter-bash@0.25.1/tree-sitter-bash.wasm',
		queries: {
			highlights: ['https://unpkg.com/tree-sitter-bash@0.25.1/queries/highlights.scm']
		}
	}
] as const satisfies FiletypeParserOptions[];
