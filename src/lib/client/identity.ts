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
import { PLAYER_COLORS, WHITE } from './theme';

/** How many portraits the config screen offers. */
export const CHARACTER_COUNT = 5;

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

/** Where a portrait lives. The art may genuinely not be there yet. */
export function characterSrc(index: number): string {
	return `/characters/${index % CHARACTER_COUNT}.png`;
}

/** The ring around a token or avatar: white for you, your colour for everyone else. */
export function ringOf(player: PublicPlayer, youId: string | null): string {
	return player.id === youId ? WHITE : colorOf(player);
}
