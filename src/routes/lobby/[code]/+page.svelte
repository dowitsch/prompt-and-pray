<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { conn } from '$lib/client/connection.svelte';
	import { agentColor, sigil } from '$lib/client/palette';
	import { MAX_PLAYERS } from '$lib/engine/types';

	const t = $derived(conn.t.lobby);

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
			<p class="text-center rubric">
				{conn.synced ? t.notFound : t.finding}
			</p>
		{:else}
			<header class="text-center">
				<p class="rubric">{t.passphrase}</p>
				<button
					type="button"
					onclick={copyCode}
					title="Copy code"
					class="mt-3 title text-6xl tracking-[0.3em] text-candle transition hover:opacity-80"
				>
					{code}
				</button>
				<p class="mt-3 font-mono text-[10px] tracking-[0.18em] text-faded uppercase">
					{copied ? t.copied : t.share}
				</p>
			</header>

			<section class="mt-9 leaf">
				<header class="flex items-baseline justify-between px-5 py-3 rule-b">
					<h2 class="rubric">{t.whoIsHere}</h2>
					<span class="font-mono text-[10px] text-faded">
						{game.players.length} / {MAX_PLAYERS}
					</span>
				</header>

				<ul class="divide-y divide-rule/60">
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
								<span class="title text-[15px]" style:color={colour}>
									{seat.name}
								</span>
								{#if seat.id === conn.you}
									<span class="rubric">{t.you}</span>
								{/if}
								{#if game.hostId === seat.id}
									<span class="rubric">{t.host}</span>
								{/if}
								<span
									class="ml-auto h-1.5 w-1.5 rounded-full"
									style:background={seat.connected ? '#7fa77f' : '#6b6579'}
								></span>
							{:else}
								<span
									class="grid h-7 w-7 place-items-center rounded-full border border-dashed border-rule"
								>
									<span class="text-[10px] text-faded">?</span>
								</span>
								<span class="text-[15px] text-faded italic">{t.emptySeat}</span>
								<span class="ml-auto font-mono text-[9px] tracking-[0.16em] text-faded uppercase">
									{t.filledBy}
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
					class="rounded border border-rule-bright px-4 py-3 text-[11px]
						tracking-[0.18em] text-quill uppercase transition hover:text-parchment"
				>
					{t.leave}
				</button>
				<button
					type="button"
					onclick={() => conn.startGame()}
					disabled={!conn.isHost}
					class="flex-1 rounded border border-candle/60 bg-candle/10 px-4 py-3 text-xs
						tracking-[0.2em] text-candle uppercase transition hover:bg-candle/20
						disabled:cursor-not-allowed disabled:border-rule disabled:bg-transparent disabled:text-faded"
				>
					{conn.isHost ? t.start : t.waitingForHost}
				</button>
			</div>

			<p class="mt-5 text-center text-xs leading-relaxed text-faded">{t.note}</p>
		{/if}
	</div>
</main>
