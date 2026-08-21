/**
 * Headless match simulator.
 *
 *   npm run dev              # in one terminal
 *   node scripts/simulate.mjs
 *
 * Connects to the real WebSocket hub as a human player, plays a competent
 * teaching strategy, and prints the transcript. Useful for checking the loop
 * end to end and for tuning bot difficulty without clicking through the UI.
 *
 * Options:
 *   --quiet     only print run summaries and the result
 *   --runs=N    give up after N runs (default 25)
 */

import WebSocket from 'ws';

const args = process.argv.slice(2);
const QUIET = args.includes('--quiet');
const MAX_RUNS = Number(args.find((a) => a.startsWith('--runs='))?.split('=')[1] ?? 25);
const URL = process.env.HOMEWARD_URL ?? 'ws://localhost:5173/ws';

const socket = new WebSocket(URL);
const send = (message) => socket.send(JSON.stringify(message));

let me = null;
let names = new Map();

/** What this simulated player has worked out by watching its own agent. */
const known = {
	deadly: new Set(),
	safeSteps: [], // { from, to }
	written: new Set()
};

const short = (label) =>
	label
		.split(/\s+/)
		.filter((w) => w.toLowerCase() !== 'the')
		.at(-1);

const log = (...parts) => {
	if (!QUIET) console.log(...parts);
};

/** The note a reasonably sharp player would write with their 20 characters. */
function nextNote(lastRun) {
	const fatal = lastRun.decisions.at(-1);
	if (fatal) {
		const killer = short(fatal.choiceLabel);
		const warning = `${killer} kills`;
		if (!known.written.has(warning) && warning.length <= 20) {
			known.deadly.add(killer);
			return warning;
		}
	}

	// Warning already recorded — bank the deepest step that actually worked.
	for (const step of [...known.safeSteps].reverse()) {
		const directive = `after ${short(step.from)} go ${short(step.to)}`.toLowerCase();
		const fallback = `${short(step.to)} is safe`;
		for (const candidate of [directive, fallback]) {
			if (candidate.length <= 20 && !known.written.has(candidate)) return candidate;
		}
	}
	return null;
}

socket.on('open', () => send({ type: 'CREATE_GAME', name: 'SIM' }));

socket.on('message', (raw) => {
	const event = JSON.parse(String(raw));

	switch (event.type) {
		case 'GAME_CREATED': {
			me = event.playerId;
			console.log(`\n  game ${event.code} created — starting\n`);
			send({ type: 'START_GAME' });
			break;
		}

		case 'GAME_STARTED': {
			for (const player of event.game.players) names.set(player.id, player.name);
			console.log(`  agents: ${[...names.values()].join(', ')}\n`);
			break;
		}

		case 'AGENT_CHOICE': {
			const who = names.get(event.playerId) ?? '???';
			const mine = event.playerId === me;
			log(
				`  ${mine ? '▶' : ' '} ${who.padEnd(8)} "${event.reasoning}"  →  ${event.choiceLabel.toUpperCase()}`
			);
			break;
		}

		case 'AGENT_SURVIVED': {
			if (event.playerId !== me) break;
			const last = event.player.agent.decisions.at(-1);
			if (last) {
				const step = { from: last.nodeTitle, to: last.choiceLabel };
				if (!known.safeSteps.some((s) => s.to === step.to)) known.safeSteps.push(step);
			}
			break;
		}

		case 'AGENT_DIED': {
			const who = names.get(event.playerId) ?? '???';
			log(`    ☠ ${who} died at ${event.run.endedAt} (depth ${event.run.depthReached})`);
			if (event.playerId !== me) break;

			console.log(
				`  run ${event.run.index}: depth ${event.run.depthReached}/8 — killed by ${event.run.decisions.at(-1)?.choiceLabel}`
			);

			if (event.run.index >= MAX_RUNS) {
				console.log(`\n  gave up after ${MAX_RUNS} runs\n`);
				socket.close();
				process.exit(1);
			}

			const note = nextNote(event.run);
			setTimeout(() => {
				if (note) {
					known.written.add(note);
					console.log(`    + memory: "${note}" (${note.length}/20)`);
					send({ type: 'ADD_MEMORY', text: note });
				}
				send({ type: 'DEPLOY_AGENT' });
			}, 120);
			break;
		}

		case 'SABOTAGE_USED': {
			console.log(
				`\n  ✖ ${event.actorName} SABOTAGED ${event.targetName}: "${event.before}" → "${event.after}"\n`
			);
			break;
		}

		case 'AGENT_REACHED_HOME': {
			const who = names.get(event.playerId) ?? '???';
			console.log(`\n  ★ ${who} REACHED HOME on run ${event.run.index}\n`);
			break;
		}

		case 'GAME_FINISHED': {
			const winner = event.game.players.find((p) => p.id === event.winnerId);
			console.log(`  winner: ${winner?.name} (${winner?.isBot ? 'bot' : 'human'})`);
			console.log('  standings:');
			for (const p of [...event.game.players].sort((a, b) => b.bestDepth - a.bestDepth)) {
				console.log(
					`    ${p.name.padEnd(8)} depth ${p.bestDepth}/8  runs ${p.runCount}  memory ${p.memoryChars} chars${p.wasSabotaged ? '  (sabotaged)' : ''}`
				);
			}
			console.log('');
			socket.close();
			process.exit(winner?.id === me ? 0 : 2);
			break;
		}

		case 'ERROR': {
			console.error(`  ! server: ${event.message}`);
			break;
		}
	}
});

socket.on('error', (error) => {
	console.error(`\n  cannot reach ${URL} — is \`npm run dev\` running?\n`, error.message);
	process.exit(1);
});
