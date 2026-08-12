import { describe, expect, it } from 'bun:test';

import { createCranResourceInput, stepsForAddResourceType } from './add-resource-wizard.tsx';

describe('add resource wizard', () => {
	it('routes Bioconductor selection to the package browser instead of generic fields', () => {
		expect(stepsForAddResourceType('bioconductor')).toEqual([]);
	});

	it('uses a focused CRAN flow without requesting a repository URL or local path', () => {
		expect(stepsForAddResourceType('cran')).toEqual(['package', 'notes', 'confirm']);
	});

	it('creates a CRAN resource whose mention name follows its package identity', () => {
		expect(createCranResourceInput('Seurat', 'single-cell workflows')).toEqual({
			type: 'cran',
			name: 'Seurat',
			package: 'Seurat',
			specialNotes: 'single-cell workflows'
		});
	});
});
