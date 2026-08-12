import { RGBA, SyntaxStyle } from '@opentui/core';

import { colors } from './theme.ts';

/**
 * High-contrast syntax theme for tree-sitter highlight groups.
 * Uses the same teal-cyan, azure, warm, and lavender language as the TUI.
 */
export const syntaxStyle = SyntaxStyle.fromStyles({
	default: { fg: RGBA.fromHex(colors.text), bg: RGBA.fromHex(colors.bg) },
	conceal: { fg: RGBA.fromHex(colors.textSubtle), bg: RGBA.fromHex(colors.bg) },

	// Keywords & control flow
	keyword: { fg: RGBA.fromHex(colors.syntax.keyword), bold: true },
	'keyword.operator': { fg: RGBA.fromHex(colors.syntax.keyword) },
	'keyword.function': { fg: RGBA.fromHex(colors.syntax.keyword), bold: true },
	'keyword.return': { fg: RGBA.fromHex(colors.syntax.keyword), bold: true },
	'keyword.import': { fg: RGBA.fromHex(colors.syntax.keyword), bold: true },
	'keyword.conditional': { fg: RGBA.fromHex(colors.syntax.keywordControl) },
	'keyword.repeat': { fg: RGBA.fromHex(colors.syntax.keywordControl) },
	'keyword.exception': { fg: RGBA.fromHex(colors.syntax.keywordControl) },
	'keyword.directive': { fg: RGBA.fromHex(colors.syntax.keywordControl) },

	// Types
	type: { fg: RGBA.fromHex(colors.syntax.type) },
	'type.builtin': { fg: RGBA.fromHex(colors.syntax.type) },
	'type.definition': { fg: RGBA.fromHex(colors.syntax.type) },

	// Functions
	function: { fg: RGBA.fromHex(colors.syntax.function) },
	'function.call': { fg: RGBA.fromHex(colors.syntax.function) },
	'function.builtin': { fg: RGBA.fromHex(colors.syntax.function) },
	'function.method': { fg: RGBA.fromHex(colors.syntax.function) },
	method: { fg: RGBA.fromHex(colors.syntax.function) },

	// Variables & properties
	variable: { fg: RGBA.fromHex(colors.syntax.variable) },
	'variable.builtin': { fg: RGBA.fromHex(colors.syntax.keyword) },
	'variable.parameter': { fg: RGBA.fromHex(colors.syntax.variable) },
	property: { fg: RGBA.fromHex(colors.syntax.variable) },

	// Strings
	string: { fg: RGBA.fromHex(colors.syntax.string) },
	'string.special': { fg: RGBA.fromHex(colors.syntax.stringSpecial) },
	'string.escape': { fg: RGBA.fromHex(colors.syntax.stringSpecial) },

	// Numbers & constants
	number: { fg: RGBA.fromHex(colors.syntax.number) },
	float: { fg: RGBA.fromHex(colors.syntax.number) },
	boolean: { fg: RGBA.fromHex(colors.syntax.boolean) },
	constant: { fg: RGBA.fromHex(colors.syntax.constant) },
	'constant.builtin': { fg: RGBA.fromHex(colors.syntax.boolean) },

	// Comments
	comment: { fg: RGBA.fromHex(colors.syntax.comment), italic: true },

	// Operators & punctuation
	operator: { fg: RGBA.fromHex(colors.syntax.punctuation) },
	punctuation: { fg: RGBA.fromHex(colors.syntax.punctuation) },
	'punctuation.bracket': { fg: RGBA.fromHex(colors.syntax.punctuation) },
	'punctuation.delimiter': { fg: RGBA.fromHex(colors.syntax.punctuation) },
	'punctuation.special': { fg: RGBA.fromHex(colors.syntax.keyword) },

	// Tags (HTML/JSX)
	tag: { fg: RGBA.fromHex(colors.syntax.tag) },
	'tag.attribute': { fg: RGBA.fromHex(colors.syntax.variable) },

	// Namespace & module
	namespace: { fg: RGBA.fromHex(colors.syntax.type) },
	module: { fg: RGBA.fromHex(colors.syntax.type) },

	// Labels & special
	label: { fg: RGBA.fromHex(colors.syntax.label) },
	attribute: { fg: RGBA.fromHex(colors.syntax.variable) },
	constructor: { fg: RGBA.fromHex(colors.syntax.type) },

	// Diff
	'text.diff.add': { fg: RGBA.fromHex(colors.syntax.diffAdd) },
	'text.diff.delete': { fg: RGBA.fromHex(colors.syntax.diffDelete) },

	// Embedded / injection
	embedded: { fg: RGBA.fromHex(colors.syntax.punctuation) },

	// Markdown presentation groups used by OpenTUI's markdown renderer
	'markup.heading': { fg: RGBA.fromHex(colors.accentBright), bold: true },
	'markup.heading.1': { fg: RGBA.fromHex(colors.accentBright), bold: true },
	'markup.heading.2': { fg: RGBA.fromHex(colors.accent), bold: true },
	'markup.heading.3': { fg: RGBA.fromHex(colors.accent), bold: true },
	'markup.heading.4': { fg: RGBA.fromHex(colors.accent), bold: true },
	'markup.heading.5': { fg: RGBA.fromHex(colors.accent), bold: true },
	'markup.heading.6': { fg: RGBA.fromHex(colors.accent), bold: true },
	'markup.list': { fg: RGBA.fromHex(colors.accent) },
	'markup.list.checked': { fg: RGBA.fromHex(colors.success) },
	'markup.list.unchecked': { fg: RGBA.fromHex(colors.textMuted) },
	'markup.quote': { fg: RGBA.fromHex(colors.textMuted), italic: true },
	'markup.link': { fg: RGBA.fromHex(colors.info), underline: true },
	'markup.link.url': { fg: RGBA.fromHex(colors.info), underline: true },
	'markup.link.label': { fg: RGBA.fromHex(colors.info), underline: true },
	'markup.raw': { fg: RGBA.fromHex(colors.syntax.diffAdd) },
	'markup.raw.block': { fg: RGBA.fromHex(colors.syntax.diffAdd) }
});

