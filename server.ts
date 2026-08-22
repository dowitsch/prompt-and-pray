import http from 'node:http';
// Emitted by adapter-node at build time, so it does not exist until `npm run build`.
// Not covered by the generated tsconfig's `include`, which only reaches into `src/`.
import { handler } from './build/handler.js';
import { attachHub } from './src/lib/server/attach.ts';

/**
 * The production server.
 *
 * One process, deliberately: the hub holds matches in memory and `MatchRunner`
 * drives a ten-minute chain of timers, so the match has to live somewhere that
 * outlasts a request. adapter-node's `build/index.js` would start its own server
 * and leave nowhere to hang the upgrade listener, so we mount its `handler` on a
 * server we own and give `/ws` to the hub.
 *
 * Env is read here, at runtime, rather than baked in by `loadEnv` at build time —
 * AI_API_KEY should not be in the image.
 */

const server = http.createServer((req, res) =>
	handler(req, res, () => {
		res.statusCode = 404;
		res.end('Not found');
	})
);

// In production nothing else answers upgrades, so unrecognised ones are destroyed.
const { describe } = attachHub(server, process.env, { claimOnly: false });

const port = Number(process.env.PORT) || 3000;
server.listen(port, () => {
	console.log(`HOMEWARD listening on :${port} — ${describe}`);
});
