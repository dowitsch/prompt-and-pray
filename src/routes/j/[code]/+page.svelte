<script lang="ts">
	/**
	 * Where a scanned QR code lands.
	 *
	 * A separate short route rather than a query on the front door, so the thing
	 * encoded in the QR is a clean URL somebody could read out loud. It joins and
	 * then gets out of the way: the socket's own reducer does the navigating once
	 * the server has actually seated you.
	 *
	 * The join waits for the socket, for the same reason the front door does — and
	 * more urgently, because this is where a *scan* lands and a scan is always a
	 * cold load. `send` drops a message on a socket that has not finished opening,
	 * without a word, and this route is neither `/` nor a table, so the reducer's
	 * own redirects do not fire here either. Firing blind therefore left the phone
	 * sitting on this screen for ever, and the code looked broken when the code was
	 * fine.
	 */
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { conn } from '$lib/client/connection.svelte';
	import { ui } from '$lib/client/ui.svelte';
	import { openingName } from '$lib/client/names';

	const code = $derived((page.params.code ?? '').toUpperCase());

	let asked = $state(false);

	onMount(() => {
		// A joiner arrives at config: they cannot know which colours are taken until
		// they have a snapshot, so the picker only makes sense once they are seated.
		ui.configured = false;
		ui.lobbyView = 'config';

		if (!code) void goto(resolve('/'));
	});

	$effect(() => {
		if (asked || !code || conn.status !== 'open' || !conn.synced) return;

		if (conn.game) {
			// The opening snapshot can seat us back at a table we still had open. If
			// it is this one, we are already in and only the navigating is left —
			// nothing else does it from here. If it is another, a scan is an intent
			// to be somewhere else, so that table is left first — properly, out loud:
			// the seat we walk away from has to be given up rather than merely
			// forgotten by this phone.
			if (conn.game.code === code) {
				asked = true;
				void goto(
					conn.game.phase === 'lobby'
						? resolve('/lobby/[code]', { code })
						: resolve('/game/[code]', { code })
				);
				return;
			}
			conn.leaveGame();
		}

		asked = true;
		conn.joinGame(code, openingName());
	});
</script>

<div class="absolute inset-0 grid place-items-center px-8">
	<p class="text-center display text-xl text-white/80">{conn.t.pp.codeSubmit} — {code}</p>
</div>
