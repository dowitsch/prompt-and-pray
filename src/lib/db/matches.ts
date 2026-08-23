import { and, eq, inArray, notInArray } from 'drizzle-orm';
import { Game, type MatchState } from '../engine/game.ts';
import type {
	Agent,
	AgentStatus,
	ChoiceOutcome,
	Decision,
	MemoryLine,
	Player,
	RoundSummary,
	RunEnding,
	RunRecord,
	StoryGraph
} from '../engine/types.ts';
import { isLocale } from '../i18n/index.ts';
import type { Db } from './db.ts';
import * as t from './schema.ts';
import { loadStory } from './story.ts';

/**
 * Making a match survive a restart.
 *
 * A round's hot loop stays in memory — it is timers and beats, and putting
 * SQLite in that path would buy nothing. What is written through is the *result*
 * of every beat, at every point the clients are told something changed. So the
 * cost is one small transaction per event rather than per tick, and the worst a
 * crash can lose is the turn that was in flight.
 *
 * Restore is deliberately not resume: see `Game.restore`.
 */

/**
 * Match rows are small — four players, a page of memory, a couple of hundred
 * decisions — so the match, its players and their memory are rewritten whole
 * every time. Runs, decisions and the fog are append-only, and get insert-or-
 * ignore. There is no diffing anywhere, which is the point: a save cannot leave
 * the row set half-updated in a way nobody thought about.
 */
