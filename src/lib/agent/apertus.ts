import type { AgentBrain, AgentDecision, DecisionContext } from './brain.ts';
import { systemPrompt, buildUserPrompt, parseDecision } from './prompt.ts';
import { DEFAULT_LOCALE } from '../i18n/index.ts';

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
	maxTokens: number;
	temperature: number;
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

	async decide(ctx: DecisionContext): Promise<AgentDecision> {
		const locale = ctx.locale ?? DEFAULT_LOCALE;
		const body: Record<string, unknown> = {
			model: this.config.model,
			max_tokens: this.config.maxTokens,
			temperature: this.config.temperature,
			messages: [
				{ role: 'system', content: systemPrompt(locale) },
				{ role: 'user', content: buildUserPrompt(ctx) }
			]
		};
		if (this.config.jsonMode) {
			body.response_format = { type: 'json_object' };
		}

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
