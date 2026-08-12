/**
 * Convert a rendered Bioconductor vignette to Markdown.
 *
 * Vignettes are knitr/rmarkdown HTML output, so the structure is narrow and
 * predictable. This is deliberately not a general HTML converter: it targets
 * that shape and drops everything a retrieval corpus does not need. A published
 * DESeq2 vignette is ~3 MB, of which ~2.7 MB is base64-encoded plot images and
 * inlined CSS; stripping those first is what makes the rest cheap.
 */

type Token =
	| { readonly kind: 'text'; readonly value: string }
	| { readonly kind: 'open'; readonly tag: string; readonly attrs: Record<string, string> }
	| { readonly kind: 'close'; readonly tag: string };

const VOID_ELEMENTS = new Set([
	'area',
	'base',
	'br',
	'col',
	'embed',
	'hr',
	'img',
	'input',
	'link',
	'meta',
	'source',
	'track',
	'wbr'
]);

/** Dropped wholesale, contents included. */
const DISCARDED_ELEMENTS = new Set(['script', 'style', 'head', 'svg', 'noscript', 'iframe']);

const NAMED_ENTITIES: Record<string, string> = {
	amp: '&',
	lt: '<',
	gt: '>',
	quot: '"',
	apos: "'",
	nbsp: ' ',
	ndash: '–',
	mdash: '—',
	hellip: '…',
	ldquo: '“',
	rdquo: '”',
	lsquo: '‘',
	rsquo: '’',
	times: '×',
	le: '≤',
	ge: '≥',
	ne: '≠',
	alpha: 'α',
	beta: 'β',
	mu: 'μ',
	sigma: 'σ'
};

export const decodeEntities = (value: string): string =>
	value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (match, entity: string) => {
		if (entity.startsWith('#x') || entity.startsWith('#X')) {
			const code = Number.parseInt(entity.slice(2), 16);
			return Number.isFinite(code) ? String.fromCodePoint(code) : match;
		}
		if (entity.startsWith('#')) {
			const code = Number.parseInt(entity.slice(1), 10);
			return Number.isFinite(code) ? String.fromCodePoint(code) : match;
		}
		return NAMED_ENTITIES[entity] ?? match;
	});

const ATTR = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;

const parseAttributes = (raw: string): Record<string, string> => {
	const attrs: Record<string, string> = {};
	for (const match of raw.matchAll(ATTR)) {
		const [, name, doubleQuoted, singleQuoted, bare] = match;
		if (!name) continue;
		attrs[name.toLowerCase()] = decodeEntities(doubleQuoted ?? singleQuoted ?? bare ?? '');
	}
	return attrs;
};

