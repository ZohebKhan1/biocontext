export const stripJsonc = (content: string): string => {
	let out = '';
	let i = 0;
	let inString = false;
	let quote: '"' | "'" | null = null;
	let escaped = false;

	while (i < content.length) {
		const ch = content[i] ?? '';
		const next = content[i + 1] ?? '';

		if (inString) {
			out += ch;
			if (escaped) escaped = false;
			else if (ch === '\\') escaped = true;
			else if (quote && ch === quote) {
				inString = false;
				quote = null;
			}
			i += 1;
			continue;
		}

		if (ch === '/' && next === '/') {
			i += 2;
			while (i < content.length && content[i] !== '\n') i += 1;
			continue;
		}

		if (ch === '/' && next === '*') {
			i += 2;
			while (i < content.length) {
				if (content[i] === '*' && content[i + 1] === '/') {
					i += 2;
					break;
				}
				i += 1;
			}
			continue;
		}

		if (ch === '"' || ch === "'") {
			inString = true;
			quote = ch;
			out += ch;
			i += 1;
			continue;
		}

		out += ch;
		i += 1;
	}

	let normalized = '';
	inString = false;
	quote = null;
	escaped = false;
	i = 0;

	while (i < out.length) {
		const ch = out[i] ?? '';

		if (inString) {
			normalized += ch;
			if (escaped) escaped = false;
			else if (ch === '\\') escaped = true;
			else if (quote && ch === quote) {
				inString = false;
				quote = null;
			}
			i += 1;
			continue;
		}

		if (ch === '"' || ch === "'") {
			inString = true;
			quote = ch;
			normalized += ch;
			i += 1;
			continue;
		}

		if (ch === ',') {
			let j = i + 1;
			while (j < out.length && /\s/.test(out[j] ?? '')) j += 1;
			const nextNonWs = out[j] ?? '';
			if (nextNonWs === ']' || nextNonWs === '}') {
				i += 1;
				continue;
			}
		}

		normalized += ch;
		i += 1;
	}

	return normalized.trim();
};

export const parseJsonc = (content: string): unknown => JSON.parse(stripJsonc(content));
