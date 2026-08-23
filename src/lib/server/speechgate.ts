import type { WebSocket } from 'ws';

/**
 * Holding the tale until it has been read out.
 *
 * The narration is server-paced: `MatchRunner` says a thing and then sleeps a
 * fixed beat before saying the next. That is exactly right when the tale is read
 * with the eyes, and exactly wrong when a phone is reading it aloud — a spoken
 * sentence takes as long as it takes, and a fixed beat would either talk over
 * itself or leave dead air.
 *
 * Slowing the client down instead is not an option. The client is a pure adopter
 * of server facts and several of those facts are absolute timestamps — the
 * teaching window arrives as an `endsAt` — so a phone that queued events locally
 * would fall further behind every step and eventually land on a writing screen
 * whose clock had already run out. So the pause has to happen on the server, and
 * the phones have to be able to say when they are done.
 *
 * That is all this is: a set of sockets that are currently reading aloud, and one
 * outstanding line they are being waited on for.
 *
 * Two properties are load-bearing:
 *
 *   1. **Nobody listening costs nothing.** With no voiced socket on a match,
 *      `wait` resolves before it returns and the tale paces exactly as it always
 *      did. This is the thing to protect in review.
 *   2. **The tale never waits for a phone that has wandered off.** Every wait has
 *      a ceiling, the same discipline the teaching window already has in
 *      `MatchRunner.openTeaching`. A phone that closed, went quiet, or simply
 *      never answered cannot wedge three other people's match.
 *
 * Deliberately not in `Game`: that is serialised to SQLite by `db/matches.ts`,
 * and "this socket is playing a sound right now" is the least persistable fact in
 * the system. It belongs beside the sockets, which is the hub.
 */

type Pending = {
	/** The line being waited on. An answer about any other line is stale. */
	utterance: number;
	/** Who has not answered yet. */
	waiting: Set<WebSocket>;
	resolve: () => void;
	timer: ReturnType<typeof setTimeout>;
};

export class SpeechGate {
	/** Sockets reading the tale aloud, per match code. */
	private readonly voiced = new Map<string, Set<WebSocket>>();
	/** The one line each match is currently being waited on for. */
	private readonly pending = new Map<string, Pending>();

	/**
	 * This socket is reading aloud, or has stopped.
	 *
	 * Turning it on mid-line does not join the line already in flight — only the
	 * next one. Turning it off leaves the current one immediately: a phone that has
	 * gone quiet is not something to wait for.
	 */
	setVoice(code: string, socket: WebSocket, on: boolean): void {
		if (on) {
			let listening = this.voiced.get(code);
			if (!listening) this.voiced.set(code, (listening = new Set()));
			listening.add(socket);
			return;
		}

		const listening = this.voiced.get(code);
		if (listening) {
			listening.delete(socket);
			if (!listening.size) this.voiced.delete(code);
		}
		this.stopWaitingFor(code, socket);
	}

	/** "I have finished reading that line." Anything about an older line is ignored. */
	ack(code: string, socket: WebSocket, utterance: number): void {
		const pending = this.pending.get(code);
		if (!pending || pending.utterance !== utterance) return;
		pending.waiting.delete(socket);
		if (!pending.waiting.size) this.settle(code);
	}

	/** A socket has gone. It is neither listening nor worth waiting for. */
	drop(socket: WebSocket): void {
		for (const [code, listening] of this.voiced) {
			if (!listening.delete(socket)) continue;
			if (!listening.size) this.voiced.delete(code);
		}
		for (const code of [...this.pending.keys()]) {
			this.stopWaitingFor(code, socket);
		}
	}

	/**
	 * The match is over. Release anything still outstanding rather than leave a
	 * runner holding a promise nobody will ever resolve.
	 *
	 * Deliberately does *not* forget who is listening: reading the tale aloud is a
	 * property of the phone rather than of the match, and those phones are still
	 * in the same hands. `forget` is the one that clears them, and it is only
	 * called when the match itself is going away.
	 */
	release(code: string): void {
		this.settle(code);
	}

	/** The match is gone. Nobody is listening to it, and nothing is waited for. */
	forget(code: string): void {
		this.settle(code);
		this.voiced.delete(code);
	}

	/**
	 * Hold until every phone reading aloud has finished this line — or until the
	 * ceiling, whichever comes first.
	 *
	 * Resolves synchronously when nobody is listening, which is the common case and
	 * the one that must not cost anything.
	 */
	wait(code: string, utterance: number, ceilingMs: number): Promise<void> {
		// Only one line is read at a time, so anything still outstanding is done
		// with. In practice there never is: the runner awaits each of these before
		// asking for the next. This is the belt to that braces.
		this.settle(code);

		const listening = this.voiced.get(code);
		if (!listening?.size) return Promise.resolve();

		const waiting = new Set(listening);
		return new Promise<void>((resolve) => {
			const timer = setTimeout(() => this.settle(code), ceilingMs);
			this.pending.set(code, { utterance, waiting, resolve, timer });
		});
	}

	private settle(code: string): void {
		const pending = this.pending.get(code);
		if (!pending) return;
		this.pending.delete(code);
		clearTimeout(pending.timer);
		pending.resolve();
	}

	private stopWaitingFor(code: string, socket: WebSocket): void {
		const pending = this.pending.get(code);
		if (!pending || !pending.waiting.delete(socket)) return;
		if (!pending.waiting.size) this.settle(code);
	}
}
