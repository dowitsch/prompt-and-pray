/**
 * Whose story the screen is telling.
 *
 * A round is taken in turns: one agent walks while the others wait. The feed is
 * tagged per player and the camera follows one token, so something has to decide
 * *which* player the Map screen means — and the answer cannot be "you", because
 * for three turns out of four you are standing still with nothing to read.
 *
 * So the screen follows the teller. Tapping a face takes it away for a moment;
 * the next turn takes it back.
 *
 * This lives outside `ui.svelte.ts` on purpose: that file holds presentation
 * state and nothing that could disagree with the server, and this rule has to
 * read the phase and whose turn it is.
 */

import { conn } from './connection.svelte';
import { ui } from './ui.svelte';

/**
 * The player the Map screen belongs to right now.
 *
 * Outside a running round there is no teller, so it falls back to you — which is
 * also what you want while writing a clue: your own history is the thing the
 * clue is being written against.
 */
export function spotlightId(): string {
	if (ui.peekId) return ui.peekId;
	if (conn.game?.phase === 'running' && conn.activeId) return conn.activeId;
	return conn.you ?? '';
}

/**
 * `$effect(followTurn)` — hand the screen back when a new agent sets out.
 *
 * It reads `activeId` and writes `peekId` without ever reading `peekId`, which is
 * what makes it safe: tapping a face does not re-run this (so a peek survives the
 * turn it was taken in), and the next `TURN_STARTED` does.
 */
export function followTurn(): void {
	void conn.activeId;
	ui.peekId = '';
}
