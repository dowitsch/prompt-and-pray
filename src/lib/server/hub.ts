import type { WebSocket } from 'ws';
import type { Game } from '../engine/game.ts';
import { GameError } from '../engine/game.ts';
import { LOBBY_COUNTDOWN_SECONDS, MAX_PLAYERS } from '../engine/types.ts';
import { DEFAULT_LOCALE, isLocale, type Locale } from '../i18n/index.ts';
import type { ClientMessage, ServerEvent } from '../protocol.ts';
import type { AgentBrain } from '../agent/index.ts';
import { BotController, makeBots } from './bots.ts';
import { MatchRunner } from './runner.ts';
import { SpeechGate } from './speechgate.ts';
import { adoptGame, createGame, getGame, newPlayerId, sweepStaleGames } from './store.ts';
import { getDb } from '../db/db.ts';
import { deleteMatch, loadMatches, saveMatch } from '../db/matches.ts';

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
	/**
	 * True while this device is reading the tale aloud.
	 *
	 * Per socket, not per player, and never persisted: it is a property of the
	 * phone in somebody's hand. `SpeechGate` holds the same fact keyed the other
	 * way round; this copy is what lets a reconnecting socket be told apart from
	 * one that simply never asked.
	 */
	voice: boolean;
};

export class Hub {
	private readonly sessions = new Map<WebSocket, Session>();
	private readonly runners = new Map<string, MatchRunner>();
	/**
	 * The lobby's 3-2-1, per match code.
	 *
	 * Lives here rather than in MatchRunner because in the lobby there is no
	 * runner yet, and the hub is already the thing that decides a match may begin.
	 */
	private readonly starts = new Map<string, ReturnType<typeof setTimeout>>();
	/**
	 * Who is reading the tale aloud, and what they are still reading.
	 *
	 * Here rather than in `Game` on purpose: `Game` is written to SQLite between
	 * events, and "this socket is playing a sound right now" is the least
	 * persistable fact in the system. It belongs beside the sockets.
	 */
	private readonly speech = new SpeechGate();
	private saveWarnings = 0;

	constructor(
		private readonly brain: AgentBrain,
		/** Multiplies every storytelling beat; see PACE_SCALE in .env.example. */
		private readonly paceScale = 1,
		/**
		 * How long a beat will wait for a phone to finish reading a line aloud.
		 *
		 * The same discipline as the teaching window's hard deadline: the tale never
		 * waits forever on somebody who wandered off. See SPEECH_CEILING_MS.
		 */
		private readonly speechCeilingMs = 30_000
	) {}

