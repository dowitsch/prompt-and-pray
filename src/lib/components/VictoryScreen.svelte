<script lang="ts">
	import type { GameSnapshot, PublicPlayer } from '$lib/engine/game';
	import { agentColor } from '$lib/client/palette';

	type Props = {
		game: GameSnapshot;
		youId: string | null;
		onPlayAgain: () => void;
	};

	let { game, youId, onPlayAgain }: Props = $props();

	const winner = $derived(game.players.find((p) => p.id === game.winnerId) ?? null);
	const youWon = $derived(Boolean(winner && winner.id === youId));
	const subject = $derived(
		(youWon ? winner : (game.players.find((p) => p.id === youId) ?? winner)) as PublicPlayer | null
	);

	const others = $derived(game.players.filter((p) => p.id !== subject?.id));
	const winningRun = $derived(winner?.lastRun ?? null);
</script>

<div
	class="fixed inset-0 z-40 grid place-items-center overflow-y-auto bg-ink/92 p-6 backdrop-blur-md"
>
	<div class="animate-slide-up w-full max-w-2xl">
		<div class="text-center">
			<p class="eyebrow">{youWon ? 'Match won' : 'Match over'}</p>
			<h1
				class="mt-3 font-mono text-4xl tracking-[0.14em] uppercase sm:text-5xl"
				style:color={youWon ? '#f5b544' : '#e9e7e2'}
			>
				{#if youWon}
					You made it home
				{:else}
					{winner?.name ?? 'Nobody'} made it home
				{/if}
			</h1>
			{#if !youWon && winner}
				<p class="mt-3 text-sm text-muted">
					Your agent was still out there, {subject?.bestDepth ?? 0} of {game.depth} decisions deep.
				</p>
			{/if}
		</div>

		{#if subject}
			<dl class="mt-9 grid grid-cols-2 gap-3 sm:grid-cols-4">
				{#each [{ label: 'Runs', value: String(subject.runCount) }, { label: 'Memory used', value: `${subject.memoryChars} chars` }, { label: 'Correct decisions', value: youWon && winningRun ? `${winningRun.depthReached} / ${game.depth}` : `${subject.bestDepth} / ${game.depth}` }, { label: 'Sabotage survived', value: subject.wasSabotaged ? 'YES' : '—' }] as stat (stat.label)}
					<div class="panel px-4 py-3 text-center">
						<div class="eyebrow">{stat.label}</div>
						<div
							class="mt-1.5 font-mono text-lg"
							style:color={stat.label === 'Sabotage survived' && subject.wasSabotaged
								? '#e0564a'
								: '#e9e7e2'}
						>
							{stat.value}
						</div>
					</div>
				{/each}
			</dl>
		{/if}

		{#if youWon && winningRun}
			<div class="mt-4 panel px-5 py-4">
				<h2 class="mb-2.5 eyebrow">The path home</h2>
				<div class="flex flex-wrap items-center gap-x-2 gap-y-1.5 font-mono text-xs">
					{#each winningRun.decisions as decision, i (decision.choiceId)}
						{#if i > 0}<span class="text-faint">→</span>{/if}
						<span class="text-ember">{decision.choiceLabel}</span>
					{/each}
				</div>
			</div>
		{/if}

		{#if subject && subject.memory.length}
			<div class="mt-4 panel px-5 py-4">
				<h2 class="mb-2.5 eyebrow">What you taught it</h2>
				<ul class="space-y-1 font-mono text-xs">
					{#each subject.memory as line (line.id)}
						<li class:text-blood={Boolean(line.sabotagedBy)} class="text-parchment/85">
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

		<div class="mt-4 panel px-5 py-4">
			<h2 class="mb-3 eyebrow">The other agents</h2>
			<ul class="space-y-2">
				{#each others as player (player.id)}
					{@const colour = agentColor(player.seat, player.id === youId)}
					<li class="flex items-center gap-3 font-mono text-xs">
						<span class="w-20 shrink-0 truncate tracking-[0.14em]" style:color={colour}>
							{player.name}
						</span>
						<div class="h-[3px] flex-1 overflow-hidden rounded-full bg-edge">
							<div
								class="h-full rounded-full"
								style:width="{Math.round((player.bestDepth / game.depth) * 100)}%"
								style:background={colour}
							></div>
						</div>
						<span class="w-32 shrink-0 text-right text-faint tabular-nums">
							{player.bestDepth}/{game.depth} · {player.runCount} runs
						</span>
					</li>
				{/each}
			</ul>
		</div>

		<div class="mt-7 text-center">
			<button
				type="button"
				onclick={onPlayAgain}
				class="rounded-md border border-ember/60 bg-ember/10 px-8 py-3 font-mono text-xs
					tracking-[0.2em] text-ember uppercase transition hover:bg-ember/20"
			>
				Play again
			</button>
		</div>
	</div>
</div>
