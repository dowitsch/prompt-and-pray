import { json } from '@sveltejs/kit';
import { isLocale } from '$lib/i18n';
import { SPEECH_MAX_CHARS, speechSettings, synthesize, voiceFor } from '$lib/server/speech';
import type { RequestHandler } from './$types';

/**
 * One line of the tale, as sound.
 *
 * The browser never talks to ElevenLabs; it asks for this, and the key stays
 * here. Every refusal is a refusal the caller can act on rather than an error to
 * report to the player: `src/lib/client/voice.ts` reads any non-2xx as "use the
 * voices this browser already has", so a missing key, a dead provider or a
 * request we would rather not pay for all degrade to the same working fallback.
 *
 * Deliberately not cached by the browser under a URL: it is a POST because the
 * line is the argument and lines are long. The caching that matters happens
 * server-side, keyed on the text — see `synthesize`, and note that the same
 * sentence is said in every round of every match.
 */
export const POST: RequestHandler = async ({ request }) => {
	const settings = speechSettings();
	if (!settings.apiKey) return json({ reason: 'no-key' }, { status: 503 });

	let body: { text?: unknown; character?: unknown; locale?: unknown };
	try {
		body = await request.json();
	} catch {
		return json({ reason: 'malformed' }, { status: 400 });
	}

	const text = typeof body.text === 'string' ? body.text.trim() : '';
	if (!text) return json({ reason: 'empty' }, { status: 400 });
	if (text.length > SPEECH_MAX_CHARS) return json({ reason: 'too-long' }, { status: 413 });

	const locale = isLocale(body.locale) ? body.locale : 'en';
	// A seat's character index, or null for the world's own lines.
	const character = typeof body.character === 'number' ? body.character : null;

	try {
		const audio = await synthesize(settings, text, voiceFor(settings, character), locale);
		return new Response(audio, {
			headers: {
				'Content-Type': 'audio/mpeg',
				'Content-Length': String(audio.byteLength),
				'Cache-Control': 'private, max-age=86400'
			}
		});
	} catch (cause) {
		// A provider that is slow, broken or out of credit is not worth a stack
		// trace per line. One line, and the phone reads it out itself.
		console.error('[prompt&pray] could not read a line aloud:', String(cause));
		return json({ reason: 'upstream' }, { status: 502 });
	}
};
