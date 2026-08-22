import type { AgentBrain, AgentDecision, DecisionContext } from './brain.ts';
import { systemPrompt, buildUserPrompt, parseDecision } from './prompt.ts';
import { personaFor } from './personas.ts';
import { DEFAULT_LOCALE } from '../i18n/index.ts';
import { hashSeed } from '../engine/rng.ts';

/**
 * OpenAI-compatible chat-completions adapter.
 *
 * Written against the Apertus endpoints documented in `doc/apertus-v1p5-007.md`,
 * but there is nothing Apertus-specific in here: any provider that speaks
 * `POST /v1/chat/completions` works by changing `AI_BASE_URL` and `AI_MODEL`.
 * See `docs/ai-integration.md`.
 *
 * The key is read from the environment and used only here, on the server. It is
 * never sent to the browser and never written to an event.
 */

export type ApertusConfig = {
	baseUrl: string;
	apiKey: string;
	model: string;
	/** Send `response_format: {type: "json_object"}` (supported by vLLM servers). */
	jsonMode: boolean;
	/**
	 * Baselines, not settings.
	 *
	 * Each is what a call uses when the agent's persona does not name its own
	 * value — and with `personas: false` they are the whole of the sampling, for
	 * every agent, which is the A/B against the four characters.
	 */
	maxTokens: number;
	temperature: number;
	topP?: number;
	frequencyPenalty?: number;
	presencePenalty?: number;
	/** Let each character's doctrine and sampling apply. `AI_PERSONAS`. */
	personas: boolean;
	timeoutMs: number;
};

export class ApertusError extends Error {}

/** Accepts either a bare origin or a full completions URL. */
function completionsUrl(baseUrl: string): string {
	const trimmed = baseUrl.replace(/\/+$/, '');
	if (trimmed.endsWith('/chat/completions')) return trimmed;
	if (trimmed.endsWith('/v1')) return `${trimmed}/chat/completions`;
	return `${trimmed}/v1/chat/completions`;
}

type ChatCompletionResponse = {
	choices?: { message?: { content?: string | null } }[];
	error?: { message?: string };
};

export class ApertusBrain implements AgentBrain {
	readonly name = 'apertus';
	private readonly url: string;

	constructor(private readonly config: ApertusConfig) {
		this.url = completionsUrl(config.baseUrl);
	}

	/**
	 * The request body for one decision.
	 *
	 * Two agents standing at the same crossroads with the same notes send
	 * genuinely different requests: a different doctrine in the system prompt and
	 * a different point in the sampling space. Everything a persona leaves unsaid
	 * still comes from the environment, so `AI_TEMPERATURE` and friends stay live
	 * as baselines rather than becoming decoration.
	 */
	private buildBody(ctx: DecisionContext): Record<string, unknown> {
		const locale = ctx.locale ?? DEFAULT_LOCALE;
		const config = this.config;
		const persona = config.personas ? personaFor(ctx.character) : null;
		const sampling = persona?.sampling;

		const body: Record<string, unknown> = {
			model: config.model,
			max_tokens: sampling?.maxTokens ?? config.maxTokens,
			temperature: sampling?.temperature ?? config.temperature,
			messages: [
				{
					role: 'system',
					content: systemPrompt(locale, persona ? ctx.character : null)
				},
				{ role: 'user', content: buildUserPrompt(ctx, persona !== null) }
			]
		};

		const topP = sampling?.topP ?? config.topP;
		const frequencyPenalty = sampling?.frequencyPenalty ?? config.frequencyPenalty;
		const presencePenalty = sampling?.presencePenalty ?? config.presencePenalty;
		if (topP !== undefined) body.top_p = topP;
		if (frequencyPenalty) body.frequency_penalty = frequencyPenalty;
		if (presencePenalty) body.presence_penalty = presencePenalty;

		// Aurelia's "mathematical perfection", made literal: the same figure at the
		// same place with the same notes sends the same seed and gets the same
		// answer back. Derived exactly the way the offline brain derives its own
		// tie-break seed. A provider that ignores `seed` simply leaves her at her
		// very low temperature, which is the same character with softer edges.
		if (sampling?.deterministic) {
			body.seed = hashSeed(`${ctx.agentName}|${ctx.nodeTitle}|${ctx.memory.join('|')}`);
		}

		if (config.jsonMode) {
			body.response_format = { type: 'json_object' };
		}
		return body;
	}

	async decide(ctx: DecisionContext): Promise<AgentDecision> {
		const locale = ctx.locale ?? DEFAULT_LOCALE;
		const body = this.buildBody(ctx);

		const response = await fetch(this.url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${this.config.apiKey}`
			},
			body: JSON.stringify(body),
			signal: AbortSignal.timeout(this.config.timeoutMs)
		});

		if (!response.ok) {
			const detail = await response.text().catch(() => '');
			throw new ApertusError(`${response.status} ${response.statusText} ${detail.slice(0, 200)}`);
		}

		const payload = (await response.json()) as ChatCompletionResponse;
		if (payload.error?.message) throw new ApertusError(payload.error.message);

		const content = payload.choices?.[0]?.message?.content;
		if (!content) throw new ApertusError('Model returned an empty message.');

		// The engine will not accept anything we cannot map to a real choice.
		const decision = parseDecision(content, ctx.choices, locale);
		if (!decision) {
			throw new ApertusError(`Unusable response: ${content.slice(0, 160)}`);
		}
		return decision;
	}
}
