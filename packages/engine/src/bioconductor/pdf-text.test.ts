import { describe, expect, it } from 'bun:test';

import {
	cleanPdfText,
	findPdfEncodingArtifacts,
	repairPdfEncodingArtifacts,
	repairUtf8ByteTokens,
	stripPageFurniture
} from './pdf-text.ts';

const page = (...lines: string[]) => lines.join('\n');

describe('stripPageFurniture', () => {
	it('removes a running header repeated at the top of every page', () => {
		const pages = Array.from({ length: 8 }, (_, i) =>
			page('DESeq2 reference manual', `body line ${i}`, 'tail')
		);
		const out = stripPageFurniture(pages);
		expect(out).not.toContain('DESeq2 reference manual');
		expect(out).toContain('body line 3');
	});

	it('removes bare page numbers', () => {
		const pages = Array.from({ length: 8 }, (_, i) => page(String(i + 1), `content ${i}`, 'x'));
		const out = stripPageFurniture(pages);
		expect(out.split('\n').filter((l) => /^\d+$/.test(l.trim()))).toEqual([]);
		expect(out).toContain('content 5');
	});

	it('keeps section headings that legitimately repeat on most pages', () => {
		// A frequency-only rule deleted all 39 `Usage`/`Arguments` headings from a
		// real reference manual, because they are body text, not page furniture.
		// Page shape mirrors a real manual: header, then the entry, then a footer.
		const pages = Array.from({ length: 10 }, (_, i) =>
			page(
				'DESeq2 reference manual',
				`fn${i}`,
				'Description',
				`Does thing ${i}.`,
				'Usage',
				`fn${i}(x, y = 1)`,
				'Arguments',
				'x a thing',
				String(i + 1)
			)
		);
		const out = stripPageFurniture(pages);
		expect(out.match(/Usage/g)).toHaveLength(10);
		expect(out.match(/Arguments/g)).toHaveLength(10);
		expect(out).not.toContain('DESeq2 reference manual');
		expect(out.split('\n').filter((l) => /^\d+$/.test(l.trim()))).toEqual([]);
	});

	it('keeps a repeated heading even when it lands in a page edge position', () => {
		// Hardening: a line that appears mid-page elsewhere is content, wherever
		// it happens to fall on any given page.
		const pages = [
			page('hdr', 'Usage', 'sig(a)', 'tail'),
			page('hdr', 'body', 'Usage', 'sig(b)', 'tail'),
			page('hdr', 'body', 'Usage', 'sig(c)', 'tail'),
			page('hdr', 'body', 'Usage', 'sig(d)', 'tail')
		];
		const out = stripPageFurniture(pages);
		expect(out.match(/Usage/g)).toHaveLength(4);
		expect(out).not.toContain('hdr');
	});

	it('never removes lines from the middle of a page', () => {
		const pages = Array.from({ length: 8 }, () => page('top', '42', 'middle', 'bottom'));
		// "42" sits in the body, so it survives even though it looks like a page number.
		expect(stripPageFurniture(pages)).toContain('42');
	});

	it('leaves a short document alone', () => {
		const pages = [page('Title', 'body')];
		expect(stripPageFurniture(pages)).toContain('Title');
	});
});

