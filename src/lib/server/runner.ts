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
 * Every round is a sequence of **synchronised beats**: all surviving agents
 * look at their level together, think together, and commit together. That is
 * what makes a round watchable — when three agents walk into the Bridge and
 * one finds the Valley, you see it happen in a single moment rather than
 * reading about it in a log four minutes apart.
 *
 * Between rounds the match pauses for everyone to spend their 20 characters.
 * The pause ends early once everybody readies up.
 */

export const PACE = {
	/** Minimum time a beat visibly "thinks", even if every brain answered instantly. */
	THINK_MIN: 1100,
	/** Gap between each agent's choice being revealed, so they read one by one. */
	REVEAL_STAGGER: 260,
	/** Travel time along the edge to the next node. */
	MOVE: 900,
	/** Beat between surviving a step and sizing up the next one. */
	STEP_GAP: 450,
	/** How long the board holds after the last agent falls. */
	ROUND_HOLD: 2200,
	/** Pause before the winner's screen takes over. */
	WIN_HOLD: 2400
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
		private readonly broadcast: Broadcast
	) {}

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
			this.broadcast({ type: 'ROUND_STARTED', round, game: this.game.snapshot() });
			await sleep(700);

			for (let step = 0; step < this.game.map.depth + 2; step++) {
				if (this.stopped) return;

				const living = this.game.livingPlayers();
				if (living.length === 0) break;

				this.broadcast({ type: 'STEP_STARTED', round, step, alive: living.length });

				// 1. Everyone looks at the same level at the same time.
				for (const player of living) {
					const node = this.game.nodeFor(player.id);
					if (node.choices.length === 0) continue;
					const reveal = this.game.sightAt(player.id);
					this.game.setThinking(player.id, true);
					this.broadcast({
						type: 'AGENT_THINKING',
						playerId: player.id,
						player: this.game.publicPlayer(player),
						nodeId: node.id,
						nodeTitle: node.title,
						nodeDescription: node.description,
						reveal
					});
				}

				// 2. All brains run concurrently; the beat waits for the slowest,
				//    so nobody gets an advantage from a faster response.
				const startedAt = Date.now();
				const decisions = await Promise.all(
					living.map(async (player) => {
						const node = this.game.nodeFor(player.id);
						const context: DecisionContext = {
							agentName: player.name,
							nodeTitle: node.title,
							nodeDescription: node.description,
							choices: node.choices.map((c) => ({ id: c.id, label: c.label })),
							memory: player.memory.map((line) => line.text),
							pathSoFar: player.agent.decisions.map((d) => d.choiceLabel)
						};
						const decision = await this.brain.decide(context);
						// Last line of defence: the engine must never be handed a
						// choice it does not offer, whatever the model said.
						const chosen = node.choices.find((c) => c.id === decision.choice) ?? node.choices[0];
						return { player, chosen, decision };
					})
				);
				await sleep(PACE.THINK_MIN - (Date.now() - startedAt));
				if (this.stopped) return;

				// 3. Choices land one after another, close enough to compare.
				for (const { player, chosen, decision } of decisions) {
					this.game.setThinking(player.id, false);
					this.broadcast({
						type: 'AGENT_CHOICE',
						playerId: player.id,
						player: this.game.publicPlayer(player),
						choiceId: chosen.id,
						choiceLabel: chosen.label,
						reasoning: decision.reasoning,
						improvised: decision.improvised ?? false
					});
					await sleep(PACE.REVEAL_STAGGER);
				}

				await sleep(PACE.MOVE);
				if (this.stopped) return;

				// 4. Everyone finds out together.
				for (const { player, chosen, decision } of decisions) {
					const result = this.game.resolveChoice(player.id, chosen.id, decision.reasoning);

					if (result.outcome === 'continue') {
						this.broadcast({
							type: 'AGENT_SURVIVED',
							playerId: player.id,
							player: this.game.publicPlayer(player),
							choiceId: chosen.id,
							depth: result.depth,
							revealed: result.revealed
						});
					} else if (result.outcome === 'win') {
						this.broadcast({
							type: 'AGENT_REACHED_HOME',
							playerId: player.id,
							player: this.game.publicPlayer(player),
							choiceId: chosen.id,
							revealed: result.revealed,
							run: result.run!
						});
					} else {
						this.broadcast({
							type: 'AGENT_DIED',
							playerId: player.id,
							player: this.game.publicPlayer(player),
							choiceId: chosen.id,
							epitaph: result.toNode.epitaph ?? result.toNode.description,
							revealed: result.revealed,
							run: result.run!
						});
					}
				}

				if (this.game.winnerIds.length) break;
				await sleep(PACE.STEP_GAP);
			}

			await sleep(this.game.winnerIds.length ? PACE.WIN_HOLD : PACE.ROUND_HOLD);
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

	/* --------------------------------------------------------- the interval */

	private openTeaching(): void {
		const endsAt = this.game.openTeaching(TEACHING_SECONDS);
		this.broadcast({
			type: 'TEACHING_STARTED',
			round: this.game.round + 1,
			endsAt,
			game: this.game.snapshot()
		});

		// Bots spend their characters, and one of them may go after the leader.
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
