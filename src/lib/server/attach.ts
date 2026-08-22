import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer } from 'ws';
import { WS_PATH } from '../protocol.ts';
import { createBrain, describeBrain, type Env } from '../agent/index.ts';
import { prepareDatabase } from '../db/boot.ts';
import { Hub } from './hub.ts';

/**
 * Anything that emits `upgrade`. Structural on purpose: Vite types its server as
 * `http.Server | Http2SecureServer`, and we only ever touch this one event.
 */
type UpgradableServer = {
	on(
		event: 'upgrade',
		listener: (request: IncomingMessage, socket: Duplex, head: Buffer) => void
	): unknown;
};

type AttachOptions = {
	/**
	 * Whether another listener also owns this server's `upgrade` event.
	 *
	 * In dev, Vite's HMR socket shares the server, so an upgrade we don't recognise
	 * has to be left completely untouched. In production we are the only listener,
	 * so an unrecognised upgrade must be destroyed — returning would leave the
	 * client hanging on a socket nobody will ever answer.
	 */
	claimOnly: boolean;
};

/**
 * Builds the hub and mounts it on an HTTP server's upgrade path.
 *
 * Dev (`ws-plugin.ts`) and production (`server.ts`) both come through here, so
 * the two cannot drift apart.
 */
export function attachHub(
	server: UpgradableServer,
	env: Env,
	{ claimOnly }: AttachOptions
): { hub: Hub; describe: string } {
	// Before anything else: there is nothing to restore matches into until the
	// schema and the built-in stories exist.
	const path = prepareDatabase();

	const { brain, settings } = createBrain(env);
	// How slowly the tale is told. 1 is the tuned default; 1.5 is a leisurely
	// read-aloud pace, 0.6 is brisk. Restarting applies it.
	const paceScale = Number(env.PACE_SCALE) > 0 ? Number(env.PACE_SCALE) : 1;
	// The longest a beat will hold for a phone reading the tale aloud. A ceiling,
	// not a duration: it is only ever reached by a phone that stopped answering.
	const ceiling = Number(env.SPEECH_CEILING_MS) > 0 ? Number(env.SPEECH_CEILING_MS) : 30_000;
	const hub = new Hub(brain, paceScale, ceiling);

	// Matches outlive the process now. Editing anything under `src/lib/server/`
	// still restarts the dev server, but it no longer costs anyone their match.
	const restored = hub.restoreMatches();

	const wss = new WebSocketServer({ noServer: true });
	wss.on('connection', (socket) => hub.handleConnection(socket));

	server.on('upgrade', (request, socket, head) => {
		const { pathname } = new URL(request.url ?? '/', 'http://localhost');
		if (pathname !== WS_PATH) {
			if (!claimOnly) socket.destroy();
			return;
		}

		wss.handleUpgrade(request, socket, head, (ws) => wss.emit('connection', ws, request));
	});

	const pace = paceScale === 1 ? '' : `, telling at ${paceScale}× pace`;
	const matches = restored === 0 ? '' : `, ${restored} match${restored === 1 ? '' : 'es'} restored`;

	console.log(`[homeward] database ready at ${path}`);
	return { hub, describe: describeBrain(settings) + pace + matches };
}
