<script lang="ts">
	/**
	 * The match: the map, somebody's memory, and the end.
	 *
	 * One route with a toggle rather than two, and — crucially — the map is *never
	 * unmounted*. It used to sit in the `{:else}` of an `{#if}`, which read as a
	 * toggle but was a teardown: `GameMap` destroys the Pixi application, terminates
	 * the terrain worker and releases every texture when it goes away. Coming back
	 * from a rival's head rebuilt the whole scene, so the ground re-streamed section
	 * by section, the camera snapped to wherever it had started and every token
	 * restarted its tween mid-journey. That is the out-of-sync catch-up you would
	 * see on the way back.
	 *
	 * So the brain is drawn *over* the map rather than instead of it. The map keeps
	 * ticking underneath, which is what makes the return instant and correct: the
	 * camera has gone on following the turn the whole time you were reading, so
	 * there is nothing to catch up on.
	 */
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { conn } from '$lib/client/connection.svelte';
	import { closeOverlay, ui } from '$lib/client/ui.svelte';
	import MapScreen from '$lib/components/pp/screens/MapScreen.svelte';
	import BrainScreen from '$lib/components/pp/screens/BrainScreen.svelte';
	import EndCard from '$lib/components/pp/EndCard.svelte';

	const game = $derived(conn.game);
	const finished = $derived(game?.phase === 'over');
</script>

{#if !game || !conn.me}
	<div class="absolute inset-0 grid place-items-center px-8">
		<p class="text-center text-sm text-white/70">
			{conn.synced ? conn.t.game.noTale : conn.t.game.finding}
		</p>
	</div>
{:else}
	<!--
		Kept in the layout, not merely hidden: `display: none` would collapse the
		canvas host to nothing and Pixi's `resizeTo` would follow it down to 0×0 and
		back, which is its own flavour of the same jump. `inert` is what actually
		takes it out of reach while the brain is up.
	-->
	<div class="absolute inset-0" inert={ui.view === 'brain'} aria-hidden={ui.view === 'brain'}>
		<MapScreen />
	</div>

	{#if ui.view === 'brain'}
		<BrainScreen />
	{/if}

	{#if finished}
		<!-- The card's one button. The match is over; the front door opens a new one. -->
		<EndCard
			onLeave={() => {
				conn.leaveGame();
				closeOverlay();
				ui.lobbyView = 'qr';
				ui.configured = false;
				void goto(resolve('/'));
			}}
		/>
	{/if}
{/if}