describe('cleanPdfText', () => {
	it('rejoins words split across a line break by justification', () => {
		expect(cleanPdfText(['used to store the input values, in-\ntermediate calculations'])).toBe(
			'used to store the input values, intermediate calculations'
		);
	});

	it('does not join a genuine hyphenated compound', () => {
		expect(cleanPdfText(['enforces non-negative integer values'])).toContain('non-negative');
	});

	it('rejoins a CamelCase identifier split across a PDF line break', () => {
		expect(cleanPdfText(['the Annotation-\nDataFrame classes'])).toContain(
			'the AnnotationDataFrame classes'
		);
	});

	it('normalizes typographic quotes so exact-match search works', () => {
		const out = cleanPdfText(['the ’apeglm’ and “ashr” estimators']);
		expect(out).toBe(`the 'apeglm' and "ashr" estimators`);
	});

	it('repairs malformed TeX PDF glyph mappings without dropping words', () => {
		const out = repairPdfEncodingArtifacts(
			'St VincentŠs bisulĄte sequencing workĆow; 321Ű332; ŞgenesŤ; ŚSequencesRevŠ; edgeRś catchSalmon'
		);
		expect(out).toBe(
			`St Vincent's bisulfite sequencing workflow; 321-332; "genes"; "SequencesRev"; edgeR' catchSalmon`
		);
		expect(findPdfEncodingArtifacts(out)).toEqual([]);
	});

	it('decodes valid UTF-8 byte tokens without changing invalid tokens', () => {
		expect(repairUtf8ByteTokens('Ant<c3><b3>nio <c3><a0>')).toBe('António à');
		expect(repairUtf8ByteTokens('keep <c3> and <zz>')).toBe('keep <c3> and <zz>');
	});

	it('repairs malformed glyphs as part of final PDF cleanup', () => {
		const out = cleanPdfText([
			'St VincentŠs bisulĄte sequencing workĆow',
			'For the ŚsetŠ, use 321Ű332.'
		]);
		expect(out).toContain("St Vincent's bisulfite sequencing workflow");
		expect(out).toContain('For the "set", use 321-332.');
		expect(findPdfEncodingArtifacts(out)).toEqual([]);
	});

	it('removes page numbers attached to Contents labels but keeps the Contents heading', () => {
		const out = cleanPdfText(['2 Contents', 'Contents', 'Contents 3', 'estimateDisp']);
		expect(out).toBe('Contents\n\nestimateDisp');
	});

	it('keeps hash-prefixed PDF output literal instead of creating false headings', () => {
		expect(cleanPdfText(['# of samples: 77', '## [1] sample-A'])).toBe(
			'\\# of samples: 77\n\\## [1] sample-A'
		);
	});

	it('fences explicit R prompts and continuations without absorbing adjacent output', () => {
		expect(cleanPdfText(['> x <- 1', '+ y', '# result', 'body prose'])).toBe(
			'```r\nx <- 1\ny\n```\n\\# result\nbody prose'
		);
	});

	it('fences consecutive explicit R prompts', () => {
		expect(cleanPdfText(['> library(S4Vectors)', '> x <- IntegerList(1:3)', '[1] 1 2 3'])).toBe(
			'```r\nlibrary(S4Vectors)\nx <- IntegerList(1:3)\n```\n[1] 1 2 3'
		);
	});

	it('preserves isolated greater-than lines from wrapped prose without creating a blockquote', () => {
		expect(
			cleanPdfText([
				'the workflow importData() > inspectDigests()',
				'> updateMetadata(). See also makeLinkedTxpData()'
			])
		).toBe(
			'the workflow importData() > inspectDigests()\n\\> updateMetadata(). See also makeLinkedTxpData()'
		);
	});

	it('does not corrupt comparison operators in a reference-manual index', () => {
		expect(cleanPdfText(['>,ANY,Vector-method', '>=,Vector,ANY-method'])).toBe(
			'>,ANY,Vector-method\n>=,Vector,ANY-method'
		);
	});

	it('normalizes dashes', () => {
		expect(cleanPdfText(['a – b — c'])).toBe('a - b -- c');
	});

	it('collapses runs of blank lines and trims', () => {
		expect(cleanPdfText(['\n\n\nalpha\n\n\n\nbeta\n\n\n'])).toBe('alpha\n\nbeta');
	});

	it('preserves the line structure of a function signature', () => {
		const signature = ['lfcShrink(', 'dds,', 'type = c("apeglm", "ashr"),', 'quiet = FALSE', ')'];
		expect(cleanPdfText([signature.join('\n')])).toBe(signature.join('\n'));
	});
});
