<script lang="ts">
	import type { Line } from '$lib/client/connection.svelte';
	import type { PublicPlayer } from '$lib/engine/game';
	import { agentColor } from '$lib/client/palette';
	import { conn } from '$lib/client/connection.svelte';
	import { fmt } from '$lib/i18n';

	type Props = {
		lines: Line[];
		agent: PublicPlayer | null;
		youId: string | null;
		turnIndex: number;
		turnTotal: number;
	};

	let { lines, agent, youId, turnIndex, turnTotal }: Props = $props();

	const isYou = $derived(Boolean(agent && agent.id === youId));
	const colour = $derived(agent ? agentColor(agent.seat, isYou) : '#a89e8c');

	let page = $state<HTMLDivElement | null>(null);

	// The newest sentence should always be the one you are looking at.
	$effect(() => {
		const count = lines.length;
		if (page && count > 0) page.scrollTop = page.scrollHeight;
	});
</script>

<div
	class="mx-auto flex w-full max-w-2xl flex-col leaf px-7 py-5 backdrop-blur-sm"
	style:border-color={agent ? `${colour}44` : undefined}
	style:background={agent ? `linear-gradient(180deg, ${colour}0f, rgb(10 10 18 / 76%))` : undefined}
>
	{#if agent}
		<div class="mb-3 flex items-baseline gap-3">
			<span class="title text-sm" style:color={colour}>{agent.name}</span>
			{#if isYou}<span class="rubric">{conn.t.narration.yourAgent}</span>{/if}
			<span class="ml-auto rubric">
				{fmt(conn.t.narration.turnOf, { n: turnIndex + 1, total: turnTotal })}
			</span>
		</div>
	{/if}

	<!-- The tale, one sentence at a time. -->
	<div bind:this={page} class="max-h-[190px] min-h-[120px] space-y-1.5 overflow-y-auto pr-1">
		{#each lines as line (line.id)}
			<p
				class="animate-ink leading-relaxed
					{line.tone === 'open' ? 'title text-[17px]' : 'text-[15px]'}
					{line.tone === 'scene' || line.tone === 'quiet' ? 'text-quill italic' : ''}
					{line.tone === 'place' ? 'text-parchment' : ''}
					{line.tone === 'ways' ? 'text-quill' : ''}
					{line.tone === 'speech' ? 'border-l-2 pl-4 text-parchment italic' : ''}
					{line.tone === 'act' ? 'text-parchment' : ''}
					{line.tone === 'good' ? 'text-moss' : ''}
					{line.tone === 'record' ? 'title text-[17px] text-candle' : ''}
					{line.tone === 'bad' ? 'text-rose' : ''}
					{line.tone === 'home' ? 'title text-[17px] text-candle' : ''}"
				style:color={line.tone === 'open' ? colour : undefined}
				style:border-color={line.tone === 'speech' ? `${colour}88` : undefined}
			>
				{line.text}
			</p>
		{/each}

		{#if lines.length === 0}
			<p class="text-[15px] text-faded italic">…</p>
		{/if}
	</div>
</div>
