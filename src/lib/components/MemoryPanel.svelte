<script lang="ts">
	import type { PublicPlayer } from '$lib/engine/game';
	import { MEMORY_GRANT_CHARS } from '$lib/engine/types';

	type Props = {
		me: PublicPlayer;
		canDeploy: boolean;
		finished: boolean;
		onAdd: (text: string) => void;
		onDeploy: () => void;
	};

	let { me, canDeploy, finished, onAdd, onDeploy }: Props = $props();

	let draft = $state('');

	/** One tick per character of the grant. */
	const ticks = Array.from({ length: MEMORY_GRANT_CHARS }, (_, i) => i);

	const remaining = $derived(MEMORY_GRANT_CHARS - draft.length);
	const canWrite = $derived(me.pendingGrants > 0 && me.agent.status !== 'running' && !finished);
	const canSubmit = $derived(canWrite && draft.trim().length > 0);

	function submit(event: SubmitEvent) {
		event.preventDefault();
		if (!canSubmit) return;
		onAdd(draft.trim());
		draft = '';
	}

	/** The counter turns hot as the grant runs out — the limit should feel physical. */
	const counterColour = $derived(
		remaining <= 0 ? 'text-blood' : remaining <= 4 ? 'text-ember' : 'text-faint'
	);
</script>

<section class="flex min-h-0 flex-col panel">
	<header class="flex items-baseline justify-between px-4 py-3 hairline">
		<h2 class="eyebrow">Agent memory</h2>
		<span class="font-mono text-[10px] text-faint">
			{me.memoryChars} chars · {me.memory.length} lines
		</span>
	</header>

	<!-- Everything the agent knows. This is its entire mind. -->
	<div class="min-h-[92px] flex-1 overflow-y-auto px-4 py-3">
		{#if me.memory.length === 0}
			<p class="font-mono text-xs leading-relaxed text-faint italic">
				Empty. Your agent knows nothing at all.
			</p>
		{:else}
			<ul class="space-y-1.5">
				{#each me.memory as line, index (line.id)}
					<li class="animate-slide-up flex gap-2 font-mono text-xs leading-relaxed">
						<span class="w-4 shrink-0 text-right text-[10px] text-faint">{index + 1}</span>
						{#if line.sabotagedBy}
							<span class="text-blood">
								{line.text}
								<span class="ml-1 text-[9px] tracking-[0.18em] uppercase opacity-70">
									◄ sabotaged by {line.sabotagedBy}
								</span>
							</span>
						{:else}
							<span class="text-parchment/90">{line.text}</span>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</div>

	<div class="hairline"></div>

	<form onsubmit={submit} class="px-4 py-3">
		<div class="mb-2 flex items-baseline justify-between">
			<h3 class="eyebrow">
				{#if canWrite}Teach your agent{:else if me.agent.status === 'running'}Agent is out
				{:else}No knowledge to give{/if}
			</h3>
			<span class="font-mono text-[10px] {counterColour} tabular-nums">
				{draft.length} / {MEMORY_GRANT_CHARS}
			</span>
		</div>

		<div class="relative">
			<input
				bind:value={draft}
				maxlength={MEMORY_GRANT_CHARS}
				disabled={!canWrite}
				placeholder={canWrite ? 'River is deadly.' : 'Finish a run to earn 20 chars'}
				spellcheck="false"
				autocomplete="off"
				class="w-full rounded-md border border-edge-bright bg-black/40 px-3 py-2 font-mono text-sm
					text-parchment placeholder:text-faint/60 focus:border-ember focus:ring-0
					disabled:cursor-not-allowed disabled:opacity-40"
			/>
			<!-- 20 ticks: the grant as a physical ration, not a number. -->
			<div class="mt-1.5 flex gap-[3px]">
				{#each ticks as i (i)}
					<span
						class="h-[3px] flex-1 rounded-full transition-colors duration-150"
						class:bg-ember={i < draft.length}
						class:bg-edge={i >= draft.length}
					></span>
				{/each}
			</div>
		</div>

		<div class="mt-3 flex gap-2">
			<button
				type="submit"
				disabled={!canSubmit}
				class="flex-1 rounded-md border border-ember/60 bg-ember/10 px-3 py-2 font-mono text-[11px]
					tracking-[0.16em] text-ember uppercase transition hover:bg-ember/20
					disabled:cursor-not-allowed disabled:border-edge disabled:bg-transparent disabled:text-faint"
			>
				Add knowledge
			</button>
			<button
				type="button"
				onclick={onDeploy}
				disabled={!canDeploy}
				class="flex-1 rounded-md border border-edge-bright bg-white/5 px-3 py-2 font-mono text-[11px]
					tracking-[0.16em] text-parchment uppercase transition hover:bg-white/10
					disabled:cursor-not-allowed disabled:opacity-35"
			>
				{me.agent.status === 'running' ? 'Running…' : 'Deploy agent'}
			</button>
		</div>

		{#if me.pendingGrants > 1}
			<p class="mt-2 font-mono text-[10px] text-ember/80">
				{me.pendingGrants} unspent grants — you banked characters by deploying without teaching.
			</p>
		{/if}
	</form>
</section>
