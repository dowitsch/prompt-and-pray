<script lang="ts">
	import type { PublicPlayer } from '$lib/engine/game';

	type Props = { me: PublicPlayer; depth: number };
	let { me, depth }: Props = $props();

	const run = $derived(me.lastRun);
	const fatal = $derived(run?.decisions.at(-1) ?? null);
	const show = $derived(Boolean(run) && me.agent.status !== 'running');
</script>

{#if show && run}
	<div class="animate-slide-up panel px-4 py-3" class:border-blood={!run.survived}>
		<div class="flex items-baseline justify-between">
			<h2 class="eyebrow">
				Run {String(run.index).padStart(2, '0')} · {run.survived ? 'home' : 'lost'}
			</h2>
			<span class="font-mono text-[10px] text-faint tabular-nums">
				{run.depthReached} / {depth} correct
			</span>
		</div>

		<!-- The decisions it made, so a death is readable at a glance. -->
		<div class="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 font-mono text-[11px]">
			{#each run.decisions as decision, i (i)}
				{#if i > 0}<span class="text-faint">›</span>{/if}
				<span class={decision.outcome === 'death' ? 'text-blood line-through' : 'text-ember/90'}>
					{decision.choiceLabel}
				</span>
			{/each}
		</div>

		{#if fatal && !run.survived}
			<p class="mt-2 text-[11px] leading-relaxed text-faint italic">
				Died at the {fatal.choiceLabel.toLowerCase()}, after {run.depthReached}
				{run.depthReached === 1 ? 'correct decision' : 'correct decisions'}.
			</p>
		{/if}
	</div>
{/if}
