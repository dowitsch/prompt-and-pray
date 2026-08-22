<script lang="ts">
	/**
	 * Where a scanned QR code lands.
	 *
	 * A separate short route rather than a query on the front door, so the thing
	 * encoded in the QR is a clean URL somebody could read out loud. It joins and
	 * then gets out of the way: the socket's own reducer does the navigating once
	 * the server has actually seated you.
	 */
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { conn } from '$lib/client/connection.svelte';
	import { ui } from '$lib/client/ui.svelte';
	import { openingName } from '$lib/client/names';

	const code = $derived((page.params.code ?? '').toUpperCase());

	onMount(() => {
		// A scan is an intent to be somewhere else, so anything we were in is left
		// first — otherwise the server refuses the join and the code looks broken.
		if (conn.game && conn.game.code !== code) conn.leave();

		// A joiner arrives at config: they cannot know which colours are taken until
		// they have a snapshot, so the picker only makes sense once they are seated.
		ui.configured = false;
		ui.lobbyView = 'config';

		if (!code) {
			void goto(resolve('/'));
			return;
		}
		conn.joinGame(code, openingName());
	});
</script>

<div class="absolute inset-0 grid place-items-center px-8">
	<p class="text-center display text-xl text-white/80">{conn.t.pp.codeSubmit} — {code}</p>
</div>
