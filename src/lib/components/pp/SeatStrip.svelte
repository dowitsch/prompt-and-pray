<script lang="ts">
	/**
	 * Who is here, small enough to sit under the QR code.
	 *
	 * The lobby already draws a roster, but it draws it for the person reading it:
	 * a row per seat, a name, a ready tick. This is the other case — the phone is
	 * pointed *away* from its owner while somebody scans it, and what they need
	 * back is a glance's worth of "did that work". So: four slots, a portrait when
	 * a seat is taken, an outline when it is not, and nothing written down — at
	 * arm's length the row of discs is read faster than any number beside it.
	 *
	 * Every disc is ringed in its own player's colour, including yours — which
	 * deliberately departs from `ringOf`, where a white ring means you. The whole
	 * job of this strip is that the colours somebody has just chosen are visible,
	 * and the owner's own colour going white would be the one hole in that. "Which
	 * one am I" comes back as a hairline of white *outside* the colour instead.
	 *
	 * The arrival itself is already announced elsewhere — PLAYER_JOINED raises a
	 * toast and plays a sound — so nothing here fires on the event. It is the
	 * standing record of it, which is what the toast is not.
	 */
	import Avatar from './Avatar.svelte';
	import { conn } from '$lib/client/connection.svelte';
	import { colorOf } from '$lib/client/identity';
	import { fmt } from '$lib/i18n';
	import { MAX_PLAYERS } from '$lib/engine/types';

	type Props = { size?: number };
	let { size = 52 }: Props = $props();

	const game = $derived(conn.game);

	/** One slot per seat, from the server rather than from the drawing. */
	const slots = $derived(
		Array.from(
			{ length: game?.maxPlayers ?? MAX_PLAYERS },
			(_, i) => (game?.players ?? [])[i] ?? null
		)
	);

	const here = $derived(slots.filter(Boolean).length);

	/**
	 * The room a slot takes, ring included.
	 *
	 * A filled disc wears its colour as a `box-shadow`, which draws outside the
	 * box and so does not move anything. Giving every slot the same padded square
	 * is what keeps the gaps even and the taken and empty seats the same size on
	 * screen — otherwise the ring makes a portrait read six pixels wider than the
	 * outline beside it.
	 */
	const slot = $derived(size + 6);
</script>

<div data-shot="seat-strip" class="flex flex-col items-center">
	<!--
		No written count any more. The discs are the count — four slots, filled or
		not — and the caption above them was a second, slower way of reading the
		same row on a screen that is held up rather than read. The number survives
		for anyone who is not looking at it, as the list's own label.
	-->
	<ul
		class="flex items-center gap-2.5"
		aria-label={fmt(conn.t.pp.hereCount, { n: here, total: slots.length })}
		aria-live="polite"
	>
		{#each slots as player, index (index)}
			<li class="grid place-items-center" style:width="{slot}px" style:height="{slot}px">
				{#if player}
					<!-- The white hairline is the "this one is you" mark; see the note above. -->
					<span
						class="animate-pp-pop block rounded-full"
						style:box-shadow={player.id === conn.you ? '0 0 0 2px #fff' : 'none'}
						aria-label={player.name}
					>
						<Avatar {player} {size} ring={3} ringColour={colorOf(player)} />
					</span>
				{:else}
					<!--
						Faintly filled as well as outlined, the way the lobby's empty seats
						are. A hairline on its own disappeared into whatever the film behind
						this screen happened to be doing there.
					-->
					<span
						class="block rounded-full border-2 border-dashed border-white/40 bg-dark/25"
						style:width="{slot}px"
						style:height="{slot}px"
						aria-label={conn.t.lobby.emptySeat}
					></span>
				{/if}
			</li>
		{/each}
	</ul>
</div>
