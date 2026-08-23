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

	/*
	 * Where the roster's faces are, so a tail can point at one.
	 *
	 * These four numbers are `BottomBar`'s layout read off in px: its row starts at
	 * `inset-x-3.5`, each face is 58 wide with a `gap-2.5` after it, and this stack
	 * sits at `inset-x-[18px]`. Duplicated rather than measured because measuring
	 * would mean a `ResizeObserver` on a row that never changes size, and a tail
	 * that lags a frame behind the bubble it belongs to is worse than one that is
	 * two pixels out.
	 */
	const ROSTER_LEFT = 14;
	const FACE = 58;
	const FACE_GAP = 10;
	const STACK_LEFT = 18;

	/** The centre of a seat's face, in px from this stack's own left edge. */
	function faceAt(index: number): number {
		return ROSTER_LEFT + index * (FACE + FACE_GAP) + FACE / 2 - STACK_LEFT;
	}
</script>

<div
	data-shot="step-bubble"
	class="pointer-events-none absolute inset-x-[18px] bottom-[112px] flex flex-col items-start gap-2.5"
	role="status"
	aria-live="polite"
>
	{#each bubbles as bubble, i (bubble.id)}
		{@const age = bubbles.length - 1 - i}
		{@const seat = players.findIndex((p) => p.id === bubble.playerId)}
		{@const speaker = seat < 0 ? null : players[seat]}
		<div
			class="w-full origin-bottom transition-all duration-500 ease-out"
			style:scale={age ? STEP_BACK : 1}
			aria-hidden={age > 0}
		>
			<StepBubble {bubble} player={speaker} tail={age === 0} tailAt={faceAt(Math.max(seat, 0))} />
		</div>
	{/each}
</div>
