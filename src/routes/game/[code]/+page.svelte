<script lang="ts">
	/**
	 * The match: the map, somebody's memory, and the end.
	 *
	 * One route with a toggle rather than two, so switching does not remount the
	 * map — which would throw away the camera position and the feed's scroll every
	 * time you glanced at a rival's head.
	 */
	import { conn } from '$lib/client/connection.svelte';
	import { closeOverlay, ui } from '$lib/client/ui.svelte';
	import MapScreen from '$lib/components/pp/screens/MapScreen.svelte';
	import BrainScreen from '$lib/components/pp/screens/BrainScreen.svelte';
	import EndCard from '$lib/components/pp/EndCard.svelte';

	const game = $derived(conn.game);
	const finished = $derived(game?.phase === 'over');

	/** Dismissed once, the end card stays dismissed until the next match ends. */
	let endDismissed = $state(false);

	$effect(() => {
		if (!finished) endDismissed = false;
	});
</script>

{#if !game || !conn.me}
	<div class="absolute inset-0 grid place-items-center px-8">
		<p class="text-center text-sm text-white/70">
			{conn.synced ? conn.t.game.noTale : conn.t.game.finding}
		</p>
	</div>
{:else}
	{#if ui.view === 'brain'}
		<BrainScreen />
	{:else}
		<MapScreen />
	{/if}

	{#if finished && !endDismissed}
		<EndCard
			onPlayAgain={() => {
				conn.playAgain();
				closeOverlay();
			}}
			onClose={() => (endDismissed = true)}
		/>
	{/if}
{/if}
