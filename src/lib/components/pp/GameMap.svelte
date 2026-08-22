<script lang="ts">
	/**
	 * The land, and everyone walking it.
	 *
	 * A single transformed layer holding an SVG of the roads and an HTML layer of
	 * the tokens, so both share one coordinate space and the tokens can still be
	 * real images with a real fallback. The camera slides to whoever is focused —
	 * tapping a face in the roster strip is how you follow a rival — and is clamped
	 * to the world so panning can never reveal the void beyond the edge.
	 *
	 * What is drawn is only ever the *fogged* graph. Node names and whether a road
	 * kills arrive as agents discover them, so the solution is not sitting in the
	 * browser waiting to be read out of a dev console.
	 */
	import type { FoggedNode, FoggedTree } from '$lib/engine/fog';
	import type { PublicPlayer } from '$lib/engine/game';
	import type { Effect } from '$lib/client/connection.svelte';
	import Avatar from './Avatar.svelte';
	import { colorOf } from '$lib/client/identity';
	import { ACCENT } from '$lib/client/theme';

	type Props = {
		tree: FoggedTree;
		players: PublicPlayer[];
		youId: string | null;
		effects: Effect[];
		/** Whose token the camera sits on. Falls back to you. */
		focusId?: string | null;
		/** Agents whose turn has not come yet stay off the board. */
		hiddenIds?: string[];
	};

	let { tree, players, youId, effects, focusId = null, hiddenIds = [] }: Props = $props();

	/**
	 * How much land fits on a phone.
	 *
	 * Chosen so a few places and the roads between them are legible at once — the
	 * real maps are 900 to 2000 units wide against a 390px frame, so this is a
	 * pan-and-follow view rather than a fit-the-whole-thing one.
	 */
	const SCALE = 0.62;
	const FRAME_W = 390;
	const FRAME_H = 844;
	const TOKEN = 66;
	const WAYPOINT = 52;

	const nodeById = $derived(
		Object.fromEntries(tree.nodes.map((n) => [n.id, n])) as Record<string, FoggedNode | undefined>
	);

	const homeNodes = $derived(new Set(tree.homeNodes));
	const shown = $derived(players.filter((p) => !hiddenIds.includes(p.id)));

	const focus = $derived(
		shown.find((p) => p.id === focusId) ?? shown.find((p) => p.id === youId) ?? shown[0] ?? null
	);

	/**
	 * Where the camera looks, in px, clamped so the world always covers the frame.
	 *
	 * When the world is narrower than the frame it is centred instead — clamping
	 * alone would jam it against one edge.
	 */
	const camera = $derived.by(() => {
		const worldW = tree.viewBox.width * SCALE;
		const worldH = tree.viewBox.height * SCALE;
		const node = focus ? nodeById[focus.agent.currentNode] : undefined;

		const targetX = ((node?.x ?? tree.viewBox.minX) - tree.viewBox.minX) * SCALE;
		const targetY = ((node?.y ?? tree.viewBox.minY) - tree.viewBox.minY) * SCALE;

		const axis = (target: number, world: number, frame: number) => {
			if (world <= frame) return (frame - world) / 2;
			return Math.min(0, Math.max(frame - world, frame / 2 - target));
		};

		return { x: axis(targetX, worldW, FRAME_W), y: axis(targetY, worldH, FRAME_H) };
	});

	/** World coordinates, shifted so the top-left of the viewBox is the origin. */
	const at = (node: FoggedNode | undefined) => ({
		x: ((node?.x ?? tree.viewBox.minX) - tree.viewBox.minX) * SCALE,
		y: ((node?.y ?? tree.viewBox.minY) - tree.viewBox.minY) * SCALE
	});

	/**
	 * Tokens fan out around their node rather than stacking on it, each seat owning
	 * a fixed angle so an avatar never jitters sideways when a rival arrives.
	 */
	const ORBIT = 34;
	const tokens = $derived(
		shown.map((player) => {
			const spot = at(nodeById[player.agent.currentNode]);
			const angle = ((-150 + player.seat * 40) * Math.PI) / 180;
			return {
				player,
				x: spot.x + Math.cos(angle) * ORBIT,
				y: spot.y + Math.sin(angle) * ORBIT
			};
		})
	);

	const flashes = $derived(
		effects
			.map((effect) => ({ ...effect, spot: at(nodeById[effect.nodeId]) }))
			.filter((effect) => Boolean(nodeById[effect.nodeId]))
	);

	const colourFor = (id: string) => {
		const player = players.find((p) => p.id === id);
		return player ? colorOf(player) : ACCENT;
	};
</script>

