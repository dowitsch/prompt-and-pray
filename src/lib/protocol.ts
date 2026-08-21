import type { GameSnapshot, PublicPlayer } from './engine/game.ts';
import type { ChoicesRevealed, NodeRevealed } from './engine/fog.ts';
import type { MemoryLine, RoundSummary, RunRecord } from './engine/types.ts';

/**
 * The wire protocol, shared by the WebSocket hub and the browser.
 *
 * Client messages are requests — the server may refuse any of them. Server
 * events are facts. Nothing here lets a client assert an outcome.
 *
 * The browser must only ever `import type` from this module and from
 * `./engine/*`: importing engine values would pull the map (and therefore the
 * solution) into the client bundle.
 */

export const WS_PATH = '/ws';

/* -------------------------------------------------------- client -> server */

export type ClientMessage =
	| { type: 'HELLO'; playerId: string | null; code: string | null }
	| { type: 'CREATE_GAME'; name: string }
	| { type: 'JOIN_GAME'; code: string; name: string }
	| { type: 'SET_READY'; ready: boolean }
	| { type: 'START_GAME' }
	| { type: 'ADD_MEMORY'; text: string }
	| { type: 'SABOTAGE'; targetPlayerId: string; lineIndex: number; text: string }
	| { type: 'PLAY_AGAIN' };

/* -------------------------------------------------------- server -> client */

/**
 * Agent lifecycle events carry the updated player snapshot. It costs a little
 * bandwidth and removes a whole class of client/server divergence bugs: the
 * client never has to derive state, it just adopts it.
 */
export type ServerEvent =
	| { type: 'STATE_SYNC'; you: string | null; game: GameSnapshot | null }
	| { type: 'GAME_CREATED'; code: string; playerId: string; game: GameSnapshot }
	| { type: 'JOINED'; code: string; playerId: string; game: GameSnapshot }
	| { type: 'PLAYER_JOINED'; player: PublicPlayer; game: GameSnapshot }
	| { type: 'PLAYER_UPDATED'; player: PublicPlayer }
	| { type: 'GAME_STARTED'; game: GameSnapshot }
	/** Every agent sets out at once. */
	| { type: 'ROUND_STARTED'; round: number; game: GameSnapshot }
	/** A synchronised beat: all surviving agents are about to face this level. */
	| { type: 'STEP_STARTED'; round: number; step: number; alive: number }
	/** The round is over; carries its story. */
	| { type: 'ROUND_ENDED'; summary: RoundSummary; game: GameSnapshot }
	/** Teaching is open until `endsAt`, or until everyone readies up. */
	| { type: 'TEACHING_STARTED'; round: number; endsAt: number; game: GameSnapshot }
	| {
			type: 'AGENT_THINKING';
			playerId: string;
			player: PublicPlayer;
			nodeId: string;
			nodeTitle: string;
			nodeDescription: string;
			reveal: ChoicesRevealed;
	  }
	| {
			type: 'AGENT_CHOICE';
			playerId: string;
			player: PublicPlayer;
			choiceId: string;
			choiceLabel: string;
			reasoning: string;
			/** True when the decision came from the offline fallback brain. */
			improvised: boolean;
	  }
	| {
			type: 'AGENT_SURVIVED';
			playerId: string;
			player: PublicPlayer;
			choiceId: string;
			depth: number;
			revealed: NodeRevealed;
	  }
	| {
			type: 'AGENT_DIED';
			playerId: string;
			player: PublicPlayer;
			choiceId: string;
			epitaph: string;
			revealed: NodeRevealed;
			run: RunRecord;
	  }
	| {
			type: 'AGENT_REACHED_HOME';
			playerId: string;
			player: PublicPlayer;
			choiceId: string;
			revealed: NodeRevealed;
			run: RunRecord;
	  }
	| { type: 'MEMORY_UPDATED'; playerId: string; player: PublicPlayer; memory: MemoryLine[] }
	| {
			type: 'SABOTAGE_USED';
			actorId: string;
			actorName: string;
			targetId: string;
			targetName: string;
			lineIndex: number;
			before: string;
			after: string;
			player: PublicPlayer;
			actor: PublicPlayer;
	  }
	| { type: 'GAME_FINISHED'; winnerIds: string[]; game: GameSnapshot }
	| { type: 'ERROR'; message: string };

export type ServerEventType = ServerEvent['type'];
