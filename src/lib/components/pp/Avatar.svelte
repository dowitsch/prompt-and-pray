<script lang="ts">
	/**
	 * A player, as a disc.
	 *
	 * Used at four sizes — the map token, the roster strip, the lobby row and the
	 * brain header — and always ringed: white when it is you, your colour when it
	 * is somebody else. That ring is the whole of "which one am I" in this design,
	 * since the colour now belongs to the player rather than to the viewer.
	 */
	import type { PublicPlayer } from '$lib/engine/game';
	import { characterOf, characterSrc, colorOf } from '$lib/client/identity';
	import { WHITE } from '$lib/client/theme';

	type Props = {
		player: PublicPlayer;
		youId?: string | null;
		size?: number;
		/** Ring weight in px. 0 for no ring at all. */
		ring?: number;
		/** Override the ring colour — the roster uses it to show what is selected. */
		ringColour?: string | null;
		dim?: boolean;
	};

	let {
		player,
		youId = null,
		size = 58,
		ring = 2,
		ringColour = null,
		dim = false
	}: Props = $props();

	const isYou = $derived(player.id === youId);
	const colour = $derived(ringColour ?? (isYou ? WHITE : colorOf(player)));
	let failed = $state(false);
</script>

<span
	class="relative grid shrink-0 place-items-center overflow-hidden rounded-full transition-opacity"
	style:width="{size}px"
	style:height="{size}px"
	style:box-shadow={ring ? `0 0 0 ${ring}px ${colour}` : 'none'}
	style:opacity={dim ? 0.4 : 1}
>
	{#if failed}
		<span class="placeholder"></span>
	{:else}
		<img
			src={characterSrc(characterOf(player))}
			alt=""
			class="h-full w-full object-cover"
			onerror={() => (failed = true)}
		/>
	{/if}
</span>

<style>
	.placeholder {
		width: 100%;
		height: 100%;
		background-color: #2a2e31;
		background-image: repeating-linear-gradient(
			45deg,
			rgb(255 255 255 / 12%) 0 5px,
			transparent 5px 10px
		);
	}
</style>