/**
 * GitHub Dark-inspired colors for fenced code only.
 *
 * Keep this separate from `syntaxStyle`: the surrounding Markdown should retain
 * the TUI's teal-cyan presentation palette, while code uses a familiar editor
 * palette with clear keyword, type, function, string, number, and comment roles.
 */
export const GITHUB_DARK_CODE_COLORS = {
	default: '#c9d1d9',
	keyword: '#ff7b72',
	keywordControl: '#ff7b72',
	type: '#ffa657',
	function: '#d2a8ff',
	variable: '#c9d1d9',
	string: '#a5d6ff',
	stringSpecial: '#79c0ff',
	number: '#79c0ff',
	boolean: '#79c0ff',
	constant: '#79c0ff',
	comment: '#8b949e',
	punctuation: '#c9d1d9',
	tag: '#7ee787',
	label: '#d2a8ff',
	diffAdd: '#7ee787',
	diffDelete: '#ffa198'
} as const;

export const codeSyntaxStyle = SyntaxStyle.fromStyles({
	default: { fg: RGBA.fromHex(GITHUB_DARK_CODE_COLORS.default) },
	keyword: { fg: RGBA.fromHex(GITHUB_DARK_CODE_COLORS.keyword), bold: true },
	'keyword.operator': { fg: RGBA.fromHex(GITHUB_DARK_CODE_COLORS.keyword) },
	'keyword.function': { fg: RGBA.fromHex(GITHUB_DARK_CODE_COLORS.keyword), bold: true },
	'keyword.return': { fg: RGBA.fromHex(GITHUB_DARK_CODE_COLORS.keyword), bold: true },
	'keyword.import': { fg: RGBA.fromHex(GITHUB_DARK_CODE_COLORS.keyword), bold: true },
	'keyword.conditional': { fg: RGBA.fromHex(GITHUB_DARK_CODE_COLORS.keywordControl) },
	'keyword.repeat': { fg: RGBA.fromHex(GITHUB_DARK_CODE_COLORS.keywordControl) },
	'keyword.exception': { fg: RGBA.fromHex(GITHUB_DARK_CODE_COLORS.keywordControl) },
	'keyword.directive': { fg: RGBA.fromHex(GITHUB_DARK_CODE_COLORS.keywordControl) },
	type: { fg: RGBA.fromHex(GITHUB_DARK_CODE_COLORS.type) },
	'type.builtin': { fg: RGBA.fromHex(GITHUB_DARK_CODE_COLORS.type) },
	'type.definition': { fg: RGBA.fromHex(GITHUB_DARK_CODE_COLORS.type) },
	function: { fg: RGBA.fromHex(GITHUB_DARK_CODE_COLORS.function) },
	'function.call': { fg: RGBA.fromHex(GITHUB_DARK_CODE_COLORS.function) },
	'function.builtin': { fg: RGBA.fromHex(GITHUB_DARK_CODE_COLORS.function) },
	'function.method': { fg: RGBA.fromHex(GITHUB_DARK_CODE_COLORS.function) },
	method: { fg: RGBA.fromHex(GITHUB_DARK_CODE_COLORS.function) },
	variable: { fg: RGBA.fromHex(GITHUB_DARK_CODE_COLORS.variable) },
	'variable.builtin': { fg: RGBA.fromHex(GITHUB_DARK_CODE_COLORS.keyword) },
	'variable.parameter': { fg: RGBA.fromHex(GITHUB_DARK_CODE_COLORS.variable) },
	property: { fg: RGBA.fromHex(GITHUB_DARK_CODE_COLORS.variable) },
	string: { fg: RGBA.fromHex(GITHUB_DARK_CODE_COLORS.string) },
	'string.special': { fg: RGBA.fromHex(GITHUB_DARK_CODE_COLORS.stringSpecial) },
	'string.escape': { fg: RGBA.fromHex(GITHUB_DARK_CODE_COLORS.stringSpecial) },
	number: { fg: RGBA.fromHex(GITHUB_DARK_CODE_COLORS.number) },
	float: { fg: RGBA.fromHex(GITHUB_DARK_CODE_COLORS.number) },
	boolean: { fg: RGBA.fromHex(GITHUB_DARK_CODE_COLORS.boolean) },
	constant: { fg: RGBA.fromHex(GITHUB_DARK_CODE_COLORS.constant) },
	'constant.builtin': { fg: RGBA.fromHex(GITHUB_DARK_CODE_COLORS.boolean) },
	comment: { fg: RGBA.fromHex(GITHUB_DARK_CODE_COLORS.comment), italic: true },
	operator: { fg: RGBA.fromHex(GITHUB_DARK_CODE_COLORS.punctuation) },
	punctuation: { fg: RGBA.fromHex(GITHUB_DARK_CODE_COLORS.punctuation) },
	'punctuation.bracket': { fg: RGBA.fromHex(GITHUB_DARK_CODE_COLORS.punctuation) },
	'punctuation.delimiter': { fg: RGBA.fromHex(GITHUB_DARK_CODE_COLORS.punctuation) },
	'punctuation.special': { fg: RGBA.fromHex(GITHUB_DARK_CODE_COLORS.keyword) },
	tag: { fg: RGBA.fromHex(GITHUB_DARK_CODE_COLORS.tag) },
	'tag.attribute': { fg: RGBA.fromHex(GITHUB_DARK_CODE_COLORS.variable) },
	namespace: { fg: RGBA.fromHex(GITHUB_DARK_CODE_COLORS.type) },
	module: { fg: RGBA.fromHex(GITHUB_DARK_CODE_COLORS.type) },
	label: { fg: RGBA.fromHex(GITHUB_DARK_CODE_COLORS.label) },
	attribute: { fg: RGBA.fromHex(GITHUB_DARK_CODE_COLORS.variable) },
	constructor: { fg: RGBA.fromHex(GITHUB_DARK_CODE_COLORS.type) },
	'text.diff.add': { fg: RGBA.fromHex(GITHUB_DARK_CODE_COLORS.diffAdd) },
	'text.diff.delete': { fg: RGBA.fromHex(GITHUB_DARK_CODE_COLORS.diffDelete) },
	embedded: { fg: RGBA.fromHex(GITHUB_DARK_CODE_COLORS.punctuation) }
});
