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
	| {
			type: 'CREATE_GAME';
			name: string;
			locale: Locale;
			/** Slug of a published story; the built-in one for this language if absent. */
			storySlug?: string;
	  }
	| { type: 'JOIN_GAME'; code: string; name: string }
	/**
	 * The config screen: portrait, identity colour, and the name you go by.
	 *
	 * A patch, so tapping one swatch does not have to resend the rest. Deliberately
	 * separate from JOIN_GAME rather than folded into it: a joiner cannot know
	 * which colours are already taken until it has a snapshot, so the honest order
	 * is join first, then configure. Lobby only — see `Game.configure`.
	 */
	| { type: 'CONFIGURE'; name?: string; character?: number; colour?: number }
	| { type: 'SET_READY'; ready: boolean }
	| { type: 'START_GAME' }
	| { type: 'ADD_MEMORY'; text: string }
	| { type: 'SABOTAGE'; targetPlayerId: string; lineIndex: number; text: string }
	| { type: 'PLAY_AGAIN' }
	/**
	 * This device is reading the tale aloud — or has stopped.
	 *
	 * Per device, not per player: it is a property of the phone in your hand and of
	 * nothing else at the table, so it is never broadcast and never stored. The
	 * server keeps it only for as long as the socket lives, and a reconnect has to
	 * say it again.
	 */
	| { type: 'SET_VOICE'; on: boolean }
	/**
	 * That line has finished being read.
	 *
	 * The one thing a client tells the server about pace. It still asserts nothing:
	 * a sound stopped, which the server is free to have already stopped waiting for.
	 */
	| { type: 'SPOKEN'; utterance: number };

/* -------------------------------------------------------- server -> client */

/**
 * Agent lifecycle events carry the updated player snapshot. It costs a little
 * bandwidth and removes a whole class of client/server divergence bugs: the
 * client never has to derive state, it just adopts it.
 *
 * The three events that put a sentence on the board — AGENT_THINKING,
 * AGENT_CHOICE and AGENT_DIED — also carry an `utterance` id, and a client that
 * is reading the tale aloud answers each of them with SPOKEN. The runner holds
 * the next beat until it has. Every one of the three is answered whether or not
 * anything was actually said: whether a line is spoken depends on client-side
 * rules the server has no business knowing (a familiar arrival is silent, and
 * "I know this road" is said once per stretch), and an unconditional answer is
 * what keeps those rules out of here.
 */
export type ServerEvent =
	| { type: 'STATE_SYNC'; you: string | null; game: GameSnapshot | null }
	| { type: 'GAME_CREATED'; code: string; playerId: string; game: GameSnapshot }
	| { type: 'JOINED'; code: string; playerId: string; game: GameSnapshot }
	| { type: 'PLAYER_JOINED'; player: PublicPlayer; game: GameSnapshot }
	| { type: 'PLAYER_UPDATED'; player: PublicPlayer }
	| { type: 'GAME_STARTED'; game: GameSnapshot }
	/**
	 * The lobby is counting down to the start. `startsAt` of 0 means cancelled.
	 *
	 * A single event with a zero sentinel rather than a started/cancelled pair, so
	 * it reads exactly like the `teachingEndsAt` field it mirrors. It has to exist
	 * at all because `PLAYER_UPDATED` carries no snapshot: without it, the ready
	 * tap that completes the set would tell nobody that the count had begun.
	 */
	| { type: 'START_COUNTDOWN'; startsAt: number }
	/** Back to the lobby, same code, same people, nothing else carried over. */
	| { type: 'MATCH_RESET'; game: GameSnapshot }
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
			/**
			 * This place has already introduced itself once in this match.
			 *
			 * The words are authored and do not change, so the second telling is the
			 * game repeating itself: the client puts the bubble up but does not read
			 * it aloud, and the beat here is brisk rather than long enough to hear a
			 * sentence out. Decided on the server because the server is the one
			 * holding the tale still while it is read.
			 */
			retold: boolean;
			utterance: number;
	  }
	| {
			type: 'AGENT_CHOICE';
			playerId: string;
			player: PublicPlayer;
			choiceId: string;
			choiceLabel: string;
			reasoning: string;
			/**
			 * The authored line for setting off down this road, or empty.
			 *
			 * The world's voice, not the agent's — this is the plank giving way, the
			 * toll being paid, the joke landing one step late. It was written into the
			 * database from the start and had nowhere to go until now.
			 */
			consequence: string;
			/** The same road's consequence has been read aloud once already. */
			retold: boolean;
			/** True when the decision came from the offline fallback brain. */
			improvised: boolean;
			/** Walking proven ground: collapsed into a single line rather than narrated. */
			retrace: boolean;
			utterance: number;
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
			utterance: number;
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
