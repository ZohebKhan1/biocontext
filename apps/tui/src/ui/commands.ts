import type { Command } from './types.ts';

export const COMMANDS: Command[] = [
	{
		name: 'connect',
		description: 'Configure provider and model',
		mode: 'connect'
	},
	{
		name: 'add',
		description: 'Add a Bioconductor or CRAN package, Git, or local resource',
		mode: 'add-repo'
	},
	{
		name: 'remove',
		description: 'Remove an installed managed package',
		mode: 'remove'
	},
	{
		name: 'clear',
		alias: 'new',
		description: 'Clear chat history',
		mode: 'clear'
	},
	{
		name: 'resume',
		description: 'Resume a previous thread',
		mode: 'resume'
	},
	{
		name: 'copy',
		description: 'Copy the latest user question and response',
		mode: 'copy'
	},
	{
		name: 'copy-all',
		description: 'Copy the full thread',
		mode: 'copy-all'
	}
];

export function filterCommands(query: string): Command[] {
	const lowerQuery = query.toLowerCase();
	return COMMANDS.filter(
		(cmd) =>
			cmd.name.toLowerCase().startsWith(lowerQuery) ||
			(cmd.alias?.toLowerCase().startsWith(lowerQuery) ?? false)
	);
}

export type ParsedAddVerifyCommand =
	| { matched: false }
	| { matched: true; success: false; error: string }
	| { matched: true; success: true; package: string; json: true };

/** The verifier deliberately has one strict, machine-readable TUI form. */
export const parseAddVerifyCommand = (input: string): ParsedAddVerifyCommand => {
	const trimmed = input.trim();
	if (!/^\/add\s+verify(?:\s|$)/iu.test(trimmed)) return { matched: false };
	const match = /^\/add\s+verify\s+([a-zA-Z][a-zA-Z0-9.]*)\s+--json$/u.exec(trimmed);
	if (!match?.[1]) {
		return {
			matched: true,
			success: false,
			error: 'Usage: /add verify <Package> --json'
		};
	}
	return { matched: true, success: true, package: match[1], json: true };
};

export type ParsedRemoveCommand =
	| { matched: false }
	| { matched: true; success: false; error: string }
	| { matched: true; success: true; package: string; confirmed: boolean };

/** Package removal requires an explicit second invocation with --yes. */
export const parseRemoveCommand = (input: string): ParsedRemoveCommand => {
	const trimmed = input.trim();
	if (!/^\/remove(?:\s|$)/iu.test(trimmed)) return { matched: false };
	const match = /^\/remove\s+([a-zA-Z][a-zA-Z0-9.]*)(?:\s+(--yes))?$/iu.exec(trimmed);
	if (!match?.[1]) {
		return {
			matched: true,
			success: false,
			error: 'Usage: /remove <Package> [--yes]'
		};
	}
	return {
		matched: true,
		success: true,
		package: match[1],
		confirmed: match[2]?.toLowerCase() === '--yes'
	};
};
