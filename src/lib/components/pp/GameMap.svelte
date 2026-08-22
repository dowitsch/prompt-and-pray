<script lang="ts">
	/**
	 * The land, and the one road being walked across it.
	 *
	 * What changed, and why: this used to draw the whole story graph — every
	 * place as a ring, every road as a line, the unwalked ones dashed. That is a
	 * diagram of a finite puzzle, and it tells the player exactly how small the
	 * world is. Now nothing is drawn until someone has walked it. The roads the
	 * table has worn in stay as faint tracks, the agent on screen lays a bright
	 * one behind it, and at each place the ways out are short stubs that dissolve
	 * into fog a few paces on. The land itself is endless in every direction, so
	 * the options can be believed to be endless too.
	 *
	 * Everything that lives in the world is drawn by Pixi in one scene graph:
	 * ground, roads, places, tokens, labels. That is not a preference — a canvas
	 * ground under a CSS-transformed overlay composites a frame apart under load,
	 * and an avatar sliding off its own road is the sort of fault that never shows
	 * up in review. One transform, one frame, no class of bug. Screen-space chrome
	 * (the phase bar, the story panel, the roster) stays in the DOM above us.
	 *
	 * What is drawn is still only the *fogged* graph: names and whether a road
	 * kills arrive as agents discover them, so the solution is not sitting in the
	 * browser waiting to be read out of a dev console.
	 */
	/*
	 * Every Map and Set below is either a local built inside a `$derived`, or part
	 * of the deliberately non-reactive registry of live Pixi objects described
	 * further down. Making any of them reactive is precisely the bug this file is
	 * arranged to avoid: the effect that owns the renderer would then re-run on
	 * every camera nudge and tear it down mid-walk.
	 */
	/* eslint-disable svelte/prefer-svelte-reactivity */
	import type { Application, Container, Mesh, Sprite, Text, Texture } from 'pixi.js';
	import type { FoggedEdge, FoggedTree } from '$lib/engine/fog';
	import type { PublicPlayer } from '$lib/engine/game';
	import type { Effect, Step } from '$lib/client/connection.svelte';
	import { characterOf, characterSrc, colorOf } from '$lib/client/identity';
	import { ACCENT } from '$lib/client/theme';
	import { glow, roadFade, roadStrip, vignette } from '$lib/map/paint';
	import { SECTION_H, SECTION_W, TEX_H, TEX_W } from '$lib/map/terrain';
	import type { FromWorker, ToWorker } from '$lib/map/worker';
	import {
		hashOf,
		measure,
		meander,
		pointAt,
		prefix,
		roadPolyline,
		seedOf,
		type Point
	} from '$lib/map/road';

	type Props = {
		tree: FoggedTree;
		players: PublicPlayer[];
		youId: string | null;
		effects: Effect[];
		/** The step being walked right now, if any. Drives the road growing. */
		step?: Step | null;
		/** Multiplies every beat, mirroring the server's own pace dial. */
		paceScale?: number;
		/** Whose token the camera sits on. Falls back to you. */
		focusId?: string | null;
		/** Agents whose turn has not come yet stay off the board. */
		hiddenIds?: string[];
	};

	let {
		tree,
		players,
		youId,
		effects,
		step = null,
		paceScale = 1,
		focusId = null,
		hiddenIds = []
	}: Props = $props();

	/* ------------------------------------------------------------- constants */

	/**
	 * Pixels per world unit. Fixed — the map never zooms during play.
	 *
	 * The authored graph steps 150 units between rows, so this puts one step at
	 * about 240px: a decision costs most of the clear band above the story panel,
	 * and roughly two steps of country are in frame at once. The old board drew
	 * the same step at 93px because it had a whole tree to fit; nothing has to fit
	 * any more, so this is set by how much land reads well rather than by extent.
	 *
	 * Everything else in the scene is authored in screen pixels and divided by
	 * this, so tokens, pins and labels hold their size when it changes — the one
	 * number to turn to reframe the map.
	 */
	const SCALE = 1.5;

	/**
	 * Where the watched token sits vertically, as a fraction of the frame.
	 *
	 * The story panel covers the bottom 40% of the screen, so centring the token
	 * would bury it. This keeps it in the clear band with the road it is walking
	 * towards still visible below.
	 */
	const EYE_Y = 0.34;

	/** Screen-pixel sizes, converted to world units at build time. */
	const TOKEN_PX = 52;
	const PIN_PX = 22;
	// The bright core is the middle 40% of the strip; the rest is the dark casing
	// that keeps a road legible on pale ground. So these are wider than the road
	// you actually see, by design.
	const ROAD_PX = 15;
	const TRAIL_PX = 20;
	const STUB_PX = 13;

	/**
	 * How far a signpost stub reaches before the fog takes it.
	 *
	 * One fixed length for every way out, not a fraction of the road. A fraction
	 * was the first attempt and it was wrong twice over: it made the fan visibly
	 * lopsided — stubs to distant places were more than twice as long as stubs to
	 * near ones — and, worse, it leaked. The length of a stub would have told the
	 * player how far away a place is that nobody has been to yet, which is exactly
	 * what the fog exists to withhold.
	 *
	 * In screen pixels rather than world units so the fan keeps its proportions
	 * if the map is reframed. The story panel covers everything below 52%, which
	 * leaves the fan about 150px of clear band to live in.
	 */
	const STUB_LEN = 110 / SCALE;

	/** Never more than this much of a road, so a stub cannot reach its far end. */
	const STUB_MAX = 0.4;

	/** Camera ease, and the walk beats. Mirrors the runner's own pace table. */
	const CAMERA_MS = 620;
	const DECIDE_MS = 1000;
	const WALK_MS = 950;
	const RETRACE_WALK_MS = 420;
	const STUB_GROW_MS = 380;
	const STUB_STAGGER_MS = 90;

	const LETHAL = 0x7b4a5f;
	/**
	 * The same verdict, said in ink rather than in road.
	 *
	 * `LETHAL` is a dark plum that reads correctly as a road on the ground and is
	 * near-illegible as 13px text on it. The label needs the same meaning at a
	 * contrast a phone can actually resolve.
	 */
	const LETHAL_INK = 0xd08fa6;
	const WORN = 0xcbb9a8;

	/** The design system speaks in '#rrggbb'; Pixi speaks in numbers. */
	const hex = (colour: string) => Number.parseInt(colour.slice(1), 16);

	/* ------------------------------------------------- what there is to draw */

	const seed = $derived(seedOf(tree.mapName, tree.startNode));
	const placeAt = $derived(meander(tree.nodes, seed));
	const nodeById = $derived(new Map(tree.nodes.map((n) => [n.id, n])));
	const edgeById = $derived(new Map(tree.edges.map((e) => [e.choiceId, e])));

	const shown = $derived(players.filter((p) => !hiddenIds.includes(p.id)));
	const watched = $derived(
		shown.find((p) => p.id === focusId) ?? shown.find((p) => p.id === youId) ?? shown[0] ?? null
	);

	/** Every road anyone has ever walked, this match. Faint tracks. */
	const worn = $derived(tree.edges.filter((e) => e.state !== 'unknown'));

	/** The watched agent's run so far, in the order it walked it. */
	const trail = $derived(watched?.agent.decisions.map((d) => d.choiceId) ?? []);

	/**
	 * The step in flight belongs to the map only while the agent walking it is
	 * the one on screen — otherwise a rival's move would grow a road under the
	 * camera of the agent you are actually watching.
	 */
	const walking = $derived(step && watched && step.playerId === watched.id ? step : null);

	/**
	 * The ways out of where the watched agent stands.
	 *
	 * A label arrives only once an agent has stood at the place and seen the
	 * signposts, which is exactly the arrival beat. The road being walked is left
	 * out: it has stopped being an option and become the trail.
	 */
	const stubs = $derived.by(() => {
		const here = watched?.agent.currentNode;
		if (!here || watched?.agent.status !== 'running') return [] as FoggedEdge[];
		return tree.edges.filter(
			(e) => e.from === here && e.label !== null && e.choiceId !== walking?.choiceId
		);
	});

	/** Places worth drawing: the ones a drawn road touches, plus start and home. */
	const places = $derived.by(() => {
		const ids = new Set<string>([tree.startNode, ...tree.homeNodes]);
		for (const edge of worn) {
			ids.add(edge.from);
			ids.add(edge.to);
		}
		for (const edge of stubs) ids.add(edge.from);
		for (const player of shown) ids.add(player.agent.currentNode);
		return [...ids].map((id) => nodeById.get(id)).filter((n) => n !== undefined);
	});

	/* ------------------------------------------------------------ pixi state */

	let host: HTMLDivElement;

	/**
	 * Values Pixi owns — deliberately NOT `$state`.
	 *
	 * If the effect that builds the app could read them, every camera nudge would
	 * re-run it and tear the whole renderer down. The only reactive mirror is
	 * `ready`, which flips once and never again.
	 */
	let PIXI: typeof import('pixi.js') | undefined;
	let app: Application | undefined;
	let world: Container | undefined;
	let layers:
		Record<'ground' | 'roads' | 'beacon' | 'places' | 'tokens' | 'labels', Container> | undefined;
	let screen: Container | undefined;
	let tex: Record<'road' | 'fade' | 'glow' | 'vignette', Texture> | undefined;

	let ready = $state(false);
	let failed = $state(false);

	/**
	 * Live views, keyed so a redraw reconciles instead of rebuilding the world.
	 *
	 * A rope owns the point array it was built from and mutating that array in
	 * place is what moves it, so the array is held here rather than read back off
	 * the mesh. `width` is fixed at construction, so a road that changes weight
	 * has to be rebuilt — rare enough (only when the spotlight moves) to be
	 * cheaper than carrying two ropes per road.
	 */
	type RoadView = { rope: Mesh; pts: Point[]; k: number; width: number };
	const roadViews = new Map<string, RoadView>();
	const stubViews = new Map<
		string,
		{ rope: Mesh; pts: Point[]; k: number; label: Text; born: number }
	>();
	const placeViews = new Map<string, Container>();
	const tokenViews = new Map<string, Container>();
	const flashViews = new Map<number, { view: Sprite; born: number }>();

	/** Road polylines, cached: the geometry cannot change inside a match. */
	const roads = new Map<string, { points: Point[]; lengths: ReturnType<typeof measure> }>();

	/** Ground sections, keyed 'sx,sy'. */
	const ground = new Map<string, Sprite>();
	/** Sections asked for and not yet answered, so nothing is requested twice. */
	const pending = new Set<string>();
	let terrain: Worker | undefined;
	let terrainSeq = 0;

	let camera = { x: 0, y: 0 };
	/** Where the ground was last reconciled, so it is not recomputed every frame. */
	let streamedAt = { x: Infinity, y: Infinity };
	let cameraFrom = { x: 0, y: 0 };
	let cameraTo = { x: 0, y: 0 };
	let cameraElapsed = CAMERA_MS;

	/** The walk in flight: which road, how far along, and how long it gets. */
	let walk: { choiceId: string; elapsed: number; hold: number; span: number } | null = null;
	let walkedStepId = -1;

	let clock = 0;

	/* ----------------------------------------------------------------- roads */

	function roadFor(edge: FoggedEdge) {
		const hit = roads.get(edge.choiceId);
		if (hit) return hit;

		const from = placeAt.get(edge.from);
		const to = placeAt.get(edge.to);
		if (!from || !to) return null;

		// A road that leads back to where it started has no direction to bow
		// along; give it a small loop so it reads as a road rather than a dot.
		const points =
			Math.hypot(to.x - from.x, to.y - from.y) < 1
				? loop(from, edge.choiceId)
				: roadPolyline(from, to, edge.choiceId);

		const built = { points, lengths: measure(points) };
		roads.set(edge.choiceId, built);
		return built;
	}

	function loop(at: Point, choiceId: string): Point[] {
		const r = 34;
		const turn = (hashOf(choiceId, 'loop') % 360) * (Math.PI / 180);
		const points: Point[] = [];
		for (let i = 0; i <= 28; i++) {
			const t = (i / 28) * Math.PI * 2;
			points.push({
				x: at.x + Math.sin(t) * r * Math.cos(turn) - (1 - Math.cos(t)) * r * Math.sin(turn),
				y: at.y + Math.sin(t) * r * Math.sin(turn) + (1 - Math.cos(t)) * r * Math.cos(turn)
			});
		}
		return points;
	}

	/**
	 * A road as a rope: a strip texture bent along the line the road takes.
	 *
	 * The `width` constructor option cannot be used, and the reason is worth
	 * writing down. `MeshRope._render` runs this every frame:
	 *
	 *     if (this.autoUpdate || geometry._width !== this.texture.height) {
	 *         geometry._width = this.texture.height;
	 *
	 * so with `autoUpdate` on — which is exactly what makes a growing road
	 * possible — the width you asked for is overwritten with the texture's height
	 * on the first frame. The only width a rope will hold is `texture.height`.
	 *
	 * So the rope is built in its own units and scaled *uniformly*: points divided
	 * by `k` going in, `scale` of `k` coming out. Position survives the round trip
	 * exactly, and the thickness lands where it was asked to. Scaling one axis —
	 * the obvious shortcut — would squash the path itself and drag the road off
	 * the places it is meant to join.
	 */
	function makeRope(points: readonly Point[], texture: Texture, width: number) {
		const k = width / texture.height;
		const pts = points.map((p) => ({ x: p.x / k, y: p.y / k }));
		const rope = new PIXI!.MeshRope({
			texture,
			points: pts,
			// 0 stretches one copy of the texture over the whole rope, which is what
			// gives a stub its fade. A road's strip is uniform along its length, so
			// stretching costs it nothing either way.
			textureScale: 0
		});
		rope.scale.set(k);
		return { rope, pts: pts as Point[], k };
	}

	/**
	 * Move a rope onto a new line.
	 *
	 * The point array is fixed in length once the geometry exists, so a road that
	 * is only part-drawn collapses its spare points onto the head. Those segments
	 * contribute no length, so the texture still stretches across just the part
	 * that is actually there. `autoUpdate` picks the change up on the next frame.
	 */
	function ropePoints(view: { pts: Point[]; k: number }, points: readonly Point[]) {
		for (let i = 0; i < view.pts.length; i++) {
			const p = points[Math.min(i, points.length - 1)];
			view.pts[i].x = p.x / view.k;
			view.pts[i].y = p.y / view.k;
		}
	}

	/* --------------------------------------------------------------- scenery */

	function makePlace(kind: string, title: string | null) {
		const place = new PIXI!.Container();
		const r = PIN_PX / SCALE / 2;

		if (kind === 'home') {
			const cross = new PIXI!.Graphics();
			const arm = r * 2.6;
			const thick = r * 0.5;
			cross
				.rect(-arm / 2, -thick / 2, arm, thick)
				.fill({ color: 0xf6d9a0 })
				.rect(-thick / 2, -arm / 2, thick, arm)
				.fill({ color: 0xf6d9a0 });
			cross.rotation = Math.PI / 4;
			place.addChild(cross);
		} else {
			const colour = kind === 'death' ? LETHAL : 0xf2e8d5;
			const disc = new PIXI!.Graphics()
				.circle(0, 0, r)
				.fill({ color: 0x1c1f22, alpha: 0.62 })
				.circle(0, 0, r)
				.stroke({ color: colour, width: 2 / SCALE });
			place.addChild(disc);

			if (kind === 'death') {
				const mark = new PIXI!.Graphics();
				const d = r * 0.46;
				mark
					.moveTo(-d, -d)
					.lineTo(d, d)
					.moveTo(d, -d)
					.lineTo(-d, d)
					.stroke({ color: LETHAL, width: 2.4 / SCALE });
				place.addChild(mark);
			}
		}

		if (title) {
			const label = new PIXI!.Text({
				text: title,
				style: {
					fontFamily: 'Inter, system-ui, sans-serif',
					fontSize: 12,
					fontWeight: '600',
					fill: 0xf2e8d5,
					align: 'center',
					// The ground behind a label is whatever the terrain happens to be
					// doing, so the contrast has to come with the text.
					stroke: { color: 0x14161a, width: 3, join: 'round' }
				},
				resolution: 2
			});
			// Above the pin, and clear of the token: a name written underneath sits
			// exactly where the agent standing there is drawn.
			label.anchor.set(0.5, 1);
			label.scale.set(1 / SCALE);
			label.position.set(0, -(TOKEN_PX / 2 + 7) / SCALE);
			label.alpha = 0.9;
			place.addChild(label);
		}

		return place;
	}

	function makeToken(player: PublicPlayer) {
		const token = new PIXI!.Container();
		const r = TOKEN_PX / SCALE / 2;
		const colour = hex(colorOf(player));

		const ring = new PIXI!.Graphics()
			.circle(0, 0, r)
			.fill({ color: 0x1c1f22 })
			.circle(0, 0, r)
			.fill({ color: colour, alpha: 0.28 })
			.circle(0, 0, r)
			.stroke({ color: player.id === youId ? 0xffffff : colour, width: 3 / SCALE });
		token.addChild(ring);

		// The portrait may genuinely not be there yet, exactly as in `Avatar`.
		// The ring underneath is the fallback, so a miss needs no other handling.
		const portrait = new PIXI!.Sprite();
		portrait.anchor.set(0.5);
		portrait.alpha = 0;
		token.addChild(portrait);

		PIXI!.Assets.load(characterSrc(characterOf(player)))
			.then((texture: Texture) => {
				if (portrait.destroyed) return;
				portrait.texture = texture;
				portrait.setSize(r * 1.86, r * 1.86);
				portrait.alpha = 1;
			})
			.catch(() => {
				/* No portrait shipped for this seat; the ring stands in. */
			});

		return token;
	}

	/* ------------------------------------------------------------ the redraw */

	/**
	 * Push the derived model into the scene graph.
	 *
	 * Reconciles by key rather than rebuilding: a step changes one road and one
	 * token, and tearing down thirty meshes to redraw twenty-nine identical ones
	 * would throw away their GPU buffers every beat.
	 */
	function sync() {
		if (!app || !PIXI || !layers || !tex) return;

		const wantRoads = new Map<string, { edge: FoggedEdge; bright: boolean }>();
		for (const edge of worn) wantRoads.set(edge.choiceId, { edge, bright: false });
		for (const choiceId of trail) {
			const edge = edgeById.get(choiceId);
			if (edge) wantRoads.set(choiceId, { edge, bright: true });
		}
		if (walking) {
			const edge = edgeById.get(walking.choiceId);
			if (edge) wantRoads.set(walking.choiceId, { edge, bright: true });
		}

		const tint = hex(watched ? colorOf(watched) : ACCENT);

		for (const [choiceId, { edge, bright }] of wantRoads) {
			const road = roadFor(edge);
			if (!road) continue;

			const width = (bright ? TRAIL_PX : ROAD_PX) / SCALE;
			let view = roadViews.get(choiceId);
			if (view && view.width !== width) {
				view.rope.destroy();
				roadViews.delete(choiceId);
				view = undefined;
			}
			if (!view) {
				const built = makeRope(road.points, tex.road, width);
				view = { ...built, width };
				roadViews.set(choiceId, view);
				layers.roads.addChild(view.rope);
			}

			// A road being walked is drawn only as far as the walker has got.
			if (walk && walk.choiceId === choiceId) {
				const grown = walk.elapsed <= walk.hold ? 0 : (walk.elapsed - walk.hold) / walk.span;
				ropePoints(view, prefix(road.points, road.lengths, Math.min(1, Math.max(0.001, grown))));
			} else {
				ropePoints(view, road.points);
			}

			view.rope.tint = edge.state === 'lethal' ? LETHAL : bright ? tint : WORN;
			view.rope.alpha = bright ? 0.95 : 0.34;
			view.rope.zIndex = bright ? 2 : 1;
		}

		for (const [choiceId, view] of roadViews) {
			if (wantRoads.has(choiceId)) continue;
			view.rope.destroy();
			roadViews.delete(choiceId);
		}
		layers.roads.sortChildren();

		syncStubs();
		syncPlaces();
		syncTokens();
		syncBeacon();
	}

	/** The stub's share of one particular road. */
	function stubReach(lengths: { total: number }) {
		return Math.min(STUB_MAX, STUB_LEN / Math.max(1, lengths.total));
	}

	function syncStubs() {
		if (!PIXI || !layers || !tex) return;

		const want = new Set(stubs.map((e) => e.choiceId));
		let index = 0;

		for (const edge of stubs) {
			const road = roadFor(edge);
			if (!road) continue;

			const reach = stubReach(road.lengths);
			let view = stubViews.get(edge.choiceId);
			if (!view) {
				const points = prefix(road.points, road.lengths, reach);
				const built = makeRope(points, tex.fade, STUB_PX / SCALE);
				built.rope.alpha = 0;

				const label = new PIXI!.Text({
					text: edge.label ?? '',
					style: {
						fontFamily: 'Inter, system-ui, sans-serif',
						fontSize: 13,
						fontWeight: '600',
						fill: 0xffffff,
						align: 'center',
						stroke: { color: 0x14161a, width: 3.5, join: 'round' },
						wordWrap: true,
						wordWrapWidth: 130
					},
					resolution: 2
				});
				label.anchor.set(0.5);
				label.scale.set(1 / SCALE);
				label.alpha = 0;

				const tip = pointAt(road.points, road.lengths, reach * 1.22);
				label.position.set(tip.x, tip.y);

				layers.roads.addChild(built.rope);
				layers.labels.addChild(label);
				view = { ...built, label, born: clock + index * STUB_STAGGER_MS };
				stubViews.set(edge.choiceId, view);
			}

			view.rope.tint = edge.state === 'lethal' ? LETHAL : 0xe8dcc8;
			view.label.style.fill = edge.state === 'lethal' ? LETHAL_INK : 0xf4ecdd;
			view.rope.zIndex = 3;
			index++;
		}

		for (const [choiceId, view] of stubViews) {
			if (want.has(choiceId)) continue;
			view.rope.destroy();
			view.label.destroy();
			stubViews.delete(choiceId);
		}
	}

	function syncPlaces() {
		if (!layers) return;
		const want = new Set(places.map((n) => n.id));

		for (const node of places) {
			const at = placeAt.get(node.id);
			if (!at) continue;

			let view = placeViews.get(node.id);
			const kind = tree.homeNodes.includes(node.id) ? 'home' : node.kind;
			// A place changes appearance exactly once, when it stops being unknown.
			if (view && view.label !== kind) {
				view.destroy({ children: true });
				placeViews.delete(node.id);
				view = undefined;
			}
			if (!view) {
				view = makePlace(kind, node.title);
				view.label = kind;
				placeViews.set(node.id, view);
				layers.places.addChild(view);
			}
			view.position.set(at.x, at.y);
		}

		for (const [id, view] of placeViews) {
			if (want.has(id)) continue;
			view.destroy({ children: true });
			placeViews.delete(id);
		}
	}

	function syncTokens() {
		if (!layers || !app) return;

		// Only the agent on screen is guaranteed a token. A rival standing in
		// unrendered fog is noise; one inside the frame is worth seeing.
		const want = shown.filter((p) => {
			if (p.id === watched?.id) return true;
			const at = placeAt.get(p.agent.currentNode);
			if (!at) return false;
			return onScreen(at);
		});
		const wantIds = new Set(want.map((p) => p.id));

		for (const player of want) {
			let view = tokenViews.get(player.id);
			if (!view) {
				view = makeToken(player);
				tokenViews.set(player.id, view);
				layers.tokens.addChild(view);
			}
			view.alpha = player.agent.status === 'dead' ? 0.4 : 1;

			// The watched agent is placed by the walk; everyone else stands still.
			if (player.id !== watched?.id || !walk) {
				const at = placeAt.get(player.agent.currentNode);
				if (at) view.position.set(at.x, at.y);
			}
		}

		for (const [id, view] of tokenViews) {
			if (wantIds.has(id)) continue;
			view.destroy({ children: true });
			tokenViews.delete(id);
		}
	}

	function syncBeacon() {
		if (!layers || !PIXI || !tex) return;
		if (layers.beacon.children.length) return;

		// Home is the one thing never under fog: you always know which way you are
		// walking, never which road gets you there.
		for (const id of tree.homeNodes) {
			const at = placeAt.get(id);
			if (!at) continue;
			const light = new PIXI.Sprite(tex.glow);
			light.anchor.set(0.5);
			// Wide and faint: it has to be a glow on the horizon from a long way
			// off, not a lamp you only notice once you are standing under it.
			light.setSize(760, 760);
			light.tint = 0xf6d9a0;
			light.alpha = 0.24;
			light.position.set(at.x, at.y);
			light.blendMode = 'add';
			layers.beacon.addChild(light);
		}
	}

	/**
	 * Is there a WebGL context to be had?
	 *
	 * Asked before Pixi is started, and the answer is load-bearing rather than
	 * cautious. `autoDetectRenderer` falls back WebGL -> Canvas on its own, but
	 * v8's `CanvasRenderer` ships no mesh pipe, and every road on this map is a
	 * `MeshRope`. So the fallback does not degrade — it builds a renderer that
	 * accepts the scene and then throws `validateRenderable` of undefined on the
	 * first frame, from inside the ticker where the init try/catch cannot reach.
	 *
	 * Better to decline up front: the CSS ground below shows through, the story
	 * panel carries the round, and the live region still says where the agent is
	 * and what its choices are.
	 */
	function hasWebGL() {
		try {
			const probe = document.createElement('canvas');
			return Boolean(probe.getContext('webgl2') ?? probe.getContext('webgl'));
		} catch {
			return false;
		}
	}

	function onScreen(at: Point) {
		if (!app) return false;
		const x = at.x * SCALE + camera.x;
		const y = at.y * SCALE + camera.y;
		const pad = 80;
		return x > -pad && x < app.screen.width + pad && y > -pad && y < app.screen.height + pad;
	}

	/* ---------------------------------------------------------------- ground */

	const sectionKey = (sx: number, sy: number) => `${sx},${sy}`;

	/**
	 * Ask for every section the viewport touches, and drop the ones it has left.
	 *
	 * Derived from the camera rather than from a fixed ring around the walker:
	 * the frame is portrait and the section is square, so the number of sections
	 * on screen differs by axis, and a phone in a browser window can be any size
	 * at all. One section of margin means the next one is usually already there
	 * by the time the camera reaches it.
	 */
	function streamGround() {
		if (!terrain || !app || !layers || !PIXI) return;

		const left = -camera.x / SCALE;
		const top = -camera.y / SCALE;
		const right = left + app.screen.width / SCALE;
		const bottom = top + app.screen.height / SCALE;

		const x0 = Math.floor(left / SECTION_W) - 1;
		const x1 = Math.floor(right / SECTION_W) + 1;
		const y0 = Math.floor(top / SECTION_H) - 1;
		const y1 = Math.floor(bottom / SECTION_H) + 1;

		const keep = new Set<string>();
		for (let sy = y0; sy <= y1; sy++) {
			for (let sx = x0; sx <= x1; sx++) {
				const k = sectionKey(sx, sy);
				keep.add(k);
				if (ground.has(k) || pending.has(k)) continue;
				pending.add(k);
				send({ type: 'section', id: ++terrainSeq, sx, sy });
			}
		}

		for (const [k, sprite] of ground) {
			if (keep.has(k)) continue;
			// The texture goes with it: a section that scrolls off is regenerated
			// from the seed if it is ever needed again, and holding every one ever
			// visited would grow without bound for a match that keeps walking.
			sprite.destroy({ texture: true, textureSource: true });
			ground.delete(k);
		}
	}

	function send(message: ToWorker) {
		terrain?.postMessage(message);
	}

	function receive(event: MessageEvent<FromWorker>) {
		if (!PIXI || !layers || !app) return;
		const message = event.data;

		if (message.type === 'ready') {
			streamGround();
			return;
		}

		// The textures finished downloading, so everything drawn so far is flat
		// colour. Throw it away and ask again; it is a few sections, once.
		if (message.type === 'dressed') {
			for (const sprite of ground.values()) {
				sprite.destroy({ texture: true, textureSource: true });
			}
			ground.clear();
			pending.clear();
			streamGround();
			return;
		}

		const k = sectionKey(message.sx, message.sy);
		pending.delete(k);
		// It may have scrolled out of view while the worker was busy with it.
		if (!wanted(message.sx, message.sy)) return;

		const source =
			'bitmap' in message
				? message.bitmap
				: (() => {
						const canvas = document.createElement('canvas');
						canvas.width = TEX_W;
						canvas.height = TEX_H;
						canvas
							.getContext('2d')!
							.putImageData(new ImageData(message.pixels, TEX_W, TEX_H), 0, 0);
						return canvas;
					})();

		const texture = PIXI.Texture.from(source);
		// Linear, so the ground softens as it scales up rather than going blocky.
		texture.source.scaleMode = 'linear';

		const sprite = new PIXI.Sprite(texture);
		sprite.setSize(SECTION_W, SECTION_H);
		sprite.position.set(message.sx * SECTION_W, message.sy * SECTION_H);
		layers.ground.addChild(sprite);
		ground.set(k, sprite);
	}

	function wanted(sx: number, sy: number) {
		if (!app) return false;
		const left = -camera.x / SCALE - SECTION_W;
		const top = -camera.y / SCALE - SECTION_H;
		const right = left + app.screen.width / SCALE + SECTION_W * 2;
		const bottom = top + app.screen.height / SCALE + SECTION_H * 2;
		const x = sx * SECTION_W;
		const y = sy * SECTION_H;
		return x + SECTION_W > left && x < right && y + SECTION_H > top && y < bottom;
	}

	/* ---------------------------------------------------------------- camera */

	/** Where the board must sit for `at` to land on the eyeline. */
	function frame(at: Point) {
		if (!app) return { x: 0, y: 0 };
		return {
			x: app.screen.width / 2 - at.x * SCALE,
			y: app.screen.height * EYE_Y - at.y * SCALE
		};
	}

	function lookAt(at: Point, immediate = false) {
		const target = frame(at);
		if (immediate) {
			camera = { ...target };
			cameraFrom = { ...target };
			cameraTo = { ...target };
			cameraElapsed = CAMERA_MS;
			return;
		}
		if (Math.abs(target.x - cameraTo.x) < 0.5 && Math.abs(target.y - cameraTo.y) < 0.5) return;
		cameraFrom = { ...camera };
		cameraTo = target;
		cameraElapsed = 0;
	}

	/* ----------------------------------------------------------- the ticker */

	function tick(deltaMS: number) {
		if (!world || !app) return;
		clock += deltaMS;

		if (walk) {
			walk.elapsed += deltaMS;
			const road = roads.get(walk.choiceId);
			if (road) {
				const grown = walk.elapsed <= walk.hold ? 0 : (walk.elapsed - walk.hold) / walk.span;
				const at = pointAt(road.points, road.lengths, Math.min(1, grown));

				const view = roadViews.get(walk.choiceId);
				if (view) {
					ropePoints(view, prefix(road.points, road.lengths, Math.min(1, Math.max(0.001, grown))));
				}

				const token = watched ? tokenViews.get(watched.id) : undefined;
				if (token) token.position.set(at.x, at.y);
				lookAt(at, true);
			}
			if (walk.elapsed >= walk.hold + walk.span) walk = null;
		}

		if (cameraElapsed < CAMERA_MS) {
			cameraElapsed = Math.min(CAMERA_MS, cameraElapsed + deltaMS);
			const p = cameraElapsed / CAMERA_MS;
			const eased = 1 - Math.pow(1 - p, 3);
			camera = {
				x: cameraFrom.x + (cameraTo.x - cameraFrom.x) * eased,
				y: cameraFrom.y + (cameraTo.y - cameraFrom.y) * eased
			};
		}

		// Whole pixels: a rope and a sprite rounded differently show as a seam.
		world.position.set(Math.round(camera.x), Math.round(camera.y));

		// Checking the section grid every frame would be a set of allocations 60
		// times a second for a question whose answer changes about once a walk.
		if (Math.hypot(camera.x - streamedAt.x, camera.y - streamedAt.y) > SECTION_W * SCALE * 0.25) {
			streamedAt = { ...camera };
			streamGround();
		}

		for (const [choiceId, view] of stubViews) {
			const age = clock - view.born;
			const p = Math.max(0, Math.min(1, age / STUB_GROW_MS));
			const eased = 1 - Math.pow(1 - p, 3);
			const road = roads.get(choiceId);
			if (road) {
				const reach = stubReach(road.lengths);
				ropePoints(view, prefix(road.points, road.lengths, Math.max(0.001, reach * eased)));
			}
			view.rope.alpha = eased * 0.9;
			view.label.alpha = eased * 0.95;
		}

		const thinking = watched?.agent.thinking ?? false;
		const token = watched ? tokenViews.get(watched.id) : undefined;
		if (token) {
			const pulse = thinking ? 1 + Math.sin(clock / 260) * 0.06 : 1;
			token.scale.set(pulse);
		}

		for (const [id, flash] of flashViews) {
			const age = clock - flash.born;
			const p = age / 900;
			if (p >= 1) {
				flash.view.destroy();
				flashViews.delete(id);
				continue;
			}
			flash.view.alpha = (1 - p) * 0.8;
			const size = (140 + p * 200) / SCALE;
			flash.view.setSize(size, size);
		}
	}

	/* ---------------------------------------------------------------- effects */

	/** Build the app. Reads nothing reactive but `host`, so it runs exactly once. */
	$effect(() => {
		let disposed = false;
		let observer: ResizeObserver | undefined;

		(async () => {
			try {
				if (!hasWebGL()) {
					console.warn('[map] no WebGL context; drawing the journey without terrain');
					failed = true;
					return;
				}

				// Dynamic import keeps Pixi out of the SSR bundle.
				PIXI = await import('pixi.js');

				// Canvas text silently falls back to a system font if the webfont is
				// not resolved yet, and the labels are the one place that shows.
				await document.fonts.ready;

				const instance = new PIXI.Application();
				await instance.init({
					resizeTo: host,
					backgroundAlpha: 0,
					// A phone-first game: full DPR quadruples the pixel count for a
					// painterly ground that is upscaled anyway. Labels opt back in
					// individually with `resolution: 2`.
					resolution: 1,
					antialias: false,
					preference: 'webgl'
				});

				if (disposed) {
					instance.destroy({ removeView: true, releaseGlobalResources: true }, { children: true });
					return;
				}

				app = instance;
				// Pixi owns this canvas start to finish; Svelte never renders it, so
				// there is no expected-DOM for it to disagree with.
				// eslint-disable-next-line svelte/no-dom-manipulating
				host.appendChild(app.canvas);

				tex = {
					road: PIXI.Texture.from(roadStrip()),
					fade: PIXI.Texture.from(roadFade()),
					glow: PIXI.Texture.from(glow()),
					vignette: PIXI.Texture.from(vignette())
				};

				world = new PIXI.Container();
				world.scale.set(SCALE);
				app.stage.addChild(world);

				layers = {
					ground: new PIXI.Container(),
					beacon: new PIXI.Container(),
					roads: new PIXI.Container(),
					places: new PIXI.Container(),
					tokens: new PIXI.Container(),
					labels: new PIXI.Container()
				};
				layers.roads.sortableChildren = true;
				world.addChild(
					layers.ground,
					layers.beacon,
					layers.roads,
					layers.places,
					layers.tokens,
					layers.labels
				);

				screen = new PIXI.Container();
				app.stage.addChild(screen);

				const shade = new PIXI.Sprite(tex.vignette);
				screen.addChild(shade);
				const fit = () => shade.setSize(app!.screen.width, app!.screen.height);
				fit();

				observer = new ResizeObserver(fit);
				observer.observe(host);

				terrain = new Worker(new URL('$lib/map/worker.ts', import.meta.url), {
					type: 'module'
				});
				terrain.onmessage = receive;
				send({ type: 'start', seed });

				app.ticker.add((ticker) => tick(ticker.deltaMS));
				ready = true;
			} catch (error) {
				// A phone without a working context must still be able to play. The
				// CSS ground below shows through and the story panel carries the
				// round. Warn, never throw: `scripts/shot.mjs` fails on any error.
				console.warn('[map] terrain unavailable, falling back to flat ground', error);
				failed = true;
			}
		})();

		return () => {
			disposed = true;
			observer?.disconnect();
			terrain?.terminate();
			terrain = undefined;
			ground.clear();
			pending.clear();
			roadViews.clear();
			stubViews.clear();
			placeViews.clear();
			tokenViews.clear();
			flashViews.clear();
			roads.clear();
			// Without `releaseGlobalResources` the pooled batches survive into the
			// next match and show as flickering.
			app?.destroy(
				{ removeView: true, releaseGlobalResources: true },
				{ children: true, texture: true, textureSource: true }
			);
			app = undefined;
			world = undefined;
			layers = undefined;
			screen = undefined;
			tex = undefined;
			ready = false;
		};
	});

	/** Push the model in. Separate from the build so it can read reactive state. */
	$effect(() => {
		if (!ready) return;
		// Named so the dependency is unmistakable to a later reader.
		void [tree, players, watched, worn, trail, stubs, places, walking];
		sync();
	});

	/** Start the walk when a new step is announced. */
	$effect(() => {
		if (!ready || !walking || walking.id === walkedStepId) return;
		walkedStepId = walking.id;

		const road = roads.get(walking.choiceId);
		const hold = walking.retrace ? 0 : DECIDE_MS * paceScale;
		const span = (walking.retrace ? RETRACE_WALK_MS : WALK_MS) * paceScale;
		walk = { choiceId: walking.choiceId, elapsed: 0, hold, span };
		if (!road) sync();
	});

	/** Centre on whoever is being watched when the spotlight moves. */
	$effect(() => {
		if (!ready || !watched) return;
		const at = placeAt.get(watched.agent.currentNode);
		if (!at || walk) return;
		lookAt(at, cameraElapsed >= CAMERA_MS && camera.x === 0 && camera.y === 0);
	});

	/** Flashes: a step landing, whatever it landed on. */
	$effect(() => {
		if (!ready || !PIXI || !layers || !tex) return;
		for (const effect of effects) {
			if (flashViews.has(effect.id)) continue;
			const at = placeAt.get(effect.nodeId);
			if (!at) continue;

			const view = new PIXI.Sprite(tex.glow);
			view.anchor.set(0.5);
			view.position.set(at.x, at.y);
			view.blendMode = 'add';
			const owner = players.find((p) => p.id === effect.playerId);
			view.tint =
				effect.kind === 'death'
					? LETHAL
					: effect.kind === 'win'
						? 0xf6d9a0
						: hex(owner ? colorOf(owner) : ACCENT);
			layers.beacon.addChild(view);
			flashViews.set(effect.id, { view, born: clock });
		}
	});

	/* ---------------------------------------------------------- the sr view */

	/**
	 * The map is a canvas now, so it says nothing to a screen reader on its own.
	 * This is the same information the sighted player gets from the stubs.
	 */
	const spoken = $derived.by(() => {
		const here = watched ? nodeById.get(watched.agent.currentNode) : undefined;
		const where = here?.title ?? '';
		const ways = stubs.map((e) => e.label).filter(Boolean);
		if (!where && !ways.length) return '';
		return ways.length ? `${where}. ${ways.join(', ')}.` : `${where}.`;
	});
</script>

<div class="absolute inset-0 overflow-hidden bg-dark">
	<!-- Shows through wherever the terrain has not painted, and instead of it
	     entirely if the renderer could not start. -->
	<div class="world-ground absolute inset-0"></div>

	<div bind:this={host} data-shot="map-canvas" class="absolute inset-0" class:hidden={failed}></div>

	<p class="sr-only" aria-live="polite">{spoken}</p>

	<!-- Keeps the phase bar legible over whatever the map is doing up there. -->
	<div
		class="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-dark/55 to-transparent"
	></div>
</div>

<style>
	/*
	 * What is behind the terrain, and what stands in for it entirely if the
	 * renderer could not start. Pitched at the graded ground's own darkness so
	 * the first sections arriving read as the land resolving rather than as the
	 * screen changing colour.
	 */
	.world-ground {
		background:
			radial-gradient(circle at 32% 22%, rgb(74 82 88 / 40%), transparent 62%),
			radial-gradient(circle at 78% 74%, rgb(58 62 70 / 34%), transparent 58%), #20242a;
	}
</style>
