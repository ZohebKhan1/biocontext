import { describe, expect, it } from 'bun:test';

import { parseDcf } from './dcf.ts';

/**
 * These assert the shape of the real published index, which drives vignette
 * format routing and R script discovery.
 */
describe('VIEWS records as published', () => {
	it('exposes an HTML vignette and a matching R script', () => {
		const [record] = parseDcf(
			[
				'Package: DESeq2',
				'vignettes: vignettes/DESeq2/inst/doc/DESeq2.html',
				'Rfiles: vignettes/DESeq2/inst/doc/DESeq2.R',
				''
			].join('\n')
		);
		expect(record?.['vignettes']).toContain('.html');
		expect(record?.['Rfiles']).toContain('.R');
	});

	it('exposes a PDF vignette with no R script', () => {
		const [record] = parseDcf(
			['Package: maSigPro', 'vignettes: vignettes/maSigPro/inst/doc/maSigPro.pdf,', ''].join('\n')
		);
		expect(record?.['vignettes']).toContain('.pdf');
		expect(record?.['Rfiles']).toBeUndefined();
	});

	it('exposes an R script with no listed vignette', () => {
		// AnnotationDbi publishes this combination, which is why R scripts must
		// come from Rfiles rather than being derived from vignette paths.
		const [record] = parseDcf(
			[
				'Package: AnnotationDbi',
				'vignettes:',
				'Rfiles: vignettes/AnnotationDbi/inst/doc/IntroToAnnotationPackages.R',
				''
			].join('\n')
		);
		expect(record?.['vignettes']).toBe('');
		expect(record?.['Rfiles']).toContain('.R');
	});
});
