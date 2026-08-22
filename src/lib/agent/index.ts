import type { AgentBrain, AgentDecision, DecisionContext } from './brain.ts';
import { MockBrain } from './mock.ts';
import { ApertusBrain, type ApertusConfig } from './apertus.ts';

export type { AgentBrain, AgentDecision, DecisionContext } from './brain.ts';
export { MockBrain } from './mock.ts';
export { ApertusBrain } from './apertus.ts';

/**
 * Brain selection and resilience.
 *
 * Two rules hold no matter which provider is configured:
 *  1. The key never leaves the server.
 *  2. A slow or broken provider can never stall a match. Every call is bounded
 *     by a timeout and falls back to the offline brain, so a run always
 *     finishes and the game stays playable on a flaky network.
 */

export type Env = Record<string, string | undefined>;

export type BrainSettings = {
	provider: 'mock' | 'apertus';
	model: string;
	baseUrl: string;
	concurrency: number;
	/** Whether the four characters' doctrines and sampling apply. `AI_PERSONAS`. */
	personas: boolean;
	/** Set when the configuration asked for a provider we could not satisfy. */
	warning?: string;
};

function num(value: string | undefined, fallback: number): number {
	const parsed = Number(value);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function bool(value: string | undefined, fallback: boolean): boolean {
	if (value === undefined || value === '') return fallback;
	return /^(1|true|yes|on)$/i.test(value);
}

export function readSettings(env: Env): BrainSettings {
	const baseUrl = env.AI_BASE_URL?.trim() ?? '';
	const apiKey = env.AI_API_KEY?.trim() ?? '';
	const model = env.AI_MODEL?.trim() ?? '';
	const concurrency = num(env.AI_CONCURRENCY, 4);
	// Read here rather than in `apertusConfig` so the boot banner can say whether
	// the four characters are actually in play.
	const personas = bool(env.AI_PERSONAS, true);

	const requested = (env.AI_PROVIDER?.trim().toLowerCase() ||
		(baseUrl && apiKey ? 'apertus' : 'mock')) as string;

	if (requested === 'mock') {
		return { provider: 'mock', model: 'deterministic', baseUrl: '', concurrency, personas };
	}

	const missing = [!baseUrl && 'AI_BASE_URL', !apiKey && 'AI_API_KEY', !model && 'AI_MODEL'].filter(
		Boolean
	);

	if (requested !== 'apertus') {
		return {
			provider: 'mock',
			model: 'deterministic',
			baseUrl: '',
			concurrency,
			personas,
			warning: `Unknown AI_PROVIDER "${requested}" — using the offline brain.`
		};
	}

	if (missing.length) {
		return {
			provider: 'mock',
			model: 'deterministic',
			baseUrl: '',
			concurrency,
			personas,
			warning: `AI_PROVIDER=apertus but ${missing.join(', ')} missing — using the offline brain.`
		};
	}

	return { provider: 'apertus', model, baseUrl, concurrency, personas };
}

/** An optional numeric knob: absent means "let the persona or the provider decide". */
function optionalNum(value: string | undefined): number | undefined {
	if (value === undefined || value.trim() === '') return undefined;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : undefined;
}

function apertusConfig(env: Env, settings: BrainSettings): ApertusConfig {
	return {
		baseUrl: settings.baseUrl,
		apiKey: env.AI_API_KEY!.trim(),
		model: settings.model,
		jsonMode: bool(env.AI_JSON_MODE, true),
		// Baselines. A character's persona overrides what it cares about and
		// inherits the rest; `AI_PERSONAS=off` leaves these as the whole story.
		maxTokens: num(env.AI_MAX_TOKENS, 160),
		temperature: Number(env.AI_TEMPERATURE ?? 0.8),
		topP: optionalNum(env.AI_TOP_P),
		frequencyPenalty: optionalNum(env.AI_FREQUENCY_PENALTY),
		presencePenalty: optionalNum(env.AI_PRESENCE_PENALTY),
		personas: settings.personas,
		timeoutMs: num(env.AI_TIMEOUT_MS, 8000)
	};
}

/** Bounds how many provider calls are in flight at once across all agents. */
class Semaphore {
	private active = 0;
	private queue: (() => void)[] = [];

	constructor(private readonly limit: number) {}

	async run<T>(task: () => Promise<T>): Promise<T> {
		if (this.active >= this.limit) {
			await new Promise<void>((resolve) => this.queue.push(resolve));
		}
		this.active++;
		try {
			return await task();
		} finally {
			this.active--;
			this.queue.shift()?.();
		}
	}
}

/**
 * Wraps a provider brain so that any failure degrades to the offline brain
 * instead of breaking the match. The decision is flagged `improvised` so the
 * UI can be honest about where the reasoning came from.
 */
export class ResilientBrain implements AgentBrain {
	readonly name: string;
	private readonly fallback = new MockBrain(7);
	private readonly gate: Semaphore;
	private warned = 0;

	constructor(
		private readonly primary: AgentBrain,
		concurrency: number
	) {
		this.name = primary.name;
		this.gate = new Semaphore(concurrency);
	}

	async decide(ctx: DecisionContext): Promise<AgentDecision> {
		try {
			return await this.gate.run(() => this.primary.decide(ctx));
		} catch (error) {
			if (this.warned < 3) {
				this.warned++;
				const message = error instanceof Error ? error.message : String(error);
				console.warn(`[homeward] ${this.primary.name} call failed, improvising: ${message}`);
				if (this.warned === 3) {
					console.warn('[homeward] further provider failures will not be logged.');
				}
			}
			const decision = await this.fallback.decide(ctx);
			return { ...decision, improvised: true };
		}
	}
}

export function createBrain(env: Env): { brain: AgentBrain; settings: BrainSettings } {
	const settings = readSettings(env);
	if (settings.warning) console.warn(`[homeward] ${settings.warning}`);

	if (settings.provider === 'mock') {
		return { brain: new MockBrain(11), settings };
	}

	const brain = new ResilientBrain(
		new ApertusBrain(apertusConfig(env, settings)),
		settings.concurrency
	);
	return { brain, settings };
}

export function describeBrain(settings: BrainSettings): string {
	if (settings.provider === 'mock') {
		return 'agent brain: offline mock (deterministic) — set AI_PROVIDER=apertus to use a real model';
	}
	const personas = settings.personas ? 'four characters' : 'personas off';
	return `agent brain: ${settings.provider} (${settings.model}, ${personas})`;
}
