import type { WebSocket } from 'ws';
import type { Game } from '../engine/game.ts';
import { GameError } from '../engine/game.ts';
import { LOBBY_COUNTDOWN_SECONDS, MAX_PLAYERS } from '../engine/types.ts';
import type { ClientMessage, ServerEvent } from '../protocol.ts';
import type { AgentBrain } from '../agent/index.ts';
import { BotController, makeBots } from './bots.ts';
import { MatchRunner } from './runner.ts';
import { SpeechGate } from './speechgate.ts';
import {
	adoptGame,
	createGame,
	deleteGame,
	getGame,
	isLive,
	newPlayerId,
	sweepStaleGames
} from './store.ts';
import { getDb } from '../db/db.ts';
import { loadMatches, saveMatch } from '../db/matches.ts';

/**
 * The authoritative hub.
 *
 * Clients send requests; this decides what actually happened. Nothing a client
 * sends can assert an outcome — the worst a malicious client can do is ask for
 * something the engine refuses.
 */

/**
 * How long a match waits for somebody who is not there.
 *
 * A dropped socket is usually nothing — a tunnel, a locked phone, a refresh —
 * and the client retries for about two minutes, so the tale goes on being told
 * around the empty chair for a while rather than reacting to every hiccup.
 *
 * Past this, the absence is treated as real, and what happens next depends only
 * on whether anybody is still at the table: the seat is taken over by a
 * simulated operator (or dropped, if the match has not begun), and a match with
 * nobody left at it is shut down outright. That last part is the point. Bots
 * play on happily without an audience, and a match nobody is watching would
 * otherwise go on calling a language model round after round forever.
 *
 * Overridable with ABSENCE_GRACE_MS, mostly so a test does not have to sit here
 * for a minute and a half.
 */
const DEFAULT_ABSENCE_GRACE_MS = 90_000;

