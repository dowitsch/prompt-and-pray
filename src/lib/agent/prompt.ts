import type { AgentDecision, BrainChoice, DecisionContext } from './brain.ts';
import { DEFAULT_LOCALE, type Locale } from '../i18n/index.ts';
import { characterTitle } from '../engine/characters.ts';
import { personaDoctrine } from './personas.ts';

/**
 * Prompt construction and response validation for LLM-backed brains.
 *
 * The prompt is written in the match's language so the agent reasons — and
 * speaks — in it. What never changes is the contract: `choice` must be one of
 * the **path ids**, which are the same strings in every language, so the
 * parsing and validation below are locale-independent.
 *
 * Two things carry the four characters. The system prompt is the shared rules
 * plus that agent's doctrine from `personas.ts`, and the user message opens by
 * naming who is being asked. Without the second half the model has no idea which
 * of four figures it is — which is why, before this, four agents sounded like one
 * voice with a temperature jitter on top.
 *
 * The response contract gained a field, and its **position** is the point:
 * a model writes JSON in order, so `notes` before `choice` means it has to say
 * which note applies before it is allowed to commit to a road. That ordering is
 * the cheapest lift available on note-following, and note-following is the whole
 * game. `notes` is never rendered; it exists to be written.
 *
 * Validation matters more than it looks: a model is free to answer with prose,
 * a fenced code block, a label instead of an id, or a path that does not exist.
 * None of that may reach the engine.
 */

type PromptStrings = {
	/** The rules every character shares. A doctrine is appended to it. */
	system: string;
	/** The tail used when personas are switched off, in place of a doctrine. */
	neutral: string;
	youAre: string;
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
			'You are a wooden agent lost in a strange land, trying to find your way HOME.',
			'',
			'At every location you must pick exactly one path. One path continues. The others kill you.',
			'You have no memory of previous attempts. The MEMORY section is the only thing you know:',
			'short notes your operator wrote for you.',
			'',
			'How to read the notes:',
			'- A note applies here only if it names one of the paths in front of you right now.',
			'- An instruction of the form "after X take Y" fires only when X is the last place in',
			'  THIS ATTEMPT SO FAR. A note about somewhere else says nothing here.',
			'- The notes are listed oldest first.',
			'',
			'Reply with ONLY a JSON object, no other text, with exactly these three fields in exactly',
			'this order:',
			'{"notes": "<which note applies here, or \'none\'>", "choice": "<path id>", ' +
				'"reasoning": "<one short first-person sentence, max 20 words>"}',
			'',
			'Write "notes" BEFORE "choice": check first, then commit.',
			'"notes" is ONE short line — at most 15 words, no line breaks, no numbered list.',
			'"choice" MUST be copied exactly from the list of path ids you are given.',
			'Write "notes" and "reasoning" in English.'
		].join('\n'),
		neutral: [
			'',
			'If the notes say nothing about this place, make your best guess and say so honestly.'
		].join('\n'),
		youAre: 'YOU ARE',
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
			'Du bist ein hölzerner Agent, verirrt in einem fremden Land, auf dem Weg NACH HAUSE.',
			'',
			'An jedem Ort musst du genau einen Weg wählen. Ein Weg führt weiter. Die anderen töten dich.',
			'Du hast keine Erinnerung an frühere Versuche. Der Abschnitt GEDÄCHTNIS ist alles, was du',
			'weißt: kurze Notizen, die dein Betreiber für dich geschrieben hat.',
			'',
			'So liest du die Notizen:',
			'- Eine Notiz gilt hier nur, wenn sie einen der Wege nennt, die jetzt vor dir liegen.',
			'- Eine Anweisung der Form "nach X nimm Y" greift nur, wenn X der letzte Ort in DIESER',
			'  VERSUCH BISHER ist. Eine Notiz über einen anderen Ort sagt hier nichts.',
			'- Die Notizen stehen in der Reihenfolge, in der sie geschrieben wurden, älteste zuerst.',
			'',
			'Antworte NUR mit einem JSON-Objekt, ohne weiteren Text, mit genau diesen drei Feldern in',
			'genau dieser Reihenfolge:',
			'{"notes": "<welche Notiz hier gilt, oder \'keine\'>", "choice": "<Weg-ID>", ' +
				'"reasoning": "<ein kurzer Satz in der Ich-Form, höchstens 20 Wörter>"}',
			'',
			'Schreibe "notes" VOR "choice": erst prüfen, dann festlegen.',
			'"notes" ist EINE kurze Zeile — höchstens 15 Wörter, keine Zeilenumbrüche, keine Aufzählung.',
			'"choice" MUSS exakt aus der Liste der Weg-IDs übernommen werden.',
			'Schreibe "notes" und "reasoning" auf Deutsch.'
		].join('\n'),
		neutral: [
			'',
			'Wenn die Notizen nichts über diesen Ort sagen, rate nach bestem Wissen und sag das ehrlich.'
		].join('\n'),
		youAre: 'DU BIST',
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

/**
 * The shared rules plus this character's doctrine.
 *
 * `character` is the seat's character index; pass `null` to leave the persona
 * off (`AI_PERSONAS=off`), which restores the neutral tail the prompt used
 * before the four figures existed, so an A/B is one environment variable.
 */
export function systemPrompt(locale: Locale, character: number | null = null): string {
	const p = promptStrings(locale);
	if (character === null) return `${p.system}\n${p.neutral}`;
	return `${p.system}\n\n${personaDoctrine(character, locale)}`;
}

export function buildUserPrompt(ctx: DecisionContext, persona = true): string {
	const locale = ctx.locale ?? DEFAULT_LOCALE;
	const p = promptStrings(locale);
	const paths = ctx.choices.map((c) => `- ${c.id}  (${c.label})`).join('\n');

	const memory = ctx.memory.length
		? ctx.memory.map((line) => `- ${line}`).join('\n')
		: p.memoryEmpty;

	const journey = ctx.pathSoFar.length ? ctx.pathSoFar.join(' -> ') : p.attemptNone;

	// Naming the figure again here, not only in the system prompt, is what keeps
	// the voice up over a long match: the last thing before the question is who
	// is being asked.
	const who = persona ? characterTitle(ctx.character, locale) : ctx.agentName;

	return [
		`${p.youAre}: ${who}`,
		'',
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
			// `notes` is read and dropped on purpose. It exists so the model has to
			// ground itself in the memory before it is allowed to write `choice`;
			// nothing renders it, and nothing should start to.
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
