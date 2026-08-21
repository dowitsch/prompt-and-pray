import type { AgentDecision, BrainChoice, DecisionContext } from './brain.ts';

/**
 * Prompt construction and response validation for LLM-backed brains.
 *
 * Validation matters more than it looks: a model is free to answer with prose,
 * a fenced code block, a label instead of an id, or a path that does not exist.
 * None of that may reach the engine. Anything we cannot resolve to one of the
 * offered choice ids is rejected here, and the caller falls back.
 */

export const SYSTEM_PROMPT = [
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
	'"choice" MUST be copied exactly from the list of path ids you are given.'
].join('\n');

export function buildUserPrompt(ctx: DecisionContext): string {
	const paths = ctx.choices.map((c) => `- ${c.id}  (${c.label})`).join('\n');

	const memory = ctx.memory.length
		? ctx.memory.map((line) => `- ${line}`).join('\n')
		: '(empty — nothing has ever been written down for you)';

	const journey = ctx.pathSoFar.length
		? ctx.pathSoFar.join(' -> ')
		: '(you have only just set out)';

	return [
		`LOCATION: ${ctx.nodeTitle}`,
		ctx.nodeDescription,
		'',
		'PATHS:',
		paths,
		'',
		'YOUR MEMORY:',
		memory,
		'',
		`THIS ATTEMPT SO FAR: ${journey}`,
		'',
		'Choose one path id.'
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

function normalise(value: string): string {
	return value.toLowerCase().replace(/[^a-z0-9]/g, '');
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
export function parseDecision(raw: string, choices: BrainChoice[]): AgentDecision | null {
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
						reasoning: clampReasoning(parsed.reasoning ?? parsed.reason, 'I follow my notes.')
					};
				}
			}
		} catch {
			// Fall through to the prose rescue below.
		}
	}

	// No usable JSON: accept plain prose only if it names exactly one path.
	const choice = resolveChoiceId(raw, choices);
	if (choice) {
		return { choice, reasoning: clampReasoning(raw, 'I follow my notes.') };
	}
	return null;
}
