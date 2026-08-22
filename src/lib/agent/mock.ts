import type { AgentBrain, AgentDecision, BrainChoice, DecisionContext } from './brain.ts';
import { createRng, hashSeed, type Rng } from '../engine/rng.ts';
import { joinAvoided, vocabulary, type Vocabulary } from './vocabulary.ts';
import { DEFAULT_LOCALE } from '../i18n/index.ts';

/**
 * The offline brain. Deterministic, dependency-free, and good enough that the
 * game is genuinely playable without an API key.
 *
 * It reads the player's memory the way a very literal reader would: it looks
 * for the names of the paths in front of it, works out whether the note is
 * warning it off or pointing it at something, and follows directives like
 * "after forest choose mountain" only when it is actually standing after the
 * forest. Where the notes say nothing, it guesses — which is exactly the
 * experience the 20-character mechanic is built around.
 *
 * All of that is language-specific, so the words it reads with come from
 * `vocabulary(locale)` rather than being baked in here.
 */

const SCORE = {
	directive: 6,
	positive: 3,
	negative: -5,
	mentioned: 0.25
};

/** Keywords that count as naming a choice: the full label plus its real words. */
function keywordsFor(choice: BrainChoice, vocab: Vocabulary): string[] {
	const label = choice.label.toLowerCase();
	const words = label.split(/\s+/).filter((w) => w.length >= 3 && !vocab.stopwords.has(w));
	return [...new Set([label, choice.id.toLowerCase(), ...words])];
}

function mentions(text: string, keywords: string[], vocab: Vocabulary): boolean {
	const edge = `[^${vocab.letters}]`;
	return keywords.some((kw) => new RegExp(`(^|${edge})${escapeRegex(kw)}(${edge}|$)`).test(text));
}

function escapeRegex(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasAny(words: string[], list: string[]): boolean {
	return words.some((w) => list.includes(w));
}

type Verdict = {
	scores: Map<string, number>;
	/** Human-readable reason for the strongest signal found, per choice. */
	notes: Map<string, string>;
};

function readMemory(ctx: DecisionContext, vocab: Vocabulary): Verdict {
	const scores = new Map<string, number>(ctx.choices.map((c) => [c.id, 0]));
	const notes = new Map<string, string>();
	const keywords = new Map(ctx.choices.map((c) => [c.id, keywordsFor(c, vocab)]));
	const wordSplit = new RegExp(`[^${vocab.letters}']+`);

	// What the agent can see behind it: the step it just took, and this place.
	const here = [ctx.pathSoFar.at(-1) ?? '', ctx.nodeTitle]
		.join(' ')
		.toLowerCase()
		.split(/\s+/)
		.filter((w) => w.length >= 3 && !vocab.stopwords.has(w));

	for (const raw of ctx.memory) {
		const line = raw.toLowerCase();

		for (const clause of line.split(vocab.clause)) {
			const text = clause.trim();
			if (!text) continue;

			const words = text.split(wordSplit).filter(Boolean);

			// "after forest choose mountain" — only applies where it applies.
			const after = vocab.after.exec(text);
			let directive = false;
			if (after) {
				const anchor = after[1];
				const relevant = here.some((w) => w === anchor || w.startsWith(anchor));
				if (!relevant) continue; // The note is about somewhere else. Ignore it here.
				directive = true;
			}

			const negative = hasAny(words, vocab.negative);
			const positive = hasAny(words, vocab.positive);

			for (const choice of ctx.choices) {
				const kw = keywords.get(choice.id)!;
				if (!mentions(text, kw, vocab)) continue;
				// Don't let "after forest ..." score the forest itself.
				if (after && mentions(after[1], kw, vocab)) continue;

				if (negative && !positive) {
					scores.set(choice.id, scores.get(choice.id)! + SCORE.negative);
					notes.set(choice.id, vocab.phrases.warned(choice.label.toLowerCase()));
				} else if (directive) {
					scores.set(choice.id, scores.get(choice.id)! + SCORE.directive);
					notes.set(choice.id, vocab.phrases.directed(choice.label.toLowerCase()));
				} else if (positive) {
					scores.set(choice.id, scores.get(choice.id)! + SCORE.positive);
					notes.set(choice.id, vocab.phrases.calledSafe(choice.label.toLowerCase()));
				} else {
					scores.set(choice.id, scores.get(choice.id)! + SCORE.mentioned);
				}
			}
		}
	}

	return { scores, notes };
}

function phrase(
	ctx: DecisionContext,
	picked: BrainChoice,
	verdict: Verdict,
	blind: boolean,
	rng: Rng,
	vocab: Vocabulary
): string {
	const label = picked.label;
	// Four agents with the same empty memory would otherwise say the same
	// sentence four times, which reads as one voice instead of four.
	if (blind) return rng.pick(vocab.phrases.blind)(label);

	const reason = verdict.notes.get(picked.id);
	if (reason && verdict.scores.get(picked.id)! > 0) {
		return `${capitalise(reason)}. ${vocab.phrases.takes(label)}`;
	}

	// Chosen by elimination: name what we are avoiding, which reads better.
	const avoided = ctx.choices
		.filter((c) => c.id !== picked.id && (verdict.scores.get(c.id) ?? 0) < 0)
		.map((c) => c.label.toLowerCase());

	if (avoided.length === 1) return rng.pick(vocab.phrases.eliminated)(label, avoided[0]);
	if (avoided.length > 1) {
		return vocab.phrases.ruleOut(label, joinAvoided(ctx.locale, avoided));
	}
	return vocab.phrases.unsure(label);
}

function capitalise(value: string): string {
	return value.charAt(0).toUpperCase() + value.slice(1);
}

export class MockBrain implements AgentBrain {
	readonly name = 'mock';
	private readonly seed: number;

	constructor(seed = 1) {
		this.seed = seed;
	}

	async decide(ctx: DecisionContext): Promise<AgentDecision> {
		const vocab = vocabulary(ctx.locale ?? DEFAULT_LOCALE);
		const verdict = readMemory(ctx, vocab);
		const best = Math.max(...ctx.choices.map((c) => verdict.scores.get(c.id) ?? 0));
		const leaders = ctx.choices.filter((c) => (verdict.scores.get(c.id) ?? 0) === best);

		// Seeded by the situation, so the same agent facing the same node with the
		// same memory always does the same thing. Guesses are still guesses, but
		// they are reproducible ones — which makes "why did you do that?" answerable.
		const rng = createRng(
			this.seed ^ hashSeed(`${ctx.agentName}|${ctx.nodeTitle}|${ctx.memory.join('|')}`)
		);
		const picked = leaders.length === 1 ? leaders[0] : rng.pick(leaders);
		const blind = best <= 0 && !ctx.choices.some((c) => (verdict.scores.get(c.id) ?? 0) < 0);

		return {
			choice: picked.id,
			reasoning: phrase(ctx, picked, verdict, blind, rng, vocab)
		};
	}
}
