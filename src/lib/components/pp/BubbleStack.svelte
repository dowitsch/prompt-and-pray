<script lang="ts">
	/**
	 * The last couple of things said this turn, stacked and fading.
	 *
	 * A line only means something next to the one before it — here is the fork,
	 * here is what I make of it — so the two stay on screen together, the newest at
	 * the bottom in full and the older one stepped back out of the way. It reads as
	 * one thought forming rather than two unrelated captions.
	 *
	 * The fade is by position rather than by a timer, which is what keeps the map
	 * readable *and* keeps the newest line up for as long as it has: nothing
	 * disappears on a clock, it is only ever pushed up by something newer.
	 */
	import type { Bubble } from '$lib/client/connection.svelte';
	import type { PublicPlayer } from '$lib/engine/game';
	import StepBubble from './StepBubble.svelte';

	type Props = {
		/** Oldest first. The last one is the one being said now. */
		bubbles: Bubble[];
		players: PublicPlayer[];
	};

	let { bubbles, players }: Props = $props();

	/** Newest is whole; each step back is a touch smaller, never fainter. */
	const STEP_BACK = 0.96;
</script>

<div
	data-shot="step-bubble"
	class="pointer-events-none absolute inset-x-[18px] bottom-[112px] flex flex-col items-start gap-2.5"
	role="status"
	aria-live="polite"
>
	{#each bubbles as bubble, i (bubble.id)}
		{@const age = bubbles.length - 1 - i}
		{@const speaker = players.find((p) => p.id === bubble.playerId) ?? null}
		<div
			class="w-full origin-bottom transition-all duration-500 ease-out"
			style:scale={age ? STEP_BACK : 1}
			aria-hidden={age > 0}
		>
			<StepBubble {bubble} player={speaker} tail={age === 0} />
		</div>
	{/each}
</div>
