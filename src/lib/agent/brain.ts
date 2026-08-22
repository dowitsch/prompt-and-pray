import type { Locale } from '../i18n/index.ts';

/**
 * The agent's brain: the one seam where a real LLM plugs in.
 *
 * Note what a brain is *not* given: whether any choice is correct, what
 * happened on previous runs, or where HOME is. An agent starts every run
 * amnesiac. The only thing that survives a death is what its player wrote into
 * memory, twenty characters at a time. That constraint is the whole game.
 */

export type BrainChoice = {
	/**
	 * The choice's word-shaped handle (`StoryChoice.slug`), not its database id.
	 * The prompt shows it to the model and the offline brain reads it as a
	 * keyword, so it has to be a word — the runner translates it back.
	 */
	id: string;
	label: string;
};

export type DecisionContext = {
	/**
	 * What the agent is called — the character's name, not the operator's.
	 *
	 * The offline brain seeds its tie-break with it, and it is what the prompt
	 * falls back to when personas are switched off.
	 */
	agentName: string;
	/**
	 * Which of the four characters this agent is, 0..CHARACTER_COUNT-1.
	 *
	 * The one field that makes two agents at the same crossroads with the same
	 * notes answer differently: it selects the doctrine appended to the system
	 * prompt and the sampling parameters the call is made with. See
	 * `agent/personas.ts`.
	 */
	character: number;
	/** The language the match is told in; the agent reasons in it. */
	locale: Locale;
	nodeTitle: string;
	nodeDescription: string;
	choices: BrainChoice[];
	/** The player's accumulated memory, oldest first. */
	memory: string[];
	/** Labels taken so far *this run*. Cleared on death. */
	pathSoFar: string[];
};

export type AgentDecision = {
	/** Must be one of the offered choice ids. Validated before it reaches the engine. */
	choice: string;
	reasoning: string;
	/** True when this came from the offline fallback rather than the configured provider. */
	improvised?: boolean;
};

export interface AgentBrain {
	readonly name: string;
	decide(ctx: DecisionContext): Promise<AgentDecision>;
}
