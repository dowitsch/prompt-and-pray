<script lang="ts">
	/**
	 * A scrolling history that sticks to the bottom until you scroll away from it.
	 *
	 * The stickiness has to be conditional: the feed grows while you are reading it,
	 * and yanking someone back to the newest line every time an agent thinks would
	 * make the older story unreadable. So once you scroll up, it stays put and
	 * offers the jump button from the mockups instead.
	 */
	import type { FeedEntry as Entry } from '$lib/client/connection.svelte';
	import FeedEntry from './FeedEntry.svelte';
	import Icon from './Icon.svelte';
	import { conn } from '$lib/client/connection.svelte';

	type Props = {
		entries: Entry[];
		tint: string;
		injectionFill: string;
		/** Rival clues become tappable targets for an injection. */
		selectableLineId?: string | null;
		selectedLineId?: string | null;
		onSelectLine?: (lineId: string) => void;
		gap?: number;
		padding?: string;
		/** Where the jump-to-latest button sits, in px from the bottom. */
		jumpBottom?: number;
		/**
		 * Change this when the entries stop being the same story.
		 *
		 * The spotlight swaps the whole set as the turn passes; without a reset the
		 * reader inherits the last player's scroll position, landing in the middle
		 * of a stranger's history with the jump button stuck on.
		 */
		resetKey?: string;
	};

	let {
		entries,
		tint,
		injectionFill,
		selectableLineId = null,
		selectedLineId = null,
		onSelectLine,
		gap = 14,
		padding = '20px 18px 8px',
		jumpBottom = 74,
		resetKey = ''
	}: Props = $props();

	const t = $derived(conn.t.map);

	let box = $state<HTMLDivElement | null>(null);
	let away = $state(false);

	/** More than a line's worth from the bottom counts as "reading the old stuff". */
	const SLACK = 40;

	function onScroll() {
		if (!box) return;
		away = box.scrollHeight - box.scrollTop - box.clientHeight > SLACK;
	}

	function jump(smooth = true) {
		if (!box) return;
		box.scrollTo({ top: box.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
		away = false;
	}

	// A different story: nobody chose to be scrolled up in it.
	$effect(() => {
		void resetKey;
		away = false;
		jump(false);
	});

	// Follow the newest line, unless the reader has deliberately gone looking.
	$effect(() => {
		void entries.length;
		if (!box || away) return;
		box.scrollTop = box.scrollHeight;
	});
</script>

<div class="relative flex min-h-0 flex-1 flex-col">
	<div
		bind:this={box}
		onscroll={onScroll}
		class="flex pp-scroll min-h-0 flex-1 flex-col overflow-y-auto"
		style:gap="{gap}px"
		style:padding
	>
		{#each entries as entry (entry.id)}
			<FeedEntry
				{entry}
				{tint}
				{injectionFill}
				selectable={Boolean(selectableLineId !== null && entry.lineId && onSelectLine)}
				selected={Boolean(entry.lineId && entry.lineId === selectedLineId)}
				selectLabel={conn.t.brain.pickLineFirst}
				onSelect={entry.lineId && onSelectLine
					? () => onSelectLine(entry.lineId as string)
					: undefined}
			/>
		{/each}
	</div>

	{#if away}
		<button
			type="button"
			onclick={() => jump()}
			aria-label={t.jumpToLatest}
			class="animate-pp-pop absolute left-3.5 grid h-11 w-11 place-items-center rounded-[14px]
				bg-[#2E3236] shadow-[0_8px_20px_rgba(0,0,0,0.4)] transition hover:bg-[#3C4145]"
			style:bottom="{jumpBottom}px"
		>
			<Icon name="down" size={20} width={3} colour="#fff" />
		</button>
	{/if}
</div>
