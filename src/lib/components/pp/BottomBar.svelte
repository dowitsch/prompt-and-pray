<script lang="ts">
	/**
	 * The bar along the bottom of both in-match screens: one button that swaps
	 * between the map and a memory, and the faces of everyone in the round.
	 *
	 * On the map a face moves the camera. In a brain it changes whose head you are
	 * reading. Your own face keeps its white ring in both, because the bubble on the
	 * map and your own memory are the only things that are yours.
	 *
	 * The roster comes first and the toggle sits on the right, which is the revised
	 * design's order and the better one: the faces are the thing you reach for, and
	 * a thumb finds them before it finds a corner. The roster also carries the turn
	 * order now — the strip of dots that used to say it lived inside the story panel
	 * that has gone, and saying it twice was always the clutter that strip replaced.
	 */
	import type { PublicPlayer } from '$lib/engine/game';
	import Avatar from './Avatar.svelte';
	import Icon from './Icon.svelte';
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
	<div
		data-shot="roster"
		data-mode={mode}
		class="flex pp-scroll min-w-0 flex-1 items-center gap-2.5 overflow-x-auto"
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
					ringColour={player.id === youId ? '#fff' : picked ? colorOf(player) : 'transparent'}
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
			<!-- Back to the land. Not a QR mark: that means "show my code" here. -->
			<span class="grid h-full w-full place-items-center bg-bright">
				<Icon name="map" size={24} colour="#fff" />
			</span>
		{/if}
	</button>
</div>
