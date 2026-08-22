import { browser } from '$app/environment';
import { characterAt, type CharacterId } from '$lib/engine/characters';
import type { Locale } from '$lib/i18n';
import { duck } from './audio.svelte';

/**
 * Reading the tale out loud.
 *
 * Two ways of doing it, and the second one always works. `/api/speak` gets a
 * proper voice per figure out of ElevenLabs; with no key configured, a provider
 * that is down, or a phone that is offline, the browser's own voices read it
 * instead. Worse, free, and always there — the same bargain the offline brain
 * makes in `src/lib/agent/mock.ts`.
 *
 * The contract with the caller is narrow and load-bearing: **`say` never
 * rejects, and always finishes.** The server is holding the tale until it hears
 * that this line has been read, so a promise that hung here would hang the match
 * for everyone at the table. Every branch resolves, and every wait has a ceiling.
 */

/**
 * The longest any single line is allowed to take.
 *
 * A backstop against the browser, not against the sentence. A tab that is
 * backgrounded mid-line may simply never fire `ended`, and `speechSynthesis` is
 * notorious for losing an utterance in the same situation. Comfortably longer
 * than any line the tale actually contains, and comfortably shorter than the
 * server's own ceiling, so this is what normally ends a lost line.
 */
const CEILING_MS = 20_000;

const after = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Which line owns the speakers.
 *
 * A new line always wins — the tale has moved on, and two voices at once is
 * worse than a line cut short. Bumping this is how everything already in flight
 * learns it has been superseded.
 */
let generation = 0;
let playing: HTMLAudioElement | null = null;

/**
 * Whether `/api/speak` is worth asking.
 *
 * A 503 means there is no key or no voice configured, which will not change
 * while the page is open, so it is asked once and then believed. A 502 is a
 * provider having a bad minute and is not latched — the next line tries again.
 */
let provider: 'unknown' | 'yes' | 'no' = 'unknown';

/** Stop talking. A turn ending must not leave the last agent speaking over the next. */
export function silence(): void {
	generation += 1;
	if (playing) {
		playing.pause();
		playing = null;
	}
	if (browser && 'speechSynthesis' in window) window.speechSynthesis.cancel();
	duck(false);
}

/**
 * Read one line, and resolve when the sound has stopped.
 *
 * `character` is the seat's character index when it is the agent talking, and
 * null for the world's own lines — the fork it has arrived at, and the one that
 * says it did not come back.
 */
export async function say(text: string, character: number | null, locale: Locale): Promise<void> {
	if (!browser || !text.trim()) return;

	silence();
	const mine = generation;
	duck(true);

	try {
		const clip = provider === 'no' ? null : await fetchClip(text, character, locale);
		if (mine !== generation) {
			if (clip) URL.revokeObjectURL(clip);
			return;
		}
		if (clip) await playClip(clip, mine);
		else await speakLocally(text, character, locale);
	} catch {
		/* Nothing here is worth failing over: the answer has to be sent regardless. */
	} finally {
		if (mine === generation) duck(false);
	}
}

/* ------------------------------------------------------------- the good way */

async function fetchClip(
	text: string,
	character: number | null,
	locale: Locale
): Promise<string | null> {
	try {
		const response = await fetch('/api/speak', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ text, character, locale })
		});
		if (!response.ok) {
			if (response.status === 503) provider = 'no';
			return null;
		}
		provider = 'yes';
		return URL.createObjectURL(await response.blob());
	} catch {
		// Offline, or the route is not there. Either way there is a fallback.
		return null;
	}
}

async function playClip(url: string, mine: number): Promise<void> {
	const clip = new Audio(url);
	playing = clip;
	try {
		const finished = new Promise<void>((resolve) => {
			clip.addEventListener('ended', () => resolve(), { once: true });
			clip.addEventListener('error', () => resolve(), { once: true });
		});

		let started = true;
		await clip.play().catch(() => {
			// Refused, almost always the autoplay policy. In practice this cannot
			// happen for the tale — the only way voice gets switched on is a tap — but
			// a refusal that was waited out would be a silent twenty-second pause.
			started = false;
		});
		if (started && mine === generation) await Promise.race([finished, after(CEILING_MS)]);
	} finally {
		if (playing === clip) playing = null;
		clip.pause();
		URL.revokeObjectURL(url);
	}
}

/* ------------------------------------------------------------ the other way */

/**
 * How the four are told apart without a cast.
 *
 * A browser voice cannot be swapped for another figure's, so the difference has
 * to come from pitch and speed: a gnome low and grudging, an elf high and exact,
 * a penguin fast and up, a mage low and slow. Crude, and better than four
 * identical robots. The world's own lines are left at the default, which is what
 * makes the narrator sound like the narrator.
 */
const TIMBRE: Record<CharacterId, { pitch: number; rate: number }> = {
	krotz: { pitch: 0.7, rate: 0.95 },
	aurelia: { pitch: 1.3, rate: 1 },
	pengu: { pitch: 1.5, rate: 1.15 },
	malakor: { pitch: 0.6, rate: 0.9 }
};

/** The browser's own voices, when there is no better one to be had. */
async function speakLocally(text: string, character: number | null, locale: Locale): Promise<void> {
	if (!('speechSynthesis' in window)) return;

	const line = new SpeechSynthesisUtterance(text);
	line.lang = locale === 'de' ? 'de-DE' : 'en-GB';
	// May be empty on the very first call in some browsers; the language tag alone
	// is usually enough for them to pick sensibly.
	const voice = window.speechSynthesis.getVoices().find((v) => v.lang.startsWith(locale));
	if (voice) line.voice = voice;

	if (character !== null) {
		const { pitch, rate } = TIMBRE[characterAt(character).id];
		line.pitch = pitch;
		line.rate = rate;
	}

	const finished = new Promise<void>((resolve) => {
		line.onend = () => resolve();
		line.onerror = () => resolve();
	});
	window.speechSynthesis.speak(line);
	await Promise.race([finished, after(CEILING_MS)]);
}