	handleConnection(socket: WebSocket): void {
		const session: Session = { socket, playerId: null, code: null, voice: false };
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
			// Before anything else: a phone that has gone is not one the tale waits for.
			this.speech.drop(socket);
			const game = session.code ? getGame(session.code) : undefined;
			if (game && session.playerId) {
				game.setConnected(session.playerId, false);
				const player = game.players.find((p) => p.id === session.playerId);
				if (player) {
					this.broadcast(game, { type: 'PLAYER_UPDATED', player: game.publicPlayer(player) });
				}
				// Someone leaving can *complete* the ready set as easily as break it,
				// so this re-evaluates rather than only cancelling.
				this.evaluateStart(game);
			}
			this.sessions.delete(socket);
			sweepStaleGames();
		});

		socket.on('error', () => {
			this.speech.drop(socket);
			this.sessions.delete(socket);
		});
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
			case 'CONFIGURE': {
				const { game, playerId } = this.requirePlayer(session);
				const player = game.configure(playerId, message);
				// Opening your config again pulls the handbrake: otherwise one player
				// could stall a lobby indefinitely by reconfiguring during the count.
				this.cancelStart(game);
				this.broadcast(game, { type: 'PLAYER_UPDATED', player: game.publicPlayer(player) });
				return;
			}
			case 'SET_READY': {
				const { game, playerId } = this.requirePlayer(session);
				game.setReady(playerId, message.ready);
				this.broadcast(game, {
					type: 'PLAYER_UPDATED',
					player: game.publicPlayer(game.getPlayer(playerId))
				});
				if (game.phase === 'lobby') {
					// Everybody ready in the lobby starts the match on its own.
					this.evaluateStart(game);
				} else {
					// Readying up during teaching can start the next round early.
					this.runners.get(game.code)?.notifyReady();
				}
				return;
			}
			case 'SET_VOICE': {
				/*
				 * Not broadcast, and not stored.
				 *
				 * Whether your phone is reading the tale out is nobody else's business —
				 * it changes no player's state and no other phone's screen. The one thing
				 * it does change is the pace, and that is the gate's job.
				 *
				 * Accepted before a match exists, so the toggle in the lobby works: with
				 * no code yet there is nothing to register, and the client says it again
				 * on every reconnect.
				 */
				session.voice = message.on;
				if (session.code) this.speech.setVoice(session.code, session.socket, message.on);
				return;
			}
			case 'SPOKEN': {
				if (session.code) this.speech.ack(session.code, session.socket, message.utterance);
				return;
			}
			case 'PLAY_AGAIN':
				return this.onPlayAgain(session);
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
		// A socket that said SET_VOICE before it had a match — the lobby toggle, or a
		// reconnect that spoke first — is registered now that there is one to key on.
		if (session.voice) this.speech.setVoice(game.code, session.socket, true);

		this.send(session.socket, { type: 'STATE_SYNC', you: player.id, game: game.snapshot() });
		this.broadcast(game, { type: 'PLAYER_UPDATED', player: game.publicPlayer(player) });
		// A human coming back changes the set of humans the count is waiting for.
		this.evaluateStart(game);
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
		if (session.voice) this.speech.setVoice(game.code, session.socket, true);

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
		if (session.voice) this.speech.setVoice(game.code, session.socket, true);

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
		// A joiner who has not readied yet must stop any count in progress; one who
		// has nothing to do with it is a no-op.
		this.evaluateStart(game);
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
			this.paceScale,
			(utterance) => this.speech.wait(game.code, utterance, this.speechCeilingMs)
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

	/**
	 * START_GAME is kept as the host's override even though the new UI never sends
	 * it: `scripts/simulate.mjs` is the only end-to-end tool in the repo and it
	 * starts matches this way.
	 */
	private onStart(session: Session): void {
		const { game, playerId } = this.requirePlayer(session);
		if (game.hostId !== playerId) throw new GameError('Only the host can start the match.');

		this.cancelStart(game);
		this.beginMatch(game);
	}

	/* ------------------------------------------------------ the lobby count */

	/**
	 * Arm, or disarm, the lobby's 3-2-1.
	 *
	 * Called from every event that can change who is ready or who is here:
	 * readying up, joining, reconnecting, reconfiguring, and disconnecting.
	 */
	private evaluateStart(game: Game): void {
		if (game.phase !== 'lobby') return;

		if (!game.allHumansReady()) return this.cancelStart(game);
		if (this.starts.has(game.code)) return;

		const startsAt = game.armStart();
		this.broadcast(game, { type: 'START_COUNTDOWN', startsAt });
		this.starts.set(
			game.code,
			setTimeout(() => {
				this.starts.delete(game.code);
				// Still true? Someone may have un-readied inside the window.
				if (game.phase !== 'lobby' || !game.allHumansReady()) return this.cancelStart(game);
				try {
					this.beginMatch(game);
				} catch (error) {
					console.error('[prompt&pray] auto-start failed', error);
					this.cancelStart(game);
				}
			}, LOBBY_COUNTDOWN_SECONDS * 1000)
		);
	}

	private cancelStart(game: Game): void {
		const timer = this.starts.get(game.code);
		if (timer) {
			clearTimeout(timer);
			this.starts.delete(game.code);
		}
		if (game.startsAt) {
			game.disarmStart();
			this.broadcast(game, { type: 'START_COUNTDOWN', startsAt: 0 });
		}
	}

	/**
	 * The order matters: `startRunner` seats the bots *before* `startMatch`
	 * asserts there are at least two agents, which is what lets one human and
	 * three simulated rivals be a match.
	 */
	private beginMatch(game: Game): void {
		const runner = this.startRunner(game);
		game.startMatch();
		this.broadcast(game, { type: 'GAME_STARTED', game: game.snapshot() });
		runner.startMatch();
	}

	/* ------------------------------------------------------------- rematch */

	/**
	 * Play the same land again — the button the end overlay offers everyone, not
	 * just the host, because the overlay is on every phone.
	 */
	private onPlayAgain(session: Session): void {
		const { game } = this.requirePlayer(session);
		if (game.phase === 'lobby') return; // Four people tapping at once.

		this.cancelStart(game);

		// Both lines: the finished runner already stopped itself on GAME_FINISHED,
		// but the map still holds it, and leaving it there would let startRunner
		// overwrite the entry while the old object stayed referenced.
		this.runners.get(game.code)?.stop();
		this.runners.delete(game.code);
		// Nothing is being read any more. Who is listening is untouched: it is the
		// same phones, and the rematch is about to want them.
		this.speech.release(game.code);

		game.rematch();

		/*
		 * Drop the stored match and let the next save write it fresh.
		 *
		 * Not optional. `runs` is unique on (matchPlayerId, round) and saveMatch
		 * only writes rounds past a per-player watermark, so once the round counter
		 * restarts at 1 every new run collides with a stored row, is silently
		 * dropped by onConflictDoNothing, and a restart would restore the *previous*
		 * match's runs into this one. The delete cascades players, memory, runs,
		 * decisions and fog.
		 */
		deleteMatch(getDb(), game.code);

		this.broadcast(game, { type: 'MATCH_RESET', game: game.snapshot() });
	}
}
