<script lang="ts">
	import type { FoggedNode, FoggedTree } from '$lib/engine/fog';
	import type { PublicPlayer } from '$lib/engine/game';
	import type { Effect } from '$lib/client/connection.svelte';
	import { agentColor, sigil } from '$lib/client/palette';
	import { conn } from '$lib/client/connection.svelte';

	type Props = {
		tree: FoggedTree;
		players: PublicPlayer[];
		youId: string | null;
		effects: Effect[];
		/** The agent whose turn is being told; the camera follows it and the rest dim. */
		activeId?: string | null;
		/** Agents still queued for their turn — kept off the board until it is theirs. */
		hiddenIds?: string[];
	};

	let { tree, players, youId, effects, activeId = null, hiddenIds = [] }: Props = $props();

	/** The camera window, in world units. Roughly four levels at a time. */
	const CAM_W = 700;
	const CAM_H = 580;

	let mode = $state<'follow' | 'fit'>('follow');

	const nodeById = $derived(
		Object.fromEntries(tree.nodes.map((n) => [n.id, n])) as Record<string, FoggedNode | undefined>
	);

	/**
	 * A node is known to the player by the name of the path that leads to it —
	 * "the River", not "The River (a place you have never been)". Unwalked paths
	 * show as ???, which is the whole point of the fog.
	 */
	const nodeLabel = $derived.by(() => {
		const labels: Record<string, string> = {
			[tree.startNode]: 'START',
			[tree.homeNode]: 'HOME'
		};
		for (const edge of tree.edges) {
			if (edge.to === tree.homeNode) continue;
			labels[edge.to] = edge.label ?? '???';
		}
		return labels;
	});

	const you = $derived(players.find((p) => p.id === youId) ?? null);

	/**
	 * Where the camera looks.
	 *
	 * During a round it frames **every agent at once**, zooming out as the pack
	 * spreads — the whole point of running in lockstep is being able to see your
	 * agent and everyone else's in the same glance. Between rounds it settles
	 * back on your own, wherever it fell.
	 */
	const camera = $derived.by(() => {
		const fitBox = (
			minX: number,
			minY: number,
			maxX: number,
			maxY: number,
			maxScale: number,
			pad: number
		) => {
			const width = maxX - minX + pad * 2;
			const height = maxY - minY + pad * 2;
			const scale = Math.min(CAM_W / width, CAM_H / height, maxScale);
			return {
				scale,
				x: CAM_W / 2 - ((minX + maxX) / 2) * scale,
				y: CAM_H / 2 - ((minY + maxY) / 2) * scale
			};
		};

		if (mode === 'fit') {
			const { minX, minY, width, height } = tree.viewBox;
			return fitBox(minX, minY, minX + width, minY + height, 1, 0);
		}

		// While an agent is walking, follow it alone. Between rounds nobody is
		// walking, so frame all four where they fell — that view is the round.
		const lead = activeId ? players.filter((p) => p.id === activeId) : players;
		const tracked = (lead.length ? lead : you ? [you] : [])
			.map((p) => nodeById[p.agent.currentNode])
			.filter((n): n is FoggedNode => Boolean(n));

		if (!tracked.length) return { scale: 1, x: CAM_W / 2, y: CAM_H / 2 };

		return fitBox(
			Math.min(...tracked.map((n) => n.x)),
			Math.min(...tracked.map((n) => n.y)),
			Math.max(...tracked.map((n) => n.x)),
			Math.max(...tracked.map((n) => n.y)),
			1,
			150
		);
	});

	/**
	 * Agents stand in an arc *above* their node rather than on top of it: the
	 * node keeps its name legible, and four agents on the same node fan out
	 * instead of stacking into one blob. Each seat owns a fixed angle, so an
	 * avatar never jitters sideways when a rival arrives or leaves.
	 */
	const ORBIT = 26;
	const avatars = $derived(
		players
			.filter((player) => !hiddenIds.includes(player.id))
			.map((player) => {
				const node = nodeById[player.agent.currentNode];
				const angle = ((-155 + player.seat * 43) * Math.PI) / 180;
				return {
					player,
					isYou: player.id === youId,
					x: (node?.x ?? 0) + Math.cos(angle) * ORBIT,
					y: (node?.y ?? 0) + Math.sin(angle) * ORBIT,
					colour: agentColor(player.seat, player.id === youId)
				};
			})
	);

	const positionedEffects = $derived(
		effects.map((effect) => ({
			...effect,
			node: nodeById[effect.nodeId],
			colour: agentColor(effect.seat, effect.playerId === youId)
		}))
	);

	/** Static drifting motes, seeded by index so they do not re-randomise on render. */
	const motes = Array.from({ length: 18 }, (_, i) => ({
		x: ((i * 137.5) % 100) - 50,
		y: (i * 83) % 100,
		delay: (i * 0.7) % 9,
		duration: 9 + (i % 5) * 2.5,
		size: 0.8 + (i % 3) * 0.5
	}));

	const shards = [
		{ dx: -16, dy: -12 },
		{ dx: 15, dy: -14 },
		{ dx: -13, dy: 15 },
		{ dx: 17, dy: 11 },
		{ dx: 0, dy: -20 },
		{ dx: 2, dy: 19 }
	];
