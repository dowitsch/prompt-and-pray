<script lang="ts">
	/**
	 * One line of the story, in one of the design's six shapes.
	 *
	 * The tint is the interesting part. On the map the feed is your own, so the
	 * agent's thoughts and its failures are drawn in *your* colour — the panel
	 * reads as your head. In the brain screen the ground is already the selected
	 * player's colour, so the same entries go white instead, and the injection
	 * pill becomes a wash of white rather than a wash of colour.
	 */
	import type { FeedEntry } from '$lib/client/connection.svelte';
	import Icon from './Icon.svelte';

	type Props = {
		entry: FeedEntry;
		/** Colour for a thought and a failure. */
		tint: string;
		/** Fill for the injection pill. */
		injectionFill: string;
		/** True on a rival's clue that could be overwritten. */
		selectable?: boolean;
		selected?: boolean;
		onSelect?: () => void;
		selectLabel?: string;
	};

	let {
		entry,
		tint,
		injectionFill,
		selectable = false,
		selected = false,
		onSelect,
		selectLabel
	}: Props = $props();
</script>

<div class="animate-pp-rise">
	{#if entry.kind === 'lore'}
		<p class="text-sm leading-[1.45] text-white">{entry.text}</p>
	{:else if entry.kind === 'clue'}
		{#if selectable && onSelect}
			<!-- A rival's note: tap it to choose it as the line you will overwrite. -->
			<button
				type="button"
				data-shot="clue-line"
				onclick={onSelect}
				aria-pressed={selected}
				aria-label={selectLabel}
				class="w-full rounded-[14px] px-2 py-1 text-left text-sm leading-[1.45] font-bold
					text-white transition
					{selected ? 'bg-white/25 ring-2 ring-white' : 'hover:bg-white/10'}"
			>
				{entry.text}
			</button>
		{:else}
			<p class="text-sm leading-[1.45] font-bold text-white">{entry.text}</p>
		{/if}
	{:else if entry.kind === 'thought'}
		<div class="flex items-start gap-3 pl-2" style:color={tint}>
			<span
				class="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full border-[1.6px]
					border-current"
			>
				<Icon name="question" size={20} />
			</span>
			<p class="pt-[3px] text-sm leading-[1.45]">{entry.text}</p>
		</div>
	{:else if entry.kind === 'success'}
		<div class="flex items-center gap-3 pl-2 text-white">
			<span
				class="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full border-[1.6px]
					border-white"
			>
				<Icon name="check" size={14} width={3} colour="#fff" />
			</span>
			<p class="text-sm font-bold">{entry.text}</p>
		</div>
	{:else if entry.kind === 'fail'}
		<div
			class="flex items-center gap-3 rounded-[22px] border-[1.6px] border-current px-3.5 py-2"
			style:color={tint}
		>
			<span
				class="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full border-[1.6px]
					border-current"
			>
				<Icon name="cross" size={13} width={3} />
			</span>
			<p class="text-sm font-bold">{entry.text}</p>
		</div>
	{:else}
		<div
			class="flex items-center gap-3 rounded-[22px] px-3.5 py-[9px] text-white"
			style:background={injectionFill}
		>
			<span
				class="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full border-[1.6px]
					border-white"
			>
				<Icon name="bang" size={22} colour="#fff" />
			</span>
			<p class="text-sm font-bold">{entry.text}</p>
		</div>
	{/if}
</div>