<div class="absolute inset-0 overflow-hidden bg-dark">
	<!--
		The ground. A real illustration belongs here; until then this is a wash in
		the design's own accent rather than a placeholder that shouts about itself.
	-->
	<div class="world-ground absolute inset-0"></div>

	<div
		class="camera absolute top-0 left-0"
		style:width="{tree.viewBox.width * SCALE}px"
		style:height="{tree.viewBox.height * SCALE}px"
		style:transform="translate({camera.x}px, {camera.y}px)"
	>
		<!-- Roads. -->
		<svg
			class="absolute top-0 left-0 overflow-visible"
			width={tree.viewBox.width * SCALE}
			height={tree.viewBox.height * SCALE}
			viewBox="{tree.viewBox.minX} {tree.viewBox.minY} {tree.viewBox.width} {tree.viewBox.height}"
			aria-hidden="true"
		>
			<g fill="none" stroke-linecap="round">
				{#each tree.edges as edge (edge.choiceId)}
					<path
						d={edge.d}
						stroke={edge.state === 'safe'
							? ACCENT
							: edge.state === 'lethal'
								? '#7B4A5F'
								: 'rgba(255,255,255,0.16)'}
						stroke-width={edge.state === 'safe' ? 11 : 5}
						stroke-dasharray={edge.state === 'unknown' ? '6 16' : undefined}
						opacity={edge.state === 'safe' ? 0.9 : 0.65}
					/>
				{/each}
			</g>
		</svg>

		<!-- Places. -->
		{#each tree.nodes as node (node.id)}
			{@const spot = at(node)}
			{@const isHome = homeNodes.has(node.id)}
			<div class="absolute" style:left="{spot.x}px" style:top="{spot.y}px">
				{#if isHome}
					<!-- Home is the cross on the map: the one thing never under fog. -->
					<div
						class="relative"
						style:width="74px"
						style:height="74px"
						style:margin="-37px 0 0 -37px"
					>
						<span class="absolute inset-0 grid place-items-center">
							<span class="block h-[13px] w-[74px] rotate-[38deg] rounded-[7px] bg-accent"></span>
						</span>
						<span class="absolute inset-0 grid place-items-center">
							<span class="block h-[13px] w-[74px] -rotate-[38deg] rounded-[7px] bg-accent"></span>
						</span>
					</div>
				{:else}
					<div
						class="grid place-items-center rounded-full border-[2.5px] bg-dark/[0.18]"
						style:width="{WAYPOINT}px"
						style:height="{WAYPOINT}px"
						style:margin="-{WAYPOINT / 2}px 0 0 -{WAYPOINT / 2}px"
						style:border-color={node.kind === 'unknown'
							? 'rgba(255,255,255,0.35)'
							: node.kind === 'death'
								? '#7B4A5F'
								: '#fff'}
						style:border-style={node.kind === 'unknown' ? 'dashed' : 'solid'}
					>
						{#if node.kind === 'death'}
							<span class="text-lg leading-none font-bold text-p5">×</span>
						{/if}
					</div>
				{/if}
			</div>
		{/each}

		<!-- What just happened. -->
		{#each flashes as flash (flash.id)}
			<span
				class="pointer-events-none absolute rounded-full"
				style:left="{flash.spot.x}px"
				style:top="{flash.spot.y}px"
				style:width="30px"
				style:height="30px"
				style:margin="-15px 0 0 -15px"
				style:border="3px solid {flash.kind === 'death' ? '#7B4A5F' : colourFor(flash.playerId)}"
				style:animation="flare 900ms ease-out forwards"
			></span>
		{/each}

		<!-- Everyone walking. -->
		{#each tokens as token (token.player.id)}
			<div
				class="token absolute"
				style:left="{token.x}px"
				style:top="{token.y}px"
				style:margin="-{TOKEN / 2}px 0 0 -{TOKEN / 2}px"
			>
				<Avatar
					player={token.player}
					{youId}
					size={TOKEN}
					ring={3}
					dim={token.player.agent.status === 'dead'}
				/>
			</div>
		{/each}
	</div>

	<!-- Keeps the phase bar legible over whatever the map is doing up there. -->
	<div
		class="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-dark/55 to-transparent"
	></div>
</div>

<style>
	.world-ground {
		background:
			radial-gradient(circle at 30% 25%, rgb(195 120 140 / 22%), transparent 60%),
			radial-gradient(circle at 75% 70%, rgb(245 157 137 / 12%), transparent 55%),
			repeating-linear-gradient(38deg, rgb(255 255 255 / 3%) 0 14px, transparent 14px 28px), #23272a;
	}

	.camera,
	.token {
		transition: transform 700ms cubic-bezier(0.3, 0.8, 0.25, 1);
	}

	.token {
		transition-property: left, top;
	}

	@media (prefers-reduced-motion: reduce) {
		.camera,
		.token {
			transition: none;
		}
	}
</style>
