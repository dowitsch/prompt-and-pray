<script lang="ts">
	/**
	 * Everything before the round: the QR, the config screen, and the lobby.
	 *
	 * Three screens on one route, and that is deliberate rather than lazy. The
	 * socket's reducer navigates on reconnect — it puts you back at the table you
	 * were sitting at — so if the QR screen were its own route, a dropped
	 * connection while you held your phone out to somebody would silently throw you
	 * back into the lobby. Views cannot be yanked; routes can.
	 */
	import { page } from '$app/state';
	import { conn } from '$lib/client/connection.svelte';
	import { ui } from '$lib/client/ui.svelte';
	import QrScreen from '$lib/components/pp/screens/QrScreen.svelte';
	import ConfigScreen from '$lib/components/pp/screens/ConfigScreen.svelte';
	import LobbyScreen from '$lib/components/pp/screens/LobbyScreen.svelte';
	import StartCountdown from '$lib/components/pp/StartCountdown.svelte';

	const code = $derived(page.params.code?.toUpperCase() ?? '');
	const game = $derived(conn.game);

	/**
	 * The forward arrow on the QR screen: to config, or straight past it once you
	 * have settled on a figure. The prototype's own rule.
	 */
	function forward() {
		ui.lobbyView = ui.configured ? 'lobby' : 'config';
	}

	function done() {
		ui.configured = true;
		ui.lobbyView = 'lobby';
	}
</script>

{#if !game}
	<div class="absolute inset-0 grid place-items-center px-8">
		<p class="text-center text-sm text-white/70">
			{conn.synced ? conn.t.lobby.notFound : conn.t.lobby.finding}
		</p>
	</div>
{:else if ui.lobbyView === 'qr'}
	<QrScreen code={game.code || code} onForward={forward} />
{:else if ui.lobbyView === 'config'}
	<ConfigScreen onDone={done} onShowQr={() => (ui.lobbyView = 'qr')} />
{:else}
	<LobbyScreen
		onEditMine={() => (ui.lobbyView = 'config')}
		onShowQr={() => (ui.lobbyView = 'qr')}
	/>
	<StartCountdown startsAt={game.startsAt} />
{/if}
