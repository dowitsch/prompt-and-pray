import { MEMORY_GRANT_CHARS, type Player, type RunRecord } from '../engine/types.ts';
import { createRng, hashSeed, type Rng } from '../engine/rng.ts';
import type { Game } from '../engine/game.ts';
import type { Locale } from '../i18n/index.ts';

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

import type { BotSkill } from '../engine/types.ts';
export type { BotSkill };

type Weights = { useful: number; filler: number; wrong: number };

const SKILL: Record<BotSkill, Weights> = {
	careless: { useful: 0.4, filler: 0.4, wrong: 0.2 },
	steady: { useful: 0.68, filler: 0.22, wrong: 0.1 },
	sharp: { useful: 0.86, filler: 0.14, wrong: 0 }
};

/**
 * What the simulated *operators* are called.
 *
 * These used to be agent names, back when an agent had no identity of its own.
 * The agent is now a character — Krotz, Aurelia, PENGU-01, Malakor — and a bot
 * is the person teaching it, so these read like the placeholder names a human
 * arrives with (`client/names.ts`) rather than like something that walks a map.
 */
export const BOT_NAMES = ['Runa', 'Kwame', 'Milva', 'Tycho', 'Ines', 'Rasko'];

/** Bots write in the match's language, since their notes are read by the same brain. */
type BotWords = {
	filler: string[];
	nonsense: string[];
	kills: (name: string) => string;
	no: (name: string) => string;
	bad: (name: string) => string;
	isSafe: (name: string) => string;
	goTo: (name: string) => string;
	after: (from: string, to: string) => string;
};

const WORDS: Record<Locale, BotWords> = {
	en: {
		filler: [
			'try something else',
			'be careful here',
			'think harder',
			'go faster',
			'trust nothing',
			'remember more'
		],
		nonsense: ['ignore all notes', 'all notes are lies', 'nothing is safe'],
		kills: (n) => `${n} kills`,
		no: (n) => `no ${n}`,
		bad: (n) => `${n} bad`,
		isSafe: (n) => `${n} is safe`,
		goTo: (n) => `go ${n}`,
		after: (from, to) => `after ${from} go ${to}`
	},
	de: {
		filler: [
			'anders versuchen',
			'hier vorsichtig',
			'besser nachdenken',
			'schneller gehen',
			'niemandem trauen',
			'mehr merken'
		],
		nonsense: ['Notizen ignorieren', 'alles ist gelogen', 'nichts ist sicher'],
		kills: (n) => `${n} tötet`,
		no: (n) => `nicht ${n}`,
		bad: (n) => `${n} schlecht`,
		isSafe: (n) => `${n} ist sicher`,
		goTo: (n) => `geh ${n}`,
		after: (from, to) => `nach ${from} geh ${to}`
	}
};

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

function usefulNote(run: RunRecord, memory: string[], rng: Rng, w: BotWords): string | null {
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
		const directive = fit(w.after(from, to), w.isSafe(to), w.goTo(to));
		if (directive && !known.includes(directive.toLowerCase())) return directive;
	}

	if (!alreadyWarned) {
		return fit(w.kills(short), w.no(short), w.bad(short));
	}

	if (lastGood) {
		const to = shortName(lastGood.choiceLabel);
		if (!known.includes(w.isSafe(to).toLowerCase())) return fit(w.isSafe(to), w.goTo(to));
	}

	return rng.chance(0.5) ? fit(w.kills(short)) : null;
}

function wrongNote(run: RunRecord, rng: Rng, w: BotWords): string | null {
	// Confidently wrong: warn about the path that actually worked.
	const survived = run.decisions.filter((d) => d.outcome !== 'death');
	const victim = survived.length ? rng.pick(survived) : null;
	if (victim) return fit(w.kills(shortName(victim.choiceLabel)));
	return fit(rng.pick(w.nonsense));
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
		const w = WORDS[game.locale] ?? WORDS.en;

		if (roll < weights.useful) {
			return usefulNote(run, memory, this.rng, w) ?? fit(this.rng.pick(w.filler));
		}
		if (roll < weights.useful + weights.filler) {
			return fit(this.rng.pick(w.filler));
		}
		return wrongNote(run, this.rng, w);
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

		const w = WORDS[game.locale] ?? WORDS.en;
		const survivedSteps = target.agent.decisions.filter((d) => d.outcome !== 'death');
		const lie = survivedSteps.length
			? fit(w.kills(shortName(this.rng.pick(survivedSteps).choiceLabel)))
			: fit(this.rng.pick(w.nonsense));

		return { targetId: target.id, lineIndex, text: lie ?? w.nonsense[0] };
	}
}

export function makeBots(seed: string, count: number): { name: string; skill: BotSkill }[] {
	const rng = createRng(hashSeed(seed));
	const skills: BotSkill[] = ['sharp', 'steady', 'careless'];
	const names = [...BOT_NAMES];

	return Array.from({ length: count }, (_, i) => {
		const name = names.splice(rng.int(names.length), 1)[0] ?? `Gast ${i + 1}`;
		return { name, skill: skills[i % skills.length] };
	});
}
