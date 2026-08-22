<script lang="ts">
	/**
	 * An agent's memory: the numbered prompts it will read before it chooses.
	 *
	 * This replaces the story feed that used to fill this screen, and the revised
	 * design is right to make the swap — the feed showed what *happened*, which the
	 * map already shows, while this shows the only thing on the phone a player can
	 * actually change. Numbered, because the order is what the agent reads them in.
	 *
	 * A poisoned line is drawn twice: what its owner wrote, and underneath, in the
	 * liar's colour, what it says now. The engine overwrites the line — the agent
	 * really does read only the lie — so the original is kept purely so the victim
	 * can see what was taken. Hiding it would make sabotage invisible, and a
	 * betrayal nobody can discover is not worth playing for.
	 */
	import type { PublicPlayer } from '$lib/engine/game';
	import type { MemoryLine } from '$lib/engine/types';
	import Icon from './Icon.svelte';
	import { colorOf } from '$lib/client/identity';
	import { conn } from '$lib/client/connection.svelte';
	import { fmt } from '$lib/i18n';

	type Props = {
		player: PublicPlayer;
		/** Everyone in the match, so a liar's id can be turned into their colour. */
		players: PublicPlayer[];
		mine: boolean;
		/** True when this player's lines may be picked as a sabotage target. */
		selectable: boolean;
		selectedLineId?: string | null;
		onSelect?: (lineId: string) => void;
	};

	let { player, players, mine, selectable, selectedLineId = null, onSelect }: Props = $props();

	const t = $derived(conn.t.brain);
	const lines = $derived(player.memory);

	/** The liar's colour, or this agent's own as a fallback if they have left. */
	function poisonColour(line: MemoryLine): string {
		const actor = players.find((p) => p.id === line.sabotagedById);
		return actor ? colorOf(actor) : colorOf(player);
	}

	let box = $state<HTMLDivElement | null>(null);

	// The newest note is the one you just wrote, so it is the one to be looking at.
	$effect(() => {
		void lines.length;
		if (box) box.scrollTop = box.scrollHeight;
	});
</script>

<div
	bind:this={box}
	class="flex pp-scroll min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 pt-2 pb-5"
>
	{#each lines as line, i (line.id)}
		{@const poisoned = Boolean(line.sabotagedBy)}
		{@const picked = line.id === selectedLineId}
		{@const canPick = selectable && !poisoned && Boolean(onSelect)}
		<div data-shot="clue-line" class="animate-pp-rise">
			<div
				class="-mx-3 flex items-center gap-3 rounded-2xl px-3 py-2.5 transition-all duration-200"
				style:background={picked ? 'rgb(28 31 34 / 28%)' : 'transparent'}
				style:box-shadow={picked ? '0 0 0 2px rgb(255 255 255 / 75%)' : 'none'}
			>
				<span class="min-w-[18px] shrink-0 text-base leading-normal font-bold text-white">
					{i + 1}
				</span>
				<span class="min-w-0 flex-1 text-base leading-normal text-white">
					{poisoned ? (line.originalText ?? line.text) : line.text}
				</span>

				{#if canPick}
					<!--
						The flask sits on the line it would replace, so choosing a target and
						choosing a line are the same gesture. Its tail points back at the text.
					-->
					<button
						type="button"
						data-shot="poison-line"
						onclick={() => onSelect?.(line.id)}
						aria-label={fmt(t.poisonLine, { n: i + 1 })}
						aria-pressed={picked}
						class="relative ml-2.5 grid h-[46px] w-[46px] shrink-0 place-items-center
							rounded-[14px] bg-dark transition hover:brightness-125"
					>
						<span
							class="absolute top-3.5 -left-2 h-0 w-0 border-t-[7px] border-r-[9px]
								border-b-[11px] border-t-transparent border-r-dark border-b-transparent"
						></span>
						<Icon name="flask" size={26} colour="#fff" />
					</button>
				{/if}
			</div>

			{#if poisoned}
				<div
					class="animate-pp-rise mt-2.5 ml-[26px] flex items-start gap-3 rounded-[18px] px-4 py-3"
					style:background={poisonColour(line)}
					aria-label={fmt(t.poisonedBy, { name: line.sabotagedBy ?? '' })}
				>
					<span class="shrink-0 pt-0.5"><Icon name="flask" size={20} colour="#fff" /></span>
					<span class="text-[15px] leading-snug font-bold text-white">{line.text}</span>
				</div>
			{/if}
		</div>
	{/each}

	{#if !lines.length}
		<p class="text-sm leading-relaxed text-white/60">
			{mine ? t.noNotesYet : t.theirNoNotes}
		</p>
	{/if}
</div>
