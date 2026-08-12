const mathSymbols: Record<string, string> = {
	alpha: 'α',
	beta: 'β',
	gamma: 'γ',
	delta: 'δ',
	epsilon: 'ε',
	varepsilon: 'ϵ',
	theta: 'θ',
	vartheta: 'ϑ',
	lambda: 'λ',
	mu: 'μ',
	nu: 'ν',
	pi: 'π',
	varpi: 'ϖ',
	rho: 'ρ',
	sigma: 'σ',
	varsigma: 'ς',
	phi: 'φ',
	varphi: 'ϕ',
	omega: 'ω',
	Gamma: 'Γ',
	Delta: 'Δ',
	Theta: 'Θ',
	Lambda: 'Λ',
	Pi: 'Π',
	Sigma: 'Σ',
	Phi: 'Φ',
	Omega: 'Ω',
	infty: '∞',
	pm: '±',
	cdot: '·',
	times: '×',
	approx: '≈',
	sim: '∼',
	propto: '∝',
	le: '≤',
	leq: '≤',
	ge: '≥',
	geq: '≥',
	neq: '≠',
	to: '→',
	rightarrow: '→',
	leftarrow: '←',
	mapsto: '↦',
	partial: '∂',
	nabla: '∇',
	forall: '∀',
	exists: '∃',
	sum: '∑',
	prod: '∏',
	log: 'log',
	exp: 'exp',
	argmax: 'argmax',
	argmin: 'argmin'
};

const formatMathLine = (value: string): string => {
	let line = value
		.replace(/\\operatorname\{([^{}]*)\}/gu, '$1')
		.replace(/\\(?:mathrm|text|mathbf|mathit|mathsf|mathbb)\{([^{}]*)\}/gu, '$1')
		.replace(/\\(?:widehat|hat)\{([^{}]*)\}/gu, '$1̂')
		.replace(/\\(?:overline|bar)\{([^{}]*)\}/gu, '$1̄')
		.replace(/\\(?:widetilde|tilde)\{([^{}]*)\}/gu, '$1̃')
		.replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/gu, '($1 / $2)')
		.replace(/\\sqrt\s*\{([^{}]*)\}/gu, '√($1)')
		.replace(/\\(?:begin|end)\{[^{}]+\}/gu, '')
		.replace(
			/\\(?:left|right|middle|displaystyle|textstyle|scriptstyle|quad|qquad|enspace)(?![A-Za-z])/gu,
			''
		)
		.replace(/\\(?:,|;|:|!)/gu, ' ')
		.replace(/\\([A-Za-z]+)/gu, (_match, command: string) => mathSymbols[command] ?? command)
		.replace(/([_^])\s*\{([^{}]*)\}/gu, '$1$2')
		.replace(/\\\\/gu, '\n')
		.replace(/&/gu, '')
		.replace(/[{}]/gu, '');

	return line
		.split('\n')
		.map((part) => part.replace(/\s+/gu, ' ').trim())
		.join('\n')
		.trim();
};

/** Convert common LaTeX notation to readable terminal text without losing meaning. */
export const formatMathForTerminal = (value: string): string => formatMathLine(value);

const inlineMath = /\\\((.+?)\\\)|(?<!\$)\$(?!\$)([^$\n]+?)(?<!\$)\$(?!\$)/gu;

const normalizeInlineMath = (line: string): string => {
	const segments = line.split(/(`+)/gu);
	return segments
		.map((segment, index) => {
			if (index % 2 === 1) return segment;
			return segment.replace(
				inlineMath,
				(_match: string, bracketed: string | undefined, dollar: string | undefined) =>
					`\`${formatMathLine(bracketed ?? dollar ?? '')}\``
			);
		})
		.join('');
};

const isFence = (line: string): string | null => line.match(/^\s*(`{3,}|~{3,})/u)?.[1] ?? null;

const isClosingFence = (line: string, marker: string): boolean => {
	const candidate = isFence(line);
	return candidate !== null && candidate[0] === marker[0] && candidate.length >= marker.length;
};

const displayMathStart = (line: string): { delimiter: '\\[' | '$$'; remainder: string } | null => {
	const match = line.match(/^\s*(\\\[|\$\$)\s*(.*)$/u);
	if (!match) return null;
	return { delimiter: match[1] as '\\[' | '$$', remainder: match[2] ?? '' };
};

const inlineDisplayMath = (remainder: string, delimiter: '\\[' | '$$'): string | null => {
	const match =
		delimiter === '\\[' ? remainder.match(/^(.*?)\\\]\s*$/u) : remainder.match(/^(.*?)\$\$\s*$/u);
	return match?.[1] ?? null;
};

/**
 * OpenTUI renders standard Markdown but has no LaTeX math token. Convert
 * completed display equations into plain-text code blocks and inline math into
 * code spans for a stable, readable terminal presentation. The original
 * response remains unchanged in message state and clipboard output.
 */
export const normalizeTerminalMarkdown = (markdown: string): string => {
	const lines = markdown.split('\n');
	const output: string[] = [];
	let fenceMarker: string | null = null;

	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index] ?? '';
		const fence = isFence(line);

		if (fenceMarker) {
			output.push(line);
			if (isClosingFence(line, fenceMarker)) fenceMarker = null;
			continue;
		}

		if (fence) {
			output.push(line);
			fenceMarker = fence;
			continue;
		}

		const start = displayMathStart(line);
		if (!start) {
			output.push(normalizeInlineMath(line));
			continue;
		}

		const sameLine = inlineDisplayMath(start.remainder, start.delimiter);
		if (sameLine !== null) {
			output.push('```', formatMathLine(sameLine), '```');
			continue;
		}

		let closingIndex = -1;
		const closingDelimiter = start.delimiter === '\\[' ? '\\]' : '$$';
		for (let candidate = index + 1; candidate < lines.length; candidate += 1) {
			if (lines[candidate]?.trim() === closingDelimiter) {
				closingIndex = candidate;
				break;
			}
		}

		if (closingIndex < 0) {
			// Keep an incomplete streaming equation intact until its delimiter arrives.
			output.push(...lines.slice(index));
			break;
		}

		const body = [start.remainder, ...lines.slice(index + 1, closingIndex)].join('\n');
		output.push('```', formatMathLine(body), '```');
		index = closingIndex;
	}

	return output.join('\n');
};
