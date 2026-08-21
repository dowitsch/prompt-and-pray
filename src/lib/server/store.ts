import { Game } from '../engine/game.ts';
import { HOMEWARD_MAP } from '../engine/map-homeward.ts';

/**
 * In-memory game registry. A prototype does not need a database: a match lives
 * for a few minutes and dies with the dev server.
 */

const games = new Map<string, Game>();

/** No I, O, 0 or 1 — game codes get read aloud and typed by hand. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomCode(length = 4): string {
	let code = '';
	for (let i = 0; i < length; i++) {
		code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
	}
	return code;
}

export function createGame(): Game {
	let code = randomCode();
	while (games.has(code)) code = randomCode();

	const game = new Game(code, HOMEWARD_MAP);
	games.set(code, game);
	return game;
}

export function getGame(code: string): Game | undefined {
	return games.get(code.trim().toUpperCase());
}

export function deleteGame(code: string): void {
	games.delete(code);
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
		if (idle > maxAgeMs && abandoned) games.delete(code);
	}
}

export function newPlayerId(): string {
	return `p_${Math.random().toString(36).slice(2, 10)}`;
}
