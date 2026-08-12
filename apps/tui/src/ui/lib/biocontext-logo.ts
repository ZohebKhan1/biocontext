const BIOCONTEXT_GLYPHS = {
	b: ['111110', '100001', '100001', '100001', '111110', '100001', '100001', '100001', '111110'],
	i: ['111111', '001100', '001100', '001100', '001100', '001100', '001100', '001100', '111111'],
	o: ['011110', '100001', '100001', '100001', '100001', '100001', '100001', '100001', '011110'],
	c: ['011111', '100000', '100000', '100000', '100000', '100000', '100000', '100000', '011111'],
	n: ['100001', '110001', '110001', '101001', '101001', '100101', '100101', '100011', '100001'],
	t: ['111111', '001100', '001100', '001100', '001100', '001100', '001100', '001100', '001100'],
	e: ['111111', '100000', '100000', '100000', '111110', '100000', '100000', '100000', '111111'],
	x: ['100001', '100001', '010010', '010010', '001100', '010010', '010010', '100001', '100001']
} as const;

export const BIOCONTEXT_LOGICAL_GLYPHS = BIOCONTEXT_GLYPHS;
export const BIOCONTEXT_LOGICAL_ALLOWED_CHARACTERS = ['0', '1'] as const;

type LogoRegion = 'bio' | 'context';

type LogoSurface = 'face-high' | 'face-mid' | 'face-low' | 'depth-near' | 'depth-far';

export type BiocontextLogoTone = `${LogoRegion}-${LogoSurface}`;

export const BIOCONTEXT_LOGO_TONES = [
	'bio-face-high',
	'bio-face-mid',
	'bio-face-low',
	'bio-depth-near',
	'bio-depth-far',
	'context-face-high',
	'context-face-mid',
	'context-face-low',
	'context-depth-near',
	'context-depth-far'
] as const satisfies readonly BiocontextLogoTone[];

export const BIOCONTEXT_LOGO_COLORS = {
	'bio-face-high': '#a4eee5',
	'bio-face-mid': '#5fd4c9',
	'bio-face-low': '#35aaa2',
	'bio-depth-near': '#277c77',
	'bio-depth-far': '#183f3d',
	'context-face-high': '#e5eef7',
	'context-face-mid': '#7bc9e8',
	'context-face-low': '#789ce8',
	'context-depth-near': '#615a9e',
	'context-depth-far': '#303047'
} as const satisfies Record<BiocontextLogoTone, string>;

export type BiocontextLogoRun = {
	text: string;
	foreground?: BiocontextLogoTone;
	background?: BiocontextLogoTone;
};

type LogoPixel = BiocontextLogoTone | null;

const PRODUCT_NAME = 'biocontext';
const GLYPH_WIDTH = BIOCONTEXT_GLYPHS.b[0].length;
const GLYPH_HEIGHT = BIOCONTEXT_GLYPHS.b.length;
const LETTER_GAP = 1;
const WORD_GAP = 2;
const BASE_WIDTH =
	PRODUCT_NAME.length * GLYPH_WIDTH + (PRODUCT_NAME.length - 2) * LETTER_GAP + WORD_GAP;

const PROJECTION_LAYERS = [
	{ offsetX: 2, offsetY: 2, surface: 'depth-far' },
	{ offsetX: 1, offsetY: 1, surface: 'depth-near' }
] as const satisfies ReadonlyArray<{
	offsetX: number;
	offsetY: number;
	surface: LogoSurface;
}>;

const MAX_PROJECTION_X = Math.max(...PROJECTION_LAYERS.map((layer) => layer.offsetX));
const MAX_PROJECTION_Y = Math.max(...PROJECTION_LAYERS.map((layer) => layer.offsetY));
const LOGICAL_WIDTH = BASE_WIDTH + MAX_PROJECTION_X;
const LOGICAL_HEIGHT = GLYPH_HEIGHT + MAX_PROJECTION_Y;

export const BIOCONTEXT_FULL_WIDTH = LOGICAL_WIDTH;
export const BIOCONTEXT_FULL_HEIGHT = Math.ceil(LOGICAL_HEIGHT / 2);
export const BIOCONTEXT_COMPACT_WIDTH = PRODUCT_NAME.length;
export const BIOCONTEXT_COMPACT_HEIGHT = 1;
export const BIOCONTEXT_FULL_ALLOWED_CHARACTERS = [' ', '▀', '▄', '█'] as const;

const createGrid = <T>(height: number, width: number, value: T): T[][] =>
	Array.from({ length: height }, () => Array<T>(width).fill(value));

const letterOffsetX = (letterIndex: number): number =>
	letterIndex * (GLYPH_WIDTH + LETTER_GAP) + (letterIndex >= 3 ? WORD_GAP - LETTER_GAP : 0);

