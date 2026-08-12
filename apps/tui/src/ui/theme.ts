// Carbon-dark terminal palette for the biocontext TUI.
//
// The ground matches the user's Ghostty background, while the site-inspired
// teal-cyan accent gives interaction states a little more lift without turning
// neon. Keeping these values here makes the TUI palette easy to tune without
// hunting through individual components.
export const colors = {
	// Backgrounds
	bg: '#101010',
	bgSubtle: '#151515',
	bgMuted: '#1b1b1b',
	bgInput: '#151515',
	bgRaised: '#1f1f1f',

	// Text
	text: '#f2f4f8',
	textMuted: '#c0c7c8',
	textSubtle: '#8c9798',
	textFaint: '#626c6d',
	textCommand: '#9ce9e1',
	textPasted: '#c7dcd9',

	// Borders
	border: '#202020',
	borderSubtle: '#2e2e2e',

	// Site-inspired teal-cyan primary accent, lifted slightly for terminal contrast.
	accent: '#5fd4c9',
	accentBright: '#8ce6dd',
	accentDark: '#358f87',

	// Semantic
	success: '#78d6a6',
	assistant: '#6dd8d0',
	info: '#71c8e9',
	error: '#f47e8a',

	// Retrieval tool activity
	toolSearch: '#e57e88',
	toolRead: '#78a9ff',
	toolGrep: '#6dd8d0',
	toolGlob: '#ba9de6',
	toolList: '#8cb6ff',

	// Balanced syntax colors for Markdown code blocks and source snippets.
	syntax: {
		keyword: '#7ebfff',
		keywordControl: '#c6aaf0',
		type: '#7ddbd1',
		function: '#f2c879',
		variable: '#9dd5e0',
		string: '#f2a087',
		stringSpecial: '#f1c582',
		number: '#8fdae3',
		boolean: '#79cfe2',
		constant: '#6ddbd0',
		comment: '#7d8788',
		punctuation: '#d5dddc',
		tag: '#76ceda',
		label: '#c4aaee',
		diffAdd: '#67d9cd',
		diffDelete: '#f47e8a'
	}
} as const;

export const getColor = (type: 'text' | 'command' | 'mention' | 'pasted') => {
	switch (type) {
		case 'mention':
			return colors.accent;
		case 'command':
			return colors.textCommand;
		case 'pasted':
			return colors.textPasted;
		default:
			return colors.text;
	}
};

export type Colors = typeof colors;