/** What takes over a seat somebody walked away from. */
const STAND_IN = { skill: 'steady', sabotages: false } as const;

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
	 * The clock on the people who are not here, per match code.
	 *
	 * One per match rather than one per player: what happens when it fires is a
	 * question about the *table* — is anybody still at it — and a timer per
	 * absentee would each have to ask that same question and race to answer it.
	 */
	private readonly absences = new Map<string, ReturnType<typeof setTimeout>>();
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
		private readonly speechCeilingMs = 30_000,
		/** How long an empty chair is given to fill again; see ABSENCE_GRACE_MS. */
		private readonly absenceGraceMs = DEFAULT_ABSENCE_GRACE_MS
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
				// And the empty chair is now on the clock.
				this.watchAbsence(game);
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
		// A match that has been shut down can still be referenced by a round loop
		// that has not noticed yet. Writing from one of those would resurrect the
		// row set that `shutdown` just deleted.
		if (!isLive(game)) return;
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
				// Nobody is connected to a match that has just come back from disk —
				// see the note in `db/matches.ts` about who counts as present on the
				// way in. So every restored match starts out on the absence clock, and
				// the ones whose people do reconnect take themselves back off it. A
				// match restored into an empty room is exactly what this is for.
				this.watchAbsence(game);
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
				return this.onCreate(session, message.name, message.storySlug);
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
			case 'LEAVE_GAME':
				return this.onLeave(session);
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

		// A seat that has been handed to a bot is not given back. Coming back to
		// find a rival where you were sitting would be worse than starting over: the
		// bot has been writing that agent's notes, and two of you teaching the same
		// agent is not a thing this game has rules for. An empty sync puts the
		// client back at the front door, which opens a fresh round of its own.
		//
		// It is also what refuses a client that claims a `bot_…` id outright.
		if (!game || !player || player.isBot) {
			return this.send(session.socket, { type: 'STATE_SYNC', you: null, game: null });
		}

		// Claiming a seat at one table is giving up a seat at another. A reconnect
		// claims the table it is already at, which is why this takes the code.
		this.depart(session, game.code);
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
		// And it may be the whole reason the match was on the clock at all.
		this.watchAbsence(game);
	}

	private onCreate(session: Session, name: string, storySlug?: string): void {
		// The host picks the tale, and the tale carries the language — the `locale`
		// the client sends with CREATE_GAME is its own UI preference and says nothing
		// about which story to open. A slug that is not a published story is refused
		// rather than quietly swapped, so nobody is dropped into a different tale
		// than the one they picked.
		const game = createGame(storySlug);
		// Only now that there is somewhere to go: a refused tale must not have cost
		// anyone the round they were already in.
		this.depart(session, game.code);
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

		// Seated first, departed second: a lobby that turns out to be full or already
		// under way leaves you where you were rather than nowhere at all.
		const player = game.addPlayer(newPlayerId(), name.trim() || 'AGENT');
		this.depart(session, game.code);
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
		this.clearStart(game.code);
		if (game.startsAt) {
			game.disarmStart();
			this.broadcast(game, { type: 'START_COUNTDOWN', startsAt: 0 });
		}
	}

	/** The timer alone, with nobody told. Only `shutdown` wants it this way. */
	private clearStart(code: string): void {
		const timer = this.starts.get(code);
		if (timer) {
			clearTimeout(timer);
			this.starts.delete(code);
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

	/* ------------------------------------------------------------- leaving */

	/**
	 * "I'm out."
	 *
	 * The only way out of a match, and it is one-way: there is no rematch and no
	 * going back to a lobby, because both of those meant holding a table together
	 * that nobody at it had asked to keep. What is left is the simple thing — you
	 * go, your seat carries on without you, and the client opens a round of its
	 * own at the front door.
	 *
	 * The session is detached before anything else, so the socket is out of this
	 * match's broadcasts and out of the speech gate by the time the seat is dealt
	 * with. Otherwise the person who just left would be sent the news about
	 * themselves, and the tale would go on holding its beats for a phone that is
	 * no longer at the table.
	 */
	private onLeave(session: Session): void {
		// Only to say the request was understood — `depart` does the work. Asking to
		// leave a match you are not in is not an error worth a message.
		this.requirePlayer(session);

		this.depart(session);
		this.send(session.socket, { type: 'STATE_SYNC', you: null, game: null });
	}

	/**
	 * Take this session out of whatever match it is in.
	 *
	 * Leaving through the menu is the obvious caller, but creating a round and
	 * joining one are just as much a departure from the last one: a phone that
	 * opens a second table has left the first, and a seat nobody tells the server
	 * about stays marked *present* for the rest of the process's life — which is
	 * precisely the state that stops an abandoned match from ever being recognised
	 * as abandoned. It is also how a stale ghost could hold a lobby seat that
	 * somebody else wanted.
	 *
	 * `staying` is the match this session is on its way *to*, so a reconnect
	 * claiming the table it is already at does not give up the seat it came for.
	 */
	private depart(session: Session, staying?: string): void {
		const code = session.code;
		const playerId = session.playerId;
		if (!code || (staying && code === staying)) return;

		session.code = null;
		session.playerId = null;
		this.speech.drop(session.socket);

		const game = getGame(code);
		if (game && playerId) this.releaseSeat(game, playerId);
	}

	/**
	 * Somebody is not coming back. What happens to the chair they were in.
	 *
	 * The one path for it, whether they said so (`onLeave`) or simply stopped
	 * being there (`onAbsenceDeadline`) — the seat cannot be allowed to end up in
	 * different states depending on which. There are three outcomes, in order of
	 * precedence:
	 *
	 *  1. **Nobody else is at the table** — the match is shut down. Nothing is
	 *     done to the seat first: there is no one to tell and nothing to preserve.
	 *  2. **The match has not begun** — the seat goes with them, and the count is
	 *     re-evaluated, since a lobby of three ready people is a lobby that starts.
	 *  3. **The match is under way** — a simulated operator takes the seat over.
	 */
	private releaseSeat(game: Game, playerId: string): void {
		if (!isLive(game)) return;

		const player = game.players.find((p) => p.id === playerId);
		if (!player || player.isBot) return;

		if (this.deserted(game, playerId)) return this.shutdown(game, 'abandoned');

		if (game.phase === 'lobby') {
			game.removePlayer(playerId);
			this.broadcast(game, {
				type: 'PLAYER_LEFT',
				playerId,
				name: player.name,
				replaced: false,
				game: game.snapshot()
			});
			this.evaluateStart(game);
		} else {
			game.replaceWithBot(playerId, STAND_IN);
			this.runners.get(game.code)?.adoptBot(
				new BotController(playerId, STAND_IN.skill, `${game.code}:${playerId}`, {
					sabotages: STAND_IN.sabotages
				})
			);
			if (game.phase === 'over') {
				/*
				 * A finished match is told nothing.
				 *
				 * The seat still changes hands, because that is what stops the absence
				 * clock from finding an empty chair here every ninety seconds for the
				 * rest of the process's life — but there is nothing left to walk and
				 * nobody's screen changes, and "their agent is on its own now" over the
				 * top of the result card would be a lie about a match that is already
				 * over. So this is the second state change in the hub that goes out to
				 * nobody, and therefore the second that has to be written by hand.
				 */
				this.save(game);
			} else {
				this.broadcast(game, {
					type: 'PLAYER_LEFT',
					playerId,
					name: player.name,
					replaced: true,
					game: game.snapshot()
				});
			}
		}

		this.watchAbsence(game);
	}

	/* --------------------------------------------------------- abandonment */

	/**
	 * Is there nobody left at this table?
	 *
	 * Connected humans only. Bots do not count — a match of four bots is the exact
	 * thing this question exists to find — and `except` is whoever is in the
	 * middle of leaving, since they are still in the list and still connected at
	 * the moment they say so.
	 */
	private deserted(game: Game, except?: string): boolean {
		return !game.players.some((p) => !p.isBot && p.connected && p.id !== except);
	}

	/**
	 * Arm — or disarm — the clock on the people who are not here.
	 *
	 * Called from every event that can change who is present: a socket closing, a
	 * player coming back, a seat changing hands, a match being restored from disk.
	 * It is written to be idempotent for that reason — the existing timer is always
	 * cleared and the question asked again from scratch, so no call site has to
	 * know whether one was already running.
	 */
	private watchAbsence(game: Game): void {
		const existing = this.absences.get(game.code);
		if (existing) {
			clearTimeout(existing);
			this.absences.delete(game.code);
		}
		if (!isLive(game)) return;

		const absent = game.players.some((p) => !p.isBot && !p.connected);
		if (!absent && !this.deserted(game)) return;

		this.absences.set(
			game.code,
			setTimeout(() => this.onAbsenceDeadline(game), this.absenceGraceMs)
		);
	}

	/**
	 * The grace is up. Whoever is not here by now is not coming.
	 *
	 * The desertion check comes before the per-seat work rather than falling out
	 * of it: a table everyone has left should be taken down as a match, and not
	 * handed to four bots one seat at a time on the way there.
	 */
	private onAbsenceDeadline(game: Game): void {
		this.absences.delete(game.code);
		if (!isLive(game)) return;

		if (this.deserted(game)) return this.shutdown(game, 'abandoned');

		for (const player of game.players.filter((p) => !p.isBot && !p.connected)) {
			this.releaseSeat(game, player.id);
		}
	}

	/**
	 * Take a match down.
	 *
	 * Everything the match owns lives in one of five places, and this is the only
	 * function that knows all five: the round loop, the lobby count, the absence
	 * clock, the speech gate, and the registry — which takes the stored rows with
	 * it. Stopping the runner first is what matters most; a round in flight checks
	 * for it between beats and unwinds, and `save` refuses to write a match that is
	 * no longer live, so the beats still in the air cannot put it back.
	 */
	private shutdown(game: Game, why: string): void {
		const absence = this.absences.get(game.code);
		if (absence) {
			clearTimeout(absence);
			this.absences.delete(game.code);
		}
		this.clearStart(game.code);

		this.runners.get(game.code)?.stop();
		this.runners.delete(game.code);
		this.speech.forget(game.code);

		// There should be nobody here — that is what made it abandoned. Any socket
		// that is somehow still pointed at this match is set adrift rather than left
		// holding a code that no longer resolves to anything.
		for (const session of this.sessions.values()) {
			if (session.code !== game.code) continue;
			session.code = null;
			session.playerId = null;
			this.send(session.socket, { type: 'STATE_SYNC', you: null, game: null });
		}

		deleteGame(game.code);
		console.log(`[prompt&pray] match ${game.code} ${why} — shut down.`);
	}
}
