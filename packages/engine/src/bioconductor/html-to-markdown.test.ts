import { describe, expect, it } from 'bun:test';

import { decodeEntities, htmlToMarkdown } from './html-to-markdown.ts';

describe('decodeEntities', () => {
	it('decodes named, decimal, and hex entities', () => {
		expect(decodeEntities('a &amp; b &#60; c &#x3E; d &alpha;')).toBe('a & b < c > d α');
	});

	it('leaves unknown entities untouched', () => {
		expect(decodeEntities('&notarealentity;')).toBe('&notarealentity;');
	});
});

describe('htmlToMarkdown', () => {
	it('converts headings, paragraphs, and emphasis', () => {
		const md = htmlToMarkdown(
			'<h2>Design</h2><p>Use <strong>DESeq</strong> and <em>lfcShrink</em>.</p>'
		);
		expect(md).toBe('## Design\n\nUse **DESeq** and _lfcShrink_.');
	});

	it('renders code blocks as R fences by default', () => {
		const md = htmlToMarkdown('<pre><code>dds &lt;- DESeq(dds)</code></pre>');
		expect(md).toBe('```r\ndds <- DESeq(dds)\n```');
	});

	it('honours an explicit language class on the code element', () => {
		const md = htmlToMarkdown('<pre><code class="sourceCode bash">R CMD check</code></pre>');
		expect(md).toBe('```bash\nR CMD check\n```');
	});

	it('keeps absolute links and unwraps relative ones', () => {
		const md = htmlToMarkdown(
			'<p><a href="https://bioconductor.org/x">docs</a> and <a href="#local">here</a></p>'
		);
		expect(md).toBe('[docs](https://bioconductor.org/x) and here');
	});

	it('prefixes every line of a blockquote', () => {
		const md = htmlToMarkdown('<blockquote><p>Love et al.</p><p>2014</p></blockquote>');
		expect(md).toBe('> Love et al.\n>\n> 2014');
	});

	it('numbers ordered lists and nests unordered lists', () => {
		const md = htmlToMarkdown('<ol><li>first</li><li>second</li></ol>');
		expect(md).toContain('1. first');
		expect(md).toContain('2. second');
	});

	it('renders tables with a header separator', () => {
		const md = htmlToMarkdown(
			'<table><tr><th>gene</th><th>padj</th></tr><tr><td>TP53</td><td>0.01</td></tr></table>'
		);
		expect(md).toContain('| gene | padj |');
		expect(md).toContain('| --- | --- |');
		expect(md).toContain('| TP53 | 0.01 |');
	});

	it('drops scripts, styles, images, and the generated table of contents', () => {
		const md = htmlToMarkdown(
			[
				'<body>',
				'<style>.x{color:red}</style>',
				'<script>console.log(1)</script>',
				'<div id="TOC"><ul><li><a href="#a">Contents entry</a></li></ul></div>',
				'<img src="data:image/png;base64,AAAA">',
				'<p>Real content.</p>',
				'</body>'
			].join('')
		);
		expect(md).toBe('Real content.');
	});

	it('adds the supplied title only when the document has no heading of its own', () => {
		expect(htmlToMarkdown('<p>body</p>', { title: 'Vignette' })).toBe('# Vignette\n\nbody');
		expect(htmlToMarkdown('<h1>Own title</h1><p>body</p>', { title: 'Vignette' })).toBe(
			'# Own title\n\nbody'
		);
	});

	it('escapes markdown control characters in prose', () => {
		expect(htmlToMarkdown('<p>a_b and *c*</p>')).toBe('a\\_b and \\*c\\*');
	});

	it('does not escape inside code blocks', () => {
		const md = htmlToMarkdown('<pre><code>x_y <- a*b</code></pre>');
		expect(md).toBe('```r\nx_y <- a*b\n```');
	});

	it('collapses runs of blank lines', () => {
		const md = htmlToMarkdown('<p>one</p><div></div><div></div><p>two</p>');
		expect(md).toBe('one\n\ntwo');
	});
});
