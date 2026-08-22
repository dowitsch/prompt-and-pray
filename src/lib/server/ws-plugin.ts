import type { Plugin, ViteDevServer } from 'vite';
import type { Env } from '../agent/index.ts';
import { attachHub } from './attach.ts';

/**
 * Mounts the game's WebSocket hub on Vite's own HTTP server.
 *
 * Doing it here rather than as a second process means one command, one port and
 * one origin — and game state survives client HMR, because this module lives in
 * the Vite config's context rather than in the app's module graph.
 *
 * Production uses the same `attachHub` from `server.ts`, so the two cannot drift.
 */
export function homewardServer(env: Env): Plugin {
	let announced = false;

	// Vite types this as `http.Server | Http2SecureServer`; we only need `on`.
	type HttpServerLike = NonNullable<ViteDevServer['httpServer']>;

	const attach = (httpServer: HttpServerLike | null | undefined) => {
		if (!httpServer) return;

		// Vite's HMR socket shares this server, so upgrades we don't own must be
		// left completely untouched.
		const { describe } = attachHub(httpServer, env, { claimOnly: true });

		if (!announced) {
			announced = true;
			console.log(`\n  \x1b[35m➜\x1b[0m  HOMEWARD: ${describe}\n`);
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
