import { browser } from '$app/environment';
import { goto } from '$app/navigation';
import { resolve } from '$app/paths';
import { applyChoicesRevealed, applyNodeRevealed } from '$lib/engine/fog';
import type { GameSnapshot, PublicPlayer } from '$lib/engine/game';
import type { RoundSummary } from '$lib/engine/types';
import type { ClientMessage, ServerEvent } from '$lib/protocol';
import { WS_PATH } from '$lib/protocol';

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

export type Toast = {
	id: number;
	title: string;
	body: string;
	tone: 'danger' | 'good';
};

const STORAGE_PLAYER = 'homeward:playerId';
const STORAGE_CODE = 'homeward:code';
const MAX_LOG = 140;

export class Connection {
	status = $state<'idle' | 'connecting' | 'open' | 'closed'>('idle');
	you = $state<string | null>(null);
	game = $state<GameSnapshot | null>(null);
	/** Last completed round’s story, shown between rounds. */
	summary = $state<RoundSummary | null>(null);
	/** Which synchronised beat the round is on, e.g. “LEVEL 3 · 2 still walking”. */
	stepLabel = $state<string | null>(null);
	log = $state<LogEntry[]>([]);
	effects = $state<Effect[]>([]);
	toast = $state<Toast | null>(null);
	error = $state<string | null>(null);
	/** True once the server has answered our opening HELLO. */
	synced = $state(false);

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
			this.status = 'closed';
			if (this.closing) return;
			// Reconnect and re-sync; the match kept running without us.
			this.retry = Math.min(this.retry + 1, 6);
			setTimeout(() => this.connect(), 400 * this.retry);
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

	createGame(name: string): void {
		this.error = null;
		this.send({ type: 'CREATE_GAME', name });
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
		this.stepLabel = null;
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
					if (browser && location.pathname !== '/') {
						this.leave();
						void goto(resolve('/'));
					}
					return;
				}
				this.you = event.you;
				this.game = event.game;
				this.summary = event.game.lastSummary;
				if (browser) {
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
				this.notify('AGENT CONNECTED', `${event.player.name} joined the match.`, 'good');
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
				this.stepLabel = null;
				this.push({
					kind: 'round',
					playerId: '',
					text: `ROUND ${String(event.round).padStart(2, '0')}`,
					detail: 'all four set out'
				});
				return;
			}

			case 'STEP_STARTED': {
				// A synchronised beat — everyone still alive faces this level at once.
				this.stepLabel = `LEVEL ${event.step + 1} · ${event.alive} still walking`;
				return;
			}

			case 'ROUND_ENDED': {
				this.game = event.game;
				this.summary = event.summary;
				this.push({
					kind: 'recap',
					playerId: '',
					text: event.summary.headline
				});
				return;
			}

			case 'TEACHING_STARTED': {
				this.game = event.game;
				this.stepLabel = null;
				return;
			}

			case 'AGENT_THINKING': {
				this.replacePlayer(event.player);
				if (this.game) applyChoicesRevealed(this.game.tree, event.reveal);
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
				this.push({ kind: 'dead', playerId: event.playerId, text: event.epitaph });
				return;
			}

			case 'AGENT_REACHED_HOME': {
				this.replacePlayer(event.player);
				if (this.game) applyNodeRevealed(this.game.tree, event.revealed);
				this.flash('win', event.playerId, event.revealed.node.id);
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
						'YOUR MEMORY WAS SABOTAGED',
						`${event.actorName} overwrote line ${event.lineIndex + 1}: "${event.before}" became "${event.after}".`,
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
