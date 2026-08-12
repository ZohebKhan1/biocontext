/**
 * Text extraction for Bioconductor PDFs.
 *
 * Bioconductor publishes reference manuals as PDF, and roughly a quarter of
 * packages publish their vignettes only as PDF, so this is the difference
 * between those packages being searchable and not.
 *
 * Raw extraction is close but not usable as-is: justified LaTeX splits words
 * across lines with hyphens, running headers and page numbers land in the
 * middle of the text stream, and typographic quotes break exact-match search
 * for things like `type="apeglm"`. The cleanup below fixes those three without
 * reflowing anything else, because the line structure is what keeps function
 * signatures readable.
 */

/** Lines this far from the top or bottom of a page may be headers or footers. */
const EDGE_LINES = 2;
/** A line must repeat across at least this share of pages to count as furniture. */
const FURNITURE_PAGE_RATIO = 0.25;
const FURNITURE_MIN_PAGES = 3;

export type PdfExtractionResult = {
	readonly text: string;
	readonly pageCount: number;
};

/** Decode valid UTF-8 byte tokens occasionally emitted by Bioconductor feeds/PDFs. */
export const repairUtf8ByteTokens = (value: string): string =>
	value.replace(/(?:<[0-9a-f]{2}>){2,}/giu, (sequence) => {
		const bytes = [...sequence.matchAll(/<([0-9a-f]{2})>/giu)].map((match) =>
			Number.parseInt(match[1]!, 16)
		);
		try {
			return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bytes));
		} catch {
			return sequence;
		}
	});

const normalizeTypography = (value: string): string =>
	value
		.replaceAll('‘', "'")
		.replaceAll('’', "'")
		.replaceAll('“', '"')
		.replaceAll('”', '"')
		.replaceAll('–', '-')
		.replaceAll('—', '--')
		.replaceAll(' ', ' ');

/**
 * Repair the small set of malformed Unicode mappings emitted by common
 * TeX-generated Bioconductor PDFs.
 *
 * Some of these PDFs contain a broken ToUnicode map. PDF.js and Poppler both
 * then decode the same glyphs as characters such as `Ą`, `Ć`, and `Š` even
 * though the visible page contains `fi`, `fl`, or punctuation. This is a
 * source-PDF encoding problem, not ordinary typography. Keep the repair
 * narrow and contextual so legitimate non-ASCII author names and scientific
 * terms are not transliterated indiscriminately.
 */
export const repairPdfEncodingArtifacts = (value: string): string =>
	repairUtf8ByteTokens(value)
		// Standard Unicode ligatures can be emitted by a PDF extractor even when
		// the source mapping is otherwise correct. Expanding them improves search
		// without changing the visible words.
		.replaceAll('ﬀ', 'ff')
		.replaceAll('ﬁ', 'fi')
		.replaceAll('ﬂ', 'fl')
		.replaceAll('ﬃ', 'ffi')
		.replaceAll('ﬄ', 'ffl')
		// This malformed map turns the common `fi` and `fl` glyphs into accented
		// Latin characters. They are repaired wherever they occur in text.
		.replaceAll('Ą', 'fi')
		.replaceAll('Ć', 'fl')
		// The same map uses separate code points for opening and closing quotes.
		.replaceAll('Ś', '"')
		.replaceAll('Ş', '"')
		.replaceAll('Ť', '"')
		// Right single quotes are ambiguous in a damaged map: between letters they
		// are apostrophes (Vincent's), otherwise they are closing double quotes.
		.replace(/(?<=\p{L})Š(?=\p{L})/gu, "'")
		.replaceAll('Š', '"')
		// A lower-case variant appears in a small number of extracted pages as a
		// malformed apostrophe (for example, edgeR's catchSalmon function).
		.replaceAll('ś', "'")
		// En/em dashes in affected PDFs are mapped to different private-looking
		// Latin characters. Normalize both to the ASCII dash convention used by
		// the rest of this extractor.
		.replaceAll('Ű', '-')
		.replaceAll('Ů', '-');

/** Known malformed glyphs for post-extraction validation and diagnostics. */
export const PDF_ENCODING_ARTIFACTS = new Set(['Ą', 'Ć', 'Ś', 'Ş', 'Ť', 'Š', 'ś', 'Ű', 'Ů']);

export const findPdfEncodingArtifacts = (value: string): string[] => [
	...new Set([...value].filter((character) => PDF_ENCODING_ARTIFACTS.has(character)))
];

/** Rejoin words that justification split across a line break. */
const rejoinHyphenation = (value: string): string =>
	value
		.replace(/([a-z])-\n[ \t]*([a-z])/g, '$1$2')
		// PDF line wrapping can split CamelCase identifiers as well. Keep this
		// deliberately narrow: the first and second pieces must look like a
		// CamelCase token, so ordinary compounds such as `RNA-Seq` remain intact.
		.replace(/([A-Z][a-z]+)-\n[ \t]*([A-Z][a-z]+[A-Z][A-Za-z]*)/g, '$1$2');

/** Remove page numbers that PDF extraction attaches to a Contents label. */
const stripContentsPageNumbers = (value: string): string =>
	value.replace(/^\s*(?:\d{1,4}\s+Contents|Contents\s+\d{1,4})\s*$/gim, '');

/**
 * Fence unambiguous multi-line R prompt blocks, leaving output and prose intact.
 *
 * A lone `>` at the start of an extracted line is ambiguous. PDF wrapping can
 * put the second half of prose such as `D-> [A|G|T]` or a workflow arrow on a
 * new line, and reference-manual indexes contain entries like
 * `>,Vector,ANY-method`. Treating all of them as prompts deletes the operator
 * and creates spurious code fences. Isolated prompt-looking lines are escaped
 * as Markdown blockquotes instead; their text is preserved verbatim.
 */
