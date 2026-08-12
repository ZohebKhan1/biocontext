const langAliases: Record<string, string> = {
	rscript: 'r',
	rlang: 'r',
	rmd: 'r',
	rmarkdown: 'r',
	sweave: 'r',
	sh: 'bash',
	shell: 'bash',
	zsh: 'bash',
	console: 'bash',
	py: 'python',
	yml: 'yaml',
	md: 'markdown'
};

// Fences are matched against lowercase filetypes, so ```R must fold to ```r.
const normalizeLang = (lang: string) => {
	const lower = lang.toLowerCase();
	return langAliases[lower] ?? lower;
};

export const normalizeFenceLang = (markdown: string) =>
	markdown
		.split('\n')
		.map((line) => {
			const m = /^(\s*)(```+|~~~+)(\s*)([^\s]+)(.*)$/.exec(line);
			if (!m) return line;
			const indent = m[1] ?? '';
			const fence = m[2] ?? '';
			const ws = m[3] ?? '';
			const rawLang = m[4];
			const rest = m[5] ?? '';
			if (!rawLang) return line;
			return `${indent}${fence}${ws}${normalizeLang(rawLang)}${rest}`;
		})
		.join('\n');
