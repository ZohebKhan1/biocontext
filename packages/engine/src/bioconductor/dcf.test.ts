import { describe, expect, it } from 'bun:test';

import { parseDcf, parseDcfList } from './dcf.ts';

describe('parseDcf', () => {
	it('splits records on blank lines', () => {
		const records = parseDcf(
			'Package: DESeq2\nVersion: 1.52.0\n\nPackage: limma\nVersion: 3.64.0\n'
		);
		expect(records).toHaveLength(2);
		expect(records[0]).toEqual({ Package: 'DESeq2', Version: '1.52.0' });
		expect(records[1]).toEqual({ Package: 'limma', Version: '3.64.0' });
	});

	it('joins indented continuation lines into the previous field', () => {
		const records = parseDcf(
			['Package: DESeq2', 'Title: Differential gene expression', '        analysis', ''].join('\n')
		);
		expect(records[0]?.['Title']).toBe('Differential gene expression analysis');
	});

	it('keeps colons inside values', () => {
		const records = parseDcf('git_url: https://git.bioconductor.org/packages/DESeq2\n');
		expect(records[0]?.['git_url']).toBe('https://git.bioconductor.org/packages/DESeq2');
	});

	it('handles CRLF line endings', () => {
		const records = parseDcf('Package: DESeq2\r\nVersion: 1.52.0\r\n');
		expect(records[0]).toEqual({ Package: 'DESeq2', Version: '1.52.0' });
	});

	it('skips malformed lines instead of failing the whole document', () => {
		const records = parseDcf('Package: DESeq2\nthis line is not a field\nVersion: 1.52.0\n');
		expect(records[0]).toEqual({ Package: 'DESeq2', Version: '1.52.0' });
	});

	it('ignores trailing blank lines rather than emitting an empty record', () => {
		expect(parseDcf('Package: DESeq2\n\n\n\n')).toHaveLength(1);
	});

	it('preserves an empty field value', () => {
		const records = parseDcf('Package: DESeq2\nMaintainer:\n');
		expect(records[0]?.['Maintainer']).toBe('');
	});

	it('parses Authors@R without appending its continuations to Version', () => {
		const records = parseDcf(
			[
				'Package: PCAtools',
				'Version: 2.23.3',
				'Authors@R: c(',
				'    person("Kevin", "Blighe", role = "aut"),',
				'    person("Jared", "Andrews", role = "cre"))',
				'Description: Principal component analysis.',
				''
			].join('\n')
		);

		expect(records[0]?.['Version']).toBe('2.23.3');
		expect(records[0]?.['Authors@R']).toContain('person("Jared", "Andrews"');
		expect(records[0]?.['Description']).toBe('Principal component analysis.');
	});
});

describe('parseDcfList', () => {
	it('splits and trims comma-separated values', () => {
		expect(parseDcfList('Sequencing, RNASeq,  GeneExpression')).toEqual([
			'Sequencing',
			'RNASeq',
			'GeneExpression'
		]);
	});

	it('returns an empty array for undefined or empty input', () => {
		expect(parseDcfList(undefined)).toEqual([]);
		expect(parseDcfList('')).toEqual([]);
		expect(parseDcfList('  ,  ,')).toEqual([]);
	});
});
