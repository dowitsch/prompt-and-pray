import type { WebSocket } from 'ws';
import type { Game } from '../engine/game.ts';
import { GameError } from '../engine/game.ts';
import { MAX_PLAYERS } from '../engine/types.ts';
import { DEFAULT_LOCALE, isLocale, type Locale } from '../i18n/index.ts';
import type { ClientMessage, ServerEvent } from '../protocol.ts';
import type { AgentBrain } from '../agent/index.ts';
import { BotController, makeBots } from './bots.ts';
import { MatchRunner } from './runner.ts';
import { adoptGame, createGame, getGame, newPlayerId, sweepStaleGames } from './store.ts';
import { getDb } from '../db/db.ts';
import { loadMatches, saveMatch } from '../db/matches.ts';

/**
 * The authoritative hub.
 *
 * Clients send requests; this decides what actually happened. Nothing a client
 * sends can assert an outcome — the worst a malicious client can do is ask for
 * something the engine refuses.
 */

type Session = {
	socket: WebSocket;
	playerId: string | null;
	code: string | null;
};

export class Hub {
	private readonly sessions = new Map<WebSocket, Session>();
	private readonly runners = new Map<string, MatchRunner>();
	private saveWarnings = 0;

	constructor(
		private readonly brain: AgentBrain,
		/** Multiplies every storytelling beat; see PACE_SCALE in .env.example. */
		private readonly paceScale = 1
	) {}

	handleConnection(socket: WebSocket): void {
		const session: Session = { socket, playerId: null, code: null };
		this.sessions.set(socket, session);

		socket.on('message', (raw: unknown) => {
			let message: ClientMessage;
			try {
				message = JSON.parse(String(raw)) as ClientMessage;
			} catch {
				return this.send(socket, { type: 'ERROR', message: 'Malformed message.' });
			}
			try {
				this.dispatch(session, message);
			} catch (error) {
				if (error instanceof GameError) {
					this.send(socket, { type: 'ERROR', message: error.message });
				} else {
					console.error('[homeward] hub error', error);
					this.send(socket, { type: 'ERROR', message: 'Something went wrong on the server.' });
				}
			}
		});

		socket.on('close', () => {
			const game = session.code ? getGame(session.code) : undefined;
			if (game && session.playerId) {
				game.setConnected(session.playerId, false);
				const player = game.players.find((p) => p.id === session.playerId);
				if (player) {
					this.broadcast(game, { type: 'PLAYER_UPDATED', player: game.publicPlayer(player) });
				}
			}
			this.sessions.delete(socket);
			sweepStaleGames();
		});

		socket.on('error', () => this.sessions.delete(socket));
	}

	/* -------------------------------------------------------------- plumbing */

	private send(socket: WebSocket, event: ServerEvent): void {
		if (socket.readyState === 1) socket.send(JSON.stringify(event));
	}

	private broadcast(game: Game, event: ServerEvent): void {
		const payload = JSON.stringify(event);
		for (const session of this.sessions.values()) {
			if (session.code === game.code && session.socket.readyState === 1) {
				session.socket.send(payload);
			}
		}
		// Anything worth telling the players is worth keeping. Making this the one
		// place a match is written means write-through cannot be forgotten at a new
		// call site: if it changed the game, it went out as an event.
		this.save(game);
	}

	/**
	 * A database that has gone wrong must not take the match with it. The round
	 * loop is authoritative in memory, so a failed write costs a restart's worth
	 * of history and nothing that is happening now.
	 */
	private save(game: Game): void {
		try {
			saveMatch(getDb(), game);
		} catch (error) {
			if (this.saveWarnings < 3) {
				this.saveWarnings++;
				console.error('[homeward] could not save match state', error);
				if (this.saveWarnings === 3) {
					console.error('[homeward] further save failures will not be logged.');
				}
			}
		}
	}

	/**
	 * Bring back the matches that were in progress when this process last stopped.
	 *
	 * A match that was mid-round comes back between rounds rather than halfway
	 * through somebody's turn — see `Game.restore`. Its rivals are rebuilt from
	 * their stored traits, so they are the same opponents, and the round is
	 * reopened for teaching so play can carry on.
	 */
	restoreMatches(): number {
		let restored = 0;
		try {
			for (const game of loadMatches(getDb())) {
				adoptGame(game);
				game.paceScale = this.paceScale;
				if (game.phase === 'teaching' || game.phase === 'running') {
					this.startRunner(game).reopenTeaching();
				}
				restored++;
			}
		} catch (error) {
			console.error('[homeward] could not restore matches', error);
		}
		return restored;
	}

	private requireGame(session: Session): Game {
		const game = session.code ? getGame(session.code) : undefined;
		if (!game) throw new GameError('You are not in a game.');
		return game;
	}

	private requirePlayer(session: Session): { game: Game; playerId: string } {
		const game = this.requireGame(session);
		if (!session.playerId) throw new GameError('You are not in a game.');
		return { game, playerId: session.playerId };
	}

	/* -------------------------------------------------------------- dispatch */

