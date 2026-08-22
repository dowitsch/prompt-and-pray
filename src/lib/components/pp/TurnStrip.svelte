<script lang="ts">
	/**
	 * The shape of the round, where the clue input sits while the round runs.
	 *
	 * During a run that row can do nothing — the ration is closed until the next
	 * teaching phase — so instead of a dimmed field it carries the one thing worth
	 * knowing while you watch: who has already gone, who is going, who is still to
	 * come. Dots rather than faces, because the roster right below is faces and
	 * saying it twice is the clutter this replaces.
	 *
	 * Read-only on purpose. Tapping a face is how you look at somebody; this is
	 * only the story's position.
	 */
	import Icon from './Icon.svelte';
	import { conn } from '$lib/client/connection.svelte';
	import { colorOf } from '$lib/client/identity';
	import { fmt } from '$lib/i18n';

	const order = $derived(conn.order);
	const players = $derived(conn.game?.players ?? []);

	function playerAt(id: string) {
		return players.find((p) => p.id === id);
	}
</script>

<!-- The input row's exact height (2px seam + 46px field + 10/14 padding), so the
	 panel does not resize when the phase changes under it. -->
<div data-shot="turn-strip" class="flex h-[72px] flex-none items-center gap-2.5 px-5">
	{#each order as id, i (id)}
		{@const player = playerAt(id)}
		{@const colour = player ? colorOf(player) : '#fff'}
		{@const done = i < conn.turnIndex}
		{@const active = i === conn.turnIndex}
		{@const died = player?.agent.status === 'dead'}
		<!--
			The state has to carry the reading, not the colour: five warm oranges at 12px
			are indistinguishable from each other, so waiting is a plain hollow ring and
			only the agents that have actually walked wear their own colour.
		-->
		<span
			class="grid shrink-0 place-items-center rounded-full transition-all duration-500"
			style:width="{active ? 22 : done ? 14 : 12}px"
			style:height="{active ? 22 : done ? 14 : 12}px"
			style:background={active || done ? colour : 'transparent'}
			style:border={active || done ? 'none' : '2px solid rgb(255 255 255 / 22%)'}
			style:box-shadow={active ? `0 0 0 2px rgb(255 255 255 / 55%), 0 0 14px ${colour}` : 'none'}
		>
			{#if done}
				<Icon name={died ? 'cross' : 'check'} size={9} width={4} colour="rgba(0,0,0,0.55)" />
			{/if}
		</span>
	{/each}

	<span class="ml-auto text-[11px] font-bold text-white/45 tabular-nums">
		{fmt(conn.t.narration.turnOf, { n: conn.turnIndex + 1, total: conn.turnTotal })}
	</span>
</div>
