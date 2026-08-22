import { browser } from '$app/environment';
import { goto } from '$app/navigation';
import { resolve } from '$app/paths';
import { applyChoicesRevealed, applyNodeRevealed } from '$lib/engine/fog';
import type { GameSnapshot, PublicPlayer } from '$lib/engine/game';
import type { RoundSummary } from '$lib/engine/types';
import type { ClientMessage, ServerEvent } from '$lib/protocol';
import { WS_PATH } from '$lib/protocol';
import { ui } from './ui.svelte';
import {
	DEFAULT_LOCALE,
	fmt,
	isLocale,
	listWays,
	strings,
	type Locale,
	type Strings
} from '$lib/i18n';

/**
 * The browser's view of the match.
 *
 * It holds no rules. Every field here is either something the server told us or
 * a purely presentational derivative of it — the client cannot decide that a
 * choice was correct, only draw the fact that it was.
 *
 * `STATE_SYNC` on (re)connect means a refresh mid-match restores the board
 * exactly, so the socket dropping is a visual hiccup rather than a lost game.
 */

/**
 * The three ways the map can speak.
 *
 * `system` is the choice being put to the agent — where it stands and what roads
 * it can see. `move` is the agent reasoning aloud as it sets off. `fail` is the
 * one line that says it did not come back.
 *
 * `system` earns its place by owning the gap. The brain takes real time to
 * decide, and between arriving somewhere and committing to a road there is a
 * pause with nothing in it — long enough, against a live model, to read as the
 * app having stalled. Posing the question there turns dead air into the most
 * interesting moment in the turn: you see the choice before the agent makes it,
 * and whether the note you wrote is going to be any use.
 *
 * Everything else the world used to say (place descriptions, epitaphs, the
 * round's headline) is gone with the panel that held it, and was never
 * load-bearing: the map already shows the place, the roads and the body.
 */
export type BubbleKind = 'system' | 'move' | 'fail';

/**
 * What the agent on the board is saying, right now.
 *
 * Exactly one of these exists at a time and it is not history: it appears when
 * an agent commits to a road and is gone when the turn passes. That is the whole
 * point of the change — the story is something you watch happen on the land, not
 * a log you scroll.
 *
 * `id` rather than a text comparison, because an agent may well reason its way
 * to the same sentence twice and the bubble must still re-animate.
 */
export type Bubble = {
	id: number;
	kind: BubbleKind;
	/** Whose turn it belongs to. Never empty: every bubble is somebody's moment. */
	playerId: string;
	text: string;
	/** `system` only: the place the choice is being made at. */
	title?: string;
	/**
	 * `move` only: the model did not answer and the offline brain stood in.
	 *
	 * Worth marking now that agents are characters. The sentence is still true
	 * about the road taken, but it is not Krotz or Malakor saying it, and a game
	 * whose whole premise is "watch what your notes did to *your* agent" should
	 * not quietly put words in its mouth.
	 */
	improvised?: boolean;
};

/** Short-lived visual events the tree turns into flashes and particles. */
export type Effect = {
	id: number;
	kind: 'death' | 'win' | 'survive';
	playerId: string;
	seat: number;
	nodeId: string;
};

/**
 * The step an agent has just committed to, for as long as it takes to walk it.
 *
 * The map needs `retrace`, and `retrace` exists only on the wire: the server
 * replays proven ground more than ten times faster than it walks new ground
 * (`RETRACE_ARRIVE` against `ARRIVE` in the runner's pace table), so a map that
 * could not tell the two apart would either crawl through a known stretch or
 * sprint through a discovery. Nothing else in the snapshot records which it was.
 *
 * `id` rather than a boolean because two identical steps in a row — a cycle
 * walked twice — must still read as two separate departures.
 */
export type Step = {
	id: number;
	playerId: string;
	choiceId: string;
	retrace: boolean;
};

/**
 * One beat of the story, built up as the events arrive: where the agent is,
 * what it said, what it chose, and what came of it. The narration card renders
 * this single object, so the tale fills in rather than flickering.
 */
/**
 * One short sentence of the tale.
 *
 * A turn is told as a sequence of these rather than one block of prose: the
 * agent sets out, it comes somewhere, it says what it remembers, it chooses,
 * and it lives or it doesn't. They are revealed one at a time so the telling
 * has a rhythm you can actually follow.
 */
export type Toast = {
	id: number;
	title: string;
	body: string;
	tone: 'danger' | 'good';
};

