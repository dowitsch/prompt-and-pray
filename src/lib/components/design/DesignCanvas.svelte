<script lang="ts">
	import { edgeGeometry, viewBoxFor } from '$lib/engine/geometry';
	import type { DesignChoice, DesignNode, DesignStory } from '$lib/db/design';
	import type { Problem } from '$lib/engine/validate';

	/**
	 * The authoring canvas.
	 *
	 * Drawn with the same `edgeGeometry` the board uses, so a story looks while it
	 * is being built exactly as it will while it is being played — which is most
	 * of the value of building it visually at all.
	 *
	 * Three gestures: drag a place to move it, drag from a place's rim to another
	 * place to lay a road between them, click either to select it.
	 */

	type Props = {
		story: DesignStory;
		problems: Problem[];
		selected: { kind: 'node' | 'choice'; id: number } | null;
		onSelect: (selection: { kind: 'node' | 'choice'; id: number } | null) => void;
		onMove: (moves: { id: number; x: number; y: number }[]) => void;
		onConnect: (fromNodeId: number, toNodeId: number) => void;
		onPlace: (x: number, y: number) => void;
		/** Set while the palette has something waiting to be put down. */
		placing: boolean;
	};

	let { story, problems, selected, onSelect, onMove, onConnect, onPlace, placing }: Props =
		$props();

	const NODE_R = 26;
	/** How far from the centre the drag-a-road rim sits. */
	const PORT_R = NODE_R + 9;

	let svg = $state<SVGSVGElement | null>(null);

	/** Positions being dragged right now, so the drag is smooth and unsaved. */
	let dragging = $state<{ id: number; x: number; y: number } | null>(null);
	/** A road being pulled out of a place, following the pointer. */
	let linking = $state<{ from: number; x: number; y: number; over: number | null } | null>(null);

	const nodeById = $derived(new Map(story.nodes.map((n) => [n.id, n])));

	/** A node's position, preferring the one under the pointer mid-drag. */
	function at(node: DesignNode): { x: number; y: number } {
		return dragging?.id === node.id ? { x: dragging.x, y: dragging.y } : node;
	}

	const placed = $derived(story.nodes.map(at));
	const box = $derived(viewBoxFor(placed.length ? placed : [{ x: 0, y: 0 }]));

	const edges = $derived(
		story.choices
			.map((choice) => {
				const from = nodeById.get(choice.fromNodeId);
				const to = nodeById.get(choice.toNodeId);
				if (!from || !to) return null;
				const a = at(from);
				const b = at(to);
				return { choice, ...edgeGeometry(a.x, a.y, b.x, b.y) };
			})
			.filter((edge): edge is { choice: DesignChoice; d: string; labelX: number; labelY: number } =>
				Boolean(edge)
			)
	);

	/** Places the validator is complaining about, so they can be marked. */
	const flagged = $derived(
		new Set(problems.filter((p) => p.severity === 'error' && p.nodeId).map((p) => Number(p.nodeId)))
	);
	const warned = $derived(
		new Set(
			problems.filter((p) => p.severity === 'warning' && p.nodeId).map((p) => Number(p.nodeId))
		)
	);

	/** Pointer position in map units, which is what everything here is stored in. */
	function toMap(event: PointerEvent | MouseEvent): { x: number; y: number } {
		if (!svg) return { x: 0, y: 0 };
		const rect = svg.getBoundingClientRect();
		// The viewBox is letterboxed by preserveAspectRatio, so the scale is the
		// same on both axes and set by whichever side is the tighter fit.
		const scale = Math.max(box.width / rect.width, box.height / rect.height);
		const drawnW = box.width / scale;
		const drawnH = box.height / scale;
		return {
			x: box.minX + (event.clientX - rect.left - (rect.width - drawnW) / 2) * scale,
			y: box.minY + (event.clientY - rect.top - (rect.height - drawnH) / 2) * scale
		};
	}

	function startDrag(event: PointerEvent, node: DesignNode): void {
		event.stopPropagation();
		(event.target as Element).setPointerCapture(event.pointerId);
		dragging = { id: node.id, x: node.x, y: node.y };
		onSelect({ kind: 'node', id: node.id });
	}

	function startLink(event: PointerEvent, node: DesignNode): void {
		event.stopPropagation();
		(event.target as Element).setPointerCapture(event.pointerId);
		const point = toMap(event);
		linking = { from: node.id, x: point.x, y: point.y, over: null };
	}

	function nodeUnder(point: { x: number; y: number }): number | null {
		for (const node of story.nodes) {
			const here = at(node);
			if (Math.hypot(here.x - point.x, here.y - point.y) <= PORT_R) return node.id;
		}
		return null;
	}

	function onPointerMove(event: PointerEvent): void {
		if (dragging) {
			const point = toMap(event);
			dragging = { ...dragging, x: Math.round(point.x), y: Math.round(point.y) };
		} else if (linking) {
			const point = toMap(event);
			const over = nodeUnder(point);
			linking = { ...linking, x: point.x, y: point.y, over: over === linking.from ? null : over };
		}
	}

	function onPointerUp(): void {
		if (dragging) {
			const move = dragging;
			dragging = null;
			const node = nodeById.get(move.id);
			// Only worth a round trip if it actually went somewhere.
			if (node && (node.x !== move.x || node.y !== move.y)) {
				onMove([{ id: move.id, x: move.x, y: move.y }]);
			}
		}
		if (linking) {
			const link = linking;
			linking = null;
			if (link.over !== null) onConnect(link.from, link.over);
		}
	}

	function onCanvasClick(event: MouseEvent): void {
		if (placing) {
			const point = toMap(event);
			onPlace(Math.round(point.x), Math.round(point.y));
		} else {
			onSelect(null);
		}
	}

	/** Ending colours, matching how the board draws them. */
	function fillFor(node: DesignNode): string {
		if (node.id === story.startNodeId) return '#1f2236';
		if (node.endingType === 'SUCCESS') return '#e8b45c';
		if (node.endingType === 'FAILURE') return '#1b1218';
		if (node.endingType === 'NEUTRAL') return '#171a24';
		return '#1a1c2e';
	}

	function strokeFor(node: DesignNode): string {
		if (flagged.has(node.id)) return '#e06c75';
		if (node.endingType === 'SUCCESS') return '#f6d9a0';
		if (node.endingType === 'FAILURE') return '#5b2f33';
		if (node.endingType === 'NEUTRAL') return '#4a4636';
		if (node.id === story.startNodeId) return '#8fb3a0';
		return '#e8b45c';
	}
