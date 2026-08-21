import type { Plugin, ViteDevServer } from 'vite';
import { WebSocketServer } from 'ws';
import { WS_PATH } from '../protocol.ts';
import { createBrain, describeBrain, type Env } from '../agent/index.ts';
import { Hub } from './hub.ts';

/**
 * Mounts the game's WebSocket hub on Vite's own HTTP server.
 *
 * Doing it here rather than as a second process means one command, one port and
 * one origin — and game state survives client HMR, because this module lives in
 * the Vite config's context rather than in the app's module graph.
 *
 * (A deployed build would run the same Hub from an adapter-node server instead;
 * see the README. The prototype targets `npm run dev`.)
 */
export function homewardServer(env: Env): Plugin {
	const { brain, settings } = createBrain(env);
	const hub = new Hub(brain);
	let announced = false;

	// Vite types this as `http.Server | Http2SecureServer`; we only need `on`.
	type HttpServerLike = NonNullable<ViteDevServer['httpServer']>;

	const attach = (httpServer: HttpServerLike | null | undefined) => {
		if (!httpServer) return;

		const wss = new WebSocketServer({ noServer: true });
		wss.on('connection', (socket) => hub.handleConnection(socket));

		httpServer.on('upgrade', (request, socket, head) => {
			// Vite's HMR socket shares this server: only claim our own path, and
			// leave every other upgrade completely untouched.
			const { pathname } = new URL(request.url ?? '/', 'http://localhost');
			if (pathname !== WS_PATH) return;

			wss.handleUpgrade(request, socket, head, (ws) => wss.emit('connection', ws, request));
		});

		if (!announced) {
			announced = true;
			console.log(`\n  \x1b[35m➜\x1b[0m  HOMEWARD: ${describeBrain(settings)}\n`);
		}
	};

	return {
		name: 'homeward-server',
		configureServer(server) {
			attach(server.httpServer);
		},
		configurePreviewServer(server) {
			attach(server.httpServer);
		}
	};
}