/**
 * Whether the page we are on is part of a match.
 *
 * The socket is opened by the root layout, so it is live on every page in the
 * app — including the story designer, which has nothing to do with a match. Only
 * the pages that are actually a match may be navigated by what the socket says.
 */
function atTheTable(): boolean {
	return /^\/(game|lobby)\//.test(location.pathname);
}

/**
 * How many bubbles stand on the map at once.
 *
 * Three is a turn: the question, the answer, and what came of it. A fourth would
 * start covering the land the bubbles are meant to be about.
 */
const BUBBLE_DEPTH = 3;

const STORAGE_PLAYER = 'homeward:playerId';
const STORAGE_LOCALE = 'homeward:locale';
const STORAGE_CODE = 'homeward:code';

/**
 * Reconnect backoff. 400ms, doubling to a 20s ceiling, then giving up — a match
 * that has been unreachable for this long is not coming back on its own, and a
 * tight retry loop against a server that isn't there just floods the console.
 */
const RETRY_BASE_MS = 400;
const RETRY_CEILING_MS = 20_000;
const RETRY_LIMIT = 10;

export class Connection {
	/** `offline` is terminal: we stopped retrying and the page needs a reload. */
	status = $state<'idle' | 'connecting' | 'open' | 'closed' | 'offline'>('idle');
	you = $state<string | null>(null);
	game = $state<GameSnapshot | null>(null);
	/** Last completed round’s story, shown between rounds. */
	summary = $state<RoundSummary | null>(null);
	/** Whose turn is being told right now, if any. */
	activeId = $state<string | null>(null);
	/** The order agents take their turns in this round. */
	order = $state<string[]>([]);
	/** Position of the current turn within the round, e.g. 3 of 4. */
	turnIndex = $state(0);
	turnTotal = $state(0);
	/**
	 * The last few things said this turn, oldest first.
	 *
	 * A short fading history rather than one bubble at a time. A turn is a beat of
	 * three — here is the fork, here is what I make of it, here is what it cost —
	 * and replacing each with the next threw away the first two before you could
	 * put them together. Held as a stack they read as one thought, with the older
	 * lines dimming out of the way rather than vanishing.
	 *
	 * Capped, because this is a map with a story on it and not a log: past
	 * `BUBBLE_DEPTH` the oldest line has faded to nothing anyway.
	 */
	bubbles = $state<Bubble[]>([]);
	/**
	 * True once this turn has said it recognises the road.
	 *
	 * A retrace is many steps over known ground and the agent is not deciding
	 * anything on any of them, so it says so once and then gets on with it.
	 */
	private saidKnown = false;
	effects = $state<Effect[]>([]);
	/** The step being walked right now. Never cleared; the map reads the id. */
	lastStep = $state<Step | null>(null);
	toast = $state<Toast | null>(null);
	error = $state<string | null>(null);
	/** True once the server has answered our opening HELLO. */
	synced = $state(false);
	/**
	 * The language to create the next match in. Once you are in a match, the
	 * match's own locale wins — everyone in it must read the same words.
	 */
	preference = $state<Locale>(DEFAULT_LOCALE);

	/** The language everything on screen is written in. */
	get locale(): Locale {
		return this.game?.locale ?? this.preference;
	}

	/** Shorthand for the current dictionary. */
	get t(): Strings {
		return strings(this.locale);
	}

	setPreference(locale: Locale): void {
		this.preference = locale;
		if (browser) localStorage.setItem(STORAGE_LOCALE, locale);
	}

	/** Restore the last chosen language, falling back to the browser's. */
	loadPreference(): void {
		if (!browser) return;
		const saved = localStorage.getItem(STORAGE_LOCALE);
		if (isLocale(saved)) {
			this.preference = saved;
			return;
		}
		const guess = navigator.languages?.[0] ?? navigator.language ?? '';
		const short = guess.slice(0, 2).toLowerCase();
		if (isLocale(short)) this.preference = short;
	}

	private socket: WebSocket | null = null;
	private seq = 0;
	private retry = 0;
	private closing = false;

	/* --------------------------------------------------------------- derived */

	get me(): PublicPlayer | null {
		if (!this.game || !this.you) return null;
		return this.game.players.find((p) => p.id === this.you) ?? null;
	}

	get opponents(): PublicPlayer[] {
		if (!this.game) return [];
		return this.game.players.filter((p) => p.id !== this.you);
	}

	/** Agents whose turn has not come yet: they should not be on the board. */
	get waitingTurn(): string[] {
		if (this.game?.phase !== 'running' || !this.order.length) return [];
		return this.order.slice(this.turnIndex + 1);
	}

