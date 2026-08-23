import { getDb } from '../db/db.ts';
import { deleteMatch } from '../db/matches.ts';
import { listStories, loadStory } from '../db/story.ts';
import { Game, GameError } from '../engine/game.ts';

/**
 * The live match registry.
 *
 * A round's hot loop runs from memory — it is a few minutes of ticking timers
 * and it has no business round-tripping through SQLite for every beat. The
 * *story* being played comes from the database, and match state is written
 * through to it (see `src/lib/db/matches.ts`), so a restart no longer takes
 * every match in progress with it.
 */

const games = new Map<string, Game>();

/**
 * The story a match plays when nobody has picked one: DIE ABKÜRZUNG, in German.
 *
 * The tale rather than the language is what is fixed here. THE SHORTCUT exists in
 * both languages, but the German one is the tale this game is shown with — five
 * steps, over in a few rounds, and every road named so that how it *sounds* says
 * nothing about where it goes. A front door that opened a different tale depending
 * on the host's browser would demo two different games.
 *
 * It takes no locale for that reason. A match is told in the language its story is
 * written in (see `createGame` below), so a German slug is what makes an
 * English-preferring host's match a German one. Anyone who wants the English
 * translation picks `shortcut-en` — from the menu, or with `?tale=shortcut-en` at
 * the front door.
 */
export function defaultStorySlug(): string {
	return 'shortcut-de';
}

/** No I, O, 0 or 1 — game codes get read aloud and typed by hand. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomCode(length = 4): string {
	let code = '';
	for (let i = 0; i < length; i++) {
		code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
	}
	return code;
}

export function createGame(storySlug?: string): Game {
	const db = getDb();

	// A story is written in one language, and the match is told in the story's —
	// so picking the tale is picking the language, and the host's browser setting
	// has no say here. See the note in `src/lib/i18n/types.ts`.
	const slug = storySlug?.trim() || defaultStorySlug();

	// A chosen tale is checked before it is loaded rather than after. Refusing is
	// the right answer: quietly starting a different story than the one the host
	// picked is worse than telling them it is not available.
	const chosen = listStories(db).find((story) => story.slug === slug);
	if (!chosen) throw new GameError('That tale does not exist.');
	if (chosen.status !== 'published') throw new GameError('That tale is not finished yet.');
	if (chosen.nodeCount === 0) throw new GameError('That tale has nothing in it yet.');

	let code = randomCode();
	while (games.has(code)) code = randomCode();

	// The match is told in the story's language, not the one the host's browser
	// happens to prefer — the agents read the names of this story's roads.
	const game = new Game(code, loadStory(db, slug), chosen.locale);
	games.set(code, game);
	return game;
}

/** Take a match rebuilt from the database into the live registry. */
export function adoptGame(game: Game): void {
	games.set(game.code, game);
}

export function getGame(code: string): Game | undefined {
	return games.get(code.trim().toUpperCase());
}

/**
 * Is this object still the live match for its code?
 *
 * Asked by the hub before it writes: a match that has been shut down can still
 * be referenced by a round loop that has not noticed yet, and saving from one of
 * those would put the match it just deleted straight back into the database.
 */
export function isLive(game: Game): boolean {
	return games.get(game.code) === game;
}

export function deleteGame(code: string): void {
	games.delete(code);
	deleteMatch(getDb(), code);
}

export function allGames(): Game[] {
	return [...games.values()];
}

/** Drop matches nobody has touched in a while, so a long-lived dev server stays tidy. */
export function sweepStaleGames(maxAgeMs = 2 * 60 * 60 * 1000): void {
	const now = Date.now();
	for (const [code, game] of games) {
		const idle = now - Math.max(game.createdAt, game.startedAt);
		const abandoned = game.players.every((p) => p.isBot || !p.connected);
		if (idle > maxAgeMs && abandoned) deleteGame(code);
	}
}

export function newPlayerId(): string {
	return `p_${Math.random().toString(36).slice(2, 10)}`;
}