const fencePdfPromptBlocks = (value: string): string => {
	const lines = value.split('\n');
	const output: string[] = [];
	const isPrompt = (line: string) => /^\s*>[ \t]+\S/u.test(line);
	const isContinuation = (line: string) => /^\s*\+[ \t]+\S/u.test(line);

	for (let index = 0; index < lines.length; index++) {
		const line = lines[index] ?? '';
		if (!isPrompt(line)) {
			output.push(line);
			continue;
		}

		const next = lines[index + 1] ?? '';
		if (!isPrompt(next) && !isContinuation(next)) {
			output.push(line.replace(/^(\s*)>(?=[ \t])/u, '$1\\>'));
			continue;
		}

		output.push('```r');
		while (index < lines.length) {
			const prompted = lines[index] ?? '';
			if (isPrompt(prompted)) {
				output.push(prompted.replace(/^\s*>[ \t]+/u, ''));
				index++;
				continue;
			}
			if (isContinuation(prompted)) {
				output.push(prompted.replace(/^\s*\+[ \t]+/u, ''));
				index++;
				continue;
			}
			break;
		}
		output.push('```');
		index--;
	}
	return output.join('\n');
};

/** Keep R output beginning with `#` from becoming an accidental Markdown heading. */
const escapePdfHeadingMarkers = (value: string): string => {
	const lines = value.split('\n');
	const output: string[] = [];
	let inFence = false;
	for (const line of lines) {
		if (/^\s*```/u.test(line)) inFence = !inFence;
		output.push(inFence || /^\s*```/u.test(line) ? line : line.replace(/^(#{1,6})(?=\s)/u, '\\$1'));
	}
	return output.join('\n');
};

/**
 * Strip running headers, footers, and page numbers.
 *
 * Only the first and last lines of each page are eligible, and a line that also
 * appears mid-page anywhere in the document is treated as content. Frequency
 * alone is not enough: in a reference manual, headings like `Usage` and
 * `Arguments` legitimately repeat on most pages, and an earlier frequency-only
 * rule deleted all 39 of them.
 */
export const stripPageFurniture = (pages: readonly string[]): string => {
	const pageCount = pages.length;
	const threshold = Math.max(FURNITURE_MIN_PAGES, Math.floor(pageCount * FURNITURE_PAGE_RATIO));

	const edgeFrequency = new Map<string, number>();
	const bodyLines = new Set<string>();
	for (const page of pages) {
		const lines = page
			.split('\n')
			.map((line) => line.trim())
			.filter((line) => line.length > 0);
		const edges = new Set([...lines.slice(0, EDGE_LINES), ...lines.slice(-EDGE_LINES)]);
		for (const line of edges) {
			if (line.length > 2) edgeFrequency.set(line, (edgeFrequency.get(line) ?? 0) + 1);
		}
		for (const line of lines) {
			if (!edges.has(line)) bodyLines.add(line);
		}
	}

	const looksLikePageNumber = (line: string) =>
		/^\d{1,4}$/.test(line) && Number(line) <= pageCount + 5;

	return pages
		.map((page) => {
			const lines = page.split('\n');
			return lines
				.filter((line, index) => {
					const atEdge = index < EDGE_LINES || index >= lines.length - EDGE_LINES;
					if (!atEdge) return true;
					const trimmed = line.trim();
					if (looksLikePageNumber(trimmed)) return false;
					// Content that also appears mid-page is a heading, not furniture,
					// even when it happens to land in a page's first or last lines.
					if (bodyLines.has(trimmed)) return true;
					return (edgeFrequency.get(trimmed) ?? 0) < threshold;
				})
				.join('\n');
		})
		.join('\n');
};

export const cleanPdfText = (pages: readonly string[]): string =>
	normalizeTypography(
		repairPdfEncodingArtifacts(
			escapePdfHeadingMarkers(
				fencePdfPromptBlocks(stripContentsPageNumbers(rejoinHyphenation(stripPageFurniture(pages))))
			)
		)
	)
		.replace(/[ \t]+$/gm, '')
		.replace(/\n{3,}/g, '\n\n')
		.trim();

/**
 * Extract readable text from a PDF.
 *
 * Returns empty text rather than throwing when the PDF is unreadable, so a
 * single bad document degrades one file instead of the whole package.
 */
export const extractPdfText = async (data: ArrayBuffer): Promise<PdfExtractionResult> => {
	// Imported lazily so packages that never fetch a PDF do not pay for it.
	const { extractText, getDocumentProxy } = await import('unpdf');
	// unpdf bundles PDF.js but not its optional standard-font directory. Text
	// extraction still works, so silence repeated font-rendering warnings that
	// would otherwise corrupt the TUI while a PDF package is loading.
	const document = await getDocumentProxy(new Uint8Array(data), { verbosity: 0 });
	try {
		const result = (await extractText(document, { mergePages: false })) as unknown as {
			text?: unknown;
		};
		const pages = Array.isArray(result.text)
			? result.text.filter((page): page is string => typeof page === 'string')
			: typeof result.text === 'string'
				? [result.text]
				: [];
		return { text: cleanPdfText(pages), pageCount: document.numPages };
	} finally {
		const disposable = document as unknown as { destroy?: () => Promise<void> | void };
		await disposable.destroy?.();
	}
};
