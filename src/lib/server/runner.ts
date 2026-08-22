import type { AgentBrain, DecisionContext } from '../agent/index.ts';
import type { Game } from '../engine/game.ts';
import { GameError } from '../engine/game.ts';
import type { Player } from '../engine/types.ts';
import { TEACHING_SECONDS } from '../engine/types.ts';
import type { ServerEvent } from '../protocol.ts';
import { BotController } from './bots.ts';

/**
 * Drives the match, round by round.
 *
 * Within a round the agents take their turns **one at a time**. Four agents
 * walking at once is legible in a log and unreadable on a board; one agent at a
 * time is a story you can follow — it arrives somewhere, it tells you what it
 * remembers, it chooses, and it lives or it doesn't. A round is four of those
 * little stories, and then everyone is handed twenty characters.
 *
 * Ground the world has already proven safe is replayed quickly, so the pace
 * lingers only on the step where something new actually happens.
 */

/**
 * How long each beat of the story is held on screen, in milliseconds.
 *
 * These are tuned for *reading*, not for finishing quickly. A beat has to give
 * you time to take in where the agent is, what it says it remembers, and what
 * that turned out to cost — roughly the pace of someone reading a page aloud.
 *
 * Everything here is multiplied by `PACE_SCALE` (see `.env.example`), so the
 * whole tale can be slowed down or sped up without touching this file.
 */
export const PACE = {
	/** The round is announced and the first agent named. Held to be read. */
	ROUND_INTRO: 2600,
	/** Spotlight moving to the next agent, and its name held before it walks. */
	TURN_INTRO: 1500,
	/** Beat after an agent's turn ends, before the next one starts. */
	TURN_OUTRO: 1100,

	/** Arriving somewhere new: three short lines are told inside this beat. */
	ARRIVE: 1700,
	/** Time to read what the agent says it remembers. */
	THINK_MIN: 1600,
	/** The choice, held before it is acted on. */
	REVEAL: 1000,
	/** Travelling the edge to the next node. */
	MOVE: 950,

	/**
	 * Retracing ground the world has already proven safe. Kept brisk on purpose:
	 * by the eighth round nobody wants to watch the same four steps narrated
	 * four times over. The client collapses these into one "walks the road it
	 * knows" line, and the pace opens back up the moment something is new.
	 */
	RETRACE_ARRIVE: 150,
	RETRACE_THINK: 280,
	RETRACE_STEP: 420,

	/** Long enough to read the epitaph. */
	DEATH_HOLD: 2400,
	HOME_HOLD: 3400,
	ROUND_OUTRO: 1500
} as const;

export type Broadcast = (event: ServerEvent) => void;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));

export class MatchRunner {
	private readonly bots = new Map<string, BotController>();
	private readonly timers = new Set<ReturnType<typeof setTimeout>>();
	private stopped = false;
	private roundInFlight = false;

	constructor(
		private readonly game: Game,
		private readonly brain: AgentBrain,
		private readonly broadcast: Broadcast,
		/** Multiplies every storytelling beat. >1 tells it slower, <1 faster. */
		private readonly paceScale = 1
	) {}

	/**
	 * Hold a beat. Every pause in the telling goes through here, so one dial
	 * changes the pace of the whole tale.
	 */
	private beat(ms: number): Promise<unknown> {
		return sleep(ms * this.paceScale);
	}

	registerBot(controller: BotController): void {
		this.bots.set(controller.playerId, controller);
	}

	/** Round one starts immediately — nobody has anything to teach yet. */
	startMatch(): void {
		void this.runRound();
	}

	stop(): void {
		this.stopped = true;
		for (const timer of this.timers) clearTimeout(timer);
		this.timers.clear();
	}

	/** A player pressed READY during teaching. */
	notifyReady(): void {
		if (this.game.phase === 'teaching' && this.game.allReady()) {
			this.beginRoundNow();
		}
	}

	private later(fn: () => void, ms: number): void {
		const timer = setTimeout(() => {
			this.timers.delete(timer);
			if (!this.stopped) fn();
		}, ms);
		this.timers.add(timer);
	}

