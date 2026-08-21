/**
 * Seat colours.
 *
 * Your own agent is always the ember — the single warm light on the board — no
 * matter which seat you took. Opponents get cool, quieter colours so they read
 * as other people's business happening in your peripheral vision.
 */

const OPPONENT_COLORS = ['#7c9cf5', '#a98cf0', '#56b6c2', '#8f98ad'];
export const EMBER = '#f5b544';

export function agentColor(seat: number, isYou: boolean): string {
	return isYou ? EMBER : OPPONENT_COLORS[seat % OPPONENT_COLORS.length];
}

/** Two-letter sigil for an agent avatar. */
export function sigil(name: string): string {
	const cleaned = name.replace(/[^A-Za-z0-9 ]/g, '').trim();
	const words = cleaned.split(/\s+/);
	if (words.length > 1) return (words[0][0] + words[1][0]).toUpperCase();
	return cleaned.slice(0, 2).toUpperCase() || '??';
}
