<script lang="ts">
	import type { GamePhase } from '$lib/engine/types';
	import type { PublicPlayer } from '$lib/engine/game';
	import { MEMORY_GRANT_CHARS } from '$lib/engine/types';
	import { roman } from '$lib/client/palette';

	type Props = {
		me: PublicPlayer;
		phase: GamePhase;
		/** The round just played. The next one is this + 1. */
		round: number;
		teachingEndsAt: number;
		waitingOn: PublicPlayer[];
		onAdd: (text: string) => void;
		onReady: () => void;
	};

	let { me, phase, round, teachingEndsAt, waitingOn, onAdd, onReady }: Props = $props();

	let draft = $state('');
	let now = $state(Date.now());

	const ticks = Array.from({ length: MEMORY_GRANT_CHARS }, (_, i) => i);

	const teaching = $derived(phase === 'teaching');
	const canWrite = $derived(teaching && me.pendingGrants > 0 && !me.ready);
	const canSubmit = $derived(canWrite && draft.trim().length > 0);
	const secondsLeft = $derived(
		teachingEndsAt ? Math.max(0, Math.ceil((teachingEndsAt - now) / 1000)) : 0
	);

	// The clock is the pressure. Everyone writes against the same candle.
	$effect(() => {
		if (!teaching) return;
		const timer = setInterval(() => (now = Date.now()), 250);
		return () => clearInterval(timer);
	});

	function submit(event: SubmitEvent) {
		event.preventDefault();
		if (!canSubmit) return;
		onAdd(draft.trim());
		draft = '';
	}
</script>

<section class="flex flex-col leaf" class:teaching-glow={teaching && !me.ready}>
	<header class="flex items-baseline justify-between px-5 py-3.5 rule-b">
		<h2 class="rubric">All your agent knows</h2>
		<span class="font-mono text-[10px] text-faded">{me.memoryChars} letters</span>
	</header>

	<!-- The whole of its mind, written by hand. -->
	<div class="max-h-52 min-h-[92px] overflow-y-auto px-5 py-4">
		{#if me.memory.length === 0}
			<p class="text-sm leading-relaxed text-faded italic">
				The page is blank. It knows nothing at all.
			</p>
		{:else}
			<ol class="space-y-2.5">
				{#each me.memory as line, index (line.id)}
					<li class="animate-ink flex gap-3 text-[15px] leading-snug">
						<span class="w-7 shrink-0 pt-px text-right text-[11px] text-faded tabular-nums">
							{roman(index + 1)}.
						</span>
						{#if line.sabotagedBy}
							<span class="text-rose">
								<span class="line-through decoration-rose/70">{line.text}</span>
								<span class="mt-0.5 block rubric text-rose/80">
									struck out by {line.sabotagedBy}
								</span>
							</span>
						{:else}
							<span class="text-parchment/90">{line.text}</span>
						{/if}
					</li>
				{/each}
			</ol>
		{/if}
	</div>

	{#if teaching}
		<div class="rule-b"></div>
		<form onsubmit={submit} class="px-5 py-4">
			<div class="mb-2.5 flex items-baseline justify-between">
				<h3 class="rubric">
					{#if me.ready}Waiting on the others{:else if canWrite}Write one more line{:else}Nothing
						left to give{/if}
				</h3>
				<span
					class="font-mono text-[10px] tabular-nums {secondsLeft <= 8 ? 'text-rose' : 'text-faded'}"
				>
					{secondsLeft}s
				</span>
			</div>

			<input
				bind:value={draft}
				maxlength={MEMORY_GRANT_CHARS}
				disabled={!canWrite}
				placeholder={canWrite ? 'The river is deadly' : 'Spent for this round'}
				spellcheck="false"
				autocomplete="off"
				class="w-full rounded border border-rule-bright bg-black/30 px-3.5 py-2.5 text-[15px]
					text-parchment placeholder:text-faded/70 focus:border-candle focus:ring-0
					disabled:cursor-not-allowed disabled:opacity-40"
			/>

			<!-- Twenty letters, shown as a ration rather than a number. -->
			<div class="mt-2 flex items-center gap-2.5">
				<div class="flex flex-1 gap-[3px]">
					{#each ticks as i (i)}
						<span
							class="h-[3px] flex-1 rounded-full transition-colors duration-150"
							class:bg-candle={i < draft.length}
							class:bg-rule={i >= draft.length}
						></span>
					{/each}
				</div>
				<span class="font-mono text-[10px] text-faded tabular-nums">
					{draft.length}/{MEMORY_GRANT_CHARS}
				</span>
			</div>

			<div class="mt-3.5 flex gap-2">
				<button
					type="submit"
					disabled={!canSubmit}
					class="flex-1 rounded border border-candle/50 bg-candle/10 px-3 py-2.5 text-xs
						tracking-[0.16em] text-candle uppercase transition hover:bg-candle/20
						disabled:cursor-not-allowed disabled:border-rule disabled:bg-transparent disabled:text-faded"
				>
					Inscribe
				</button>
				<button
					type="button"
					onclick={onReady}
					disabled={me.ready}
					class="flex-1 rounded border border-rule-bright bg-white/5 px-3 py-2.5 text-xs
						tracking-[0.16em] text-parchment uppercase transition hover:bg-white/10
						disabled:cursor-not-allowed disabled:opacity-35"
				>
					{me.ready ? 'Ready' : 'Send them out'}
				</button>
			</div>

			{#if me.ready && waitingOn.length}
				<p class="mt-2.5 text-xs text-faded italic">
					Waiting on {waitingOn.map((p) => p.name).join(', ')}…
				</p>
			{/if}
		</form>
	{:else}
		<div class="rule-b"></div>
		<p class="px-5 py-4 text-center text-xs tracking-[0.2em] text-faded uppercase">
			{#if phase === 'running'}Round {round} · the page is closed{:else}The tale is told{/if}
		</p>
	{/if}
</section>

<style>
	/* A faint warmth on the page while you still have letters to spend. */
	.teaching-glow {
		border-color: color-mix(in srgb, var(--color-candle) 45%, transparent);
		box-shadow: 0 0 44px -22px var(--color-candle);
	}
</style>