	private emitPlayer(player: Player): void {
		this.broadcast({ type: 'PLAYER_UPDATED', player: this.game.publicPlayer(player) });
	}

	/* ----------------------------------------------------------- the round */

	private async runRound(): Promise<void> {
		if (this.stopped || this.roundInFlight) return;
		this.roundInFlight = true;

		try {
			const round = this.game.beginRound();
			const order = this.game.turnOrder();
			this.broadcast({
				type: 'ROUND_STARTED',
				round,
				order: order.map((p) => p.id),
				game: this.game.snapshot()
			});
			await this.beat(PACE.ROUND_INTRO);

			// Every agent gets its turn, even after someone reaches home — turn
			// order must never decide the match. Anyone who arrives this round wins.
			for (const [index, player] of order.entries()) {
				if (this.stopped) return;
				await this.playTurn(player, index, order.length);
			}

			await this.beat(PACE.ROUND_OUTRO);
			if (this.stopped) return;

			const summary = this.game.endRound();
			this.broadcast({ type: 'ROUND_ENDED', summary, game: this.game.snapshot() });

			if (this.game.winnerIds.length) {
				this.broadcast({
					type: 'GAME_FINISHED',
					winnerIds: this.game.winnerIds,
					game: this.game.snapshot()
				});
				this.stop();
				return;
			}

			this.openTeaching();
		} catch (error) {
			// A wedged round would wedge the match. Log it and move on.
			console.error('[homeward] round failed', error);
			try {
				this.game.endRound();
				this.openTeaching();
			} catch {
				/* nothing left to salvage */
			}
		} finally {
			this.roundInFlight = false;
		}
	}

	/** One agent's whole attempt, told start to finish. */
	private async playTurn(player: Player, index: number, total: number): Promise<void> {
		this.broadcast({
			type: 'TURN_STARTED',
			playerId: player.id,
			player: this.game.publicPlayer(player),
			index,
			total
		});
		await this.beat(PACE.TURN_INTRO);

		for (let step = 0; step < this.game.map.depth + 2; step++) {
			if (this.stopped) return;
			if (player.agent.status !== 'running') break;

			const node = this.game.nodeFor(player.id);
			if (node.choices.length === 0) break;

			// A crossroads the world has already seen needs no ceremony on arrival.
			const familiar = this.game.isFamiliar(node.id) && step > 0;

			const reveal = this.game.sightAt(player.id);
			this.game.setThinking(player.id, true);
			this.broadcast({
				type: 'AGENT_THINKING',
				playerId: player.id,
				player: this.game.publicPlayer(player),
				nodeId: node.id,
				nodeTitle: node.title,
				nodeDescription: node.description,
				reveal,
				familiar
			});
			await this.beat(familiar ? PACE.RETRACE_ARRIVE : PACE.ARRIVE);

			const startedAt = Date.now();
			const context: DecisionContext = {
				agentName: player.name,
				nodeTitle: node.title,
				nodeDescription: node.description,
				choices: node.choices.map((c) => ({ id: c.id, label: c.label })),
				memory: player.memory.map((line) => line.text),
				pathSoFar: player.agent.decisions.map((d) => d.choiceLabel)
			};
			const decision = await this.brain.decide(context);
			// Last line of defence: the engine must never be handed a choice it
			// does not offer, whatever the model said.
			const chosen = node.choices.find((c) => c.id === decision.choice) ?? node.choices[0];

			// Stepping off the known road is worth watching even at a familiar
			// crossroads, so the brisk pace needs both conditions together.
			const retrace = familiar && this.game.isProvenSafe(chosen.id);
			const thinkFloor = (retrace ? PACE.RETRACE_THINK : PACE.THINK_MIN) * this.paceScale;
			await sleep(thinkFloor - (Date.now() - startedAt));
			if (this.stopped) return;

			this.game.setThinking(player.id, false);
			this.broadcast({
				type: 'AGENT_CHOICE',
				playerId: player.id,
				player: this.game.publicPlayer(player),
				choiceId: chosen.id,
				choiceLabel: chosen.label,
				reasoning: decision.reasoning,
				improvised: decision.improvised ?? false,
				retrace
			});
			await this.beat(retrace ? PACE.RETRACE_STEP : PACE.REVEAL + PACE.MOVE);
			if (this.stopped) return;

			// Captured before resolving, so a step past it is genuinely a first.
			const highWater = this.game.deepestSoFar();
			const result = this.game.resolveChoice(player.id, chosen.id, decision.reasoning);

			if (result.outcome === 'continue') {
				this.broadcast({
					type: 'AGENT_SURVIVED',
					playerId: player.id,
					player: this.game.publicPlayer(player),
					choiceId: chosen.id,
					depth: result.depth,
					record: result.depth > highWater,
					revealed: result.revealed
				});
				continue;
			}

			if (result.outcome === 'win') {
				this.broadcast({
					type: 'AGENT_REACHED_HOME',
					playerId: player.id,
					player: this.game.publicPlayer(player),
					choiceId: chosen.id,
					revealed: result.revealed,
					run: result.run!
				});
				await this.beat(PACE.HOME_HOLD);
				break;
			}

			this.broadcast({
				type: 'AGENT_DIED',
				playerId: player.id,
				player: this.game.publicPlayer(player),
				choiceId: chosen.id,
				epitaph: result.toNode.epitaph ?? result.toNode.description,
				revealed: result.revealed,
				run: result.run!
			});
			await this.beat(PACE.DEATH_HOLD);
			break;
		}

		this.broadcast({
			type: 'TURN_ENDED',
			playerId: player.id,
			player: this.game.publicPlayer(player)
		});
		await this.beat(PACE.TURN_OUTRO);
	}