export function saveMatch(db: Db, game: Game): void {
	const state = game.exportState();
	const now = Date.now();

	db.transaction((tx) => {
		const story = tx
			.select({ id: t.stories.id })
			.from(t.stories)
			.where(eq(t.stories.slug, game.story.id))
			.get();
		if (!story) throw new Error(`Match ${game.code} plays unknown story "${game.story.id}".`);

		const match = tx
			.insert(t.matches)
			.values({
				code: game.code,
				storyId: story.id,
				locale: game.locale,
				phase: state.phase,
				round: state.round,
				teachingEndsAt: state.teachingEndsAt,
				hostPlayerId: state.hostId,
				paceScale: game.paceScale,
				winnerIds: state.winnerIds,
				lastSummary: state.lastSummary,
				previousDeaths: state.previousDeaths,
				startedAt: state.startedAt,
				createdAt: game.createdAt,
				updatedAt: now
			})
			.onConflictDoUpdate({
				target: t.matches.code,
				set: {
					phase: state.phase,
					round: state.round,
					teachingEndsAt: state.teachingEndsAt,
					hostPlayerId: state.hostId,
					paceScale: game.paceScale,
					winnerIds: state.winnerIds,
					lastSummary: state.lastSummary,
					previousDeaths: state.previousDeaths,
					startedAt: state.startedAt,
					updatedAt: now
				}
			})
			.returning({ id: t.matches.id })
			.get();

		/*
		 * Seats that are no longer in the match.
		 *
		 * Somebody leaving a lobby takes their seat with them and everyone behind
		 * them moves up one, and `match_players` is unique on (match, seat) — so
		 * without this the shuffled-up rows collide with the row of the player who
		 * left and the whole save throws. Their memory and runs cascade away.
		 *
		 * It has to happen before the upserts below for the same reason. Those then
		 * write seats in ascending order into space this has just freed.
		 */
		const seated = state.players.map((player) => player.id);
		tx.delete(t.matchPlayers)
			.where(
				seated.length
					? and(eq(t.matchPlayers.matchId, match.id), notInArray(t.matchPlayers.playerId, seated))
					: eq(t.matchPlayers.matchId, match.id)
			)
			.run();

		// How far each player's history is already written. Runs are immutable once
		// recorded, so without this watermark every beat of round thirty would
		// re-offer all thirty rounds of decisions to be conflict-ignored, and the
		// cost of a save would grow with the length of the match.
		const storedThrough = new Map<number, number>();
		for (const run of tx
			.select({ playerId: t.runs.matchPlayerId, round: t.runs.round })
			.from(t.runs)
			.all()) {
			storedThrough.set(run.playerId, Math.max(storedThrough.get(run.playerId) ?? 0, run.round));
		}

		for (const player of state.players) {
			const row = tx
				.insert(t.matchPlayers)
				.values({
					matchId: match.id,
					playerId: player.id,
					seat: player.seat,
					name: player.name,
					character: player.character,
					colour: player.colour,
					isBot: player.isBot,
					botSkill: player.botSkill ?? null,
					botSabotages: player.botSabotages ?? false,
					connected: player.connected,
					ready: player.ready,
					sabotageUsed: player.sabotageUsed,
					wasSabotaged: player.wasSabotaged,
					sabotagedThisRound: player.sabotagedThisRound,
					currentNodeId: Number(player.agent.currentNode),
					status: player.agent.status,
					depth: player.agent.depth,
					bestDepth: player.agent.bestDepth,
					pendingGrants: player.pendingGrants,
					runCount: player.runCount
				})
				.onConflictDoUpdate({
					target: [t.matchPlayers.matchId, t.matchPlayers.playerId],
					set: {
						// Both of these change *after* a player exists now: a seat moves up
						// when somebody ahead of them leaves the lobby, and a seat somebody
						// walked away from mid-match is taken over by a bot. Leaving either
						// out of the update set means a restart hands the match back with
						// the hole, or the departed human, still in it.
						seat: player.seat,
						isBot: player.isBot,
						botSkill: player.botSkill ?? null,
						botSabotages: player.botSabotages ?? false,
						name: player.name,
						character: player.character,
						colour: player.colour,
						connected: player.connected,
						ready: player.ready,
						sabotageUsed: player.sabotageUsed,
						wasSabotaged: player.wasSabotaged,
						sabotagedThisRound: player.sabotagedThisRound,
						currentNodeId: Number(player.agent.currentNode),
						status: player.agent.status,
						depth: player.agent.depth,
						bestDepth: player.agent.bestDepth,
						pendingGrants: player.pendingGrants,
						runCount: player.runCount
					}
				})
				.returning({ id: t.matchPlayers.id })
				.get();

			// Memory is rewritten whole: a line can be *overwritten* by a sabotage,
			// so it is not append-only and there is nothing to be gained by
			// pretending otherwise. It is at most a handful of rows.
			tx.delete(t.memoryLines).where(eq(t.memoryLines.matchPlayerId, row.id)).run();
			for (const [position, line] of player.memory.entries()) {
				tx.insert(t.memoryLines)
					.values({
						matchPlayerId: row.id,
						position,
						lineId: line.id,
						text: line.text,
						writtenOnRound: line.addedOnRun,
						sabotagedBy: line.sabotagedBy ?? null,
						sabotagedById: line.sabotagedById ?? null,
						originalText: line.originalText ?? null
					})
					.run();
			}

			const written = storedThrough.get(row.id) ?? 0;
			for (const run of player.runs) {
				if (run.index <= written) continue;

				const runRow = tx
					.insert(t.runs)
					.values({
						matchPlayerId: row.id,
						round: run.index,
						endedAtNodeId: Number(run.endedAt),
						ending: run.ending,
						survived: run.survived,
						depthReached: run.depthReached
					})
					.onConflictDoNothing()
					.returning({ id: t.runs.id })
					.get();

				// `get()` returns undefined when the conflict clause skipped the row,
				// which is exactly the "already recorded" case.
				if (!runRow) continue;

				for (const [step, decision] of run.decisions.entries()) {
					tx.insert(t.decisions)
						.values({
							runId: runRow.id,
							step,
							fromNodeId: Number(decision.nodeId),
							choiceId: Number(decision.choiceId),
							reasoning: decision.reasoning,
							outcome: decision.outcome,
							improvised: decision.improvised ?? false,
							atMs: decision.at
						})
						.onConflictDoNothing()
						.run();
				}
			}
		}

		// The fog: append-only, and public to the whole match.
		for (const nodeId of state.reveal.visitedNodes) {
			tx.insert(t.matchVisited)
				.values({ matchId: match.id, nodeId: Number(nodeId) })
				.onConflictDoNothing()
				.run();
		}
		for (const [choiceId, outcome] of Object.entries(state.reveal.takenChoices)) {
			tx.insert(t.matchReveals)
				.values({ matchId: match.id, choiceId: Number(choiceId), outcome })
				.onConflictDoUpdate({
					target: [t.matchReveals.matchId, t.matchReveals.choiceId],
					set: { outcome }
				})
				.run();
		}
	});
}

/** Forget a match entirely. Players, memory, runs and fog cascade away with it. */
export function deleteMatch(db: Db, code: string): void {
	db.delete(t.matches).where(eq(t.matches.code, code)).run();
}

/**
 * Rebuild every stored match.
 *
 * A story that has been deleted since takes its matches with it rather than
 * throwing — an unplayable match is worse than a missing one.
 */
export function loadMatches(db: Db): Game[] {
	const matchRows = db.select().from(t.matches).all();
	if (!matchRows.length) return [];

	const storyRows = db.select({ id: t.stories.id, slug: t.stories.slug }).from(t.stories).all();
	const slugById = new Map(storyRows.map((s) => [s.id, s.slug]));
	const graphs = new Map<string, StoryGraph>();

	const games: Game[] = [];

	for (const row of matchRows) {
		const slug = slugById.get(row.storyId);
		if (!slug) {
			console.warn(
				`[homeward] match ${row.code} plays a story that no longer exists — dropping it.`
			);
			deleteMatch(db, row.code);
			continue;
		}

		let graph = graphs.get(slug);
		if (!graph) {
			graph = loadStory(db, slug);
			graphs.set(slug, graph);
		}

		const players = loadPlayers(db, row.id, graph);
		// A match nobody is in is not worth restoring.
		if (!players.length) {
			deleteMatch(db, row.code);
			continue;
		}

		const game = new Game(row.code, graph, isLocale(row.locale) ? row.locale : 'en');
		game.paceScale = row.paceScale;
		game.restore({
			phase: row.phase as MatchState['phase'],
			round: row.round,
			teachingEndsAt: row.teachingEndsAt,
			hostId: row.hostPlayerId ?? players[0].id,
			winnerIds: row.winnerIds,
			startedAt: row.startedAt,
			lastSummary: (row.lastSummary as RoundSummary | null) ?? null,
			previousDeaths: (row.previousDeaths as Record<string, string> | null) ?? {},
			reveal: loadReveal(db, row.id),
			players
		});
		games.push(game);
	}

	return games;
}

