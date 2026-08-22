<script lang="ts">
	/**
	 * How far this agent has ever got, as pips.
	 *
	 * Against `parSteps` — the shortest route home — rather than steps taken, so a
	 * detour does not read as progress. It can legitimately overshoot: an agent may
	 * walk further than par and still be walking, which is why the pips clamp
	 * rather than adding a row.
	 *
	 * Bars rather than a number because it sits under the name at the top of the
	 * brain screen, where a fraction would compete with it for the same glance.
	 */
	type Props = {
		reached: number;
		/** Par for the course. Never zero for a real story; guarded anyway. */
		total: number;
	};

	let { reached, total }: Props = $props();

	const pips = $derived(Array.from({ length: Math.max(total, 1) }, (_, i) => i));
	const filled = $derived(Math.min(reached, Math.max(total, 1)));
</script>

<div class="flex items-center gap-1.5" role="img" aria-label="{filled}/{Math.max(total, 1)}">
	{#each pips as i (i)}
		<span
			class="h-1.5 w-[18px] rounded-full transition-colors duration-300"
			style:background={i < filled ? '#fff' : 'rgb(255 255 255 / 32%)'}
		></span>
	{/each}
</div>
