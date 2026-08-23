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
	import { characterNameOf, colorOf } from '$lib/client/identity';
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
		/**
		 * Where the tail's point sits, in px from this bubble's left edge.
		 *
		 * `BubbleStack` works it out from the speaker's place in the roster below, so
		 * the notch lands over that agent's face rather than over the first one. See
		 * the note there for the arithmetic.
		 */
		tailAt?: number;
	};

	let { bubble, player, tail = true, tailAt = 26 }: Props = $props();

	/** The tail's left border, which is what stands between its box and its point. */
	const TAIL_LEAD = 10;

	const colour = $derived(player ? colorOf(player) : '#F59D89');
	// The agent speaks, so the bubble is signed with the character. The operator's
	// own name belongs to the roster.
	const label = $derived(player ? fmt(conn.t.map.storyOf, { name: characterNameOf(player) }) : '');
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
					<div class="pt-1.5 text-base leading-relaxed text-white">{bubble.text}</div>
				</div>
			{:else if bubble.kind === 'fail'}
				<!--
					Set to the thought bubble's own measurements — the same corner, the same
					gap, the same padding, and a disc the size of a face. It is the third
					beat of the same turn and it sat a few pixels off from the two before it,
					which read as a different kind of thing having happened rather than as
					the same agent's story ending.
				-->
				<div
					class="flex items-center gap-3.5 rounded-[26px] bg-dark py-[18px] pr-[22px] pl-4
						shadow-[0_14px_34px_rgba(0,0,0,0.35)]"
				>
					<span
						class="grid h-10 w-10 shrink-0 place-items-center rounded-full border-[2.4px]"
						style:border-color={colour}
					>
						<Icon name="cross" size={18} width={2.6} {colour} />
					</span>
					<span class="text-base leading-relaxed font-bold" style:color={colour}>
						{bubble.text}
					</span>
				</div>
			{:else}
				<div
					class="relative flex items-center gap-3.5 rounded-[26px] py-[18px] pr-[22px] pl-4
						shadow-[0_14px_34px_rgba(0,0,0,0.35)]"
					style:background={colour}
				>
					<!--
						The mockup puts a placeholder tag in this circle. The real thing that
						belongs there is the face: the bubble is somebody talking, and the
						colour alone stops meaning "who" the moment two agents share a hue
						across matches.

						Unringed: the bubble is already the agent's own colour, so a white
						hairline around the face was a border between a thing and itself.
					-->
					<Avatar {player} size={40} ring={0} />
					<span class="text-base leading-relaxed text-white">
						{bubble.text}
						<!--
							Said, but not by the character: the model did not answer in time and
							the offline brain stood in. Small and set inside the sentence rather
							than beside it, because it qualifies the line — it is not news.
						-->
						{#if bubble.improvised}
							<span class="ml-1 text-xs whitespace-nowrap text-white/65 italic">
								{conn.t.map.onInstinct}
							</span>
						{/if}
					</span>
					{#if tail}
						<!--
							The tail, notched under the bubble and aimed: its point sits over the
							speaker's own face in the roster below, so a line of dialogue says who
							is saying it without anybody having to match two colours across an
							inch of map.
						-->
						<span
							class="absolute bottom-[-14px] h-0 w-0 border-t-[18px] border-r-[20px]
								border-l-[10px] border-r-transparent border-l-transparent"
							style:left="{tailAt - TAIL_LEAD}px"
							style:border-top-color={colour}
						></span>
					{/if}
				</div>
			{/if}
		</div>
	{/key}
{/if}
