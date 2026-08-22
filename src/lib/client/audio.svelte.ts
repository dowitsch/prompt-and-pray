import { browser } from '$app/environment';

/**
 * What the app sounds like.
 *
 * Three switches, all a property of the phone in your hand rather than of the
 * match: whether there is music under the tale, whether the tale is read out
 * loud, and whether the short cues fire. None is anybody else's business, so
 * none is ever sent as game state — but the second one has a consequence at the
 * table, because a tale that is being read aloud has to wait for the reading.
 * See `src/lib/server/speechgate.ts` for the half of that which lives on the
 * server.
 *
 * Only the music is played from here. The cues are `src/lib/client/sound.ts` and
 * the voice is `src/lib/client/voice.ts`; both reach back for their switch, which
 * is why all three live together in this file rather than each beside its own
 * machinery.
 *
 * Kept out of `ui.svelte.ts` on purpose: that file is presentation state and is
 * deliberately not persisted. These are preferences, and they follow the pattern
 * the language preference already set in `connection.svelte.ts` — remembered in
 * `localStorage`, restored once on mount.
 */

const STORAGE_MUSIC = 'homeward:music';
const STORAGE_VOICE = 'homeward:voice';
const STORAGE_SFX = 'homeward:sfx';

/**
 * Under the tale, not over it. Loud enough to notice when it stops.
 */
const LEVEL = 0.22;
/** What it drops to while a line is being read. */
const UNDER = 0.05;

export const audio = $state({
	/**
	 * On by default. The music was made for this and a first-time player should
	 * hear it — the dot menu is one tap away for anyone who would rather not.
	 */
	music: true,
	/**
	 * Off by default, and it has to be: turning it on is what makes the tale wait
	 * for it, so nobody should discover that pace without having asked for it.
	 */
	voice: false,
	/**
	 * On by default. Two hundred milliseconds at the moment an agent dies is the
	 * cheapest thing in the game, and unlike the music it never plays over
	 * anything — there is nothing to be spared from by default.
	 */
	sfx: true
});

/* -------------------------------------------------------------- the record */

const remembered = (key: string, fallback: boolean): boolean => {
	const saved = localStorage.getItem(key);
	return saved === null ? fallback : saved === 'on';
};

/** Restore all three switches, and start the music if it is wanted. */
export function loadAudioPrefs(): void {
	if (!browser) return;
	try {
		audio.music = remembered(STORAGE_MUSIC, true);
		audio.voice = remembered(STORAGE_VOICE, false);
		audio.sfx = remembered(STORAGE_SFX, true);
	} catch {
		/* A browser with storage switched off still gets the defaults. */
	}
	if (audio.music) start();
}

export function setMusic(on: boolean): void {
	audio.music = on;
	keep(STORAGE_MUSIC, on);
	if (on) start();
	else element?.pause();
}

/**
 * Turn the short cues on or off.
 *
 * Only the record — there is nothing to start or stop, because a cue is only ever
 * a couple of hundred milliseconds long and the next one simply will not fire.
 * `sound.ts` reads `audio.sfx` at the moment it is asked to play.
 */
export function setSfx(on: boolean): void {
	audio.sfx = on;
	keep(STORAGE_SFX, on);
}

/**
 * Note that this device is reading aloud.
 *
 * Only the record. Telling the server is `Connection.setVoice`, which is the one
 * place that knows there is a socket.
 */
export function rememberVoice(on: boolean): void {
	audio.voice = on;
	keep(STORAGE_VOICE, on);
}

function keep(key: string, on: boolean): void {
	if (!browser) return;
	try {
		localStorage.setItem(key, on ? 'on' : 'off');
	} catch {
		/* Not worth failing a tap over. */
	}
}

/* --------------------------------------------------------------- the music */

/**
 * One element, made once, held here rather than mounted in the layout.
 *
 * A module singleton rather than markup because two things reach for it: the
 * menu, and `voice.ts` — which has to duck it under a spoken line and has no
 * business receiving it as a prop through four components to do so.
 */
let element: HTMLAudioElement | null = null;
/** True while a first tap is being waited on. */
let armed = false;

function loop(): HTMLAudioElement | null {
	if (!browser) return null;
	if (element) return element;
	element = new Audio('/music.mp3');
	element.loop = true;
	element.volume = LEVEL;
	// Four megabytes nobody asked for is not a good first impression on a phone.
	element.preload = 'none';
	return element;
}

/**
 * Start playing, or arrange to start at the first touch.
 *
 * Every browser refuses to play sound on a page nobody has interacted with yet,
 * which is correct of them and means the honest handling is to try, be refused,
 * and take the first tap as permission. There is nothing to explain to the
 * player: the first tap is the one that opens the lobby anyway.
 */
function start(): void {
	const music = loop();
	if (!music) return;
	music.play().catch(() => arm());
}

function arm(): void {
	if (!browser || armed) return;
	armed = true;
	const go = () => {
		armed = false;
		if (audio.music)
			void loop()
				?.play()
				.catch(() => {});
	};
	window.addEventListener('pointerdown', go, { once: true });
}

/**
 * Drop the music under a spoken line, and lift it again after.
 *
 * Not a pause: the tale is read over the music, and music that stopped and
 * restarted at every sentence would be the most distracting thing on the phone.
 */
export function duck(under: boolean): void {
	if (!element) return;
	element.volume = under ? UNDER : LEVEL;
}
