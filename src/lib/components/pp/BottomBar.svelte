<script lang="ts">
	/**
	 * The bar along the bottom of both in-match screens: one button that swaps
	 * between the map and a memory, and the faces of everyone in the round.
	 *
	 * On the map a face moves the camera. In a brain it changes whose head you are
	 * reading. Only the face you have picked is ringed — your own used to wear a
	 * white one permanently, which meant the one ring in the row that could not be
	 * moved was also the one that never told you anything you did not know. Your own
	 * agent is still marked where it matters: as a white ring on the map token.
	 *
	 * The roster comes first and the toggle sits on the right, which is the revised
	 * design's order and the better one: the faces are the thing you reach for, and
	 * a thumb finds them before it finds a corner. The roster also carries the turn
	 * order now — the strip of dots that used to say it lived inside the story panel
	 * that has gone, and saying it twice was always the clutter that strip replaced.
	 */
	import type { PublicPlayer } from '$lib/engine/game';
	import Avatar from './Avatar.svelte';
	import { conn } from '$lib/client/connection.svelte';
	import { colorOf } from '$lib/client/identity';
	import { PLAYER_COLORS } from '$lib/client/theme';
	import { fmt } from '$lib/i18n';

	type Props = {
		players: PublicPlayer[];
		youId: string | null;
		/** Which face is currently picked out. */
		activeId: string | null;
		mode: 'map' | 'brain';
		onToggle: () => void;
		onPick: (id: string) => void;
	};

	let { players, youId, activeId, mode, onToggle, onPick }: Props = $props();

	const t = $derived(conn.t.map);
	/** Whose turn it is, so the roster shows the spotlight too. */
	const telling = $derived(conn.game?.phase === 'running' ? conn.activeId : null);
	/**
	 * Who has already had their turn this round.
	 *
	 * The turn order used to be a row of dots in the story panel. With the panel
	 * gone the faces have to carry it, and they can: an agent that has been is
	 * dimmed, the one walking pulses, the ones still to come are plain.
	 */
	const walked = $derived(
		conn.game?.phase === 'running' ? conn.order.slice(0, conn.turnIndex) : []
	);
</script>

<div class="absolute inset-x-3.5 bottom-[22px] flex items-center gap-3">
	<!--
		The padding is not decoration. A ring is a `box-shadow`, which draws outside
		the element's box, and `overflow-x-auto` clips on both axes — so without room
		above and below, every face in this row was shaved flat top and bottom along
		with the 3px it lifts on hover. The matching negative margin keeps the row
		the height it was, so nothing else on the bar moves.
	-->
	<div
		data-shot="roster"
		data-mode={mode}
		class="-my-2 flex pp-scroll min-w-0 flex-1 items-center gap-2.5 overflow-x-auto py-2"
	>
		{#each players as player (player.id)}
			{@const picked = player.id === activeId}
			{@const done = mode === 'map' && player.id !== telling && walked.includes(player.id)}
			<button
				type="button"
				class:animate-pp-pulse={mode === 'map' && player.id === telling}
				data-me={player.id === youId ? '' : undefined}
				onclick={() => onPick(player.id)}
				aria-label={fmt(mode === 'map' ? t.focusOn : conn.t.brain.selectPlayer, {
					name: player.name
				})}
				aria-pressed={picked}
				class="shrink-0 rounded-full transition hover:-translate-y-[3px]"
				style:opacity={done ? 0.45 : mode === 'brain' && !picked ? 0.75 : 1}
			>
				<Avatar
					{player}
					{youId}
					size={58}
					ring={3}
					ringColour={picked ? colorOf(player) : 'transparent'}
				/>
			</button>
		{/each}
	</div>
	<button
		type="button"
		data-shot="toggle-view"
		data-mode={mode}
		onclick={onToggle}
		aria-label={mode === 'map' ? t.toBrain : t.toMap}
		class="grid h-[58px] w-[58px] shrink-0 overflow-hidden rounded-2xl
			shadow-[0_8px_20px_rgba(0,0,0,0.3)] transition hover:-translate-y-[3px]"
	>
		{#if mode === 'map'}
			<!-- Four colours: the button leads to somebody's head, and heads have colours. -->
			<span class="grid h-full w-full grid-cols-2 grid-rows-2">
				{#each PLAYER_COLORS.slice(0, 4) as colour (colour)}
					<span style:background={colour}></span>
				{/each}
			</span>
		{:else}
			<!--
				Back to the land, as a piece of the land: a scrap of terrain says "map"
				faster than a drawing of a folded one does, and it is the only button in
				the design that leads somewhere with a picture of its own. Decorative, so
				the label on the button carries the meaning; `object-cover` because the
				square is 58px and the scrap is not.
			-->
			<span class="grid h-full w-full place-items-center bg-bright">
				<img src="/map-thumb.webp" alt="" class="h-full w-full object-cover" />
			</span>
		{/if}
	</button>
</div>
