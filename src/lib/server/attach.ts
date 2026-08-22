import type { Server as HttpServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { WS_PATH } from '../protocol.ts';
import { createBrain, describeBrain, type Env } from '../agent/index.ts';
import { Hub } from './hub.ts';

/** Anything with `.on('upgrade', ...)`. Vite types its server as a union; we only need that. */
type UpgradableServer = Pick<HttpServer, 'on'>;

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
	const { brain, settings } = createBrain(env);
	// How slowly the tale is told. 1 is the tuned default; 1.5 is a leisurely
	// read-aloud pace, 0.6 is brisk. Restarting applies it.
	const paceScale = Number(env.PACE_SCALE) > 0 ? Number(env.PACE_SCALE) : 1;
	const hub = new Hub(brain, paceScale);

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

	return {
		hub,
		describe:
			describeBrain(settings) + (paceScale === 1 ? '' : `, telling at ${paceScale}× pace`)
	};
}
