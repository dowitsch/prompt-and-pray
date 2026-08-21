import type { AgentBrain, DecisionContext } from '../agent/index.ts';
import type { Game } from '../engine/game.ts';
import { GameError } from '../engine/game.ts';
import type { Player, RunRecord } from '../engine/types.ts';
import type { ServerEvent } from '../protocol.ts';
import { BotController } from './bots.ts';

/**
 * Drives runs.
 *
 * Every agent runs its own loop, concurrently and independently — nobody waits
 * for a turn. The delays below are deliberate: a decision that resolves
 * instantly is unreadable, and the point of this game is watching an agent
 * think and then watching it be wrong. Provider latency is absorbed into the
 * thinking beat rather than added on top, so mock and real brains feel the same.
 */

export const PACE = {
	/** Minimum time an agent visibly "thinks", even if the brain answered instantly. */
	THINK_MIN: 900,
	/** Travel time along the edge to the next node. */
	MOVE: 850,
	/** Beat between surviving a step and sizing up the next one. */
	STEP_GAP: 250,
	/** How long a death is held on screen before the run is closed out. */
	DEATH_HOLD: 1600,
	/** Pause before the winner's screen takes over. */
	WIN_HOLD: 1200
} as const;

export type Broadcast = (event: ServerEvent) => void;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));

export class MatchRunner {
	private readonly bots = new Map<string, BotController>();
	private readonly timers = new Set<ReturnType<typeof setTimeout>>();
	private stopped = false;

	constructor(
		private readonly game: Game,
		private readonly brain: AgentBrain,
		private readonly broadcast: Broadcast
	) {}

	registerBot(controller: BotController): void {
		this.bots.set(controller.playerId, controller);
	}

	/** Every agent sets out at once when the match begins. */
	startMatch(): void {
		for (const player of this.game.players) {
			this.deploy(player.id);
		}
	}

	deploy(playerId: string): void {
		if (this.stopped || !this.game.canDeploy(playerId)) return;
		void this.runAgent(playerId);
	}

	stop(): void {
		this.stopped = true;
		for (const timer of this.timers) clearTimeout(timer);
		this.timers.clear();
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

	private async runAgent(playerId: string): Promise<void> {
		const player = this.game.getPlayer(playerId);

		let run: number;
		try {
			run = this.game.beginRun(playerId);
		} catch {
			return;
		}

		this.broadcast({
			type: 'RUN_STARTED',
			playerId,
			run,
			player: this.game.publicPlayer(player)
		});

		const pathSoFar: string[] = [];

		try {
			while (!this.stopped) {
				// Someone else already made it home — freeze where we stand.
				if (this.game.winnerId) {
					player.agent.thinking = false;
					this.emitPlayer(player);
					return;
				}

				const node = this.game.nodeFor(playerId);
				if (node.choices.length === 0) return;

				const reveal = this.game.sightAt(playerId);
				this.game.setThinking(playerId, true);
				this.broadcast({
					type: 'AGENT_THINKING',
					playerId,
					player: this.game.publicPlayer(player),
					nodeId: node.id,
					nodeTitle: node.title,
					nodeDescription: node.description,
					reveal
				});

				const context: DecisionContext = {
					agentName: player.name,
					nodeTitle: node.title,
					nodeDescription: node.description,
					choices: node.choices.map((c) => ({ id: c.id, label: c.label })),
					memory: player.memory.map((line) => line.text),
					pathSoFar: [...pathSoFar]
				};

				const startedAt = Date.now();
				const decision = await this.brain.decide(context);
				await sleep(PACE.THINK_MIN - (Date.now() - startedAt));
				if (this.stopped) return;

				// Last line of defence: the engine must never be handed a choice it
				// does not offer, whatever the model said.
				const chosen = node.choices.find((c) => c.id === decision.choice) ?? node.choices[0];

				this.game.setThinking(playerId, false);
				this.broadcast({
					type: 'AGENT_CHOICE',
					playerId,
					player: this.game.publicPlayer(player),
					choiceId: chosen.id,
					choiceLabel: chosen.label,
					reasoning: decision.reasoning,
					improvised: decision.improvised ?? false
				});

				await sleep(PACE.MOVE);
				if (this.stopped) return;

				const result = this.game.resolveChoice(playerId, chosen.id, decision.reasoning);
				pathSoFar.push(chosen.label);

				if (result.outcome === 'continue') {
					this.broadcast({
						type: 'AGENT_SURVIVED',
						playerId,
						player: this.game.publicPlayer(player),
						choiceId: chosen.id,
						depth: result.depth,
						revealed: result.revealed
					});
					await sleep(PACE.STEP_GAP);
					continue;
				}

				if (result.outcome === 'win') {
					this.broadcast({
						type: 'AGENT_REACHED_HOME',
						playerId,
						player: this.game.publicPlayer(player),
						choiceId: chosen.id,
						revealed: result.revealed,
						run: result.run!
					});
					await sleep(PACE.WIN_HOLD);
					this.broadcast({
						type: 'GAME_FINISHED',
						winnerId: playerId,
						game: this.game.snapshot()
					});
					this.stop();
					return;
				}

				this.broadcast({
					type: 'AGENT_DIED',
					playerId,
					player: this.game.publicPlayer(player),
					choiceId: chosen.id,
					epitaph: result.toNode.epitaph ?? result.toNode.description,
					revealed: result.revealed,
					run: result.run!
				});
				await sleep(PACE.DEATH_HOLD);
				this.afterRun(player, result.run!);
				return;
			}
		} catch (error) {
			// A wedged agent would wedge the match. Log it, end the run cleanly.
			console.error('[homeward] run failed', error);
			player.agent.thinking = false;
			player.agent.status = 'dead';
			this.emitPlayer(player);
		}
	}

	/** Bots teach themselves, maybe sabotage someone, and set out again. */
	private afterRun(player: Player, run: RunRecord): void {
		this.emitPlayer(player);
		const bot = this.bots.get(player.id);
		if (!bot || this.game.winnerId) return;

		this.later(() => {
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

			this.deploy(player.id);
		}, bot.redeployDelay());
	}
}
