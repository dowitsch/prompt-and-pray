<script lang="ts">
	import type { RoundSummary } from '$lib/engine/types';
	import { agentColor, roman } from '$lib/client/palette';
	import { conn } from '$lib/client/connection.svelte';
	import { fmt, parts } from '$lib/i18n';

	const t = $derived(conn.t.tale);
	const lost = $derived(parts(t.lostAt, 'place'));

	type Props = {
		summary: RoundSummary;
		youId: string | null;
		depth: number;
	};

	let { summary, youId, depth }: Props = $props();

	const ranked = $derived(
		[...summary.outcomes].sort(
			(a, b) => Number(b.survived) - Number(a.survived) || b.depth - a.depth
		)
	);
	const best = $derived(Math.max(...summary.outcomes.map((o) => o.depth)));
</script>

<section class="animate-rise overflow-hidden leaf">
	<header class="px-5 py-4 rule-b">
		<h2 class="rubric">{fmt(t.round, { n: roman(summary.round) })}</h2>
		<!-- The one line that tells the story of the round. -->
		<p class="mt-2 text-[15px] leading-snug text-parchment">{summary.headline}</p>
	</header>

	<ul class="divide-y divide-rule/50">
		{#each ranked as outcome (outcome.playerId)}
			{@const isYou = outcome.playerId === youId}
			{@const colour = agentColor(outcome.seat, isYou)}
			<li class="px-5 py-2.5" class:lit={isYou}>
				<div class="flex items-baseline gap-2">
					<span class="title text-[13px]" style:color={colour}>{outcome.name}</span>
					{#if isYou}<span class="rubric">{t.you}</span>{/if}
					{#if outcome.survived}
						<span class="text-[11px] tracking-[0.14em] text-candle uppercase">{t.home}</span>
					{:else if outcome.depth === best && best > 0}
						<span class="text-[11px] tracking-[0.14em] text-moss/90 uppercase">{t.furthest}</span>
					{/if}
					<span class="ml-auto font-mono text-[10px] text-faded tabular-nums">
						{outcome.depth}/{depth}
					</span>
				</div>

				{#if !outcome.survived && outcome.killedBy}
					<p class="mt-0.5 text-[13px] text-quill">
						{lost.before}<span class="text-rose/90">{outcome.killedBy.toLowerCase()}</span
						>{lost.after}{#if outcome.repeatedMistake}<span class="text-rose/80 italic">
								{t.asBefore}</span
							>{/if}{#if outcome.wasSabotaged}<span class="text-rose/80 italic">
								{t.onFalsePage}</span
							>{/if}
					</p>
				{:else if outcome.ending === 'wandered' || outcome.ending === 'ended'}
					<!-- Neither home nor killed: nothing to blame, so nothing is named. -->
					<p class="mt-0.5 text-[13px] text-quill">
						{outcome.ending === 'wandered' ? t.wandered : t.stopped}{#if outcome.wasSabotaged}<span
								class="text-rose/80 italic"
							>
								{t.onFalsePage}</span
							>{/if}
					</p>
				{/if}
			</li>
		{/each}
	</ul>
</section>

<style>
	.lit {
		background: rgb(255 250 240 / 4%);
	}
</style>
