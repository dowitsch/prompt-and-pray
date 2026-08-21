<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { conn } from '$lib/client/connection.svelte';
	import { agentColor, sigil } from '$lib/client/palette';
	import { MAX_PLAYERS } from '$lib/engine/types';

	const code = $derived(page.params.code?.toUpperCase() ?? '');
	const game = $derived(conn.game);
	const seats = $derived(Array.from({ length: MAX_PLAYERS }, (_, i) => game?.players[i] ?? null));

	let copied = $state(false);

	async function copyCode() {
		try {
			await navigator.clipboard.writeText(code);
			copied = true;
			setTimeout(() => (copied = false), 1600);
		} catch {
			copied = false;
		}
	}

	function leave() {
		conn.leave();
		void goto(resolve('/'));
	}
</script>

<main class="grid min-h-screen place-items-center px-5 py-12">
	<div class="w-full max-w-lg">
		{#if !game}
			<p class="text-center font-mono text-xs tracking-[0.2em] text-faint uppercase">
				{conn.synced ? 'Game not found' : 'Reconnecting…'}
			</p>
		{:else}
			<header class="text-center">
				<p class="eyebrow">Game code</p>
				<button
					type="button"
					onclick={copyCode}
					title="Copy code"
					class="mt-3 font-mono text-6xl tracking-[0.3em] text-ember transition hover:opacity-80"
				>
					{code}
				</button>
				<p class="mt-3 font-mono text-[10px] tracking-[0.18em] text-faint uppercase">
					{copied ? 'Copied' : 'Share this code to let someone join'}
				</p>
			</header>

			<section class="mt-9 panel">
				<header class="flex items-baseline justify-between px-5 py-3 hairline">
					<h2 class="eyebrow">Players</h2>
					<span class="font-mono text-[10px] text-faint">
						{game.players.length} / {MAX_PLAYERS}
					</span>
				</header>

				<ul class="divide-y divide-edge/60">
					{#each seats as seat, index (index)}
						<li class="flex items-center gap-3 px-5 py-3.5">
							{#if seat}
								{@const colour = agentColor(seat.seat, seat.id === conn.you)}
								<span
									class="grid h-7 w-7 place-items-center rounded-full border font-mono text-[10px] font-bold"
									style:border-color={colour}
									style:color={colour}
								>
									{sigil(seat.name)}
								</span>
								<span class="font-mono text-sm tracking-[0.14em]" style:color={colour}>
									{seat.name}
								</span>
								{#if seat.id === conn.you}
									<span class="eyebrow">you</span>
								{/if}
								{#if game.hostId === seat.id}
									<span class="eyebrow">host</span>
								{/if}
								<span
									class="ml-auto h-1.5 w-1.5 rounded-full"
									style:background={seat.connected ? '#58c3a0' : '#575c6e'}
								></span>
							{:else}
								<span
									class="grid h-7 w-7 place-items-center rounded-full border border-dashed border-edge"
								>
									<span class="text-[10px] text-faint">?</span>
								</span>
								<span class="font-mono text-sm text-faint italic">Waiting…</span>
								<span class="ml-auto font-mono text-[9px] tracking-[0.16em] text-faint uppercase">
									simulated agent
								</span>
							{/if}
						</li>
					{/each}
				</ul>
			</section>

			<div class="mt-7 flex gap-3">
				<button
					type="button"
					onclick={leave}
					class="rounded-md border border-edge-bright px-4 py-3 font-mono text-[11px]
						tracking-[0.18em] text-muted uppercase transition hover:text-parchment"
				>
					Leave
				</button>
				<button
					type="button"
					onclick={() => conn.startGame()}
					disabled={!conn.isHost}
					class="flex-1 rounded-md border border-ember/60 bg-ember/10 px-4 py-3 font-mono text-xs
						tracking-[0.2em] text-ember uppercase transition hover:bg-ember/20
						disabled:cursor-not-allowed disabled:border-edge disabled:bg-transparent disabled:text-faint"
				>
					{conn.isHost ? 'Start game' : 'Waiting for host'}
				</button>
			</div>

			<p class="mt-5 text-center text-xs leading-relaxed text-faint">
				Every remaining seat is taken by a simulated agent when the match starts. All four race the
				same hidden tree.
			</p>
		{/if}
	</div>
</main>
