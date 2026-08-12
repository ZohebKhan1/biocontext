import { describe, expect, it } from 'bun:test';

import { COMMANDS, parseAddVerifyCommand, parseRemoveCommand } from './commands.ts';

describe('commands', () => {
	it('exposes /add and keeps package installation inside the add flow', () => {
		expect(COMMANDS.some((command) => command.name === 'add')).toBe(true);
		expect(COMMANDS.some((command) => command.name === 'bioconductor')).toBe(false);
	});
});

describe('parseAddVerifyCommand', () => {
	it('accepts only the strict JSON verifier form', () => {
		expect(parseAddVerifyCommand('/add verify DESeq2 --json')).toEqual({
			matched: true,
			success: true,
			package: 'DESeq2',
			json: true
		});
	});

	it('rejects missing and additional arguments with stable usage text', () => {
		for (const command of [
			'/add verify DESeq2',
			'/add verify --json',
			'/add verify DESeq2 --json repair'
		]) {
			expect(parseAddVerifyCommand(command)).toEqual({
				matched: true,
				success: false,
				error: 'Usage: /add verify <Package> --json'
			});
		}
	});

	it('does not intercept the package browser command', () => {
		expect(parseAddVerifyCommand('/add')).toEqual({ matched: false });
		expect(parseAddVerifyCommand('/package verify DESeq2 --json')).toEqual({ matched: false });
	});
});

describe('parseRemoveCommand', () => {
	it('parses a package and requires explicit confirmation', () => {
		expect(parseRemoveCommand('/remove DESeq2')).toEqual({
			matched: true,
			success: true,
			package: 'DESeq2',
			confirmed: false
		});
		expect(parseRemoveCommand('/remove DESeq2 --yes')).toEqual({
			matched: true,
			success: true,
			package: 'DESeq2',
			confirmed: true
		});
	});

	it('rejects unsafe or ambiguous forms', () => {
		for (const command of [
			'/remove',
			'/remove ../DESeq2 --yes',
			'/remove DESeq2 --force',
			'/remove DESeq2 --yes extra'
		]) {
			expect(parseRemoveCommand(command)).toEqual({
				matched: true,
				success: false,
				error: 'Usage: /remove <Package> [--yes]'
			});
		}
	});

	it('does not intercept other commands', () => {
		expect(parseRemoveCommand('/add')).toEqual({ matched: false });
	});
});
