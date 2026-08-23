<script lang="ts">
	/**
	 * Screen 3: who is here, and are we going.
	 *
	 * Four slots, one per seat. The design used to draw five and the fifth was
	 * permanently the empty pill; the revised design drops it, which is the honest
	 * count — an empty slot means a seat somebody could still take, and a row that
	 * never fills was only ever telling you the design was drawn before the rule.
	 * Every seat still empty when the round starts is taken by a simulated rival.
	 *
	 * "Ready" becomes "Waiting" becomes the count. The count itself comes from the
	 * server, so all four phones say the same number.
	 */
	import Avatar from '../Avatar.svelte';
	import Icon from '../Icon.svelte';
	import DotMenu from '../DotMenu.svelte';
	import { conn } from '$lib/client/connection.svelte';
	import { audio } from '$lib/client/audio.svelte';
	import { colorOf } from '$lib/client/identity';
	import { clock, secondsUntil, tick } from '$lib/client/clock.svelte';
	import { MAX_PLAYERS } from '$lib/engine/types';

	type Props = { onEditMine: () => void; onShowQr: () => void };
	let { onEditMine, onShowQr }: Props = $props();

	$effect(tick);

	const t = $derived(conn.t.seats);
	const game = $derived(conn.game);
	const me = $derived(conn.me);

	/** One row per seat, from the server rather than from the drawing. */
	const slots = $derived(
		Array.from(
			{ length: game?.maxPlayers ?? MAX_PLAYERS },
			(_, i) => (game?.players ?? [])[i] ?? null
		)
	);

	const counting = $derived(secondsUntil(game?.startsAt ?? 0, clock.now));
	const ready = $derived(Boolean(me?.ready));

	const label = $derived(counting > 0 ? String(counting) : ready ? t.waiting : t.ready);
</script>

<div class="animate-pp-fade absolute inset-0">
	<div class="absolute top-[26px] right-[22px] z-[5]">
		<DotMenu />
	</div>

	<ul class="absolute top-[132px] right-6 left-6 flex flex-col gap-4">
		{#each slots as player, index (index)}
			<li class="flex items-center gap-3.5">
				{#if player}
					{@const isYou = player.id === conn.you}
					<!-- Only your own row is a button: it is the way back to config. -->
					<svelte:element
						this={isYou ? 'button' : 'div'}
						role={isYou ? 'button' : undefined}
						tabindex={isYou ? 0 : undefined}
						onclick={isYou ? onEditMine : undefined}
						aria-label={isYou ? t.editYours : undefined}
						class="flex h-[78px] min-w-0 flex-1 items-center gap-4 rounded-[39px] pr-6 pl-1.5
							text-left {isYou ? 'transition hover:brightness-105' : ''}"
						style:background={colorOf(player)}
					>
						<Avatar {player} youId={conn.you} size={66} ring={0} />
						<span class="min-w-0 flex-1 truncate display text-2xl text-white">
							{player.name}
						</span>
						{#if isYou}
							<Icon name="pencil" size={20} width={2.2} colour="#fff" />
						{/if}
					</svelte:element>

					<span
						class="grid w-[26px] shrink-0 place-items-center"
						style:color={colorOf(player)}
						aria-label={player.ready ? t.ready : t.waiting}
					>
						{#if player.ready}
							<Icon name="check" size={24} width={3} />
						{:else}
							<Icon name="clock" size={24} colour="#fff" />
						{/if}
					</span>
				{:else}
					<span class="h-[78px] flex-1 rounded-[39px] bg-dark/[0.16]"></span>
					<span class="w-[26px] shrink-0"></span>
				{/if}
			</li>
		{/each}
	</ul>

	<!-- Kept level with the config screen's own button; see the note there. -->
	<div class="absolute right-6 bottom-[88px] left-[110px]">
		<button
			type="button"
			data-shot="ready"
			onclick={() => conn.setReady(!ready)}
			disabled={counting > 0}
			class="flex h-[74px] w-full items-center justify-end gap-4 rounded-[22px] bg-dark pr-7
				shadow-[0_16px_34px_rgba(28,31,34,0.3)] transition hover:-translate-y-0.5
				hover:bg-[#2A2E31] disabled:hover:translate-y-0"
			aria-live="polite"
		>
			<span class="display text-2xl text-white tabular-nums">{label}</span>
			{#if counting === 0}
				{#if ready}
					<span class="animate-pp-pulse">
						<Icon name="clock" size={22} width={2.2} colour="#fff" />
					</span>
				{:else}
					<Icon name="check" size={22} width={3.2} colour="#fff" />
				{/if}
			{/if}
		</button>
	</div>

	<!--
		Stacked rather than side by side: the ready button starts at 110px from the
		left, which is not enough room for two of these next to each other, and the
		column above the QR code is empty.

		The voice switch belongs here specifically. This is the last screen before
		the tale begins, and reading it aloud is a decision about the tale — it
		changes the pace of the whole thing for everyone at the table, so it wants
		asking before the first agent sets out rather than discovering mid-round.
		It stays reachable from the menu once one has.
	-->
	<div class="absolute bottom-7 left-6 flex flex-col gap-3.5">
		<button
			type="button"
			data-shot="voice"
			onclick={() => conn.setVoice(!audio.voice)}
			aria-pressed={audio.voice}
			aria-label={audio.voice ? conn.t.pp.readAloudStop : conn.t.pp.readAloud}
			class="grid h-[54px] w-[54px] place-items-center rounded-2xl transition
				hover:-translate-y-0.5 {audio.voice
				? 'bg-p1 shadow-[0_10px_22px_rgba(28,31,34,0.25)]'
				: 'bg-white/15 hover:bg-white/25'}"
		>
			<Icon
				name={audio.voice ? 'speaker' : 'speakerOff'}
				size={24}
				width={2.2}
				colour={audio.voice ? '#1C1F22' : '#fff'}
			/>
		</button>

		<button
			type="button"
			onclick={onShowQr}
			aria-label={conn.t.pp.showQr}
			class="grid h-[54px] w-[54px] place-items-center rounded-2xl bg-white
				shadow-[0_10px_22px_rgba(28,31,34,0.25)] transition hover:-translate-y-0.5
				hover:bg-[#F2F2F2]"
		>
			<Icon name="qr" size={24} colour="#1C1F22" />
		</button>
	</div>
</div>
