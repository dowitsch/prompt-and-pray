<script lang="ts">
	import type { PublicPlayer } from '$lib/engine/game';
	import { agentColor, roman } from '$lib/client/palette';
	import { conn } from '$lib/client/connection.svelte';
	import { fmt, parts } from '$lib/i18n';

	const t = $derived(conn.t.carried);

	type Props = { agent: PublicPlayer; youId: string | null };
	let { agent, youId }: Props = $props();

	const isYou = $derived(agent.id === youId);
	const colour = $derived(agentColor(agent.seat, isYou));
	const lies = $derived(agent.memory.filter((line) => line.sabotagedBy).length);
	const heading = $derived(parts(t.title, 'name'));
</script>

<section class="leaf" style:border-color="{colour}44">
	<header class="flex items-baseline justify-between px-5 py-3.5 rule-b">
		<h2 class="rubric">
			{heading.before}<span style:color={colour}>{agent.name}</span>{heading.after}
		</h2>
		{#if lies}
			<span class="text-[11px] text-rose/90 italic">
				{lies === 1 ? t.oneFalse : fmt(t.manyFalse, { n: lies })}
			</span>
		{/if}
	</header>

	<div class="max-h-44 min-h-[70px] overflow-y-auto px-5 py-4">
		{#if agent.memory.length === 0}
			<p class="text-sm text-faded italic">{t.nothing}</p>
		{:else}
			<ol class="space-y-2">
				{#each agent.memory as line, index (line.id)}
					<li class="flex gap-3 text-[15px] leading-snug">
						<span class="w-7 shrink-0 pt-px text-right text-[11px] text-faded tabular-nums">
							{roman(index + 1)}.
						</span>
						{#if line.sabotagedBy}
							<!-- It believes this. That is the joke. -->
							<span class="text-rose">
								{line.text}
								<span class="mt-0.5 block rubric text-rose/80">
									{fmt(conn.t.memory.struckOutBy, { name: line.sabotagedBy })}
								</span>
							</span>
						{:else}
							<span class="text-parchment/85">{line.text}</span>
						{/if}
					</li>
				{/each}
			</ol>
		{/if}
	</div>
</section>