const buildMainPixels = (): Array<Array<LogoRegion | null>> => {
	const pixels = createGrid<LogoRegion | null>(GLYPH_HEIGHT, BASE_WIDTH, null);

	for (const [letterIndex, letter] of [...PRODUCT_NAME].entries()) {
		const glyph = BIOCONTEXT_GLYPHS[letter as keyof typeof BIOCONTEXT_GLYPHS];
		const region: LogoRegion = letterIndex < 3 ? 'bio' : 'context';
		const offsetX = letterOffsetX(letterIndex);

		for (const [rowIndex, row] of glyph.entries()) {
			for (const [columnIndex, pixel] of [...row].entries()) {
				if (pixel === '1') pixels[rowIndex]![offsetX + columnIndex] = region;
			}
		}
	}

	return pixels;
};

const tone = (region: LogoRegion, surface: LogoSurface): BiocontextLogoTone =>
	`${region}-${surface}`;

const faceSurface = (y: number): LogoSurface => {
	if (y <= 2) return 'face-high';
	if (y <= 5) return 'face-mid';
	return 'face-low';
};

const buildStyledPixels = (): LogoPixel[][] => {
	const mainPixels = buildMainPixels();
	const pixels = createGrid<LogoPixel>(LOGICAL_HEIGHT, LOGICAL_WIDTH, null);

	for (const layer of PROJECTION_LAYERS) {
		for (let y = 0; y < GLYPH_HEIGHT; y += 1) {
			for (let x = 0; x < BASE_WIDTH; x += 1) {
				const region = mainPixels[y]?.[x];
				if (region) pixels[y + layer.offsetY]![x + layer.offsetX] = tone(region, layer.surface);
			}
		}
	}

	for (let y = 0; y < GLYPH_HEIGHT; y += 1) {
		for (let x = 0; x < BASE_WIDTH; x += 1) {
			const region = mainPixels[y]?.[x];
			if (!region) continue;
			pixels[y]![x] = tone(region, faceSurface(y));
		}
	}

	return pixels;
};

const encodeCell = (upper: LogoPixel, lower: LogoPixel): BiocontextLogoRun => {
	if (!upper && !lower) return { text: ' ' };
	if (upper && upper === lower) return { text: '█', foreground: upper };
	if (upper && lower) return { text: '▀', foreground: upper, background: lower };
	if (upper) return { text: '▀', foreground: upper };
	return { text: '▄', foreground: lower ?? undefined };
};

const appendRun = (runs: BiocontextLogoRun[], cell: BiocontextLogoRun) => {
	const previous = runs.at(-1);
	if (
		previous &&
		previous.foreground === cell.foreground &&
		previous.background === cell.background
	) {
		previous.text += cell.text;
		return;
	}
	runs.push({ ...cell });
};

const buildLogoRows = (): BiocontextLogoRun[][] => {
	const pixels = buildStyledPixels();
	const rows: BiocontextLogoRun[][] = [];

	for (let y = 0; y < LOGICAL_HEIGHT; y += 2) {
		const runs: BiocontextLogoRun[] = [];
		for (let x = 0; x < LOGICAL_WIDTH; x += 1) {
			appendRun(runs, encodeCell(pixels[y]?.[x] ?? null, pixels[y + 1]?.[x] ?? null));
		}
		rows.push(runs);
	}

	return rows;
};

export const BIOCONTEXT_FULL_ROWS = buildLogoRows();

export type BiocontextLogoVariant = 'full' | 'compact' | 'hidden';

type SelectBiocontextLogoVariantOptions = {
	terminalWidth: number;
	terminalHeight: number;
	startupSummary: string;
};

export const selectBiocontextLogoVariant = ({
	terminalWidth,
	terminalHeight,
	startupSummary
}: SelectBiocontextLogoVariantOptions): BiocontextLogoVariant => {
	const usableColumns = Math.max(1, terminalWidth - 5);
	const conversationRows = Math.max(0, terminalHeight - 9);
	const summaryColumns = Math.max(1, usableColumns - 4);
	const summaryRows = Math.max(1, Math.ceil(startupSummary.length / summaryColumns) + 1);
	const requiredRows = (logoRows: number) => 2 + logoRows + 2 + 1 + 1 + summaryRows;

	if (
		usableColumns >= BIOCONTEXT_FULL_WIDTH &&
		requiredRows(BIOCONTEXT_FULL_HEIGHT) <= conversationRows
	) {
		return 'full';
	}

	if (
		usableColumns >= BIOCONTEXT_COMPACT_WIDTH &&
		requiredRows(BIOCONTEXT_COMPACT_HEIGHT) <= conversationRows
	) {
		return 'compact';
	}

	return 'hidden';
};