function loadReveal(db: Db, matchId: number) {
	const visited = db
		.select({ nodeId: t.matchVisited.nodeId })
		.from(t.matchVisited)
		.where(eq(t.matchVisited.matchId, matchId))
		.all();

	const reveals = db
		.select({ choiceId: t.matchReveals.choiceId, outcome: t.matchReveals.outcome })
		.from(t.matchReveals)
		.where(eq(t.matchReveals.matchId, matchId))
		.all();

	return {
		visitedNodes: visited.map((v) => String(v.nodeId)),
		takenChoices: Object.fromEntries(
			reveals.map((r) => [String(r.choiceId), r.outcome as ChoiceOutcome])
		)
	};
}

function loadPlayers(db: Db, matchId: number, graph: StoryGraph): Player[] {
	const rows = db
		.select()
		.from(t.matchPlayers)
		.where(eq(t.matchPlayers.matchId, matchId))
		.all()
		.sort((a, b) => a.seat - b.seat);
	if (!rows.length) return [];

	const ids = rows.map((r) => r.id);
	const memory = db
		.select()
		.from(t.memoryLines)
		.where(inArray(t.memoryLines.matchPlayerId, ids))
		.all();
	const runRows = db.select().from(t.runs).where(inArray(t.runs.matchPlayerId, ids)).all();
	const decisionRows = runRows.length
		? db
				.select()
				.from(t.decisions)
				.where(
					inArray(
						t.decisions.runId,
						runRows.map((r) => r.id)
					)
				)
				.all()
		: [];

	// Choice and node labels are not stored on a decision — they belong to the
	// story, and looking them up keeps one copy of the truth.
	const choiceById = new Map<string, { label: string }>();
	for (const node of Object.values(graph.nodes)) {
		for (const choice of node.choices) choiceById.set(choice.id, choice);
	}

	return rows.map((row) => {
		const runs: RunRecord[] = runRows
			.filter((r) => r.matchPlayerId === row.id)
			.sort((a, b) => a.round - b.round)
			.map((r) => ({
				index: r.round,
				endedAt: String(r.endedAtNodeId),
				ending: r.ending as RunEnding,
				survived: r.survived,
				depthReached: r.depthReached,
				decisions: decisionRows
					.filter((d) => d.runId === r.id)
					.sort((a, b) => a.step - b.step)
					.map((d): Decision => ({
						nodeId: String(d.fromNodeId),
						nodeTitle: graph.nodes[String(d.fromNodeId)]?.title ?? '',
						choiceId: String(d.choiceId),
						choiceLabel: choiceById.get(String(d.choiceId))?.label ?? '',
						reasoning: d.reasoning,
						outcome: d.outcome as ChoiceOutcome,
						improvised: d.improvised,
						at: d.atMs
					}))
			}));

		const agent: Agent = {
			currentNode: String(row.currentNodeId ?? graph.startNode),
			status: row.status as AgentStatus,
			decisions: runs.at(-1)?.decisions ?? [],
			depth: row.depth,
			bestDepth: row.bestDepth,
			thinking: false
		};

		return {
			id: row.playerId,
			name: row.name,
			seat: row.seat,
			character: row.character,
			colour: row.colour,
			isBot: row.isBot,
			botSkill: (row.botSkill as Player['botSkill']) ?? undefined,
			botSabotages: row.botSabotages,
			// Nobody is connected until they say so; a human who never comes back
			// must not hold the next round up forever.
			connected: row.isBot,
			ready: row.ready,
			memory: memory
				.filter((m) => m.matchPlayerId === row.id)
				.sort((a, b) => a.position - b.position)
				.map((m): MemoryLine => ({
					id: m.lineId,
					text: m.text,
					addedOnRun: m.writtenOnRound,
					sabotagedBy: m.sabotagedBy ?? undefined,
					sabotagedById: m.sabotagedById ?? undefined,
					originalText: m.originalText ?? undefined
				})),
			agent,
			runCount: row.runCount,
			runs,
			sabotageUsed: row.sabotageUsed,
			wasSabotaged: row.wasSabotaged,
			sabotagedThisRound: row.sabotagedThisRound,
			pendingGrants: row.pendingGrants
		};
	});
}