	get isHost(): boolean {
		return Boolean(this.game && this.you && this.game.hostId === this.you);
	}

	playerName(id: string): string {
		return this.game?.players.find((p) => p.id === id)?.name ?? 'AGENT';
	}

	seatOf(id: string): number {
		return this.game?.players.find((p) => p.id === id)?.seat ?? 0;
	}

	/* ---------------------------------------------------------------- socket */

	connect(): void {
		if (!browser || this.socket) return;

		this.closing = false;
		this.status = 'connecting';
		const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
		const socket = new WebSocket(`${protocol}://${location.host}${WS_PATH}`);
		this.socket = socket;

		socket.addEventListener('open', () => {
			this.status = 'open';
			this.retry = 0;
			this.send({
				type: 'HELLO',
				playerId: sessionStorage.getItem(STORAGE_PLAYER),
				code: sessionStorage.getItem(STORAGE_CODE)
			});
		});

		socket.addEventListener('message', (event) => {
			this.receive(JSON.parse(event.data as string) as ServerEvent);
		});

		socket.addEventListener('close', () => {
			this.socket = null;
			if (this.closing) return;

			// Reconnect and re-sync; the match kept running without us. Exponential,
			// because a server that is simply not there should not be hammered — a
			// linear retry against a missing endpoint floods the console.
			this.retry += 1;
			if (this.retry > RETRY_LIMIT) {
				this.status = 'offline';
				return;
			}
			this.status = 'closed';
			const delay = Math.min(RETRY_BASE_MS * 2 ** (this.retry - 1), RETRY_CEILING_MS);
			setTimeout(() => this.connect(), delay);
		});

		socket.addEventListener('error', () => socket.close());
	}

	disconnect(): void {
		this.closing = true;
		this.socket?.close();
		this.socket = null;
	}

	private send(message: ClientMessage): void {
		if (this.socket?.readyState === WebSocket.OPEN) {
			this.socket.send(JSON.stringify(message));
		}
	}

	/* ---------------------------------------------------------------- intents */

	createGame(name: string, storySlug?: string): void {
		this.error = null;
		this.send({ type: 'CREATE_GAME', name, locale: this.preference, storySlug });
	}

	joinGame(code: string, name: string): void {
		this.error = null;
		this.send({ type: 'JOIN_GAME', code: code.trim().toUpperCase(), name });
	}

	/**
	 * The config screen. A patch, so tapping one swatch sends one swatch.
	 *
	 * The server arbitrates: a colour someone else already holds comes back as an
	 * ERROR rather than being quietly accepted, which is the only way two players
	 * tapping the same one can be resolved.
	 */
	configure(patch: { name?: string; character?: number; colour?: number }): void {
		this.error = null;
		this.send({ type: 'CONFIGURE', ...patch });
	}

	/** Same land, same people, same code. */
	playAgain(): void {
		this.send({ type: 'PLAY_AGAIN' });
	}

	setReady(ready: boolean): void {
		this.send({ type: 'SET_READY', ready });
	}

	startGame(): void {
		this.send({ type: 'START_GAME' });
	}

	/** "I'm done teaching." The round starts once everyone has said this. */
	readyUp(): void {
		this.send({ type: 'SET_READY', ready: true });
	}

	addMemory(text: string): void {
		this.error = null;
		this.send({ type: 'ADD_MEMORY', text });
	}

	sabotage(targetPlayerId: string, lineIndex: number, text: string): void {
		this.error = null;
		this.send({ type: 'SABOTAGE', targetPlayerId, lineIndex, text });
	}

	leave(): void {
		if (browser) {
			sessionStorage.removeItem(STORAGE_PLAYER);
			sessionStorage.removeItem(STORAGE_CODE);
		}
		this.game = null;
		this.you = null;
		this.forgetStory();
	}

	/* ---------------------------------------------------------------- reducer */

	private remember(playerId: string, code: string): void {
		this.you = playerId;
		if (browser) {
			sessionStorage.setItem(STORAGE_PLAYER, playerId);
			sessionStorage.setItem(STORAGE_CODE, code);
		}
	}

	private replacePlayer(player: PublicPlayer): void {
		if (!this.game) return;
		const index = this.game.players.findIndex((p) => p.id === player.id);
		if (index === -1) this.game.players.push(player);
		else this.game.players[index] = player;
	}

