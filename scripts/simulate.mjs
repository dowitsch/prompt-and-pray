/**
 * Headless match simulator.
 *
 *   npm run dev              # in one terminal
 *   node scripts/simulate.mjs
 *
 * Connects to the real WebSocket hub as a human player, plays a competent
 * teaching strategy, and prints the transcript round by round. Useful for
 * checking the loop end to end and for tuning bot difficulty without clicking.
 *
 * Options:
 *   --quiet      only round recaps and the result
 *   --rounds=N   give up after N rounds (default 25)
 */

import WebSocket from 'ws';

const args = process.argv.slice(2);
const QUIET = args.includes('--quiet');
const MAX_ROUNDS = Number(args.find((a) => a.startsWith('--rounds='))?.split('=')[1] ?? 25);
const URL = process.env.HOMEWARD_URL ?? 'ws://localhost:5173/ws';

const socket = new WebSocket(URL);
const send = (message) => socket.send(JSON.stringify(message));

let me = null;
const names = new Map();

/** What this simulated player has worked out by watching its own agent. */
const known = {
	safeSteps: [],
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
function nextNote(outcome) {
	if (outcome?.killedBy) {
		const warning = `${short(outcome.killedBy)} kills`;
		if (!known.written.has(warning) && warning.length <= 20) return warning;
	}
	// Warning already recorded — bank the deepest step that actually worked.
	for (const step of [...known.safeSteps].reverse()) {
		for (const candidate of [
			`after ${short(step.from)} go ${short(step.to)}`.toLowerCase(),
			`${short(step.to)} is safe`
		]) {
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

		case 'ROUND_STARTED':
			log(`\n  ── ROUND ${event.round} ──`);
			break;

		case 'STEP_STARTED':
			log(`\n  level ${event.step + 1}  (${event.alive} still walking)`);
			break;

		case 'AGENT_CHOICE': {
			const who = names.get(event.playerId) ?? '???';
			const mine = event.playerId === me;
			log(
				`  ${mine ? '▶' : ' '} ${who.padEnd(8)} → ${event.choiceLabel.toUpperCase().padEnd(12)} "${event.reasoning}"`
			);
			break;
		}

		case 'AGENT_SURVIVED': {
			if (event.playerId !== me) break;
			const last = event.player.agent.decisions.at(-1);
			if (last && !known.safeSteps.some((s) => s.to === last.choiceLabel)) {
				known.safeSteps.push({ from: last.nodeTitle, to: last.choiceLabel });
			}
			break;
		}

		case 'AGENT_DIED':
			log(`    ☠ ${names.get(event.playerId)} — ${event.epitaph}`);
			break;

		case 'SABOTAGE_USED':
			console.log(
				`\n  ✖ ${event.actorName} SABOTAGED ${event.targetName}: "${event.before}" → "${event.after}"`
			);
			break;

		case 'AGENT_REACHED_HOME':
			console.log(`\n  ★ ${names.get(event.playerId)} REACHED HOME`);
			break;

		case 'ROUND_ENDED': {
			const { summary } = event;
			console.log(`\n  ROUND ${summary.round}: ${summary.headline}`);
			for (const o of [...summary.outcomes].sort((a, b) => b.depth - a.depth)) {
				const tag = o.survived ? 'HOME' : `died at ${o.killedBy}`;
				console.log(
					`    ${o.name.padEnd(8)} ${String(o.depth).padStart(2)}/8  ${tag}${o.repeatedMistake ? ' (again)' : ''}${o.wasSabotaged ? ' (sabotaged)' : ''}`
				);
			}
			if (summary.round >= MAX_ROUNDS) {
				console.log(`\n  gave up after ${MAX_ROUNDS} rounds\n`);
				socket.close();
				process.exit(1);
			}
			break;
		}

		case 'TEACHING_STARTED': {
			const mine = event.game.players.find((p) => p.id === me);
			const outcome = event.game.lastSummary?.outcomes.find((o) => o.playerId === me);
			const note = nextNote(outcome);
			setTimeout(() => {
				if (note && mine?.pendingGrants > 0) {
					known.written.add(note);
					console.log(`    + memory: "${note}" (${note.length}/20)`);
					send({ type: 'ADD_MEMORY', text: note });
				}
				send({ type: 'SET_READY', ready: true });
			}, 250);
			break;
		}

		case 'GAME_FINISHED': {
			const winners = event.game.players.filter((p) => event.winnerIds.includes(p.id));
			console.log(`\n  winner: ${winners.map((w) => w.name).join(' & ')}`);
			console.log(`  rounds: ${event.game.round}`);
			console.log('  standings:');
			for (const p of [...event.game.players].sort((a, b) => b.bestDepth - a.bestDepth)) {
				console.log(
					`    ${p.name.padEnd(8)} best ${p.bestDepth}/8  memory ${p.memoryChars} chars${p.wasSabotaged ? '  (sabotaged)' : ''}`
				);
			}
			console.log('');
			socket.close();
			process.exit(event.winnerIds.includes(me) ? 0 : 2);
			break;
		}

		case 'ERROR':
			console.error(`  ! server: ${event.message}`);
			break;
	}
});

socket.on('error', (error) => {
	console.error(`\n  cannot reach ${URL} — is \`npm run dev\` running?\n`, error.message);
	process.exit(1);
});
