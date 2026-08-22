import { createHash } from 'node:crypto';
import { env } from '$env/dynamic/private';
import { characterAt, type CharacterId } from '../engine/characters.ts';
import type { Locale } from '../i18n/index.ts';

/**
 * Reading the tale aloud.
 *
 * Two invariants, the same two the agent brain is built on
 * (`src/lib/agent/index.ts`):
 *
 *   1. **The key never leaves the server.** Nothing here is prefixed
 *      `PUBLIC_`/`VITE_`, so SvelteKit cannot put it in the browser bundle, and
 *      the browser only ever talks to `/api/speak`.
 *   2. **A slow or broken provider can never stall a match.** Every call is
 *      bounded; a failure is a failure, and the phone falls back to the voices
 *      its own browser ships with. Which are worse, and free, and always there.
 *
 * Absent a key the whole feature still works on those browser voices, which is
 * why none of this throws on missing configuration: it reports, and the caller
 * says no.
 */

/** Low latency and cheap. `eleven_multilingual_v2` sounds better; it is slower. */
const DEFAULT_MODEL = 'eleven_flash_v2_5';
const DEFAULT_TIMEOUT_MS = 8000;

/**
 * The longest line we will pay to have read.
 *
 * Not a rail against our own narration: the longest thing anyone says is an
 * agent's reasoning, and `AI_MAX_TOKENS` already keeps that to a sentence or
 * two. It is a rail against this endpoint being handed something else entirely.
 */
export const SPEECH_MAX_CHARS = 600;

/** Who is speaking. The world's own lines are the narrator's. */
export type VoiceKey = CharacterId | 'narrator';

/**
 * The cast, so a key on its own is enough.
 *
 * All five are ElevenLabs' own premade voices, which every account has and which
 * therefore cannot go missing the way a library or cloned voice can. Chosen to
 * be told apart before they are admired: the point is that you can hear *which*
 * agent is talking without looking up from the map.
 *
 * A narrator who is telling a tale, a trickster made of swamp wood, an elf who
 * takes every word literally, a penguin who has already set off, and a mage old
 * enough to distrust everything. Any of them can be recast in `.env`.
 */
const DEFAULT_VOICES: Record<VoiceKey, string> = {
	narrator: 'JBFqnCBsd6RMkjVDRZzb', // George, warm captivating storyteller
	krotz: 'N2lVS1w4EtoT3dr4eOWO', // Callum, husky trickster
	aurelia: 'Xb7hH8MSUJpSbSDYk0k2', // Alice, clear and precise
	pengu: 'IKne3meq5aSn9XLyUdCD', // Charlie, young and hyped
	malakor: 'pqHfZKP75CvOlQylNhV4' // Bill, old and wise
};

export type SpeechSettings = {
	apiKey: string | null;
	model: string;
	timeoutMs: number;
	voices: Record<VoiceKey, string>;
};

const trimmed = (value: string | undefined): string | null => {
	const text = value?.trim();
	return text ? text : null;
};

/**
 * Read live rather than at module load, matching `designerEnabled()` — this is
 * `$env/dynamic/private`, so a key added to a running machine takes effect
 * without a rebuild.
 */
export function speechSettings(): SpeechSettings {
	const timeout = Number(env.ELEVENLABS_TIMEOUT_MS);
	return {
		apiKey: trimmed(env.ELEVENLABS_API_KEY),
		model: trimmed(env.ELEVENLABS_MODEL) ?? DEFAULT_MODEL,
		timeoutMs: timeout > 0 ? timeout : DEFAULT_TIMEOUT_MS,
		voices: {
			narrator: trimmed(env.ELEVENLABS_VOICE_NARRATOR) ?? DEFAULT_VOICES.narrator,
			krotz: trimmed(env.ELEVENLABS_VOICE_KROTZ) ?? DEFAULT_VOICES.krotz,
			aurelia: trimmed(env.ELEVENLABS_VOICE_AURELIA) ?? DEFAULT_VOICES.aurelia,
			pengu: trimmed(env.ELEVENLABS_VOICE_PENGU) ?? DEFAULT_VOICES.pengu,
			malakor: trimmed(env.ELEVENLABS_VOICE_MALAKOR) ?? DEFAULT_VOICES.malakor
		}
	};
}

/**
 * Which voice says this line.
 *
 * `character` is a seat's character index, or null for the world's own lines —
 * the fork the agent is standing at, and the one that says it did not come back.
 * Neither of those is the agent talking, so neither is in the agent's voice.
 *
 * Always answers: every figure has a cast default, so the only way to end up
 * without one is to blank it in `.env` on purpose, and even then it falls back to
 * the narrator rather than going silent. One voice for four agents is a poorer
 * tale than the full cast, but it is still a tale.
 */
export function voiceFor(settings: SpeechSettings, character: number | null): string {
	if (character === null) return settings.voices.narrator;
	return settings.voices[characterAt(character).id] || settings.voices.narrator;
}

/**
 * The lines already paid for.
 *
 * Worth having: "It does not come back", "I know this road" and every place name
 * in the land are said again every round, by four agents, for as long as the
 * match lasts. Insertion-ordered, so the oldest entry is the first one out — and
 * a hit is re-inserted, which makes it least-recently-used eviction for free.
 */
const CACHE_LIMIT = 240;
const cache = new Map<string, ArrayBuffer>();

function remember(key: string, audio: ArrayBuffer): void {
	cache.set(key, audio);
	while (cache.size > CACHE_LIMIT) {
		const oldest = cache.keys().next().value;
		if (oldest === undefined) break;
		cache.delete(oldest);
	}
}

function recall(key: string): ArrayBuffer | null {
	const hit = cache.get(key);
	if (!hit) return null;
	cache.delete(key);
	cache.set(key, hit);
	return hit;
}

/**
 * One line, as MP3.
 *
 * Buffered rather than piped straight through to the browser, because the point
 * of the cache is that the second telling is free, and a stream that is
 * forwarded cannot also be kept. The lines are one sentence long: the wait here
 * is the model's latency, not the transfer's.
 */
export async function synthesize(
	settings: SpeechSettings,
	text: string,
	voiceId: string,
	locale: Locale
): Promise<ArrayBuffer> {
	const key = createHash('sha256')
		.update([settings.model, voiceId, locale, text].join(' '))
		.digest('hex');

	const known = recall(key);
	if (known) return known;

	const response = await fetch(
		`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/stream?output_format=mp3_44100_128`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json', 'xi-api-key': settings.apiKey ?? '' },
			body: JSON.stringify({
				text,
				model_id: settings.model,
				// Told which language it is reading rather than left to guess it from a
				// sentence that may be six words long.
				language_code: locale,
				voice_settings: { stability: 0.4, similarity_boost: 0.75, speed: 1 }
			}),
			signal: AbortSignal.timeout(settings.timeoutMs)
		}
	);

	if (!response.ok) {
		throw new Error(`elevenlabs ${response.status}: ${(await response.text()).slice(0, 200)}`);
	}

	const audio = await response.arrayBuffer();
	remember(key, audio);
	return audio;
}
