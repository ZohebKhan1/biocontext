/**
 * Debian Control File parsing.
 *
 * Bioconductor publishes its package index as DCF (the same format as an R
 * `DESCRIPTION` file): `Field: value` records separated by blank lines, where a
 * line starting with whitespace continues the previous field.
 */

export type DcfRecord = Record<string, string>;

const CONTINUATION = /^[ \t]/;
// R DESCRIPTION files use `Authors@R`; rejecting `@` leaves the prior field
// active and can append indented author continuations to values such as Version.
const FIELD = /^([A-Za-z0-9][A-Za-z0-9._@-]*)\s*:\s?(.*)$/;

/**
 * Parse a DCF document into one record per blank-line-separated block.
 *
 * Unparseable lines are skipped rather than thrown on: the Bioconductor VIEWS
 * files are large and occasionally contain stray content, and a single bad line
 * should never cost the user the whole catalog.
 */
export const parseDcf = (content: string): DcfRecord[] => {
	const records: DcfRecord[] = [];
	let current: DcfRecord = {};
	let lastField: string | undefined;

	const flush = () => {
		if (Object.keys(current).length > 0) records.push(current);
		current = {};
		lastField = undefined;
	};

	for (const rawLine of content.replaceAll('\r\n', '\n').split('\n')) {
		if (rawLine.trim().length === 0) {
			flush();
			continue;
		}

		if (CONTINUATION.test(rawLine) && lastField) {
			current[lastField] = `${current[lastField] ?? ''} ${rawLine.trim()}`.trim();
			continue;
		}

		const match = FIELD.exec(rawLine);
		if (!match) continue;

		const [, field, value] = match;
		if (!field) continue;
		lastField = field;
		current[field] = value ?? '';
	}

	flush();
	return records;
};

/** Split a DCF field that holds a comma-separated list (biocViews, Imports, ...). */
export const parseDcfList = (value: string | undefined): string[] =>
	(value ?? '')
		.split(',')
		.map((entry) => entry.trim())
		.filter((entry) => entry.length > 0);
