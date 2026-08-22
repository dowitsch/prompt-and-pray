import type { GameSnapshot, PublicPlayer } from './engine/game.ts';
import type { ChoicesRevealed, NodeRevealed } from './engine/fog.ts';
import type { MemoryLine, RoundSummary, RunRecord } from './engine/types.ts';
import type { Locale } from './i18n/index.ts';

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
	| { type: 'CREATE_GAME'; name: string; locale: Locale }
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
	/** A new round. `order` is the sequence agents take their turns in. */
	| { type: 'ROUND_STARTED'; round: number; order: string[]; game: GameSnapshot }
	/** The spotlight moves to one agent; its whole attempt follows. */
	| { type: 'TURN_STARTED'; playerId: string; player: PublicPlayer; index: number; total: number }
	| { type: 'TURN_ENDED'; playerId: string; player: PublicPlayer }
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
			/** The world has stood here before — the client keeps the arrival quiet. */
			familiar: boolean;
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
			/** Walking proven ground: collapsed into a single line rather than narrated. */
			retrace: boolean;
	  }
	| {
			type: 'AGENT_SURVIVED';
			playerId: string;
			player: PublicPlayer;
			choiceId: string;
			depth: number;
			/** This step went deeper than any agent had ever been. */
			record: boolean;
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
