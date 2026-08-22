/**
 * One clock for the whole app.
 *
 * Three things count down from a server timestamp at once — the clue phase, the
 * lobby's 3-2-1, and the round label — and each of them spinning up its own
 * interval means three timers ticking out of step, so two adjacent numbers can
 * disagree by most of a second. One shared tick, reference-counted so it stops
 * when the last reader goes away.
 *
 * Countdowns always read `endsAt - now`. Never a locally decremented counter:
 * the server owns when the phase ends, and a tab that was backgrounded has to
 * come back to the right number rather than to whatever it stopped at.
 */

const TICK_MS = 250;

let readers = 0;
let timer: ReturnType<typeof setInterval> | null = null;

const clock = $state({ now: Date.now() });

/**
 * Read `clock.now` while mounted. Call inside `$effect` and return the result,
 * so the tick is released on teardown.
 */
export function tick(): () => void {
	readers += 1;
	if (!timer) {
		clock.now = Date.now();
		timer = setInterval(() => (clock.now = Date.now()), TICK_MS);
	}
	return () => {
		readers -= 1;
		if (readers <= 0 && timer) {
			clearInterval(timer);
			timer = null;
			readers = 0;
		}
	};
}

export { clock };

/** Whole seconds left until an epoch-ms deadline. 0 when there is no deadline. */
export function secondsUntil(endsAt: number, now: number): number {
	if (!endsAt) return 0;
	return Math.max(0, Math.ceil((endsAt - now) / 1000));
}
