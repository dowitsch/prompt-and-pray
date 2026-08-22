import { browser } from '$app/environment';
import { goto } from '$app/navigation';
import { resolve } from '$app/paths';
import { applyChoicesRevealed, applyNodeRevealed } from '$lib/engine/fog';
import type { GameSnapshot, PublicPlayer } from '$lib/engine/game';
import type { RoundSummary } from '$lib/engine/types';
import type { ClientMessage, ServerEvent } from '$lib/protocol';
import { WS_PATH } from '$lib/protocol';
import { roman } from '$lib/client/palette';
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

export type LogKind =
	'round' | 'recap' | 'sight' | 'speech' | 'ok' | 'dead' | 'home' | 'memory' | 'sabotage';

export type LogEntry = {
	id: number;
	kind: LogKind;
	playerId: string;
	playerName: string;
	seat: number;
	text: string;
	detail?: string;
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
export type LineTone =
	| 'open'
	| 'place'
	| 'scene'
	| 'ways'
	| 'speech'
	| 'act'
	| 'good'
	| 'record'
	| 'bad'
	| 'home'
	| 'quiet';

export type Line = {
	id: number;
	tone: LineTone;
	text: string;
};

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

const STORAGE_PLAYER = 'homeward:playerId';
const STORAGE_LOCALE = 'homeward:locale';
const STORAGE_CODE = 'homeward:code';
const MAX_LOG = 140;

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
	/** The sentences of the current turn, oldest first. */
	lines = $state<Line[]>([]);
	/** Sentences waiting their turn to appear. */
	private queue: Omit<Line, 'id'>[] = [];
	private reveal: ReturnType<typeof setInterval> | null = null;
	/** True once this turn has already announced it is retracing. */
	private saidRetracing = false;
	log = $state<LogEntry[]>([]);
	effects = $state<Effect[]>([]);
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
		this.summary = null;
		this.order = [];
		this.activeId = null;
		this.newPage();
		this.log = [];
		this.effects = [];
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

	private push(entry: Omit<LogEntry, 'id' | 'playerName' | 'seat'>): void {
		const full: LogEntry = {
			...entry,
			id: ++this.seq,
			playerName: this.playerName(entry.playerId),
			seat: this.seatOf(entry.playerId)
		};
		this.log = [...this.log, full].slice(-MAX_LOG);
	}

	private flash(kind: Effect['kind'], playerId: string, nodeId: string): void {
		const effect: Effect = { id: ++this.seq, kind, playerId, seat: this.seatOf(playerId), nodeId };
		this.effects = [...this.effects, effect];
		setTimeout(() => {
			this.effects = this.effects.filter((e) => e.id !== effect.id);
		}, 1400);
	}

	/**
	 * Queue sentences for the current turn. They surface one at a time so the
	 * telling has a rhythm; if the server gets ahead of us the queue drains
	 * faster rather than falling behind the board.
	 */
	private say(...lines: { tone: LineTone; text: string }[]): void {
		this.queue.push(...lines);
		if (this.reveal) return;

		const step = () => {
			const next = this.queue.shift();
			if (!next) {
				if (this.reveal) clearInterval(this.reveal);
				this.reveal = null;
				return;
			}
			this.lines = [...this.lines, { ...next, id: ++this.seq }].slice(-14);
		};

		step();
		// Sentences are spread across the server's beat, so turning PACE_SCALE up
		// slows the telling itself rather than just adding dead air after it.
		const stagger = 420 * (this.game?.paceScale ?? 1);
		this.reveal = setInterval(() => {
			// Backed up behind a fast server: catch up two at a time.
			if (this.queue.length > 3) step();
			step();
		}, stagger);
	}

	/** Clear the page for a new teller. */
	private newPage(): void {
		if (this.reveal) clearInterval(this.reveal);
		this.reveal = null;
		this.queue = [];
		this.lines = [];
		this.saidRetracing = false;
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
				this.log = [];
				void goto(resolve('/game/[code]', { code: event.game.code }));
				return;
			}

			case 'ROUND_STARTED': {
				this.game = event.game;
				this.activeId = null;
				this.order = event.order;
				this.newPage();
				const n = this.t.narration;
				const first = this.playerName(event.order[0] ?? '');
				this.say(
					{ tone: 'open', text: fmt(n.roundIs, { n: roman(event.round) }) },
					{ tone: 'quiet', text: n.backToStart },
					{ tone: 'place', text: fmt(n.goesFirst, { name: first }) }
				);
				this.push({
					kind: 'round',
					playerId: '',
					text: `ROUND ${String(event.round).padStart(2, '0')}`,
					detail: 'all four set out'
				});
				return;
			}

			case 'TURN_STARTED': {
				this.replacePlayer(event.player);
				this.activeId = event.playerId;
				this.turnIndex = event.index;
				this.turnTotal = event.total;
				this.newPage();

				const n = this.t.narration;
				const carried = event.player.memory.length;
				const lies = event.player.memory.filter((line) => line.sabotagedBy).length;
				this.say({ tone: 'open', text: fmt(n.setsOut, { name: event.player.name }) });
				if (carried === 0) {
					this.say({ tone: 'quiet', text: n.knowsNothing });
				} else {
					this.say({
						tone: 'quiet',
						text: carried === 1 ? n.carriesOne : fmt(n.carriesMany, { n: carried })
					});
					// The best beat in the game: watching an agent walk off on a lie.
					if (lies) {
						this.say({
							tone: 'bad',
							text: lies === 1 ? n.oneIsFalse : fmt(n.manyAreFalse, { n: lies })
						});
					}
				}
				return;
			}

			case 'TURN_ENDED': {
				this.replacePlayer(event.player);
				return;
			}

			case 'ROUND_ENDED': {
				this.game = event.game;
				this.summary = event.summary;
				this.activeId = null;
				this.newPage();
				this.push({
					kind: 'recap',
					playerId: '',
					text: event.summary.headline
				});
				return;
			}

			case 'TEACHING_STARTED': {
				this.game = event.game;
				this.activeId = null;
				this.newPage();
				return;
			}

			case 'AGENT_THINKING': {
				this.replacePlayer(event.player);
				if (this.game) applyChoicesRevealed(this.game.tree, event.reveal);
				if (!event.familiar) {
					const n = this.t.narration;
					const ways = event.reveal.choices.map((c) => c.label);
					this.say(
						{ tone: 'place', text: fmt(n.comesTo, { place: event.nodeTitle }) },
						{ tone: 'scene', text: event.nodeDescription },
						{ tone: 'ways', text: listWays(this.locale, ways) }
					);
				}
				this.push({
					kind: 'sight',
					playerId: event.playerId,
					text: event.nodeTitle,
					detail: event.reveal.choices.map((c) => c.label).join(' · ')
				});
				return;
			}

			case 'AGENT_CHOICE': {
				this.replacePlayer(event.player);
				if (event.retrace) {
					// Known road: said once, not once per step.
					if (!this.saidRetracing) {
						this.saidRetracing = true;
						this.say({ tone: 'quiet', text: this.t.narration.hurriesOn });
					}
				} else {
					this.say(
						{ tone: 'speech', text: `\u201C${event.reasoning}\u201D` },
						{
							tone: 'act',
							text: fmt(this.t.narration.takes, { choice: event.choiceLabel })
						}
					);
				}
				this.push({
					kind: 'speech',
					playerId: event.playerId,
					text: event.reasoning,
					detail: event.choiceLabel,
					improvised: event.improvised
				});
				return;
			}

			case 'AGENT_SURVIVED': {
				this.replacePlayer(event.player);
				if (this.game) applyNodeRevealed(this.game.tree, event.revealed);
				this.flash('survive', event.playerId, event.revealed.node.id);
				// A step past everything anyone has ever managed deserves its own line.
				this.say(
					event.record
						? { tone: 'record', text: this.t.narration.record }
						: { tone: 'good', text: this.t.narration.wayHolds }
				);
				this.push({
					kind: 'ok',
					playerId: event.playerId,
					text: 'CORRECT',
					detail: `depth ${event.depth}`
				});
				return;
			}

			case 'AGENT_DIED': {
				this.replacePlayer(event.player);
				if (this.game) applyNodeRevealed(this.game.tree, event.revealed);
				this.flash('death', event.playerId, event.revealed.node.id);
				this.say(
					{ tone: 'bad', text: this.t.narration.doesNotReturn },
					{ tone: 'scene', text: event.epitaph }
				);
				this.push({ kind: 'dead', playerId: event.playerId, text: event.epitaph });
				return;
			}

			case 'AGENT_REACHED_HOME': {
				this.replacePlayer(event.player);
				if (this.game) applyNodeRevealed(this.game.tree, event.revealed);
				this.flash('win', event.playerId, event.revealed.node.id);
				this.say({ tone: 'home', text: 'The gate opens.' }, { tone: 'home', text: 'It is home.' });
				this.push({ kind: 'home', playerId: event.playerId, text: 'REACHED HOME' });
				return;
			}

			case 'MEMORY_UPDATED': {
				this.replacePlayer(event.player);
				if (event.playerId === this.you) {
					const added = event.memory.at(-1);
					this.push({
						kind: 'memory',
						playerId: event.playerId,
						text: added?.text ?? '',
						detail: `${event.memory.length} lines`
					});
				}
				return;
			}

			case 'SABOTAGE_USED': {
				this.replacePlayer(event.player);
				this.replacePlayer(event.actor);
				this.push({
					kind: 'sabotage',
					playerId: event.actorId,
					text: `overwrote ${event.targetName}'s memory`,
					detail: `"${event.before}" → "${event.after}"`
				});
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