	/**
	 * Put one sentence on the board, belonging to the agent whose turn it is.
	 *
	 * Nothing here schedules a hand-off: a bubble simply stands until the next one
	 * replaces it. That is what makes each of them last as long as it possibly can
	 * — the question holds for as long as the brain is thinking, and the answer
	 * holds for as long as the agent is walking.
	 */
	private speak(
		kind: BubbleKind,
		playerId: string,
		text: string,
		title?: string,
		improvised = false
	): void {
		const next = [...this.bubbles, { id: ++this.seq, kind, playerId, text, title, improvised }];
		this.bubbles = next.slice(-BUBBLE_DEPTH);
	}

	/** Nobody is talking. Between turns, and between rounds. */
	private hush(): void {
		this.bubbles = [];
		this.saidKnown = false;
	}

	private flash(kind: Effect['kind'], playerId: string, nodeId: string): void {
		const effect: Effect = { id: ++this.seq, kind, playerId, seat: this.seatOf(playerId), nodeId };
		this.effects = [...this.effects, effect];
		setTimeout(() => {
			this.effects = this.effects.filter((e) => e.id !== effect.id);
		}, 1400);
	}

	/** Everything a new match must not inherit. */
	private forgetStory(): void {
		this.hush();
		this.summary = null;
		this.effects = [];
		this.lastStep = null;
		this.activeId = null;
		this.order = [];
		this.turnIndex = 0;
		this.turnTotal = 0;
	}

	private notify(title: string, body: string, tone: Toast['tone']): void {
		const toast: Toast = { id: ++this.seq, title, body, tone };
		this.toast = toast;
		setTimeout(() => {
			if (this.toast?.id === toast.id) this.toast = null;
		}, 6000);
	}

