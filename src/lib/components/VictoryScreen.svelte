<script lang="ts">
	import type { GameSnapshot, PublicPlayer } from '$lib/engine/game';
	import { agentColor } from '$lib/client/palette';

	type Props = {
		game: GameSnapshot;
		youId: string | null;
		onPlayAgain: () => void;
	};

	let { game, youId, onPlayAgain }: Props = $props();

	const winners = $derived(game.players.filter((p) => game.winnerIds.includes(p.id)));
	const winner = $derived(winners[0] ?? null);
	const youWon = $derived(Boolean(youId && game.winnerIds.includes(youId)));
	const subject = $derived(
		(game.players.find((p) => p.id === youId) ?? winner) as PublicPlayer | null
	);

	const others = $derived(game.players.filter((p) => p.id !== subject?.id));
	const winningRun = $derived(winner?.lastRun ?? null);
	const rounds = $derived(game.round);
</script>

<div
	class="fixed inset-0 z-40 grid place-items-center overflow-y-auto bg-night/92 p-6 backdrop-blur-md"
>
	<div class="animate-rise w-full max-w-2xl">
		<div class="text-center">
			<p class="rubric">{youWon ? 'And so' : 'And so'}</p>
			<h1
				class="mt-3 text-4xl tracking-[0.14em] uppercase sm:text-5xl"
				style:color={youWon ? '#e8b45c' : '#f2e8d5'}
			>
				{#if youWon}
					Your agent came home
				{:else}
					{winners.map((w) => w.name).join(' & ') || 'Nobody'} found the gate
				{/if}
			</h1>
			{#if !youWon && winner}
				<p class="mt-3 text-sm text-quill">
					Yours was still out there, {subject?.bestDepth ?? 0} partings of {game.depth} along the way.
				</p>
			{/if}
		</div>

		{#if subject}
			<dl class="mt-9 grid grid-cols-2 gap-3 sm:grid-cols-4">
				{#each [{ label: 'Rounds', value: String(rounds) }, { label: 'Letters spent', value: String(subject.memoryChars) }, { label: 'Partings passed', value: youWon && winningRun ? `${winningRun.depthReached} / ${game.depth}` : `${subject.bestDepth} / ${game.depth}` }, { label: 'Misled', value: subject.wasSabotaged ? 'ONCE' : 'NEVER' }] as stat (stat.label)}
					<div class="leaf px-4 py-3 text-center">
						<div class="rubric">{stat.label}</div>
						<div
							class="mt-1.5 text-lg"
							style:color={stat.label === 'Misled' && subject.wasSabotaged ? '#cf5f57' : '#f2e8d5'}
						>
							{stat.value}
						</div>
					</div>
				{/each}
			</dl>
		{/if}

		{#if youWon && winningRun}
			<div class="mt-4 leaf px-5 py-4">
				<h2 class="mb-2.5 rubric">The road it took</h2>
				<div class="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs">
					{#each winningRun.decisions as decision, i (decision.choiceId)}
						{#if i > 0}<span class="text-faded">→</span>{/if}
						<span class="text-candle">{decision.choiceLabel}</span>
					{/each}
				</div>
			</div>
		{/if}

		{#if subject && subject.memory.length}
			<div class="mt-4 leaf px-5 py-4">
				<h2 class="mb-2.5 rubric">What you wrote for it</h2>
				<ul class="space-y-1 text-xs">
					{#each subject.memory as line (line.id)}
						<li class:text-rose={Boolean(line.sabotagedBy)} class="text-parchment/85">
							{line.text}
							{#if line.sabotagedBy}
								<span class="text-[9px] tracking-[0.16em] uppercase opacity-70">
									◄ {line.sabotagedBy}
								</span>
							{/if}
						</li>
					{/each}
				</ul>
			</div>
		{/if}

		<div class="mt-4 leaf px-5 py-4">
			<h2 class="mb-3 rubric">The others</h2>
			<ul class="space-y-2">
				{#each others as player (player.id)}
					{@const colour = agentColor(player.seat, player.id === youId)}
					<li class="flex items-center gap-3 text-xs">
						<span class="w-20 shrink-0 truncate tracking-[0.14em]" style:color={colour}>
							{player.name}
						</span>
						<div class="h-[3px] flex-1 overflow-hidden rounded-full bg-rule">
							<div
								class="h-full rounded-full"
								style:width="{Math.round((player.bestDepth / game.depth) * 100)}%"
								style:background={colour}
							></div>
						</div>
						<span class="w-32 shrink-0 text-right text-faded tabular-nums">
							{player.bestDepth}/{game.depth}
						</span>
					</li>
				{/each}
			</ul>
		</div>

		<div class="mt-7 text-center">
			<button
				type="button"
				onclick={onPlayAgain}
				class="rounded border border-candle/60 bg-candle/10 px-8 py-3 text-xs
					tracking-[0.2em] text-candle uppercase transition hover:bg-candle/20"
			>
				Play again
			</button>
		</div>
	</div>
</div>
