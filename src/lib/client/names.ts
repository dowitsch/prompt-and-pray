/**
 * The name on the pill, and whether the player chose it.
 *
 * A player arrives already called something, because nobody wants to type a
 * name before they can look at the game. What they are called until they say
 * otherwise is the *character's* name — swipe to Malakor and the pill reads
 * MALAKOR — so the config screen has one idea of identity rather than two, and
 * the operator's own name is something you opt into.
 *
 * The moment they type one, it sticks: the presence of the stored name *is* the
 * "they committed it" flag, so there is no second piece of state to keep honest
 * and no way for a reload to reroll a name somebody liked.
 */

import { browser } from '$app/environment';

const STORAGE_NAME = 'pp:name';

/** The name they chose on this device, or null if they never have. */
export function storedName(): string | null {
	if (!browser) return null;
	return localStorage.getItem(STORAGE_NAME);
}

/**
 * What to introduce yourself as before the config screen has run.
 *
 * Empty when they have never chosen: the seat is not assigned yet, so the
 * character's name is not knowable here, and `Game.cleanName` fills the gap
 * with "Agent 2" for the instant before the config screen syncs the real one.
 */
export function openingName(): string {
	return storedName() ?? '';
}

/** Called only when the player commits a name by hand. */
export function rememberName(name: string): void {
	if (browser) localStorage.setItem(STORAGE_NAME, name);
}
