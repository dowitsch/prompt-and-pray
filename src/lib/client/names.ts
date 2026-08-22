/**
 * A name to be going on with.
 *
 * Nobody wants to type a name before they can look at the game, so a player
 * arrives already called something. The name rerolls on every load until they
 * commit one by hand — and the presence of the stored name *is* the "they
 * committed it" flag, so there is no second piece of state to keep honest.
 */

import { browser } from '$app/environment';

const NAMES = [
	'Dimi',
	'Mei Ling',
	'Boris',
	'Nala',
	'Kwame',
	'Sora',
	'Yara',
	'Tycho',
	'Runa',
	'Ferro',
	'Milva',
	'Ozzy',
	'Ines',
	'Kazu',
	'Pina',
	'Odin',
	'Lumi',
	'Rasko',
	'Nuri',
	'Talin',
	'Vesna',
	'Jarek'
];

const STORAGE_NAME = 'pp:name';

export function randomName(): string {
	return NAMES[Math.floor(Math.random() * NAMES.length)];
}

/** The name to show in the config screen: theirs if they chose one, else a fresh one. */
export function openingName(): string {
	if (!browser) return NAMES[0];
	return localStorage.getItem(STORAGE_NAME) ?? randomName();
}

/** Called only when the player commits a name by hand. */
export function rememberName(name: string): void {
	if (browser) localStorage.setItem(STORAGE_NAME, name);
}
