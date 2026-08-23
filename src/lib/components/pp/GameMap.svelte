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
	import type { BiomeId } from '$lib/map/biomes';
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
		/** Names the canvas for a screen reader, and says how to move it. */
		label?: string;
	};

	let {
		tree,
		players,
		youId,
		effects,
		step = null,
		paceScale = 1,
		focusId = null,
		hiddenIds = [],
		label = ''
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

	/**
	 * How far the player may pull back, and what the ground can afford.
	 *
	 * Zooming out is bounded by the terrain rather than by taste. `streamGround`
	 * asks the worker for every section the viewport touches — each one a 384x384
	 * texture built from noise — and the count grows with the square of the
	 * pull-back. `MAX_SECTIONS` is the budget and `minZoom` reads the real screen
	 * to find the widest view that fits inside it, so a phone and a desktop window
	 * each get as much as they can carry instead of the same hard number.
	 *
	 * Going below `ZOOM_FLOOR` would want a coarser section from the worker: at
	 * `TEXEL_PER_UNIT = 2` the ground is already oversampled four times over at
	 * rest, and the texels are wasted long before the sections are.
	 *
	 * Zooming in is bounded by the labels, drawn at `resolution: 2`.
	 */
	const MAX_ZOOM = 2;
	const ZOOM_FLOOR = 0.35;
	const MAX_SECTIONS = 48;

	/** One press of a zoom key, and how far an arrow key slides the land. */
	const ZOOM_STEP = 1.25;
	const PAN_STEP = 90;

	/**
	 * How far a pointer must travel before it counts as a drag.
	 *
	 * A tap on the map is not a gesture. Without this, touching the land would take
	 * the camera off whoever's turn it is for the rest of the beat.
	 */
	const DRAG_SLOP = 4;

	/**
	 * Breathing room past the outermost revealed place, so an edge place is not
	 * pressed against the frame.
	 *
	 * Only breathing room: the clamp adds a second, viewport-derived pad on top,
	 * and that one is what keeps the story's own camera inside the bound. So this
	 * can be small, and wants to be — the viewport pad already buys half a screen
	 * of land past the last place, and at 120 the wall stood a whole screen out,
	 * far enough that the story had left the frame by the time you got there.
	 */
	const BOUND_PAD = 40;

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

	/**
	 * What the story says the land looks like, as section overrides for the
	 * terrain worker.
	 *
	 * A plain function, called once when the worker starts, rather than a
	 * `$derived`: it is read from inside the effect that owns the renderer, and
	 * nothing in there may become a reason to tear the renderer down. It is also
	 * genuinely fixed for the match — biomes and authored positions do not move.
	 *
	 * Each place claims the section it stands in **and the eight around it**. One
	 * section is 192 units and places sit 150 apart, so claiming only the section
	 * underfoot would leave the gaps between the places of a region to the noise —
	 * and a patch of desert in the middle of a forest belt is worse than no
	 * override at all. A direct claim beats a neighbour's halo, and between two of
	 * equal standing the nearer place wins, so the result does not depend on the
	 * order the nodes happen to arrive in.
	 */
	function biomeSections(): Record<string, BiomeId> {
		const claims = new Map<string, { biome: BiomeId; d2: number; direct: boolean }>();

		for (const node of tree.nodes) {
			if (!node.biome) continue;
			const at = placeAt.get(node.id);
			if (!at) continue;

			const sx = Math.floor(at.x / SECTION_W);
			const sy = Math.floor(at.y / SECTION_H);

			for (let dy = -1; dy <= 1; dy++) {
				for (let dx = -1; dx <= 1; dx++) {
					const key = `${sx + dx},${sy + dy}`;
					const direct = dx === 0 && dy === 0;
					const cx = (sx + dx + 0.5) * SECTION_W;
					const cy = (sy + dy + 0.5) * SECTION_H;
					const d2 = (at.x - cx) ** 2 + (at.y - cy) ** 2;

					const held = claims.get(key);
					if (held) {
						if (held.direct && !direct) continue;
						if (held.direct === direct && held.d2 <= d2) continue;
					}
					claims.set(key, { biome: node.biome, d2, direct });
				}
			}
		}

		return Object.fromEntries([...claims].map(([key, claim]) => [key, claim.biome]));
	}

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
	/** And at what zoom: the same camera sees more land once you pull back. */
	let streamedZoom = 0;
	let cameraFrom = { x: 0, y: 0 };
	let cameraTo = { x: 0, y: 0 };
	let cameraElapsed = CAMERA_MS;

	/** The player's zoom, multiplying the fixed `SCALE`. */
	let zoom = 1;

	/**
	 * The player has taken the camera, so the story stops moving it.
	 *
	 * Handed back at the next beat — a step announced, or the spotlight moving to
	 * another agent — rather than needing a button to press. Looking around during
	 * a pause therefore costs nothing and cannot make you miss a walk.
	 *
	 * `homing` is the return trip. While it is set the walk moves the camera's
	 * *target* and lets the ease already in flight carry it, so the land slides
	 * back to the walker instead of cutting there.
	 */
	let detached = false;
	let homing = false;

	/**
	 * How far the camera may roam: the box around every place the story has
	 * actually reached, in world units.
	 *
	 * It grows as the fog lifts, so panning can never show a place before the story
	 * has been there. Home is the exception, and was always the exception — it is
	 * public from the first frame and carries a beacon, so the bound reaches down
	 * the road you are walking towards while staying shut on the flanks.
	 */
	let bound: { minX: number; minY: number; maxX: number; maxY: number } | null = null;

	/** Live pointers, so two fingers can be told from one. */
	const pointers = new Map<number, { x: number; y: number }>();
	/** Distance between two of them on the last move, for the pinch. */
	let pinch = 0;
	let dragging = false;
	let travelled = 0;

	/** The walk in flight: which road, how far along, and how long it gets. */
	let walk: { choiceId: string; elapsed: number; hold: number; span: number } | null = null;
	let walkedStepId = -1;
	/** Whose story the camera was last handed to, so a change of teller is seen. */
	let lastWatchedId = '';

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

	function makePlace(kind: string, title: string | null, sigil: string | null) {
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

			if (sigil) {
				// The place's own mark, inside its ring. A glyph says what a place *is*
				// at a glance, which a row of identical discs cannot — and it does it
				// without a second label competing with the name above the pin.
				const glyph = new PIXI!.Text({
					text: sigil,
					style: { fontFamily: 'Inter, system-ui, sans-serif', fontSize: 13, align: 'center' },
					resolution: 2
				});
				glyph.anchor.set(0.5);
				glyph.scale.set(1 / SCALE);
				place.addChild(glyph);
			} else if (kind === 'death') {
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
		//
		// It is masked to the disc because the art is a square crop: unmasked it
		// draws its corners over the ring and the token reads as a photo pinned to
		// the map rather than a figure standing on it. The mask sits just inside
		// the stroke so the coloured edge stays a full ring.
		const portrait = new PIXI!.Sprite();
		portrait.anchor.set(0.5);
		portrait.alpha = 0;
		const clip = new PIXI!.Graphics().circle(0, 0, r - 1.5 / SCALE).fill({ color: 0xffffff });
		portrait.mask = clip;
		token.addChild(clip);
		token.addChild(portrait);

		PIXI!.Assets.load(characterSrc(characterOf(player), 'avatar'))
			.then((texture: Texture) => {
				if (portrait.destroyed) return;
				portrait.texture = texture;
				// Fills the mask rather than sitting inside it; the clip is the edge now.
				portrait.setSize(r * 2, r * 2);
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
			// A place changes appearance exactly once, when it stops being unknown —
			// and the glyph is part of what arrives then, so it is part of the key.
			const look = `${kind}:${node.sigil ?? ''}`;
			if (view && view.label !== look) {
				view.destroy({ children: true });
				placeViews.delete(node.id);
				view = undefined;
			}
			if (!view) {
				view = makePlace(kind, node.title, node.sigil);
				view.label = look;
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
		const k = pxPerUnit();
		const x = at.x * k + camera.x;
		const y = at.y * k + camera.y;
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

		const k = pxPerUnit();
		const left = -camera.x / k;
		const top = -camera.y / k;
		const right = left + app.screen.width / k;
		const bottom = top + app.screen.height / k;

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
		const k = pxPerUnit();
		const left = -camera.x / k - SECTION_W;
		const top = -camera.y / k - SECTION_H;
		const right = left + app.screen.width / k + SECTION_W * 2;
		const bottom = top + app.screen.height / k + SECTION_H * 2;
		const x = sx * SECTION_W;
		const y = sy * SECTION_H;
		return x + SECTION_W > left && x < right && y + SECTION_H > top && y < bottom;
	}

	/* ---------------------------------------------------------------- camera */

	/**
	 * Live pixels per world unit: the fixed `SCALE` times the player's zoom.
	 *
	 * Every authored size in this file is still divided by `SCALE` alone, and that
	 * is deliberate — those divisions turn design pixels into world units, which is
	 * a property of the drawing and not of where the camera happens to be. Only the
	 * handful of places doing *coordinate* arithmetic use this instead, so a zoom
	 * scales the whole scene uniformly, text and roads together.
	 */
	function pxPerUnit() {
		return SCALE * zoom;
	}

	/** Where the board must sit for `at` to land on the eyeline. */
	function frame(at: Point) {
		if (!app) return { x: 0, y: 0 };
		const k = pxPerUnit();
		return {
			x: app.screen.width / 2 - at.x * k,
			y: app.screen.height * EYE_Y - at.y * k
		};
	}

	/** The box the story has reached. Reads reactive state; call it from an effect. */
	function boundOf() {
		let minX = Infinity;
		let minY = Infinity;
		let maxX = -Infinity;
		let maxY = -Infinity;
		for (const node of places) {
			const at = placeAt.get(node.id);
			if (!at) continue;
			if (at.x < minX) minX = at.x;
			if (at.y < minY) minY = at.y;
			if (at.x > maxX) maxX = at.x;
			if (at.y > maxY) maxY = at.y;
		}
		return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null;
	}

	/**
	 * The bound, padded out to the edge of what the camera may show.
	 *
	 * The pads are derived rather than chosen. `frame` stands a place at the middle
	 * of the screen across and at `EYE_Y` down, so a bound that stopped at the
	 * outermost place would exclude camera positions the *story* takes by itself —
	 * and the first drag after one of those would snap. Padding by exactly the
	 * framing distance makes the clamp a no-op for the follow camera, which is why
	 * nothing below has to special-case it.
	 */
	function limits() {
		if (!app || !bound) return null;
		const k = pxPerUnit();
		const w = app.screen.width;
		const h = app.screen.height;
		return {
			minX: bound.minX - BOUND_PAD - w / 2 / k,
			maxX: bound.maxX + BOUND_PAD + w / 2 / k,
			minY: bound.minY - BOUND_PAD - (h * EYE_Y) / k,
			maxY: bound.maxY + BOUND_PAD + (h * (1 - EYE_Y)) / k
		};
	}

	/**
	 * Keep the visible land inside the bound, one axis at a time.
	 *
	 * When the bound is narrower than the screen the two walls cross over: there is
	 * no legal place to stand, so it centres what there is rather than picking a
	 * wall and pressing the story against it.
	 */
	function clampCamera(at: Point): Point {
		const box = limits();
		if (!box || !app) return at;
		const k = pxPerUnit();

		const fit = (v: number, min: number, max: number, span: number) => {
			const lo = span - max * k;
			const hi = -min * k;
			if (lo > hi) return (span - (max - min) * k) / 2 - min * k;
			return Math.min(hi, Math.max(lo, v));
		};

		return {
			x: fit(at.x, box.minX, box.maxX, app.screen.width),
			y: fit(at.y, box.minY, box.maxY, app.screen.height)
		};
	}

	/**
	 * The floor on zooming out: whichever budget bites first.
	 *
	 * Never above 1, because 1 is the authored framing — a story with barely
	 * anything revealed should simply not zoom out, not be shoved closer than the
	 * map was designed to sit.
	 */
	function minZoom() {
		if (!app) return 1;
		const w = app.screen.width;
		const h = app.screen.height;

		// What the ground can carry. Walked down in steps rather than solved: the
		// section count is a pair of floors either side of a division and does not
		// inverse cleanly, and this runs on resize rather than per frame.
		let ground = 1;
		for (let z = 1; z >= ZOOM_FLOOR; z -= 0.05) {
			const k = SCALE * z;
			// Mirrors `streamGround`: the span, plus its one section of margin
			// either side, plus the section the near edge is standing in.
			const across = Math.ceil(w / k / SECTION_W) + 3;
			const down = Math.ceil(h / k / SECTION_H) + 3;
			if (across * down > MAX_SECTIONS) break;
			ground = z;
		}

		// And no point pulling back past the story itself: at this zoom the revealed
		// land already fills the frame and the clamp would only centre it.
		let story = ZOOM_FLOOR;
		if (bound) {
			const bw = bound.maxX - bound.minX + BOUND_PAD * 2;
			const bh = bound.maxY - bound.minY + BOUND_PAD * 2;
			story = Math.min(w / (bw * SCALE), h / (bh * SCALE));
		}

		return Math.min(1, Math.max(ground, story));
	}

	/**
	 * Zoom about a point, keeping the land under it still.
	 *
	 * The anchor is where the player's fingers are when they hold the camera, and
	 * the eyeline when the story holds it — which is exactly where the followed
	 * token stands, so following and zooming never argue about the centre.
	 */
	function setZoom(next: number, anchor?: Point) {
		if (!app) return;
		const want = Math.min(MAX_ZOOM, Math.max(minZoom(), next));
		if (Math.abs(want - zoom) < 0.001) return;

		const at = anchor ?? { x: app.screen.width / 2, y: app.screen.height * EYE_Y };
		const ratio = want / zoom;
		zoom = want;
		camera = clampCamera({
			x: at.x - (at.x - camera.x) * ratio,
			y: at.y - (at.y - camera.y) * ratio
		});

		// The tween's endpoints are screen pixels and meant something different at
		// the old scale. Retire it; whoever owns the camera will re-aim next frame.
		cameraFrom = { ...camera };
		cameraTo = { ...camera };
		cameraElapsed = CAMERA_MS;
	}

	/** The player takes the camera. Handed back at the next beat. */
	function take() {
		if (detached) return;
		detached = true;
		homing = false;
		cameraFrom = { ...camera };
		cameraTo = { ...camera };
		cameraElapsed = CAMERA_MS;
	}

	/** Slide the land by a screen-pixel delta. */
	function pan(dx: number, dy: number) {
		take();
		camera = clampCamera({ x: camera.x + dx, y: camera.y + dy });
	}

	/** Hand the camera back to the story, easing rather than cutting. */
	function give(at: Point) {
		if (!detached) return;
		detached = false;
		homing = true;
		cameraFrom = { ...camera };
		cameraTo = frame(at);
		cameraElapsed = 0;
	}

	/** Re-aim a tween in flight without restarting it. */
	function retarget(at: Point) {
		cameraTo = frame(at);
	}

	function lookAt(at: Point, immediate = false) {
		if (detached) return;
		const target = frame(at);
		if (immediate) {
			camera = clampCamera(target);
			cameraFrom = { ...camera };
			cameraTo = { ...camera };
			cameraElapsed = CAMERA_MS;
			return;
		}
		if (Math.abs(target.x - cameraTo.x) < 0.5 && Math.abs(target.y - cameraTo.y) < 0.5) return;
		cameraFrom = { ...camera };
		cameraTo = target;
		cameraElapsed = 0;
	}

	/* ----------------------------------------------------------------- input */

	function midpoint() {
		const [a, b] = [...pointers.values()];
		return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
	}

	function spread() {
		const [a, b] = [...pointers.values()];
		return Math.hypot(a.x - b.x, a.y - b.y);
	}

	function onPointerDown(event: PointerEvent) {
		if (!ready) return;
		host.setPointerCapture(event.pointerId);
		pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
		if (pointers.size === 2) pinch = spread();
		dragging = pointers.size === 1;
		travelled = 0;
	}

	function onPointerMove(event: PointerEvent) {
		const held = pointers.get(event.pointerId);
		if (!held) return;

		const dx = event.clientX - held.x;
		const dy = event.clientY - held.y;
		held.x = event.clientX;
		held.y = event.clientY;

		if (pointers.size >= 2) {
			// Two fingers do both at once: the change in spread is the zoom, and the
			// midpoint it is taken about moves with the hand.
			const now = spread();
			if (pinch > 0 && now > 0) {
				take();
				setZoom(zoom * (now / pinch), midpoint());
			}
			pinch = now;
			return;
		}

		if (!dragging) return;
		travelled += Math.abs(dx) + Math.abs(dy);
		if (travelled < DRAG_SLOP) return;
		pan(dx, dy);
	}

	function onPointerUp(event: PointerEvent) {
		pointers.delete(event.pointerId);
		if (host.hasPointerCapture(event.pointerId)) host.releasePointerCapture(event.pointerId);
		// The finger that stays behind is now a drag of its own, from where it is.
		if (pointers.size < 2) pinch = 0;
		dragging = pointers.size === 1;
	}

	function onWheel(event: WheelEvent) {
		if (!ready) return;
		event.preventDefault();
		// A trackpad pinch arrives as a wheel event with `ctrlKey` set, which the
		// browser would otherwise spend on zooming the page.
		if (event.ctrlKey || event.metaKey) {
			const box = host.getBoundingClientRect();
			take();
			// A trackpad pinch sends a stream of small deltas and a mouse notch sends
			// one of about 100, so the step is clamped rather than proportional — the
			// same gesture on a mouse would otherwise cross the whole range at once.
			const ratio = Math.min(1.25, Math.max(0.8, Math.exp(-event.deltaY / 240)));
			setZoom(zoom * ratio, {
				x: event.clientX - box.left,
				y: event.clientY - box.top
			});
			return;
		}
		pan(-event.deltaX, -event.deltaY);
	}

	/** Arrows slide the land, plus and minus zoom. The same camera, by keyboard. */
	function onKeyDown(event: KeyboardEvent) {
		if (!ready) return;
		const steps: Record<string, [number, number]> = {
			ArrowLeft: [PAN_STEP, 0],
			ArrowRight: [-PAN_STEP, 0],
			ArrowUp: [0, PAN_STEP],
			ArrowDown: [0, -PAN_STEP]
		};
		const step = steps[event.key];
		if (step) {
			event.preventDefault();
			pan(step[0], step[1]);
			return;
		}
		if (event.key === '+' || event.key === '=') {
			event.preventDefault();
			setZoom(zoom * ZOOM_STEP);
		} else if (event.key === '-' || event.key === '_') {
			event.preventDefault();
			setZoom(zoom / ZOOM_STEP);
		}
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
				// Mid-return: move the target and let the ease finish the journey,
				// rather than snapping from wherever the player had wandered to.
				if (homing) retarget(at);
				else lookAt(at, true);
			}
			if (walk.elapsed >= walk.hold + walk.span) walk = null;
		}

		if (cameraElapsed < CAMERA_MS) {
			cameraElapsed = Math.min(CAMERA_MS, cameraElapsed + deltaMS);
			const p = cameraElapsed / CAMERA_MS;
			const eased = 1 - Math.pow(1 - p, 3);
			camera = clampCamera({
				x: cameraFrom.x + (cameraTo.x - cameraFrom.x) * eased,
				y: cameraFrom.y + (cameraTo.y - cameraFrom.y) * eased
			});
			if (cameraElapsed >= CAMERA_MS) homing = false;
		}

		// Whole pixels: a rope and a sprite rounded differently show as a seam.
		world.scale.set(pxPerUnit());
		world.position.set(Math.round(camera.x), Math.round(camera.y));

		// Checking the section grid every frame would be a set of allocations 60
		// times a second for a question whose answer changes about once a walk — or
		// the moment a zoom changes how much of that grid the same camera can see.
		if (
			zoom !== streamedZoom ||
			Math.hypot(camera.x - streamedAt.x, camera.y - streamedAt.y) > SECTION_W * pxPerUnit() * 0.25
		) {
			streamedAt = { ...camera };
			streamedZoom = zoom;
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
				// The ticker owns the scale from here, because the player can change it.
				world.scale.set(pxPerUnit());
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
				// Both zoom floors and every wall are read off the frame, so a resize
				// can leave the camera outside its own bound or below its own minimum.
				const fit = () => {
					shade.setSize(app!.screen.width, app!.screen.height);
					setZoom(zoom);
					camera = clampCamera(camera);
				};
				fit();

				observer = new ResizeObserver(fit);
				observer.observe(host);

				terrain = new Worker(new URL('$lib/map/worker.ts', import.meta.url), {
					type: 'module'
				});
				terrain.onmessage = receive;
				send({ type: 'start', seed, biomes: biomeSections() });

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
		// The one place allowed to read `places` for the bound: this effect already
		// depends on it, and the effect that owns the renderer must never.
		bound = boundOf();
		sync();
	});

	/** Start the walk when a new step is announced. */
	$effect(() => {
		if (!ready || !walking || walking.id === walkedStepId) return;
		walkedStepId = walking.id;

		// A new beat: the camera comes back from wherever it was left, easing from
		// there to whoever is about to set out.
		const from = watched ? placeAt.get(watched.agent.currentNode) : undefined;
		if (from) give(from);

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
		if (!at) return;
		// The other beat that takes the camera back. Guarded on the id rather than
		// on the effect running, which it does whenever an agent moves at all.
		if (watched.id !== lastWatchedId) {
			lastWatchedId = watched.id;
			give(at);
		}
		if (walk) return;
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

	<!-- Dragging the land is a gesture and not a scroll, so `touch-action: none`
	     stops the browser spending it on a page pan or a pinch-zoom instead.

	     `application` is the honest role for a canvas that owns its own keys, and
	     the ignores are needed because ARIA files it under `structure` — so every
	     a11y rule reads it as inert scenery. Focus and the arrow keys are for a
	     sighted player without a pointer; a screen reader is served by the live
	     region below, which says where the agent is standing and what its ways
	     out are, and which does not depend on where the camera is looking. -->
	<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div
		bind:this={host}
		data-shot="map-canvas"
		class="map-host absolute inset-0"
		class:hidden={failed}
		role="application"
		tabindex="0"
		aria-label={label || undefined}
		onpointerdown={onPointerDown}
		onpointermove={onPointerMove}
		onpointerup={onPointerUp}
		onpointercancel={onPointerUp}
		onwheel={onWheel}
		onkeydown={onKeyDown}
	></div>

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
	.map-host {
		touch-action: none;
	}

	.world-ground {
		background:
			radial-gradient(circle at 32% 22%, rgb(74 82 88 / 40%), transparent 62%),
			radial-gradient(circle at 78% 74%, rgb(58 62 70 / 34%), transparent 58%), #20242a;
	}
</style>
