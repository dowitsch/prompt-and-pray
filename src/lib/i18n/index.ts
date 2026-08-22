import { en } from './en.ts';
import { de } from './de.ts';
import { isLocale, type Locale, type Strings } from './types.ts';

export { LOCALES, LOCALE_NAMES, isLocale } from './types.ts';
export type { Locale, Strings } from './types.ts';

const DICTIONARIES: Record<Locale, Strings> = { en, de };

export const DEFAULT_LOCALE: Locale = 'en';

export function strings(locale: Locale): Strings {
	return DICTIONARIES[locale] ?? en;
}

/** Fill `{name}` placeholders. Missing values are left as-is so they are obvious. */
export function fmt(template: string, values: Record<string, string | number> = {}): string {
	return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
		key in values ? String(values[key]) : whole
	);
}

/** Best guess from the browser, used only until a match sets the language. */
export function preferredLocale(candidates: readonly string[]): Locale {
	for (const candidate of candidates) {
		const short = candidate.slice(0, 2).toLowerCase();
		if (isLocale(short)) return short;
	}
	return DEFAULT_LOCALE;
}

/**
 * Split a template around one placeholder, so a component can wrap that part in
 * markup without `{@html}`.
 *
 * Agent names are typed by players, so interpolating them into raw HTML would
 * be a genuine injection hole rather than a lint nag. Returning the surrounding
 * text lets the template stay translated and the value stay escaped.
 */
export function parts(
	template: string,
	key: string,
	values: Record<string, string | number> = {}
): { before: string; after: string } {
	const [before = '', after = ''] = fmt(template, values).split(`{${key}}`);
	return { before, after };
}

/**
 * "a, b or c" in the right language and with the right conjunction.
 * Used for the list of paths at a crossroads.
 */
export function listWays(locale: Locale, ways: string[]): string {
	const s = strings(locale);
	if (ways.length === 1) return fmt(s.narration.waysOne, { a: ways[0] });
	if (ways.length === 2) return fmt(s.narration.waysTwo, { a: ways[0], b: ways[1] });
	return fmt(s.narration.waysMany, {
		list: ways.slice(0, -1).join(', '),
		last: ways.at(-1) ?? ''
	});
}
