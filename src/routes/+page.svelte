<script lang="ts">
	/**
	 * The front door.
	 *
	 * There is nothing to fill in here. The design opens on a QR code of *your*
	 * round, which means a round has to exist, so this page's whole job is to make
	 * one and step aside — the socket's reducer carries you into the lobby, where
	 * the QR, the config screen and the lobby all live as views.
	 *
	 * A name is picked for you. It rerolls on every load until you type one, which
	 * is why nobody has to think about it before they can look at the game.
	 */
	import { onMount } from 'svelte';
	import { conn } from '$lib/client/connection.svelte';
	import { ui } from '$lib/client/ui.svelte';
	import { openingName } from '$lib/client/names';
	import { page } from '$app/state';

	let asked = $state(false);

	/**
	 * A back door for the second tale, since the design has no picker on this
	 * screen — the menu has one, but a link is easier to share.
	 */
	const slug = $derived(page.url.searchParams.get('tale') ?? undefined);

	onMount(() => {
		ui.lobbyView = 'qr';
		ui.configured = false;
	});

	/*
	 * Wait for the socket rather than firing blind: `createGame` on a closed socket
	 * is silently dropped, and the player would sit here looking at nothing.
	 */
	$effect(() => {
		if (asked || conn.status !== 'open' || !conn.synced) return;
		// Already in a match? The reducer is about to move us; do not open a second.
		if (conn.game) return;
		asked = true;
		conn.createGame(openingName(), slug);
	});
</script>

<div class="animate-pp-fade absolute inset-0 grid place-items-center">
	<h1 class="flex items-center justify-center">
		<img
			src="/logo.webp"
			alt="Prompt &amp; Pray"
			width="280"
			height="170"
			class="h-[170px] w-[280px] object-contain
				drop-shadow-[0_10px_24px_rgba(28,31,34,0.45)]"
		/>
	</h1>
</div>
