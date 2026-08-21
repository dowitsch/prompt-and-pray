<script lang="ts">
	import type { PublicPlayer } from '$lib/engine/game';
	import { agentColor, sigil } from '$lib/client/palette';

	type Props = {
		opponents: PublicPlayer[];
		depth: number;
		sabotageUsed: boolean;
		finished: boolean;
		onSabotage: (player: PublicPlayer) => void;
	};

	let { opponents, depth, sabotageUsed, finished, onSabotage }: Props = $props();

	const STATUS: Record<string, string> = {
		idle: 'waiting',
		running: 'in the field',
		dead: 'lost',
		home: 'home'
	};
</script>

<section class="flex flex-col panel">
	<header class="flex items-baseline justify-between px-4 py-3 hairline">
		<h2 class="eyebrow">Rival agents</h2>
		{#if !finished}
			<span class="font-mono text-[10px] {sabotageUsed ? 'text-faint' : 'text-blood'}">
				{sabotageUsed ? 'sabotage spent' : 'sabotage ready'}
			</span>
		{/if}
	</header>

	<ul class="divide-y divide-edge/60">
		{#each opponents as opponent (opponent.id)}
			{@const colour = agentColor(opponent.seat, false)}
			{@const progress = Math.round((opponent.bestDepth / depth) * 100)}
			<li class="px-4 py-3">
				<div class="flex items-center gap-2.5">
					<span
						class="grid h-6 w-6 shrink-0 place-items-center rounded-full border font-mono text-[9px] font-bold"
						style:border-color={colour}
						style:color={colour}
					>
						{sigil(opponent.name)}
					</span>

					<div class="min-w-0 flex-1">
						<div class="flex items-baseline gap-2">
							<span class="truncate font-mono text-xs tracking-[0.14em]" style:color={colour}>
								{opponent.name}
							</span>
							{#if opponent.agent.thinking}
								<span class="font-mono text-[9px] text-faint">thinking…</span>
							{:else}
								<span class="font-mono text-[9px] text-faint"
									>{STATUS[opponent.agent.status] ?? ''}</span
								>
							{/if}
						</div>
						<div class="mt-1 flex items-center gap-2">
							<div class="h-[3px] flex-1 overflow-hidden rounded-full bg-edge">
								<div
									class="h-full rounded-full transition-all duration-700"
									style:width="{progress}%"
									style:background={colour}
								></div>
							</div>
							<span class="font-mono text-[9px] text-faint tabular-nums">
								{opponent.bestDepth}/{depth}
							</span>
						</div>
					</div>
				</div>

				<div class="mt-2 flex items-center justify-between pl-8.5">
					<span class="font-mono text-[10px] text-faint">
						{opponent.runCount} runs · {opponent.memoryChars} chars
						{#if opponent.wasSabotaged}<span class="text-blood/70"> · hit</span>{/if}
					</span>

					{#if !finished}
						<button
							type="button"
							onclick={() => onSabotage(opponent)}
							disabled={sabotageUsed || opponent.memory.length === 0}
							class="rounded border border-edge px-2 py-0.5 font-mono text-[9px] tracking-[0.16em]
								text-faint uppercase transition
								hover:border-blood/60 hover:text-blood
								disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:border-edge disabled:hover:text-faint"
						>
							Sabotage
						</button>
					{/if}
				</div>
			</li>
		{/each}
	</ul>
</section>
