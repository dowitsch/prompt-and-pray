import type { AgentDecision, BrainChoice, DecisionContext } from './brain.ts';
import { DEFAULT_LOCALE, type Locale } from '../i18n/index.ts';

/**
 * Prompt construction and response validation for LLM-backed brains.
 *
 * The prompt is written in the match's language so the agent reasons — and
 * speaks — in it. What never changes is the contract: `choice` must be one of
 * the **path ids**, which are the same strings in every language, so the
 * parsing and validation below are locale-independent.
 *
 * Validation matters more than it looks: a model is free to answer with prose,
 * a fenced code block, a label instead of an id, or a path that does not exist.
 * None of that may reach the engine.
 */

type PromptStrings = {
	system: string;
	location: string;
	paths: string;
	memory: string;
	memoryEmpty: string;
	attempt: string;
	attemptNone: string;
	instruction: string;
	fallbackReason: string;
};

const PROMPTS: Record<Locale, PromptStrings> = {
	en: {
		system: [
			'You are an AI agent lost in a strange land, trying to find your way HOME.',
			'',
			'At every location you must pick exactly one path. One path continues. The others kill you.',
			'You have no memory of previous attempts. The MEMORY section is the only thing you know:',
			'short notes your operator wrote for you. Trust those notes over your own instincts.',
			'If the notes say nothing about this place, make your best guess and say so honestly.',
			'',
			'Reply with ONLY a JSON object, no other text, in exactly this shape:',
			'{"choice": "<path id>", "reasoning": "<one short first-person sentence, max 20 words>"}',
			'',
			'"choice" MUST be copied exactly from the list of path ids you are given.',
			'Write the reasoning in English.'
		].join('\n'),
		location: 'LOCATION',
		paths: 'PATHS',
		memory: 'YOUR MEMORY',
		memoryEmpty: '(empty — nothing has ever been written down for you)',
		attempt: 'THIS ATTEMPT SO FAR',
		attemptNone: '(you have only just set out)',
		instruction: 'Choose one path id.',
		fallbackReason: 'I follow my notes.'
	},
	de: {
		system: [
			'Du bist ein KI-Agent, verirrt in einem fremden Land, auf dem Weg NACH HAUSE.',
			'',
			'An jedem Ort musst du genau einen Weg wählen. Ein Weg führt weiter. Die anderen töten dich.',
			'Du hast keine Erinnerung an frühere Versuche. Der Abschnitt GEDÄCHTNIS ist alles, was du weißt:',
			'kurze Notizen, die dein Betreiber für dich geschrieben hat. Vertraue diesen Notizen mehr als deinem Gefühl.',
			'Wenn die Notizen nichts über diesen Ort sagen, rate nach bestem Wissen und sag das ehrlich.',
			'',
			'Antworte NUR mit einem JSON-Objekt, ohne weiteren Text, genau in dieser Form:',
			'{"choice": "<Weg-ID>", "reasoning": "<ein kurzer Satz in der Ich-Form, höchstens 20 Wörter>"}',
			'',
			'"choice" MUSS exakt aus der Liste der Weg-IDs übernommen werden.',
			'Schreibe die Begründung auf Deutsch.'
		].join('\n'),
		location: 'ORT',
		paths: 'WEGE',
		memory: 'DEIN GEDÄCHTNIS',
		memoryEmpty: '(leer — es wurde nie etwas für dich aufgeschrieben)',
		attempt: 'DIESER VERSUCH BISHER',
		attemptNone: '(du bist gerade erst aufgebrochen)',
		instruction: 'Wähle eine Weg-ID.',
		fallbackReason: 'Ich folge meinen Notizen.'
	}
};

export function promptStrings(locale: Locale): PromptStrings {
	return PROMPTS[locale] ?? PROMPTS[DEFAULT_LOCALE];
}

export function systemPrompt(locale: Locale): string {
	return promptStrings(locale).system;
}

export function buildUserPrompt(ctx: DecisionContext): string {
	const p = promptStrings(ctx.locale ?? DEFAULT_LOCALE);
	const paths = ctx.choices.map((c) => `- ${c.id}  (${c.label})`).join('\n');

	const memory = ctx.memory.length
		? ctx.memory.map((line) => `- ${line}`).join('\n')
		: p.memoryEmpty;

	const journey = ctx.pathSoFar.length ? ctx.pathSoFar.join(' -> ') : p.attemptNone;

	return [
		`${p.location}: ${ctx.nodeTitle}`,
		ctx.nodeDescription,
		'',
		`${p.paths}:`,
		paths,
		'',
		`${p.memory}:`,
		memory,
		'',
		`${p.attempt}: ${journey}`,
		'',
		p.instruction
	].join('\n');
}

/** Pull the first balanced JSON object out of arbitrary model output. */
export function extractJsonObject(raw: string): string | null {
	const start = raw.indexOf('{');
	if (start === -1) return null;

	let depth = 0;
	let inString = false;
	let escaped = false;

	for (let i = start; i < raw.length; i++) {
		const char = raw[i];

		if (inString) {
			if (escaped) escaped = false;
			else if (char === '\\') escaped = true;
			else if (char === '"') inString = false;
			continue;
		}

		if (char === '"') inString = true;
		else if (char === '{') depth++;
		else if (char === '}') {
			depth--;
			if (depth === 0) return raw.slice(start, i + 1);
		}
	}
	return null;
}

/** Lowercase and strip anything that is not a letter or digit, umlauts included. */
function normalise(value: string): string {
	return value.toLowerCase().replace(/[^\p{Letter}\p{Number}]/gu, '');
}

/** Resolve whatever the model said into a real choice id, or null. */
export function resolveChoiceId(candidate: string, choices: BrainChoice[]): string | null {
	const wanted = normalise(candidate);
	if (!wanted) return null;

	const byId = choices.find((c) => normalise(c.id) === wanted);
	if (byId) return byId.id;

	const byLabel = choices.find((c) => normalise(c.label) === wanted);
	if (byLabel) return byLabel.id;

	// Last resort: the model wrote a sentence containing exactly one path name.
	const mentioned = choices.filter(
		(c) => wanted.includes(normalise(c.id)) || wanted.includes(normalise(c.label))
	);
	return mentioned.length === 1 ? mentioned[0].id : null;
}

export function clampReasoning(value: unknown, fallback: string): string {
	if (typeof value !== 'string') return fallback;
	const text = value.replace(/\s+/g, ' ').trim();
	if (!text) return fallback;
	return text.length > 160 ? `${text.slice(0, 157)}…` : text;
}

/**
 * Parse a model response into a decision the engine will accept, or null if the
 * response cannot be trusted.
 */
export function parseDecision(
	raw: string,
	choices: BrainChoice[],
	locale: Locale = DEFAULT_LOCALE
): AgentDecision | null {
	const fallback = promptStrings(locale).fallbackReason;
	const json = extractJsonObject(raw);
	if (json) {
		try {
			const parsed = JSON.parse(json) as Record<string, unknown>;
			const candidate = parsed.choice ?? parsed.path ?? parsed.id;
			if (typeof candidate === 'string') {
				const choice = resolveChoiceId(candidate, choices);
				if (choice) {
					return {
						choice,
						reasoning: clampReasoning(parsed.reasoning ?? parsed.reason, fallback)
					};
				}
			}
		} catch {
			// Fall through to the prose rescue below.
		}
	}

	// No usable JSON: accept plain prose *only* if it names exactly one path.
	const choice = resolveChoiceId(raw, choices);
	if (choice) {
		return { choice, reasoning: clampReasoning(raw, fallback) };
	}
	return null;
}
