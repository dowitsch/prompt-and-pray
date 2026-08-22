/**
 * Who a player *looks* like.
 *
 * The one place that answers "what colour is this player" and "which portrait".
 * Every pill, ring, tint, timer digit and gradient goes through here, which is
 * what makes the identity stable: the design's whole premise is that a colour
 * means one player for the length of a match, and that only holds if nothing
 * computes it a second way.
 *
 * Note what changed from HOMEWARD: colour used to be "am I looking at myself?"
 * — your own agent was always the candle, whoever you were. Here the colour is
 * the player's, the same on every phone, and *you* are marked by a white ring
 * instead.
 */

import type { PublicPlayer } from '$lib/engine/game';
import { CHARACTER_COUNT, characterAt } from '$lib/engine/characters';
import { PLAYER_COLORS, WHITE } from './theme';

/**
 * How many characters the config screen offers.
 *
 * Re-exported rather than declared: this module's whole premise is that identity
 * is computed in exactly one place, and a second copy of the count is the same
 * mistake one level down.
 */
export { CHARACTER_COUNT };

/**
 * The player's chosen colour.
 *
 * Falls back to the seat when the field is missing — a match restored from
 * before the column existed, or a snapshot in flight during a deploy. `Game`
 * normalises identity on restore, so this is belt and braces rather than a
 * second source of truth.
 */
export function colorOf(player: { colour?: number; seat: number }): string {
	const index = player.colour ?? player.seat;
	return PLAYER_COLORS[index % PLAYER_COLORS.length];
}

export function characterOf(player: { character?: number; seat: number }): number {
	return (player.character ?? player.seat) % CHARACTER_COUNT;
}

/**
 * Where a portrait lives, in the size the caller actually draws it at.
 *
 * Named after the character rather than numbered, so the file on disk says who
 * is in it: `krotz.webp`, not `0.webp`. Every consumer resolves the URL through
 * here at runtime — there is no manifest and no bundle — so the four pairs in
 * `static/characters/` are the whole of the art.
 *
 * Two sizes, because the same figure is a 300px cut-out in the carousel and a
 * 36px disc on the map. `full` is the standing figure on transparency; `avatar`
 * is the square crop of the head, which is the only part legible in a disc.
 * Both keep their `onerror` fallback at the call site: a missed deploy should
 * be a hatched placeholder, not a broken image.
 */
export function characterSrc(index: number, size: 'full' | 'avatar' = 'full'): string {
	const { id } = characterAt(index);
	return size === 'avatar' ? `/characters/${id}-avatar.webp` : `/characters/${id}.webp`;
}

/**
 * What the *agent* is called.
 *
 * The player's own name belongs to the operator and stays on the roster, the
 * lobby and the toasts. Anything the agent does on the map — speaks, arrives,
 * dies, wins — is signed with this.
 */
export function characterNameOf(player: { character?: number; seat: number }): string {
	return characterAt(characterOf(player)).name;
}

/** The ring around a token or avatar: white for you, your colour for everyone else. */
export function ringOf(player: PublicPlayer, youId: string | null): string {
	return player.id === youId ? WHITE : colorOf(player);
}