	private receive(event: ServerEvent): void {
		switch (event.type) {
			case 'STATE_SYNC': {
				this.synced = true;
				if (!event.game || !event.you) {
					// The server has no memory of us — start over from the front door.
					// Only from a table we were supposedly sitting at: this connection is
					// opened on every page, and pages that are not the game (the story
					// designer, say) have no business being redirected by it.
					if (browser && atTheTable()) {
						this.leave();
						void goto(resolve('/'));
					}
					return;
				}
				this.you = event.you;
				this.game = event.game;
				this.summary = event.game.lastSummary;
				// Rejoining carries you back to your match — but only from the front
				// door or from another of its own pages. Being dragged out of the
				// designer into a match you left open is not a rescue.
				if (browser && (location.pathname === '/' || atTheTable())) {
					const target =
						event.game.phase === 'lobby'
							? resolve('/lobby/[code]', { code: event.game.code })
							: resolve('/game/[code]', { code: event.game.code });
					if (location.pathname !== target) void goto(target);
				}
				return;
			}

			case 'GAME_CREATED':
			case 'JOINED': {
				this.remember(event.playerId, event.code);
				this.game = event.game;
				void goto(resolve('/lobby/[code]', { code: event.code }));
				return;
			}

			case 'PLAYER_JOINED': {
				this.game = event.game;
				this.notify(
					this.t.toast.joinedTitle,
					fmt(this.t.toast.joinedBody, { name: event.player.name }),
					'good'
				);
				return;
			}

			case 'PLAYER_UPDATED':
				this.replacePlayer(event.player);
				return;

			case 'GAME_STARTED': {
				this.game = event.game;
				this.forgetStory();
				void goto(resolve('/game/[code]', { code: event.game.code }));
				return;
			}

			case 'START_COUNTDOWN': {
				// The snapshot's own field is the single source; the event exists only
				// because PLAYER_UPDATED does not carry a snapshot.
				if (this.game) this.game.startsAt = event.startsAt;
				return;
			}

			case 'MATCH_RESET': {
				this.game = event.game;
				this.forgetStory();
				if (browser && atTheTable()) {
					const target = resolve('/lobby/[code]', { code: event.game.code });
					if (location.pathname !== target) void goto(target);
				}
				return;
			}

			case 'ROUND_STARTED': {
				this.game = event.game;
				this.activeId = null;
				this.order = event.order;
				this.hush();
				return;
			}

			case 'TURN_STARTED': {
				this.replacePlayer(event.player);
				this.activeId = event.playerId;
				this.turnIndex = event.index;
				this.turnTotal = event.total;
				// A new mouth: the last agent's turn must not hang over this one.
				this.hush();
				return;
			}

			case 'TURN_ENDED': {
				this.replacePlayer(event.player);
				this.hush();
				return;
			}

			case 'ROUND_ENDED': {
				this.game = event.game;
				this.summary = event.summary;
				this.activeId = null;
				this.hush();
				return;
			}

			case 'TEACHING_STARTED': {
				this.game = event.game;
				this.activeId = null;
				this.hush();
				/*
				 * The round is over and the writing window is open, so put the player
				 * where the writing happens.
				 *
				 * This is the one screen change the game itself should make. The clue
				 * row lives only in your own head now — the revised design took it off
				 * the map — so leaving the player on a map with a dead clock means the
				 * thirty seconds they get to teach their agent tick away behind a
				 * screen with nothing to do on it. Landing on your own memory is also
				 * what the mockup does.
				 *
				 * Your own head, explicitly: whoever you were reading last was probably
				 * a rival, and the first thing to do with a new window is your own note.
				 */
				ui.view = 'brain';
				ui.selectedId = this.you ?? '';
				return;
			}

			case 'AGENT_THINKING': {
				this.replacePlayer(event.player);
				if (this.game) applyChoicesRevealed(this.game.tree, event.reveal);
				// Ground it has already argued about gets no question: on a retrace the
				// agent is hurrying, and re-posing a settled choice at every step would
				// bury the one moment this bubble exists for.
				if (!event.familiar) {
					const ways = event.reveal.choices.map((c) => c.label);
					this.speak(
						'system',
						event.playerId,
						listWays(this.locale, ways),
						fmt(this.t.narration.comesTo, { place: event.nodeTitle })
					);
				}
				return;
			}

			case 'AGENT_CHOICE': {
				this.replacePlayer(event.player);
				this.lastStep = {
					id: ++this.seq,
					playerId: event.playerId,
					choiceId: event.choiceId,
					retrace: event.retrace
				};
				if (event.retrace) {
					// Known ground: the agent is not deciding, it is recognising. Said once
					// and then it gets on with it — once per step down a road it has
					// already walked would be the same sentence eight times.
					if (!this.saidKnown) {
						this.saidKnown = true;
						this.speak('move', event.playerId, this.t.narration.knowsTheWay);
					}
				} else {
					// Back on new ground, so the next known stretch earns the line again.
					this.saidKnown = false;
					this.speak('move', event.playerId, event.reasoning, undefined, event.improvised);
				}
				return;
			}

			case 'AGENT_SURVIVED': {
				this.replacePlayer(event.player);
				if (this.game) applyNodeRevealed(this.game.tree, event.revealed);
				// The flash on the board is the whole announcement now; the road holding
				// is something you can see.
				this.flash('survive', event.playerId, event.revealed.node.id);
				return;
			}

			case 'AGENT_DIED': {
				this.replacePlayer(event.player);
				if (this.game) applyNodeRevealed(this.game.tree, event.revealed);
				this.flash('death', event.playerId, event.revealed.node.id);
				this.speak('fail', event.playerId, this.t.narration.doesNotReturn);
				return;
			}

			case 'AGENT_REACHED_HOME': {
				this.replacePlayer(event.player);
				if (this.game) applyNodeRevealed(this.game.tree, event.revealed);
				// No bubble: reaching home ends the match, and the end card is a louder
				// way of saying it than a sentence that would be swept away with it.
				this.flash('win', event.playerId, event.revealed.node.id);
				return;
			}

			case 'MEMORY_UPDATED': {
				/*
				 * The player *is* the memory now.
				 *
				 * The brain screen reads `PublicPlayer.memory` straight, so replacing
				 * the player is the whole update — there is no second copy of the notes
				 * to keep in step. Nothing leaks: that memory is already public to the
				 * whole table, which is what makes overwriting a line possible at all.
				 */
				this.replacePlayer(event.player);
				return;
			}

			case 'SABOTAGE_USED': {
				this.replacePlayer(event.player);
				this.replacePlayer(event.actor);
				// The lie shows itself: the victim's own memory now carries both the
				// line they wrote and the one that replaced it, in the liar's colour.
				// The toast is only so they find out without being on that screen.
				if (event.targetId === this.you) {
					this.notify(
						this.t.toast.sabotagedTitle,
						fmt(this.t.toast.sabotagedBody, {
							actor: event.actorName,
							line: event.lineIndex + 1,
							before: event.before,
							after: event.after
						}),
						'danger'
					);
				}
				return;
			}

			case 'GAME_FINISHED': {
				this.game = event.game;
				return;
			}

			case 'ERROR': {
				this.error = event.message;
				setTimeout(() => {
					if (this.error === event.message) this.error = null;
				}, 4000);
				return;
			}
		}
	}
}

export const conn = new Connection();
