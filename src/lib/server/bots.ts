import { MEMORY_GRANT_CHARS, type Player, type RunRecord } from '../engine/types.ts';
import { createRng, hashSeed, type Rng } from '../engine/rng.ts';
import type { Game } from '../engine/game.ts';

/**
 * Simulated opponents.
 *
 * A bot uses exactly the same brain and the same 20-character limit as a human.
 * What differs is the *teacher*: after each death a scripted routine decides
 * what note to write, and how good that note is. Careless bots waste their
 * characters or write something actively wrong; sharp bots write directives.
 *
 * This is where match difficulty lives. It is deliberately a small, legible
 * knob rather than a difficulty system.
 */

export type BotSkill = 'careless' | 'steady' | 'sharp';

type Weights = { useful: number; filler: number; wrong: number };

const SKILL: Record<BotSkill, Weights> = {
	careless: { useful: 0.4, filler: 0.4, wrong: 0.2 },
	steady: { useful: 0.68, filler: 0.22, wrong: 0.1 },
	sharp: { useful: 0.86, filler: 0.14, wrong: 0 }
};

export const BOT_NAMES = ['ORACLE', 'PILGRIM', 'MAGPIE', 'VESSEL', 'KESTREL', 'TALLOW'];

const FILLER = [
	'try something else',
	'be careful here',
	'think harder',
	'go faster',
	'trust nothing',
	'remember more'
];

const NONSENSE = ['ignore all notes', 'all notes are lies', 'nothing is safe'];

/** Squeeze a note into the 20-character grant, preferring a shorter phrasing. */
function fit(...candidates: string[]): string | null {
	for (const candidate of candidates) {
		const text = candidate.trim();
		if (text && text.length <= MEMORY_GRANT_CHARS) return text;
	}
	const last = candidates.at(-1)?.trim() ?? '';
	return last ? last.slice(0, MEMORY_GRANT_CHARS) : null;
}

/** The shortest distinctive word of a label: "Black Water" -> "Water". */
function shortName(label: string): string {
	const words = label.split(/\s+/).filter((w) => w.toLowerCase() !== 'the');
	return words.at(-1) ?? label;
}

function usefulNote(run: RunRecord, memory: string[], rng: Rng): string | null {
	const fatal = run.decisions.at(-1);
	if (!fatal) return null;

	const known = memory.join(' ').toLowerCase();
	const killer = fatal.choiceLabel;
	const short = shortName(killer);

	// If the warning is already written down, the useful move is to record the
	// step that worked instead — that is how a bot climbs past its old ceiling.
	const alreadyWarned = known.includes(short.toLowerCase());
	const survived = run.decisions.filter((d) => d.outcome !== 'death');
	const lastGood = survived.at(-1);

	if (alreadyWarned && lastGood) {
		const from = shortName(lastGood.nodeTitle);
		const to = shortName(lastGood.choiceLabel);
		const directive = fit(`after ${from} go ${to}`, `${to} is safe`, `go ${to}`);
		if (directive && !known.includes(directive.toLowerCase())) return directive;
	}

	if (!alreadyWarned) {
		return fit(`${short} kills`, `no ${short}`, `${short} bad`);
	}

	if (lastGood) {
		const to = shortName(lastGood.choiceLabel);
		if (!known.includes(`${to.toLowerCase()} is safe`)) return fit(`${to} is safe`, `go ${to}`);
	}

	return rng.chance(0.5) ? fit(`${short} kills`) : null;
}

function wrongNote(game: Game, run: RunRecord, rng: Rng): string | null {
	// Confidently wrong: warn about the path that actually worked.
	const survived = run.decisions.filter((d) => d.outcome !== 'death');
	const victim = survived.length ? rng.pick(survived) : null;
	if (victim) return fit(`${shortName(victim.choiceLabel)} kills`);
	return fit(rng.pick(NONSENSE));
}

export class BotController {
	readonly skill: BotSkill;
	readonly sabotages: boolean;
	private readonly rng: Rng;
	private sabotageDueAfterRun: number;

	constructor(
		readonly playerId: string,
		skill: BotSkill,
		seed: string,
		options: { sabotages: boolean }
	) {
		this.skill = skill;
		this.sabotages = options.sabotages;
		this.rng = createRng(hashSeed(seed));
		this.sabotageDueAfterRun = 3 + this.rng.int(2);
	}

	/** What this bot writes into its own memory after a run. Null = writes nothing. */
	teach(game: Game, player: Player, run: RunRecord): string | null {
		const weights = SKILL[this.skill];
		const roll = this.rng.next();
		const memory = player.memory.map((line) => line.text);

		if (roll < weights.useful) {
			return usefulNote(run, memory, this.rng) ?? fit(this.rng.pick(FILLER));
		}
		if (roll < weights.useful + weights.filler) {
			return fit(this.rng.pick(FILLER));
		}
		return wrongNote(game, run, this.rng);
	}

	/**
	 * How long the bot takes to write its note during the teaching phase. Spread
	 * out so rivals' memories visibly update one by one rather than all at once.
	 */
	thinkTime(): number {
		return 1200 + this.rng.int(4200);
	}

	/**
	 * Bots go after whoever is winning — which is usually the human, and is
	 * exactly when it hurts most.
	 */
	pickSabotage(
		game: Game,
		me: Player
	): { targetId: string; lineIndex: number; text: string } | null {
		if (!this.sabotages || me.sabotageUsed) return null;
		if (me.runCount < this.sabotageDueAfterRun) return null;

		const candidates = game.players
			.filter((p) => p.id !== me.id && p.memory.length > 0)
			.sort((a, b) => {
				const depth = b.agent.bestDepth - a.agent.bestDepth;
				if (depth !== 0) return depth;
				// Tie-break toward humans: they are the interesting target.
				return Number(a.isBot) - Number(b.isBot);
			});

		const target = candidates[0];
		if (!target) return null;

		// Overwrite the note that looks most load-bearing: the longest one.
		let lineIndex = 0;
		for (let i = 1; i < target.memory.length; i++) {
			if (target.memory[i].text.length > target.memory[lineIndex].text.length) lineIndex = i;
		}

		const survivedSteps = target.agent.decisions.filter((d) => d.outcome !== 'death');
		const lie = survivedSteps.length
			? fit(`${shortName(this.rng.pick(survivedSteps).choiceLabel)} kills`)
			: fit(this.rng.pick(NONSENSE));

		return { targetId: target.id, lineIndex, text: lie ?? 'ignore this' };
	}
}

export function makeBots(seed: string, count: number): { name: string; skill: BotSkill }[] {
	const rng = createRng(hashSeed(seed));
	const skills: BotSkill[] = ['sharp', 'steady', 'careless'];
	const names = [...BOT_NAMES];

	return Array.from({ length: count }, (_, i) => {
		const name = names.splice(rng.int(names.length), 1)[0] ?? `BOT-${i}`;
		return { name, skill: skills[i % skills.length] };
	});
}
