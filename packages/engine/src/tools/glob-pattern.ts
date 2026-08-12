const escapeRegex = (value: string) => value.replace(/[\\.^$+?()[\]|]/g, '\\$&');

/** Minimal deterministic glob syntax shared by glob and grep include filters. */
export const globToRegExp = (pattern: string): RegExp => {
	let regex = '^';
	let index = 0;
	while (index < pattern.length) {
		const char = pattern[index] ?? '';
		const next = pattern[index + 1] ?? '';
		if (char === '*' && next === '*' && pattern[index + 2] === '/') {
			regex += '(?:.*/)?';
			index += 3;
			continue;
		}
		if (char === '*' && next === '*') {
			regex += '.*';
			index += 2;
			continue;
		}
		if (char === '*') {
			regex += '[^/]*';
			index += 1;
			continue;
		}
		if (char === '?') {
			regex += '[^/]';
			index += 1;
			continue;
		}
		if (char === '{') {
			const end = pattern.indexOf('}', index + 1);
			if (end > index + 1) {
				const alternatives = pattern
					.slice(index + 1, end)
					.split(',')
					.map(escapeRegex);
				regex += `(?:${alternatives.join('|')})`;
				index = end + 1;
				continue;
			}
		}
		regex += escapeRegex(char);
		index += 1;
	}
	return new RegExp(`${regex}$`);
};

export const buildIncludeMatcher = (pattern: string): ((relativePath: string) => boolean) => {
	const regex = globToRegExp(pattern);
	if (!pattern.includes('/')) {
		return (relativePath) => {
			const baseName = relativePath.slice(relativePath.lastIndexOf('/') + 1);
			return regex.test(baseName) || regex.test(relativePath);
		};
	}
	return (relativePath) => regex.test(relativePath);
};
