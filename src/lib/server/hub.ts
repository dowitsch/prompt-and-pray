import type { WebSocket } from 'ws';
import type { Game } from '../engine/game.ts';
import { GameError } from '../engine/game.ts';
import { MAX_PLAYERS } from '../engine/types.ts';
import type { ClientMessage, ServerEvent } from '../protocol.ts';
import type { AgentBrain } from '../agent/index.ts';
import { BotController, makeBots } from './bots.ts';
import { MatchRunner } from './runner.ts';
import { createGame, getGame, newPlayerId, sweepStaleGames } from './store.ts';

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

	constructor(private readonly brain: AgentBrain) {}

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
				return this.onCreate(session, message.name);
			case 'JOIN_GAME':
				return this.onJoin(session, message.code, message.name);
			case 'SET_READY': {
				const { game, playerId } = this.requirePlayer(session);
				game.setReady(playerId, message.ready);
				return this.broadcast(game, {
					type: 'PLAYER_UPDATED',
					player: game.publicPlayer(game.getPlayer(playerId))
				});
			}
			case 'START_GAME':
				return this.onStart(session);
			case 'DEPLOY_AGENT': {
				const { game, playerId } = this.requirePlayer(session);
				this.runners.get(game.code)?.deploy(playerId);
				return;
			}
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

	private onCreate(session: Session, name: string): void {
		const game = createGame();
		const player = game.addPlayer(newPlayerId(), name.trim() || 'YOU');
		player.ready = true;

		session.playerId = player.id;
		session.code = game.code;

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
		player.ready = true;
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

	private onStart(session: Session): void {
		const { game, playerId } = this.requirePlayer(session);
		if (game.hostId !== playerId) throw new GameError('Only the host can start the match.');

		// Empty seats are filled with simulated opponents, so one browser tab is
		// enough to play a full four-agent match.
		const missing = MAX_PLAYERS - game.players.length;
		const specs = makeBots(game.code, missing);

		const runner = new MatchRunner(game, this.brain, (event) => this.broadcast(game, event));
		this.runners.set(game.code, runner);

		specs.forEach((spec, index) => {
			const bot = game.addPlayer(`bot_${game.code}_${index}`, spec.name, true);
			runner.registerBot(
				new BotController(bot.id, spec.skill, `${game.code}:${bot.id}`, {
					// Exactly one opponent plays dirty.
					sabotages: index === 0
				})
			);
		});

		game.start();
		this.broadcast(game, { type: 'GAME_STARTED', game: game.snapshot() });
		runner.startMatch();
	}
}