</script>

<!--
  The map is driven by pointer gestures — drag to move, drag from a rim to lay a
  road. Each has a keyboard-reachable equivalent in the inspector beside it (a
  road's destination is a select, a place's role a set of buttons), and places
  and roads are focusable and selectable with Enter. Dragging is the part with
  no sensible key equivalent, so it is the part that stays pointer-only.
-->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<svg
	bind:this={svg}
	viewBox="{box.minX} {box.minY} {box.width} {box.height}"
	class="h-full w-full touch-none select-none {placing ? 'cursor-copy' : ''}"
	role="application"
	aria-label="Story map"
	onpointermove={onPointerMove}
	onpointerup={onPointerUp}
	onpointercancel={onPointerUp}
	onclick={onCanvasClick}
>
	<defs>
		<marker
			id="arrow"
			viewBox="0 0 8 8"
			refX="7"
			refY="4"
			markerWidth="7"
			markerHeight="7"
			orient="auto"
		>
			<path d="M 0 0 L 8 4 L 0 8 z" fill="currentColor" />
		</marker>
	</defs>

	<!-- Roads, under the places so a card is never hidden by a line. -->
	<g>
		{#each edges as edge (edge.choice.id)}
			{@const chosen = selected?.kind === 'choice' && selected.id === edge.choice.id}
			{@const colour =
				edge.choice.result === 'SETBACK'
					? '#c98a8a'
					: edge.choice.result === 'DETOUR'
						? '#8a9ac9'
						: '#6b6f8c'}

			<!-- A fat invisible line first: a 1px path is impossible to hit. -->
			<path
				d={edge.d}
				stroke="transparent"
				stroke-width="16"
				fill="none"
				class="cursor-pointer"
				role="button"
				tabindex="0"
				aria-label="Road: {edge.choice.label}"
				onclick={(event) => {
					event.stopPropagation();
					onSelect({ kind: 'choice', id: edge.choice.id });
				}}
				onkeydown={(event) => {
					if (event.key === 'Enter' || event.key === ' ') {
						event.preventDefault();
						onSelect({ kind: 'choice', id: edge.choice.id });
					}
				}}
			/>
			<path
				d={edge.d}
				stroke={chosen ? '#e8b45c' : colour}
				stroke-width={chosen ? 2.4 : 1.4}
				stroke-dasharray={edge.choice.result === 'DETOUR' ? '6 4' : undefined}
				fill="none"
				marker-end="url(#arrow)"
				style:color={chosen ? '#e8b45c' : colour}
				class="pointer-events-none"
			/>
			<text
				x={edge.labelX}
				y={edge.labelY}
				text-anchor="middle"
				dominant-baseline="middle"
				class="pointer-events-none font-mono"
				font-size="11"
				fill={chosen ? '#e8b45c' : '#8b8fa8'}
			>
				{edge.choice.label}
			</text>
		{/each}

		<!-- The road being pulled out of a place right now. -->
		{#if linking}
			{@const from = nodeById.get(linking.from)}
			{#if from}
				{@const start = at(from)}
				<path
					d={edgeGeometry(start.x, start.y, linking.x, linking.y).d}
					stroke="#e8b45c"
					stroke-width="1.8"
					stroke-dasharray="5 4"
					fill="none"
					class="pointer-events-none"
				/>
			{/if}
		{/if}
	</g>

	<!-- Places -->
	<g>
		{#each story.nodes as node (node.id)}
			{@const here = at(node)}
			{@const chosen = selected?.kind === 'node' && selected.id === node.id}
			{@const target = linking?.over === node.id}

			<g style:transform="translate({here.x}px, {here.y}px)">
				{#if chosen || target}
					<circle r={PORT_R + 5} fill="none" stroke="#e8b45c" stroke-width="1" opacity="0.5" />
				{/if}

				<!-- The rim: drag from here to lay a road. Endings have no roads out. -->
				{#if !node.endingType}
					<circle
						r={PORT_R}
						fill="transparent"
						stroke="#e8b45c"
						stroke-width="1"
						stroke-dasharray="2 5"
						opacity={chosen ? 0.7 : 0.18}
						class="cursor-crosshair"
						role="button"
						tabindex="-1"
						aria-label="Lay a road from {node.title}"
						onpointerdown={(event) => startLink(event, node)}
					/>
				{/if}

				<circle
					r={NODE_R}
					fill={fillFor(node)}
					stroke={strokeFor(node)}
					stroke-width={chosen ? 2.4 : 1.6}
					stroke-dasharray={warned.has(node.id) && !flagged.has(node.id) ? '4 3' : undefined}
					class="cursor-grab"
					role="button"
					tabindex="0"
					aria-label="Place: {node.title || 'unnamed'}"
					onpointerdown={(event) => startDrag(event, node)}
					onclick={(event) => event.stopPropagation()}
					onkeydown={(event) => {
						if (event.key === 'Enter' || event.key === ' ') {
							event.preventDefault();
							onSelect({ kind: 'node', id: node.id });
						}
					}}
				/>

				{#if node.id === story.startNodeId}
					<circle r={NODE_R - 6} fill="none" stroke="#8fb3a0" stroke-width="1" opacity="0.6" />
				{/if}

				<text
					y={NODE_R + 16}
					text-anchor="middle"
					class="pointer-events-none font-mono"
					font-size="11"
					fill={flagged.has(node.id) ? '#e06c75' : chosen ? '#e8b45c' : '#c9ccd8'}
				>
					{node.title || '(unnamed)'}
				</text>

				{#if flagged.has(node.id)}
					<text
						x={NODE_R - 4}
						y={-NODE_R + 6}
						class="pointer-events-none"
						font-size="14"
						fill="#e06c75">!</text
					>
				{/if}
			</g>
		{/each}
	</g>
</svg>
