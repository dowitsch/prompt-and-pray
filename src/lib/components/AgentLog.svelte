<script lang="ts">
	import type { LogEntry } from '$lib/client/connection.svelte';
	import { agentColor } from '$lib/client/palette';

	type Props = {
		log: LogEntry[];
		youId: string | null;
	};

	let { log, youId }: Props = $props();

	let onlyMine = $state(false);
	let feed = $state<HTMLDivElement | null>(null);

	const visible = $derived(onlyMine ? log.filter((e) => e.playerId === youId) : log);

	// Watching the agent think is half the game, so the feed always shows the
	// newest line without the player having to chase it.
	$effect(() => {
		const count = visible.length;
		if (feed && count > 0) feed.scrollTop = feed.scrollHeight;
	});
</script>

<section class="flex min-h-0 flex-col panel">
	<header class="flex items-center justify-between px-4 py-3 hairline">
		<h2 class="eyebrow">Agent log</h2>
		<button
			type="button"
			onclick={() => (onlyMine = !onlyMine)}
			class="font-mono text-[10px] tracking-[0.16em] uppercase transition
				{onlyMine ? 'text-ember' : 'text-faint hover:text-muted'}"
		>
			{onlyMine ? 'Mine' : 'All agents'}
		</button>
	</header>

	<div bind:this={feed} class="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-3">
		{#if visible.length === 0}
			<p class="font-mono text-xs text-faint italic">Waiting for the first move…</p>
		{/if}

		{#each visible as entry (entry.id)}
			{@const colour = agentColor(entry.seat, entry.playerId === youId)}
			<div class="animate-slide-up font-mono text-xs leading-relaxed">
				{#if entry.kind === 'round'}
					<!-- Rounds are the spine of the feed: everything below belongs to this one. -->
					<div class="mt-4 flex items-center gap-2 first:mt-0">
						<span class="tracking-[0.2em] text-parchment">{entry.text}</span>
						<span class="h-px flex-1 bg-edge-bright"></span>
						<span class="text-[10px] text-faint">{entry.detail}</span>
					</div>
				{:else if entry.kind === 'recap'}
					<p class="mt-1 border-l-2 border-ember/50 py-0.5 pl-2.5 text-parchment/90">
						{entry.text}
					</p>
				{:else if entry.kind === 'sight'}
					<p class="text-faint">
						<span class="opacity-60">{entry.playerName}</span> arrives at {entry.text}
						{#if entry.detail}<span class="text-faint/70"> — {entry.detail}</span>{/if}
					</p>
				{:else if entry.kind === 'speech'}
					<p class="border-l pl-2.5 text-parchment/90" style:border-color={`${colour}66`}>
						“{entry.text}”
						{#if entry.improvised}
							<span class="ml-1 text-[9px] tracking-[0.14em] text-faint uppercase">(instinct)</span>
						{/if}
						{#if entry.detail}
							<span class="mt-0.5 block tracking-[0.18em] uppercase" style:color={colour}>
								→ {entry.detail}
							</span>
						{/if}
					</p>
				{:else if entry.kind === 'ok'}
					<p class="pl-2.5 tracking-[0.18em] text-verdant/80 uppercase">
						→ correct <span class="text-faint normal-case">{entry.detail}</span>
					</p>
				{:else if entry.kind === 'dead'}
					<p class="pl-2.5">
						<span class="tracking-[0.18em] text-blood uppercase">→ dead</span>
						<span class="mt-0.5 block text-faint italic">{entry.text}</span>
					</p>
				{:else if entry.kind === 'home'}
					<p class="pl-2.5 tracking-[0.2em] text-ember uppercase">★ reached home</p>
				{:else if entry.kind === 'memory'}
					<p class="text-ember/80">+ memory: “{entry.text}”</p>
				{:else if entry.kind === 'sabotage'}
					<p class="text-blood/90">
						✖ {entry.playerName}
						{entry.text}
						{#if entry.detail}<span class="block text-faint">{entry.detail}</span>{/if}
					</p>
				{/if}
			</div>
		{/each}
	</div>
</section>
