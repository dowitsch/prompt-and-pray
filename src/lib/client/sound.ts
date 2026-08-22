import { browser } from '$app/environment';
import type { ServerEvent, ServerEventType } from '$lib/protocol';
import { audio } from './audio.svelte';

/**
 * The short noises.
 *
 * Six of them, one per moment that matters, each hung off a server event rather
 * than off a component — a sound that fires from markup fires again whenever the
 * markup happens to remount, and the events are the only place that knows
 * something actually *happened* as opposed to something being redrawn.
 *
 * The switch that turns these off lives with the other two in `audio.svelte.ts`,
 * because it is the same kind of thing: a property of the phone in your hand and
 * nobody else's business. This file is the machinery, and holds no preference of
 * its own.
 *
 * Distinct from `voice.ts` in the one way that matters: nothing waits for these.
 * A cue that fails to load, fails to decode, or is refused outright is simply not
 * heard, and the match carries on without noticing. Every path here swallows.
 */

/**
 * Loud enough to land over the music, quiet enough to sit under a spoken line.
 *
 * Deliberately above the music's own `LEVEL` of 0.22: these are punctuation and
 * have a tenth of a second to register, where the loop has all match to do it.
 */
const LEVEL = 0.55;

const CUES = [
	'player-joined',
	'round-start',
	'agent-survive',
	'agent-died',
	'agent-home',
	'sabotage'
] as const;

export type Cue = (typeof CUES)[number];

/**
 * Which events make a noise.
 *
 * A partial map on purpose, and the omissions are the interesting half.
 * **`STATE_SYNC` is not here and must never be** — it is what a reconnect and a
 * mid-match join both arrive as, so a cue on it would greet a player who dropped
 * off the wifi for two seconds with the entire lobby joining again. The same
 * reasoning keeps the per-turn chatter (`AGENT_THINKING`, `AGENT_CHOICE`,
 * `TURN_STARTED`) silent: they fire several times a round, and a game that
 * chirps at every step stops meaning anything by the second round.
 */
const FOR_EVENT: Partial<Record<ServerEventType, Cue>> = {
	PLAYER_JOINED: 'player-joined',
	ROUND_STARTED: 'round-start',
	AGENT_SURVIVED: 'agent-survive',
	AGENT_DIED: 'agent-died',
	AGENT_REACHED_HOME: 'agent-home',
	SABOTAGE_USED: 'sabotage'
};

/* ---------------------------------------------------------------- the first tap */

/**
 * Whether a human has touched the page yet.
 *
 * Every browser refuses sound on a page nobody has interacted with, and the
 * honest response is to not ask. The music can afford to try-and-be-refused
 * because it is one long thing that either starts or doesn't; cues cannot,
 * because the refusals arrive as a stream of rejected promises for sounds whose
 * moment has already passed. So nothing is even attempted until this flips.
 *
 * Note that nothing is queued behind it either. A cue that happened before the
 * first tap is gone, which is right: the alternative is six sounds firing at once
 * the instant somebody reaches for the screen.
 */
let unlocked = false;

const GESTURES = ['pointerdown', 'keydown', 'touchend'] as const;

/**
 * Wait for the first interaction, then take it as permission.
 *
 * Called once from the layout's `onMount`. There is nothing to explain to the
 * player: on a phone the first tap is the one that opens the lobby anyway, and on
 * a desktop it is the one that types a name.
 */
export function unlockSound(): void {
	if (!browser || unlocked) return;

	const go = (): void => {
		if (unlocked) return;
		unlocked = true;
		for (const gesture of GESTURES) window.removeEventListener(gesture, go);
		warm();
	};

	// `once` on each is not enough — three listeners, and only one of them fires —
	// hence the explicit removal above.
	for (const gesture of GESTURES) window.addEventListener(gesture, go, { passive: true });
}

/**
 * Pull the files down now that we are allowed to make noise.
 *
 * All six together are about the size of one character portrait, and fetching
 * them at the first tap means the join sound is not the one cue that arrives
 * late. Skipped entirely when the switch is off, so a player who does not want
 * sound does not pay for it.
 */
function warm(): void {
	if (!audio.sfx) return;
	for (const name of CUES) clip(name)?.load();
}

/* ----------------------------------------------------------------- the clips */

/**
 * Which container this browser admits to understanding.
 *
 * Asked once. Kenney ships Ogg Vorbis and Safari did not play it until iOS 17,
 * which matters more here than it would elsewhere — this game is joined by
 * pointing a phone at a QR code, so the old iPhone on the far side of the table
 * is a normal case rather than an edge one. `null` means the browser claimed
 * neither, and the whole layer goes quiet rather than guessing.
 */
let format: 'ogg' | 'm4a' | null | undefined;

function suffix(): 'ogg' | 'm4a' | null {
	if (format !== undefined) return format;
	const probe = new Audio();
	// `canPlayType` answers '', 'maybe' or 'probably'; only the empty string is a no.
	if (probe.canPlayType('audio/ogg; codecs="vorbis"')) format = 'ogg';
	else if (probe.canPlayType('audio/mp4; codecs="mp4a.40.2"')) format = 'm4a';
	else format = null;
	return format;
}

/**
 * One element per cue, made on demand and kept.
 *
 * `null` is cached as deliberately as an element is: it is how a cue whose file
 * is missing, corrupt or unplayable stops being asked about. Without that, every
 * death in the match would start a fresh 404.
 */
const clips = new Map<Cue, HTMLAudioElement | null>();

function clip(name: Cue): HTMLAudioElement | null {
	const held = clips.get(name);
	if (held !== undefined) return held;

	const extension = browser ? suffix() : null;
	if (!extension) {
		clips.set(name, null);
		return null;
	}

	const element = new Audio(`/audio/${name}.${extension}`);
	element.preload = 'auto';
	element.volume = LEVEL;
	// The file is not there, or the browser changed its mind about the codec.
	// Either way this cue is over for the life of the page.
	element.addEventListener('error', () => clips.set(name, null), { once: true });

	clips.set(name, element);
	return element;
}

/* ---------------------------------------------------------------- the playing */

/**
 * Play one cue by name, if there is any reason to.
 *
 * Exported for the odd caller that wants a noise without an event behind it —
 * the menu's own toggle uses it to demonstrate what it just switched on.
 */
export function cue(name: Cue): void {
	if (!browser || !audio.sfx || !unlocked) return;

	const sound = clip(name);
	if (!sound) return;

	try {
		// Restart rather than overlap. Two agents can survive within a second of
		// each other and the same note twice over itself is a flam, not a chord.
		sound.currentTime = 0;
	} catch {
		/* Not seekable yet, which means it has not played, which means it is at zero. */
	}
	void sound.play().catch(() => {
		/* Refused or interrupted. There is no recovery worth attempting for 200ms of sound. */
	});
}

/**
 * The hook the socket calls for every event that arrives.
 *
 * Deliberately given the whole event rather than just its type, so that a cue
 * that later wants to know *whose* agent died has it to hand without changing
 * the call site.
 */
export function soundFor(event: ServerEvent): void {
	const name = FOR_EVENT[event.type];
	if (name) cue(name);
}
