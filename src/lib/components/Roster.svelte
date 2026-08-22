<script lang="ts">
	import type { PublicPlayer } from '$lib/engine/game';
	import { agentColor } from '$lib/client/palette';
	import { conn } from '$lib/client/connection.svelte';

	const t = $derived(conn.t.roster);

	type Props = {
		players: PublicPlayer[];
		youId: string | null;
		activeId: string | null;
		depth: number;
		sabotageUsed: boolean;
		finished: boolean;
		onSabotage: (player: PublicPlayer) => void;
	};

	let { players, youId, activeId, depth, sabotageUsed, finished, onSabotage }: Props = $props();

	// Furthest first, so the roster reads as a standing.
	const ranked = $derived([...players].sort((a, b) => b.bestDepth - a.bestDepth));
</script>

<section class="leaf">
	<header class="flex items-baseline justify-between px-5 py-3.5 rule-b">
		<h2 class="rubric">{t.title}</h2>
		{#if !finished}
			<span class="text-[11px] {sabotageUsed ? 'text-faded' : 'text-rose/90'} italic">
				{sabotageUsed ? t.mischiefSpent : t.mischiefLeft}
			</span>
		{/if}
	</header>

	<ul class="divide-y divide-rule/50">
		{#each ranked as player (player.id)}
			{@const isYou = player.id === youId}
			{@const colour = agentColor(player.seat, isYou)}
			{@const active = player.id === activeId}
			<li class="px-5 py-3 transition-colors" class:lit={active}>
				<div class="flex items-baseline gap-2">
					<span class="title text-[13px]" style:color={colour}>{player.name}</span>
					{#if isYou}<span class="rubric">{t.you}</span>{/if}
					{#if player.agent.thinking}
						<span class="text-[11px] text-faded italic">{t.thinking}</span>
					{:else if player.wasSabotaged}
						<span class="text-[11px] text-rose/80 italic">{t.misled}</span>
					{/if}
					<span class="ml-auto font-mono text-[10px] text-faded tabular-nums">
						{player.bestDepth}/{depth}
					</span>
				</div>

				<!-- Progress as a row of lanterns rather than a bar. -->
				<div class="mt-2 flex items-center gap-2">
					<div class="flex flex-1 gap-1">
						{#each Array.from({ length: depth }, (_, i) => i) as i (i)}
							<span
								class="h-1.5 flex-1 rounded-full transition-all duration-500"
								style:background={i < player.bestDepth ? colour : 'var(--color-rule)'}
								style:opacity={i < player.bestDepth ? 0.85 : 1}
							></span>
						{/each}
					</div>

					{#if !finished && !isYou}
						<button
							type="button"
							onclick={() => onSabotage(player)}
							disabled={sabotageUsed || player.memory.length === 0}
							title={t.misleadHint}
							class="shrink-0 rounded border border-rule px-2 py-0.5 text-[10px]
								tracking-[0.14em] text-faded uppercase transition
								hover:border-rose/60 hover:text-rose
								disabled:cursor-not-allowed disabled:opacity-25 disabled:hover:border-rule disabled:hover:text-faded"
						>
							{t.mislead}
						</button>
					{/if}
				</div>
			</li>
		{/each}
	</ul>
</section>

<style>
	/* The agent whose turn is being told sits in the light. */
	.lit {
		background: rgb(255 250 240 / 4%);
	}
</style>
