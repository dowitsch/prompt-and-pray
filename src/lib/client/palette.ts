/**
 * Seat colours and small storybook helpers.
 *
 * Your own agent is always the candle — the one warm light on the board — no
 * matter which seat you took. The others are cool and quieter, so they read as
 * someone else's story happening alongside yours.
 */

const OPPONENT_COLORS = ['#8fa6e8', '#b48ce0', '#6fb3ae', '#9aa0b8'];
export const CANDLE = '#e8b45c';

export function agentColor(seat: number, isYou: boolean): string {
	return isYou ? CANDLE : OPPONENT_COLORS[seat % OPPONENT_COLORS.length];
}

/** Two-letter sigil for an agent avatar. */
export function sigil(name: string): string {
	const cleaned = name.replace(/[^A-Za-z0-9 ]/g, '').trim();
	const words = cleaned.split(/\s+/);
	if (words.length > 1) return (words[0][0] + words[1][0]).toUpperCase();
	return cleaned.slice(0, 2).toUpperCase() || '??';
}

const NUMERALS: [number, string][] = [
	[1000, 'M'],
	[900, 'CM'],
	[500, 'D'],
	[400, 'CD'],
	[100, 'C'],
	[90, 'XC'],
	[50, 'L'],
	[40, 'XL'],
	[10, 'X'],
	[9, 'IX'],
	[5, 'V'],
	[4, 'IV'],
	[1, 'I']
];

/** Rounds and memory entries are numbered like chapters, not like rows. */
export function roman(value: number): string {
	let remaining = Math.max(0, Math.floor(value));
	let out = '';
	for (const [amount, glyph] of NUMERALS) {
		while (remaining >= amount) {
			out += glyph;
			remaining -= amount;
		}
	}
	return out || '—';
}
