/**
 * The colours, in one place.
 *
 * The design uses exactly these and nothing else — anything softer is one of
 * them at reduced opacity. Before this file the truth was in three places at
 * once (the CSS `@theme` block, the old `palette.ts`, and a few dozen literal
 * hexes inside the map), which is why re-theming used to mean a hunt.
 *
 * `src/routes/layout.css` mirrors these as CSS custom properties for the cases
 * that are pure markup; anything a component has to compute reads them here.
 */

/** The five identities, in palette order. A player owns one for the whole match. */
export const PLAYER_COLORS = ['#F59D89', '#FFB775', '#FA924B', '#B05A49', '#7B4A5F'] as const;

/** The design's own furniture: the road on the map, the middle of every gradient. */
export const ACCENT = '#C3788C';

/** The two neutrals. Nothing else in the design is dark. */
export const DARK = '#1C1F22';
export const BRIGHT = '#23272A';

export const WHITE = '#FFFFFF';

/**
 * Text on a coloured ground.
 *
 * The design puts white on all five, and that is what ships. It is kept behind a
 * function rather than inlined because white on #F59D89 is about 2:1 and on
 * #FFB775 worse, so the day someone reads a lobby in sunlight and wants ink on
 * the three light colours, this is the only line that changes.
 */
export function inkOn(colour: string): string {
	void colour;
	return WHITE;
}

/** A translucent wash of a colour, for fills that sit over artwork. */
export function wash(colour: string, percent: number): string {
	return `color-mix(in srgb, ${colour} ${percent}%, transparent)`;
}
