<script lang="ts">
	/**
	 * The last few things said this turn, stacked and fading.
	 *
	 * A turn is a beat of three — here is the fork, here is what I make of it, here
	 * is what it cost — and each line only means something next to the one before
	 * it. So they stay on screen together, the newest at the bottom in full and the
	 * older ones dimming upward out of the way. It reads as one thought forming
	 * rather than three unrelated captions.
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

	/** Newest is whole; each step back is dimmer and a touch smaller. */
	const DEPTH = [1, 0.5, 0.26];
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
			style:opacity={DEPTH[age] ?? 0}
			style:scale={age ? 0.96 : 1}
			aria-hidden={age > 0}
		>
			<StepBubble {bubble} player={speaker} tail={age === 0} />
		</div>
	{/each}
</div>