	/* --------------------------------------------------------- the interval */

	private openTeaching(): void {
		const endsAt = this.game.openTeaching(TEACHING_SECONDS);
		this.broadcast({
			type: 'TEACHING_STARTED',
			round: this.game.round + 1,
			endsAt,
			game: this.game.snapshot()
		});

		// Rivals spend their characters, and one of them may go after the leader.
		for (const player of this.game.players) {
			const bot = this.bots.get(player.id);
			if (!bot) continue;
			this.later(() => this.botTurn(player, bot), bot.thinkTime());
		}

		// Hard deadline: the match never waits on someone who wandered off.
		this.later(() => this.beginRoundNow(), TEACHING_SECONDS * 1000);
	}

	private beginRoundNow(): void {
		if (this.stopped || this.game.phase !== 'teaching' || this.roundInFlight) return;
		for (const timer of this.timers) clearTimeout(timer);
		this.timers.clear();
		void this.runRound();
	}

	private botTurn(player: Player, bot: BotController): void {
		if (this.game.phase !== 'teaching') return;

		const run = player.runs.at(-1);
		if (run) {
			const note = bot.teach(this.game, player, run);
			if (note && player.pendingGrants > 0) {
				try {
					this.game.addMemory(player.id, note);
					this.broadcast({
						type: 'MEMORY_UPDATED',
						playerId: player.id,
						player: this.game.publicPlayer(player),
						memory: player.memory
					});
				} catch (error) {
					if (!(error instanceof GameError)) throw error;
				}
			}
		}

		const plan = bot.pickSabotage(this.game, player);
		if (plan) {
			try {
				const result = this.game.useSabotage(player.id, plan.targetId, plan.lineIndex, plan.text);
				this.broadcast({
					type: 'SABOTAGE_USED',
					actorId: player.id,
					actorName: player.name,
					targetId: result.target.id,
					targetName: result.target.name,
					lineIndex: result.lineIndex,
					before: result.before,
					after: result.after,
					player: this.game.publicPlayer(result.target),
					actor: this.game.publicPlayer(player)
				});
			} catch (error) {
				if (!(error instanceof GameError)) throw error;
			}
		}

		this.game.setReady(player.id, true);
		this.emitPlayer(player);
		this.notifyReady();
	}
}
