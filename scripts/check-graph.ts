/**
 * Graph engine check.
 *
 *   npm run check:graph
 *
 * The story shape widened from a tree to a directed graph, which introduced four
 * things a tree could not express and the engine had no reason to handle:
 *
 *   1. **Reconvergence** — two roads into one place, so a node has more than one
 *      way in and progress cannot be "how many steps have I taken".
 *   2. **Setbacks** — an edge that survives but takes the agent backwards.
 *   3. **Cycles** — `A → B → A`, which an automatically-walking agent would
 *      otherwise follow until the process died.
 *   4. **Endings that are neither death nor home** — a road that just stops.
 *
 * Each is asserted here against a purpose-built graph rather than against
 * HOMEWARD, which contains none of them.
 */

import { Game } from '../src/lib/engine/game.ts';
import { stepBudgetFor } from '../src/lib/db/story.ts';
import { distancesToHome } from '../src/lib/db/story.ts';
import type { StoryChoice, StoryGraph, StoryNode } from '../src/lib/engine/types.ts';
import { CHARACTER_COUNT, MAX_PLAYERS, PALETTE_SIZE } from '../src/lib/engine/types.ts';
import { validateStory } from '../src/lib/engine/validate.ts';

let passed = 0;
let failed = 0;

function check(ok: boolean, why: string, detail = ''): void {
	if (ok) passed++;
	else failed++;
	console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${why}`);
	if (!ok && detail) console.log(`        ${detail}`);
}

type NodeSpec = {
	id: string;
	ending?: StoryNode['endingType'];
	ways?: [label: string, to: string, result?: StoryChoice['result']][];
};

/** Assemble a graph the way the loader does, without needing a database. */
function graph(startNode: string, specs: NodeSpec[]): StoryGraph {
	const nodes: Record<string, StoryNode> = {};
	const edges: { from: string; to: string }[] = [];

	for (const [index, spec] of specs.entries()) {
		nodes[spec.id] = {
			id: spec.id,
			kind: 'LOCATION',
			title: spec.id,
			description: `at ${spec.id}`,
			endingType: spec.ending ?? null,
			x: 0,
			y: index * 100,
			choices: (spec.ways ?? []).map(([label, to, result]) => ({
				id: `${spec.id}->${to}`,
				label,
				slug: label.toLowerCase(),
				nextNode: to,
				result: result ?? 'ADVANCE',
				consequence: ''
			}))
		};
	}
	for (const node of Object.values(nodes)) {
		for (const choice of node.choices) edges.push({ from: node.id, to: choice.nextNode });
	}

	const distanceHome = distancesToHome(Object.values(nodes), edges);
	const parSteps = distanceHome[startNode] ?? 0;

	return {
		id: 'test',
		name: 'Test',
		tagline: '',
		startNode,
		homeNodes: Object.values(nodes)
			.filter((n) => n.endingType === 'SUCCESS')
			.map((n) => n.id),
		parSteps,
		stepBudget: stepBudgetFor(parSteps),
		distanceHome,
		nodes
	};
}

/** A game with one player, already running, ready to be walked by hand. */
function playing(story: StoryGraph) {
	const game = new Game('TEST', story, 'en');
	game.addPlayer('p1', 'Tester');
	game.addPlayer('p2', 'Other');
	game.startMatch();
	game.beginRound();
	return game;
}

/** Take the way with this label from wherever the agent is standing. */
function walk(game: Game, label: string) {
	const here = game.nodeFor('p1');
	const choice = here.choices.find((c) => c.label === label);
	if (!choice) throw new Error(`No way "${label}" out of "${here.id}".`);
	return game.resolveChoice('p1', choice.id, 'because');
}

// --- 1. Reconvergence, and progress measured as ground closed ------------
//
//   start ──Quick──────────────► middle ──Gate──► home
//     └────Long──► detour ──Back──┘
//
// Both roads reach `middle`. The long way takes two steps to get there and the
// short way one, so par is 2 — and an agent that took the long way is *level*
// with one that took the short way, not one step ahead of it.
{
	const story = graph('start', [
		{
			id: 'start',
			ways: [
				['Quick', 'middle'],
				['Long', 'detour']
			]
		},
		{ id: 'detour', ways: [['Back', 'middle']] },
		{ id: 'middle', ways: [['Gate', 'home']] },
		{ id: 'home', ending: 'SUCCESS' }
	]);

	check(story.parSteps === 2, 'par is the shortest of two routes', `got ${story.parSteps}`);

	const quick = playing(story);
	walk(quick, 'Quick');
	const afterQuick = quick.getPlayer('p1').agent.depth;

	const long = playing(story);
	walk(long, 'Long');
	const midDetour = long.getPlayer('p1').agent.depth;
	walk(long, 'Back');
	const afterLong = long.getPlayer('p1').agent.depth;

	check(afterQuick === 1, 'the short road closes one step of ground', `got ${afterQuick}`);
	check(midDetour === 0, 'a step sideways closes no ground', `got ${midDetour}`);
	check(
		afterLong === afterQuick,
		'two roads to one place leave both agents level',
		`long ${afterLong}, quick ${afterQuick}`
	);

	const arrived = walk(long, 'Gate');
	check(arrived.outcome === 'win', 'a SUCCESS ending wins', arrived.outcome);
	check(arrived.run?.ending === 'home', 'and the run is recorded as home', arrived.run?.ending);
	check(
		arrived.depth === story.parSteps,
		'arriving reads as the whole journey done',
		`${arrived.depth}/${story.parSteps}`
	);
}

// --- 2. A SETBACK survives ----------------------------------------------
//
// The edge says SETBACK; the node it leads to is not an ending. Terminality is
// the node's business, so the agent lives — and keeps the ground it had already
// closed, because progress only ever moves up.
{
	const story = graph('start', [
		{
			id: 'start',
			ways: [
				['On', 'ridge'],
				['Aside', 'nowhere']
			]
		},
		{
			id: 'ridge',
			ways: [
				['Slip', 'start', 'SETBACK'],
				['Gate', 'home']
			]
		},
		{ id: 'nowhere', ending: 'NEUTRAL' },
		{ id: 'home', ending: 'SUCCESS' }
	]);

	const game = playing(story);
	walk(game, 'On');
	const earned = game.getPlayer('p1').agent.depth;
	const slipped = walk(game, 'Slip');

	check(slipped.outcome === 'continue', 'a SETBACK edge does not end the run', slipped.outcome);
	check(game.getPlayer('p1').agent.status === 'running', 'and the agent is still walking');
	check(
		slipped.toNode.id === 'start',
		'a road may lead back where it came from',
		slipped.toNode.id
	);
	check(
		slipped.depth === earned,
		'losing ground does not un-earn what was already shown',
		`${slipped.depth} vs ${earned}`
	);
	check(
		slipped.revealed.state === 'safe',
		'and the road is drawn as survivable, because it is',
		slipped.revealed.state
	);

	// A NEUTRAL ending: over, but nothing killed it. The road stays honest.
	const stopped = playing(story);
	const result = walk(stopped, 'Aside');
	check(result.outcome === 'end', 'a NEUTRAL ending stops the run', result.outcome);
	check(result.run?.ending === 'ended', 'recorded as ended, not died', result.run?.ending);
	check(result.run?.survived === false, 'and it did not get home');
	check(
		result.revealed.state === 'safe',
		'a road that merely stops is not marked lethal',
		result.revealed.state
	);
}

// --- 3. A cycle terminates ----------------------------------------------
//
// `A → B → A` with no way out. Left alone the agent would walk it forever; the
// step budget ends the run instead, and — the part that matters — does not
// slander the last road it took.
{
	const story = graph('start', [
		{
			id: 'start',
			ways: [
				['Round', 'loop'],
				['Gate', 'home']
			]
		},
		{ id: 'loop', ways: [['Back', 'start']] },
		{ id: 'home', ending: 'SUCCESS' }
	]);

	check(
		story.stepBudget === 20,
		'a short story still gets the floor budget',
		`${story.stepBudget}`
	);

	const game = playing(story);
	let steps = 0;
	while (game.getPlayer('p1').agent.status === 'running' && steps < story.stepBudget) {
		const here = game.nodeFor('p1');
		// Always take the way round, never the gate.
		walk(game, here.id === 'start' ? 'Round' : 'Back');
		steps++;
	}

	check(
		steps === story.stepBudget,
		'walking in circles is legal right up to the budget',
		`${steps} steps`
	);
	check(
		game.getPlayer('p1').agent.status === 'running',
		'the engine does not end the run by itself — the runner does'
	);

	const wandered = game.wander('p1');
	check(wandered.run.ending === 'wandered', 'and then it has wandered', wandered.run.ending);
	check(game.getPlayer('p1').agent.status === 'dead', 'the run is over');
	check(
		wandered.revealed.state === 'safe',
		'the last road walked is not blamed for it',
		wandered.revealed.state
	);
	check(
		wandered.epitaph.length > 0 && !wandered.epitaph.includes('{'),
		'and there is a line to read out',
		wandered.epitaph
	);
}

// --- 4. Somewhere home cannot be reached from ----------------------------
{
	const story = graph('start', [
		{
			id: 'start',
			ways: [
				['Gate', 'home'],
				['Pocket', 'pocket']
			]
		},
		{ id: 'pocket', ways: [['Deeper', 'deeper']] },
		{ id: 'deeper', ways: [['Back', 'pocket']] },
		{ id: 'home', ending: 'SUCCESS' }
	]);

	check(story.distanceHome['pocket'] === undefined, 'a pocket with no way home has no distance');

	const game = playing(story);
	walk(game, 'Pocket');
	check(
		game.getPlayer('p1').agent.depth === 0,
		'and standing in it counts for no progress',
		`${game.getPlayer('p1').agent.depth}`
	);
	check(game.progressAt('home') === story.parSteps, 'while home counts for all of it');
}

// --- 5. The validator refuses what a designer will actually build ---------
//
// Every rule here is a story that would *load and run* and still be broken. The
// keyword collision is the one worth the most: nothing about it looks wrong.
{
	const problems = (story: StoryGraph) => validateStory(story, 'en').errors.map((p) => p.code);

	const collide = graph('start', [
		{
			id: 'start',
			ways: [
				['Lantern Road', 'home'],
				['Ash Road', 'grave']
			]
		},
		{ id: 'home', ending: 'SUCCESS' },
		{ id: 'grave', ending: 'FAILURE' }
	]);
	const found = validateStory(collide, 'en').errors.find((p) => p.code === 'keyword-collision');
	check(Boolean(found), 'two roads sharing a word is refused');
	check(
		Boolean(found && found.message.includes('Lantern Road') && found.message.includes('Ash Road')),
		'and the complaint names both roads',
		found?.message
	);

	// The same two labels are fine at *different* places: a note keyed on "road"
	// only fires where both are on offer.
	const apart = graph('start', [
		{
			id: 'start',
			ways: [
				['Lantern Road', 'middle'],
				['River', 'grave']
			]
		},
		{
			id: 'middle',
			ways: [
				['Ash Road', 'home'],
				['Volcano', 'grave']
			]
		},
		{ id: 'home', ending: 'SUCCESS' },
		{ id: 'grave', ending: 'FAILURE' }
	]);
	check(
		validateStory(apart, 'en').publishable,
		'the same two names apart are fine',
		problems(apart).join(', ')
	);

	const oneWay = graph('start', [
		{ id: 'start', ways: [['On', 'home']] },
		{ id: 'home', ending: 'SUCCESS' }
	]);
	check(problems(oneWay).includes('one-way'), 'a place with one road is refused');

	const noHome = graph('start', [
		{
			id: 'start',
			ways: [
				['Left', 'grave'],
				['Right', 'grave']
			]
		},
		{ id: 'grave', ending: 'FAILURE' }
	]);
	check(problems(noHome).includes('no-home'), 'a story with nowhere to get to is refused');

	const walledOff = graph('start', [
		{
			id: 'start',
			ways: [
				['Left', 'grave'],
				['Right', 'other']
			]
		},
		{ id: 'other', ways: [['Back', 'start']] },
		{ id: 'grave', ending: 'FAILURE' },
		{ id: 'home', ending: 'SUCCESS' }
	]);
	check(problems(walledOff).includes('home-unreachable'), 'a home no road reaches is refused');

	const talkativeEnding = graph('start', [
		{
			id: 'start',
			ways: [
				['Left', 'home'],
				['Right', 'grave']
			]
		},
		{ id: 'grave', ending: 'FAILURE', ways: [['Onward', 'home']] },
		{ id: 'home', ending: 'SUCCESS' }
	]);
	check(
		problems(talkativeEnding).includes('ending-has-exits'),
		'an ending with a road out of it is refused'
	);

	// And a warning is not a refusal: the wandering pocket from case 4 above is
	// odd but playable, and the author gets to decide.
	const pocket = graph('start', [
		{
			id: 'start',
			ways: [
				['Gate', 'home'],
				['Pocket', 'pocket']
			]
		},
		{
			id: 'pocket',
			ways: [
				['Deeper', 'deeper'],
				['Grave', 'grave']
			]
		},
		{
			id: 'deeper',
			ways: [
				['Back', 'pocket'],
				['Tomb', 'grave']
			]
		},
		{ id: 'grave', ending: 'FAILURE' },
		{ id: 'home', ending: 'SUCCESS' }
	]);
	const verdict = validateStory(pocket, 'en');
	check(
		verdict.publishable,
		'a pocket you can only wander in still publishes',
		problems(pocket).join(', ')
	);
	check(
		verdict.warnings.some((p) => p.code === 'no-way-home'),
		'but the author is warned about it'
	);
}

// --- 5. Identity: a colour means one player ------------------------------
//
// The whole design rests on a colour belonging to exactly one player for the
// length of a match. That is a rule, so it is asserted here rather than trusted
// to the picker that happens to be in front of it.
{
	check(
		PALETTE_SIZE >= MAX_PLAYERS,
		'there are at least as many colours as seats',
		`PALETTE_SIZE=${PALETTE_SIZE} MAX_PLAYERS=${MAX_PLAYERS}`
	);

	// The same rule one field over. `Game.freeCharacter()` walks the roster looking
	// for an unused index; with fewer characters than seats the last joiner would
	// silently double up on somebody else's figure — and a character now decides
	// how an agent reads its notes, so that is a duplicated *player*, not a
	// duplicated costume.
	check(
		CHARACTER_COUNT >= MAX_PLAYERS,
		'there are at least as many characters as seats',
		`CHARACTER_COUNT=${CHARACTER_COUNT} MAX_PLAYERS=${MAX_PLAYERS}`
	);

	const story = graph('start', [
		{
			id: 'start',
			ways: [
				['On', 'home'],
				['Off', 'grave']
			]
		},
		{ id: 'grave', ending: 'FAILURE' },
		{ id: 'home', ending: 'SUCCESS' }
	]);

	const game = new Game('TEST', story, 'en');
	for (let i = 0; i < MAX_PLAYERS; i++) game.addPlayer(`p${i}`, `P${i}`);
	const colours = game.players.map((p) => p.colour);
	check(
		new Set(colours).size === MAX_PLAYERS,
		'a full lobby is assigned distinct colours',
		colours.join(', ')
	);

	let refusedTaken = false;
	try {
		game.configure('p0', { colour: game.players[1].colour });
	} catch {
		refusedTaken = true;
	}
	check(refusedTaken, 'a colour another player holds is refused');

	game.configure('p0', { name: 'Renamed', character: 3 });
	check(game.players[0].name === 'Renamed', 'a name can be changed in the lobby');
	check(game.players[0].character === 3, 'so can a portrait');

	let refusedRange = false;
	try {
		game.configure('p0', { character: CHARACTER_COUNT });
	} catch {
		refusedRange = true;
	}
	check(refusedRange, 'a portrait outside the set is refused');

	game.startMatch();
	let refusedRunning = false;
	try {
		game.configure('p0', { name: 'Too late' });
	} catch {
		refusedRunning = true;
	}
	check(refusedRunning, 'and nothing can be reconfigured once the match is running');
}

// --- 6. A rematch keeps the people and forgets the land ------------------
//
// The dangerous half of `rematch` is the private half. Carrying `reveal` over
// would hand the second match the first match's fog — which is to say the
// answer — and it would do it silently, so this is the check that matters.
{
	const story = graph('start', [
		{
			id: 'start',
			ways: [
				['On', 'home'],
				['Off', 'grave']
			]
		},
		{ id: 'grave', ending: 'FAILURE' },
		{ id: 'home', ending: 'SUCCESS' }
	]);

	const game = playing(story);
	const before = game.players[0].colour;
	walk(game, 'On');
	game.endRound();
	// The phase the end overlay is shown in; `finish` is the runner's job.
	game.phase = 'over';

	check(
		game.foggedTree().edges.some((e) => e.state !== 'unknown'),
		'walking a road reveals it'
	);

	game.rematch();

	check(game.phase === 'lobby', 'a rematch puts the match back in the lobby');
	check(game.round === 0, 'and back to round zero');
	check(game.winnerIds.length === 0, 'with no winner');
	check(
		game.foggedTree().edges.every((e) => e.state === 'unknown'),
		'and every road is unknown again — the fog must not carry over'
	);
	check(
		game.players.every(
			(p) =>
				p.memory.length === 0 &&
				p.runs.length === 0 &&
				p.agent.bestDepth === 0 &&
				!p.sabotageUsed &&
				!p.ready
		),
		'every agent starts over knowing nothing'
	);
	check(game.players[0].colour === before, 'but everyone keeps who they were');
	check(game.players.length === 2, 'and nobody loses their seat');

	let startedAgain = true;
	try {
		game.startMatch();
	} catch {
		startedAgain = false;
	}
	check(startedAgain, 'and the match can simply be started again');
}

console.log(`\n  ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