const tokenize = (html: string): Token[] => {
	const tokens: Token[] = [];
	const pattern = /<(\/)?([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;
	let cursor = 0;

	for (const match of html.matchAll(pattern)) {
		const index = match.index ?? 0;
		if (index > cursor) tokens.push({ kind: 'text', value: html.slice(cursor, index) });
		cursor = index + match[0].length;

		const tag = (match[2] ?? '').toLowerCase();
		if (match[1]) {
			tokens.push({ kind: 'close', tag });
			continue;
		}

		const rest = match[3] ?? '';
		const attrs = parseAttributes(rest);
		tokens.push({ kind: 'open', tag, attrs });
		if (VOID_ELEMENTS.has(tag) || rest.trimEnd().endsWith('/')) {
			tokens.push({ kind: 'close', tag });
		}
	}

	if (cursor < html.length) tokens.push({ kind: 'text', value: html.slice(cursor) });
	return tokens;
};

const collapseWhitespace = (value: string) => value.replace(/\s+/g, ' ');

const escapeMarkdown = (value: string) => value.replace(/([\\`*_[\]])/g, '\\$1');

/** Trim blank lines to at most one, and drop leading/trailing blank lines. */
const tidy = (markdown: string): string =>
	markdown
		.replace(/[ \t]+$/gm, '')
		.replace(/\n{3,}/g, '\n\n')
		.trim();

type ListState = { readonly ordered: boolean; index: number };

/** Class tokens that decorate a highlighted block without naming its language. */
const NON_LANGUAGE_CLASS_TOKENS = new Set([
	'sourcecode',
	'hljs',
	'highlight',
	'numberlines',
	'nowrap',
	'code',
	'pre',
	'r-code',
	'chunk'
]);

/**
 * Read the language off a highlighted block's class attribute.
 *
 * rmarkdown emits `class="sourceCode r"` while pandoc and highlight.js emit
 * `class="language-r"`, so both shapes have to be understood.
 */
export const detectCodeLanguage = (className: string | undefined): string | undefined => {
	if (!className) return undefined;

	const prefixed = /(?:language|lang|sourceCode)-([a-zA-Z0-9+#._-]+)/i.exec(className);
	if (prefixed?.[1]) return prefixed[1].toLowerCase();

	for (const token of className.trim().split(/\s+/)) {
		const normalized = token.toLowerCase();
		if (normalized.length === 0) continue;
		if (NON_LANGUAGE_CLASS_TOKENS.has(normalized)) continue;
		if (!/^[a-zA-Z][a-zA-Z0-9+#._-]*$/.test(normalized)) continue;
		return normalized;
	}

	return undefined;
};

/**
 * Extract the `<body>` (or whole document) with the expensive, contentless
 * parts removed before tokenizing.
 */
const prepare = (html: string): string => {
	const body = /<body\b[^>]*>([\s\S]*)<\/body>/i.exec(html);
	let content = body?.[1] ?? html;
	for (const tag of DISCARDED_ELEMENTS) {
		content = content.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?</${tag}>`, 'gi'), '');
	}
	// Base64 plot images carry no retrievable text and dominate the payload.
	content = content.replace(/<img\b[^>]*>/gi, '');
	content = content.replace(/<!--[\s\S]*?-->/g, '');
	// The rendered table of contents duplicates every heading in the document.
	content = content.replace(/<div\b[^>]*id=["']?TOC["']?[^>]*>[\s\S]*?<\/div>/i, '');
	return content;
};

export type HtmlToMarkdownOptions = {
	/** Emitted as an H1 when the document has no title of its own. */
	readonly title?: string;
};

export const htmlToMarkdown = (html: string, options: HtmlToMarkdownOptions = {}): string => {
	const tokens = tokenize(prepare(html));

	const out: string[] = [];
	const listStack: ListState[] = [];
	const inlineStack: string[] = [];

	let preDepth = 0;
	let preBuffer = '';
	let preLanguage = '';
	let anchorHref: string | undefined;
	let anchorText = '';
	let skipDepth = 0;
	let inTableRow = false;
	let rowCells: string[] = [];
	let cellBuffer = '';
	let inCell = false;
	let tableHeaderPending = false;
	const quoteStarts: number[] = [];

	const push = (value: string) => {
		if (inCell) cellBuffer += value;
		else if (anchorHref !== undefined) anchorText += value;
		else out.push(value);
	};

	const pushBlock = (value: string) => {
		out.push(`\n\n${value}\n\n`);
	};

	const listPrefix = (): string => {
		const state = listStack.at(-1);
		if (!state) return '';
		const indent = '  '.repeat(Math.max(0, listStack.length - 1));
		if (state.ordered) {
			state.index += 1;
			return `${indent}${state.index}. `;
		}
		return `${indent}- `;
	};

	for (const token of tokens) {
		if (skipDepth > 0) {
			if (token.kind === 'open' && !VOID_ELEMENTS.has(token.tag)) skipDepth += 1;
			if (token.kind === 'close') skipDepth -= 1;
			continue;
		}

		if (token.kind === 'text') {
			const decoded = decodeEntities(token.value);
			if (preDepth > 0) {
				preBuffer += decoded;
				continue;
			}
			const collapsed = collapseWhitespace(decoded);
			if (collapsed.trim().length === 0) {
				if (collapsed.length > 0) push(' ');
				continue;
			}
			push(escapeMarkdown(collapsed));
			continue;
		}

		if (token.kind === 'open') {
			const { tag, attrs } = token;

			if (DISCARDED_ELEMENTS.has(tag)) {
				skipDepth = 1;
				continue;
			}

			if (preDepth > 0) {
				// Inside <pre>, knitr wraps tokens in <span class="...">; keep only text.
				// The language may be declared on the inner <code> rather than the <pre>.
				if (tag === 'code' && !preLanguage) {
					preLanguage = detectCodeLanguage(attrs['class']) ?? '';
				}
				if (tag === 'br') preBuffer += '\n';
				continue;
			}

			switch (tag) {
				case 'pre': {
					preDepth = 1;
					preBuffer = '';
					preLanguage = detectCodeLanguage(attrs['class']) ?? '';
					break;
				}
				case 'code': {
					// A <code> inside <pre> is handled by the pre branch above; this is
					// the inline case.
					const language = detectCodeLanguage(attrs['class']);
					if (language) preLanguage = language;
					inlineStack.push('`');
					push('`');
					break;
				}
				case 'h1':
				case 'h2':
				case 'h3':
				case 'h4':
				case 'h5':
				case 'h6': {
					out.push(`\n\n${'#'.repeat(Number(tag.slice(1)))} `);
					break;
				}
				case 'p':
				case 'div':
				case 'section':
				case 'article': {
					out.push('\n\n');
					break;
				}
				case 'blockquote': {
					out.push('\n\n');
					quoteStarts.push(out.length);
					break;
				}
				case 'br': {
					push('  \n');
					break;
				}
				case 'hr': {
					pushBlock('---');
					break;
				}
				case 'ul':
				case 'ol': {
					listStack.push({ ordered: tag === 'ol', index: 0 });
					out.push('\n');
					break;
				}
				case 'li': {
					out.push(`\n${listPrefix()}`);
					break;
				}
				case 'strong':
				case 'b': {
					inlineStack.push('**');
					push('**');
					break;
				}
				case 'em':
				case 'i': {
					inlineStack.push('_');
					push('_');
					break;
				}
				case 'a': {
					anchorHref = attrs['href'];
					anchorText = '';
					break;
				}
				case 'table': {
					out.push('\n\n');
					tableHeaderPending = true;
					break;
				}
				case 'tr': {
					inTableRow = true;
					rowCells = [];
					break;
				}
				case 'th':
				case 'td': {
					inCell = true;
					cellBuffer = '';
					break;
				}
				default:
					break;
			}
			continue;
		}

		// close
		const { tag } = token;

		if (preDepth > 0 && tag !== 'pre') continue;

		switch (tag) {
			case 'pre': {
				preDepth = 0;
				const body = preBuffer.replace(/\s+$/, '').replace(/^\n+/, '');
				preBuffer = '';
				if (body.trim().length > 0) {
					// Vignette chunks are R unless the markup names another language.
					pushBlock(`\`\`\`${preLanguage || 'r'}\n${body}\n\`\`\``);
				}
				preLanguage = '';
				break;
			}
			case 'code':
			case 'strong':
			case 'b':
			case 'em':
			case 'i': {
				const marker = inlineStack.pop();
				if (marker) push(marker);
				break;
			}
			case 'a': {
				const href = anchorHref;
				const text = anchorText.trim();
				anchorHref = undefined;
				anchorText = '';
				if (!text) break;
				if (href && /^https?:\/\//i.test(href)) push(`[${text}](${href})`);
				else push(text);
				break;
			}
			case 'ul':
			case 'ol': {
				listStack.pop();
				out.push('\n');
				break;
			}
			case 'th':
			case 'td': {
				inCell = false;
				rowCells.push(collapseWhitespace(cellBuffer).trim().replaceAll('|', '\\|'));
				cellBuffer = '';
				break;
			}
			case 'tr': {
				inTableRow = false;
				if (rowCells.length > 0) {
					out.push(`\n| ${rowCells.join(' | ')} |`);
					if (tableHeaderPending) {
						out.push(`\n|${' --- |'.repeat(rowCells.length)}`);
						tableHeaderPending = false;
					}
				}
				rowCells = [];
				break;
			}
			case 'table': {
				out.push('\n\n');
				tableHeaderPending = false;
				break;
			}
			case 'blockquote': {
				// Quote markers have to be applied to finished lines, so the body is
				// collected first and rewritten on close.
				const start = quoteStarts.pop();
				if (start !== undefined) {
					const body = tidy(out.splice(start).join(''));
					if (body.length > 0) {
						const quoted = body
							.split('\n')
							.map((line) => (line.length > 0 ? `> ${line}` : '>'))
							.join('\n');
						out.push(`${quoted}\n\n`);
					}
				}
				break;
			}
			case 'h1':
			case 'h2':
			case 'h3':
			case 'h4':
			case 'h5':
			case 'h6':
			case 'p':
			case 'div':
			case 'section':
			case 'article': {
				out.push('\n\n');
				break;
			}
			default:
				break;
		}
	}

	// A cell or row left open by malformed markup should not swallow content.
	if (inCell && cellBuffer.trim()) out.push(cellBuffer);
	if (inTableRow && rowCells.length > 0) out.push(`\n| ${rowCells.join(' | ')} |`);

	const markdown = tidy(out.join(''));
	if (!options.title) return markdown;
	if (/^#\s/.test(markdown)) return markdown;
	return `# ${options.title}\n\n${markdown}`;
};
