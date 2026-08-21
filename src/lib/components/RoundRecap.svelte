<script lang="ts">
	import type { RoundSummary } from '$lib/engine/types';
	import { agentColor } from '$lib/client/palette';

	type Props = {
		summary: RoundSummary;
		youId: string | null;
		depth: number;
	};

	let { summary, youId, depth }: Props = $props();

	// Furthest first: the round reads as a leaderboard of one attempt.
	const ranked = $derived(
		[...summary.outcomes].sort(
			(a, b) => Number(b.survived) - Number(a.survived) || b.depth - a.depth
		)
	);
	const best = $derived(Math.max(...summary.outcomes.map((o) => o.depth)));
</script>

<section class="animate-slide-up overflow-hidden panel">
	<header class="px-4 py-3 hairline">
		<div class="flex items-baseline justify-between">
			<h2 class="eyebrow">Round {String(summary.round).padStart(2, '0')}</h2>
			<span class="font-mono text-[10px] text-faint">what happened</span>
		</div>
		<!-- The one line that tells the story of the round. -->
		<p class="mt-1.5 font-mono text-sm leading-snug text-parchment">{summary.headline}</p>
	</header>

	<ul class="divide-y divide-edge/50">
		{#each ranked as outcome (outcome.playerId)}
			{@const isYou = outcome.playerId === youId}
			{@const colour = agentColor(outcome.seat, isYou)}
			<li class="px-4 py-2.5" class:bg-white-3={isYou}>
				<div class="flex items-baseline gap-2">
					<span class="font-mono text-[11px] tracking-[0.14em]" style:color={colour}>
						{outcome.name}
					</span>
					{#if isYou}<span class="eyebrow">you</span>{/if}

					{#if outcome.survived}
						<span class="font-mono text-[10px] tracking-[0.16em] text-ember uppercase">
							★ home
						</span>
					{:else if outcome.depth === best && best > 0}
						<span class="font-mono text-[10px] tracking-[0.16em] text-verdant/80 uppercase">
							furthest
						</span>
					{/if}

					<span class="ml-auto font-mono text-[10px] text-faint tabular-nums">
						{outcome.depth}/{depth}
					</span>
				</div>

				{#if !outcome.survived && outcome.killedBy}
					<p class="mt-0.5 font-mono text-[11px] text-faint">
						died at the <span class="text-blood">{outcome.killedBy.toLowerCase()}</span>
						{#if outcome.repeatedMistake}
							<span class="ml-1 text-[9px] tracking-[0.14em] text-blood uppercase">again</span>
						{/if}
						{#if outcome.wasSabotaged}
							<span class="ml-1 text-[9px] tracking-[0.14em] text-blood uppercase">
								· ran on a lie
							</span>
						{/if}
					</p>
				{/if}
			</li>
		{/each}
	</ul>
</section>

<style>
	/* A whisper of highlight on your own row, not a colour change. */
	.bg-white-3 {
		background: rgb(255 255 255 / 3%);
	}
</style>
