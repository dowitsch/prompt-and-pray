<script lang="ts">
	/**
	 * What the agent on the board is saying, and the map's only narration.
	 *
	 * The revised design deleted the story panel, so these are the whole of the
	 * telling. One shape; `BubbleStack` owns where they sit and how the older ones
	 * fade. They float clear of the bottom bar rather than docking to it, because a
	 * bubble that touched the roster would read as a label for a face.
	 *
	 * Three shapes, and the difference is the point.
	 *
	 * A *question* is a dark panel with the place along its top and the roads set
	 * out below: nobody is speaking yet, the world is simply presenting the choice.
	 * A *thought* is a filled bubble in the agent's own colour with a tail — now
	 * the agent is speaking, and answering the question that was just asked. A
	 * *death* is a dark pill with the colour pushed out to a ring, because nobody
	 * is speaking any more.
	 *
	 * Read in order they are the whole beat of a turn: here is the fork, here is
	 * what I make of it, here is what it cost. Each holds until the next arrives,
	 * so the question stands for exactly as long as the brain takes to think.
	 */
	import type { Bubble } from '$lib/client/connection.svelte';
	import type { PublicPlayer } from '$lib/engine/game';
	import Avatar from './Avatar.svelte';
	import Icon from './Icon.svelte';
	import { colorOf } from '$lib/client/identity';
	import { fmt } from '$lib/i18n';
	import { conn } from '$lib/client/connection.svelte';

	type Props = {
		bubble: Bubble;
		/** The speaker. Null while a snapshot is in flight; then nothing is drawn. */
		player: PublicPlayer | null;
		/**
		 * Whether to draw the tail.
		 *
		 * Only the newest bubble gets one: a tail says "this is being said now", and
		 * three of them pointing at the same agent would read as three mouths.
		 */
		tail?: boolean;
	};

	let { bubble, player, tail = true }: Props = $props();

	const colour = $derived(player ? colorOf(player) : '#F59D89');
	const label = $derived(player ? fmt(conn.t.map.storyOf, { name: player.name }) : '');
</script>

{#if player}
	<!--
		Keyed on the bubble id so a new sentence re-runs the entrance animation. Two
		identical thoughts in a row are still two moments.
	-->
	{#key bubble.id}
		<div class="animate-pp-rise flex" aria-label={label}>
			{#if bubble.kind === 'system'}
				<div
					class="w-full rounded-[26px] bg-dark px-[22px] py-[18px]
						shadow-[0_14px_34px_rgba(0,0,0,0.35)]"
				>
					<!-- The place, set like a label: it is context, not something said. -->
					{#if bubble.title}
						<div class="font-mono text-[10px] tracking-[0.14em] uppercase" style:color={colour}>
							{bubble.title}
						</div>
					{/if}
					<div class="pt-1.5 text-base leading-snug text-white">{bubble.text}</div>
				</div>
			{:else if bubble.kind === 'fail'}
				<div
					class="flex items-center gap-3.5 rounded-[34px] bg-dark py-[7px] pr-6 pl-[7px]
						shadow-[0_14px_34px_rgba(0,0,0,0.35)]"
				>
					<span
						class="grid h-11 w-11 shrink-0 place-items-center rounded-full border-[2.4px]"
						style:border-color={colour}
					>
						<Icon name="cross" size={20} width={2.6} {colour} />
					</span>
					<span class="text-[17px] leading-tight font-bold" style:color={colour}>
						{bubble.text}
					</span>
				</div>
			{:else}
				<div
					class="relative flex items-start gap-3.5 rounded-[26px] py-[18px] pr-[22px] pl-4
						shadow-[0_14px_34px_rgba(0,0,0,0.35)]"
					style:background={colour}
				>
					<!--
						The mockup puts a placeholder tag in this circle. The real thing that
						belongs there is the face: the bubble is somebody talking, and the
						colour alone stops meaning "who" the moment two agents share a hue
						across matches.
					-->
					<Avatar {player} size={40} ring={2} ringColour="#fff" />
					<span class="pt-2 text-base leading-snug text-white">{bubble.text}</span>
					{#if tail}
						<!-- The tail, notched under the left edge so it points at the roster. -->
						<span
							class="absolute bottom-[-14px] left-[26px] h-0 w-0
								border-t-[18px] border-r-[20px] border-l-[10px] border-r-transparent
								border-l-transparent"
							style:border-top-color={colour}
						></span>
					{/if}
				</div>
			{/if}
		</div>
	{/key}
{/if}