	private dispatch(session: Session, message: ClientMessage): void {
		switch (message.type) {
			case 'HELLO':
				return this.onHello(session, message.playerId, message.code);
			case 'CREATE_GAME':
				return this.onCreate(session, message.name, message.locale, message.storySlug);
			case 'JOIN_GAME':
				return this.onJoin(session, message.code, message.name);
			case 'SET_READY': {
				const { game, playerId } = this.requirePlayer(session);
				game.setReady(playerId, message.ready);
				this.broadcast(game, {
					type: 'PLAYER_UPDATED',
					player: game.publicPlayer(game.getPlayer(playerId))
				});
				// Readying up during teaching can start the next round early.
				this.runners.get(game.code)?.notifyReady();
				return;
			}
			case 'START_GAME':
				return this.onStart(session);
			case 'ADD_MEMORY': {
				const { game, playerId } = this.requirePlayer(session);
				game.addMemory(playerId, message.text);
				const player = game.getPlayer(playerId);
				return this.broadcast(game, {
					type: 'MEMORY_UPDATED',
					playerId,
					player: game.publicPlayer(player),
					memory: player.memory
				});
			}
			case 'SABOTAGE': {
				const { game, playerId } = this.requirePlayer(session);
				const result = game.useSabotage(
					playerId,
					message.targetPlayerId,
					message.lineIndex,
					message.text
				);
				const actor = game.getPlayer(playerId);
				return this.broadcast(game, {
					type: 'SABOTAGE_USED',
					actorId: playerId,
					actorName: actor.name,
					targetId: result.target.id,
					targetName: result.target.name,
					lineIndex: result.lineIndex,
					before: result.before,
					after: result.after,
					player: game.publicPlayer(result.target),
					actor: game.publicPlayer(actor)
				});
			}
		}
	}

	private onHello(session: Session, playerId: string | null, code: string | null): void {
		const game = code ? getGame(code) : undefined;
		const player = game && playerId ? game.players.find((p) => p.id === playerId) : undefined;

		if (!game || !player) {
			return this.send(session.socket, { type: 'STATE_SYNC', you: null, game: null });
		}

		session.playerId = player.id;
		session.code = game.code;
		game.setConnected(player.id, true);

		this.send(session.socket, { type: 'STATE_SYNC', you: player.id, game: game.snapshot() });
		this.broadcast(game, { type: 'PLAYER_UPDATED', player: game.publicPlayer(player) });
	}

	private onCreate(session: Session, name: string, locale: Locale, storySlug?: string): void {
		// The host picks the language and the tale; everyone in the match reads the
		// one they chose. A slug that is not a published story is refused rather
		// than quietly swapped, so nobody is dropped into a different tale than the
		// one they picked.
		const game = createGame(isLocale(locale) ? locale : DEFAULT_LOCALE, storySlug);
		game.paceScale = this.paceScale;
		const player = game.addPlayer(newPlayerId(), name.trim() || 'YOU');

		session.playerId = player.id;
		session.code = game.code;

		// The only state change in the whole hub that nobody else is told about, so
		// the one that needs saving by hand.
		this.save(game);

		this.send(session.socket, {
			type: 'GAME_CREATED',
			code: game.code,
			playerId: player.id,
			game: game.snapshot()
		});
	}

	private onJoin(session: Session, code: string, name: string): void {
		const game = getGame(code);
		if (!game) throw new GameError(`No game with code ${code.toUpperCase()}.`);

		const player = game.addPlayer(newPlayerId(), name.trim() || 'AGENT');
		session.playerId = player.id;
		session.code = game.code;

		this.send(session.socket, {
			type: 'JOINED',
			code: game.code,
			playerId: player.id,
			game: game.snapshot()
		});
		this.broadcast(game, {
			type: 'PLAYER_JOINED',
			player: game.publicPlayer(player),
			game: game.snapshot()
		});
	}

	/**
	 * Build the runner for a match and give it back its rivals.
	 *
	 * Bots that are already seated — a restored match — are re-armed from their
	 * stored traits; missing seats are filled with new ones. So this is the same
	 * call whether a match is starting for the first time or coming back from a
	 * restart, and the two cannot drift apart.
	 */
	private startRunner(game: Game): MatchRunner {
		const runner = new MatchRunner(
			game,
			this.brain,
			(event) => this.broadcast(game, event),
			this.paceScale
		);
		this.runners.set(game.code, runner);

		// Empty seats are filled with simulated opponents, so one browser tab is
		// enough to play a full four-agent match. A restored match is already
		// seated, and seats cannot be taken once a match has begun anyway.
		const seated = game.players.filter((p) => p.isBot);
		const specs =
			game.phase === 'lobby' ? makeBots(game.code, MAX_PLAYERS - game.players.length) : [];
		specs.forEach((spec, index) => {
			// Exactly one opponent plays dirty.
			const traits = { skill: spec.skill, sabotages: seated.length === 0 && index === 0 };
			seated.push(game.addPlayer(`bot_${game.code}_${seated.length}`, spec.name, true, traits));
		});

		for (const bot of seated) {
			runner.registerBot(
				new BotController(bot.id, bot.botSkill ?? 'steady', `${game.code}:${bot.id}`, {
					sabotages: bot.botSabotages ?? false
				})
			);
		}

		return runner;
	}

	private onStart(session: Session): void {
		const { game, playerId } = this.requirePlayer(session);
		if (game.hostId !== playerId) throw new GameError('Only the host can start the match.');

		const runner = this.startRunner(game);
		game.startMatch();
		this.broadcast(game, { type: 'GAME_STARTED', game: game.snapshot() });
		runner.startMatch();
	}
}