</script>

<div class="relative h-full w-full overflow-hidden">
	<svg
		class="h-full w-full"
		viewBox="0 0 {CAM_W} {CAM_H}"
		preserveAspectRatio="xMidYMid meet"
		role="img"
		aria-label="Decision tree"
	>
		<defs>
			<radialGradient id="home-glow">
				<stop offset="0%" stop-color="#e8b45c" stop-opacity="0.55" />
				<stop offset="100%" stop-color="#e8b45c" stop-opacity="0" />
			</radialGradient>
			<filter id="soft-glow" x="-120%" y="-120%" width="340%" height="340%">
				<feGaussianBlur stdDeviation="4" result="blur" />
				<feMerge>
					<feMergeNode in="blur" />
					<feMergeNode in="SourceGraphic" />
				</feMerge>
			</filter>
			<filter id="hard-glow" x="-150%" y="-150%" width="400%" height="400%">
				<feGaussianBlur stdDeviation="7" result="blur" />
				<feMerge>
					<feMergeNode in="blur" />
					<feMergeNode in="blur" />
					<feMergeNode in="SourceGraphic" />
				</feMerge>
			</filter>
		</defs>

		<!-- Atmosphere: slow motes drifting up through the whole scene. -->
		<g class="motes" opacity="0.5">
			{#each motes as mote, i (i)}
				<circle
					cx={(mote.x / 100) * CAM_W + CAM_W / 2}
					cy={(mote.y / 100) * CAM_H}
					r={mote.size}
					fill="#d8c49a"
					style="animation: drift {mote.duration}s linear {mote.delay}s infinite"
				/>
			{/each}
		</g>

		<g class="world" style:transform="translate({camera.x}px, {camera.y}px) scale({camera.scale})">
			<!-- Edges -->
			<g fill="none" stroke-linecap="round">
				{#each tree.edges as edge (edge.choiceId)}
					<path
						d={edge.d}
						stroke={edge.state === 'safe'
							? '#e8b45c'
							: edge.state === 'lethal'
								? '#5b2f33'
								: '#2a2c42'}
						stroke-width={edge.state === 'safe' ? 2.4 : 1.6}
						stroke-dasharray={edge.state === 'unknown' ? '3 7' : undefined}
						opacity={edge.state === 'safe' ? 0.75 : edge.state === 'lethal' ? 0.7 : 0.5}
					/>
					{#if edge.state === 'safe'}
						<!-- A faint current flowing along the confirmed route. -->
						<path
							d={edge.d}
							stroke="#e8b45c"
							stroke-width="2.4"
							stroke-dasharray="2 22"
							opacity="0.85"
							style="animation: dash-flow 1.6s linear infinite"
						/>
					{/if}
				{/each}
			</g>

			<!-- Nodes -->
			<g>
				{#each tree.nodes as node (node.id)}
					{@const isHome = node.id === tree.homeNode}
					{@const isDeath = node.kind === 'death'}
					{@const isUnknown = node.kind === 'unknown'}
					{@const radius = isHome ? 26 : node.kind === 'start' ? 18 : 15}

					<g class="node" style:transform="translate({node.x}px, {node.y}px)">
						{#if isHome}
							<circle
								r="60"
								fill="url(#home-glow)"
								style="animation: breathe 3.6s ease-in-out infinite"
							/>
						{/if}

						<circle
							r={radius}
							fill={isHome ? '#e8b45c' : isDeath ? '#1b1218' : isUnknown ? '#12131f' : '#1a1c2e'}
							stroke={isHome ? '#f6d9a0' : isDeath ? '#5b2f33' : isUnknown ? '#2a2c42' : '#e8b45c'}
							stroke-width={isUnknown ? 1 : 1.8}
							stroke-dasharray={isUnknown ? '3 4' : undefined}
							filter={isHome
								? 'url(#hard-glow)'
								: !isUnknown && !isDeath
									? 'url(#soft-glow)'
									: undefined}
						/>

						{#if isDeath}
							<g stroke="#cf5f57" stroke-width="1.8" stroke-linecap="round" opacity="0.85">
								<line x1="-5" y1="-5" x2="5" y2="5" />
								<line x1="5" y1="-5" x2="-5" y2="5" />
							</g>
						{:else if isUnknown}
							<text
								text-anchor="middle"
								dy="4"
								font-size="12"
								class="select-none"
								style="fill:#585370;font-family:var(--font-mono)">?</text
							>
						{:else if isHome}
							<text
								text-anchor="middle"
								dy="5"
								font-size="13"
								fill="#3a2a0c"
								style="font-family:var(--font-mono);font-weight:700;letter-spacing:0.06em"
								class="select-none">◆</text
							>
						{/if}

						<text
							text-anchor="middle"
							y={radius + 17}
							font-size={isHome ? 13 : 11}
							class="select-none"
							style="
								font-family: var(--font-mono);
								letter-spacing: 0.14em;
								fill: {isHome ? '#e8b45c' : isDeath ? '#8a6068' : isUnknown ? '#585370' : '#e6dcc8'};
								font-weight: {isHome ? 700 : 500};
							"
						>
							{(nodeLabel[node.id] ?? '???').toUpperCase()}
						</text>
					</g>
				{/each}
			</g>

			<!-- Transient flashes -->
			<g>
				{#each positionedEffects as effect (effect.id)}
					{#if effect.node}
						<g style:transform="translate({effect.node.x}px, {effect.node.y}px)">
							{#if effect.kind === 'death'}
								{#each shards as shard, i (i)}
									<rect
										x="-2"
										y="-2"
										width="4"
										height="4"
										fill="#cf5f57"
										style="--dx:{shard.dx}px; --dy:{shard.dy}px; animation: shatter 900ms ease-out forwards"
									/>
								{/each}
								<circle
									r="16"
									fill="none"
									stroke="#cf5f57"
									stroke-width="2"
									style="animation: flare 700ms ease-out forwards"
								/>
							{:else}
								<circle
									r="16"
									fill="none"
									stroke={effect.kind === 'win' ? '#f6d9a0' : effect.colour}
									stroke-width={effect.kind === 'win' ? 3 : 2}
									style="animation: flare {effect.kind === 'win' ? 1200 : 700}ms ease-out forwards"
								/>
							{/if}
						</g>
					{/if}
				{/each}
			</g>

			<!-- Agents -->
			<g>
				{#each avatars as avatar (avatar.player.id)}
					{@const dead = avatar.player.agent.status === 'dead'}
					{@const spotlit = !activeId || avatar.player.id === activeId}
					<g
						class="avatar"
						style:transform="translate({avatar.x}px, {avatar.y}px)"
						style:opacity={dead ? 0.3 : spotlit ? 1 : 0.4}
					>
						{#if avatar.player.agent.thinking}
							<circle
								r="13"
								fill="none"
								stroke={avatar.colour}
								stroke-width="1.5"
								style="animation: think-ring 1.5s ease-out infinite"
							/>
							<circle
								r="13"
								fill="none"
								stroke={avatar.colour}
								stroke-width="1.5"
								style="animation: think-ring 1.5s ease-out 0.75s infinite"
							/>
						{/if}

						<circle
							r="11"
							fill="#06070a"
							stroke={avatar.colour}
							stroke-width={avatar.isYou ? 2.4 : 1.5}
							filter={avatar.isYou ? 'url(#soft-glow)' : undefined}
						/>
						{#if avatar.isYou}
							<circle r="15" fill="none" stroke={avatar.colour} stroke-width="1" opacity="0.4" />
						{/if}
						<text
							text-anchor="middle"
							dy="3.5"
							font-size="9"
							style="font-family:var(--font-mono);font-weight:700;letter-spacing:0.04em;fill:{avatar.colour}"
							class="select-none">{sigil(avatar.player.name)}</text
						>
					</g>
				{/each}
			</g>
		</g>
	</svg>

	<!-- Camera control -->
	<div class="absolute top-3 right-3 flex gap-1">
		<button
			type="button"
			onclick={() => (mode = mode === 'follow' ? 'fit' : 'follow')}
			class="rounded border border-rule bg-black/40 px-2.5 py-1 text-[10px] tracking-[0.18em] text-faded uppercase transition hover:border-rule-bright hover:text-parchment"
		>
			{mode === 'follow' ? conn.t.game.wholeLand : conn.t.game.follow}
		</button>
	</div>

	<div class="pointer-events-none absolute bottom-3 left-4 rubric">
		{tree.mapName}
	</div>
</div>

<style>
	.world,
	.avatar {
		transition: transform 850ms cubic-bezier(0.4, 0, 0.2, 1);
	}

	.avatar {
		transition:
			transform 850ms cubic-bezier(0.4, 0, 0.2, 1),
			opacity 400ms ease;
	}

	.node text {
		transition: fill 600ms ease;
	}
</style>
