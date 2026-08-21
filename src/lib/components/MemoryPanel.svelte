<script lang="ts">
	import type { GamePhase } from '$lib/engine/types';
	import type { PublicPlayer } from '$lib/engine/game';
	import { MEMORY_GRANT_CHARS } from '$lib/engine/types';

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

	/** One tick per character of the grant. */
	const ticks = Array.from({ length: MEMORY_GRANT_CHARS }, (_, i) => i);

	const teaching = $derived(phase === 'teaching');
	const canWrite = $derived(teaching && me.pendingGrants > 0 && !me.ready);
	const canSubmit = $derived(canWrite && draft.trim().length > 0);
	const remaining = $derived(MEMORY_GRANT_CHARS - draft.length);
	const secondsLeft = $derived(
		teachingEndsAt ? Math.max(0, Math.ceil((teachingEndsAt - now) / 1000)) : 0
	);

	// The clock is the pressure. Everyone teaches against the same deadline.
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

	const counterColour = $derived(
		remaining <= 0 ? 'text-blood' : remaining <= 4 ? 'text-ember' : 'text-faint'
	);
</script>

<section class="flex flex-col panel" class:border-ember={teaching && !me.ready}>
	<header class="flex items-baseline justify-between px-4 py-3 hairline">
		<h2 class="eyebrow">Agent memory</h2>
		<span class="font-mono text-[10px] text-faint">
			{me.memoryChars} chars · {me.memory.length} lines
		</span>
	</header>

	<!-- Everything the agent knows. This is its entire mind. -->
	<div class="max-h-44 min-h-[80px] overflow-y-auto px-4 py-3">
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

	{#if teaching}
		<form onsubmit={submit} class="px-4 py-3">
			<div class="mb-2 flex items-baseline justify-between">
				<h3 class="eyebrow">
					{#if me.ready}Waiting for the others{:else if canWrite}Teach your agent{:else}Nothing left
						to give{/if}
				</h3>
				<span
					class="font-mono text-[10px] tabular-nums {secondsLeft <= 8
						? 'text-blood'
						: 'text-faint'}"
				>
					{secondsLeft}s
				</span>
			</div>

			<div class="relative">
				<input
					bind:value={draft}
					maxlength={MEMORY_GRANT_CHARS}
					disabled={!canWrite}
					placeholder={canWrite ? 'River is deadly.' : 'Spent for this round'}
					spellcheck="false"
					autocomplete="off"
					class="w-full rounded-md border border-edge-bright bg-black/40 px-3 py-2 font-mono
						text-sm text-parchment placeholder:text-faint/60 focus:border-ember focus:ring-0
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
				<div class="mt-1 text-right font-mono text-[10px] {counterColour} tabular-nums">
					{draft.length} / {MEMORY_GRANT_CHARS}
				</div>
			</div>

			<div class="mt-2 flex gap-2">
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
					onclick={onReady}
					disabled={me.ready}
					class="flex-1 rounded-md border border-edge-bright bg-white/5 px-3 py-2 font-mono text-[11px]
						tracking-[0.16em] text-parchment uppercase transition hover:bg-white/10
						disabled:cursor-not-allowed disabled:opacity-35"
				>
					{me.ready ? 'Ready ✓' : `Start round ${round + 1}`}
				</button>
			</div>

			{#if me.ready && waitingOn.length}
				<p class="mt-2 font-mono text-[10px] text-faint">
					Waiting on {waitingOn.map((p) => p.name).join(', ')}…
				</p>
			{/if}
		</form>
	{:else}
		<div class="px-4 py-4 text-center">
			<p class="font-mono text-[11px] tracking-[0.18em] text-faint uppercase">
				{#if phase === 'running'}
					Round {round} in progress — memory is locked
				{:else}
					Match over
				{/if}
			</p>
		</div>
	{/if}
</section>
