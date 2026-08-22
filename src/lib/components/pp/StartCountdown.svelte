<script lang="ts">
	/**
	 * The lobby's 3-2-1.
	 *
	 * Read from the server's timestamp rather than counted down locally, so four
	 * phones show the same number and a tab that was backgrounded comes back to the
	 * right one instead of to wherever it stopped.
	 */
	import { clock, secondsUntil, tick } from '$lib/client/clock.svelte';

	type Props = { startsAt: number };
	let { startsAt }: Props = $props();

	$effect(tick);

	const left = $derived(secondsUntil(startsAt, clock.now));
</script>

{#if startsAt && left > 0}
	<div
		class="animate-pp-fade absolute inset-0 z-[65] grid place-items-center bg-[#0E0F10]/[0.78]"
		aria-live="assertive"
	>
		{#key left}
			<span class="animate-pp-pop display text-[120px] text-white">{left}</span>
		{/key}
	</div>
{/if}
