<script lang="ts">
	/**
	 * The shell.
	 *
	 * Everything the app draws lives inside the phone frame, chrome included — a
	 * toast or an offline banner floating on the blurred backdrop *outside* the
	 * phone reads as a rendering bug rather than as a message.
	 *
	 * The menu and its sheets are here rather than in a screen because the brief
	 * asks for them to be reachable from everywhere, and because leaving the round
	 * has to work identically whether you are in a lobby or mid-match.
	 *
	 * The story designer opts out of all of it: it has its own layout and its own
	 * look, and it is not played on a phone.
	 */
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { conn } from '$lib/client/connection.svelte';
	import { loadAudioPrefs } from '$lib/client/audio.svelte';
	import { unlockSound } from '$lib/client/sound';
	import { closeOverlay, ui } from '$lib/client/ui.svelte';
	import { openingName } from '$lib/client/names';
	import type { Locale } from '$lib/i18n';
	import { fmt } from '$lib/i18n';

	import PhoneFrame from '$lib/components/pp/PhoneFrame.svelte';
	import Toast from '$lib/components/pp/Toast.svelte';
	import MenuSheet from '$lib/components/pp/MenuSheet.svelte';
	import RulesSheet from '$lib/components/pp/RulesSheet.svelte';
	import ConfirmSheet from '$lib/components/pp/ConfirmSheet.svelte';
	import SettingsSheet from '$lib/components/pp/SettingsSheet.svelte';
	import ScanSheet from '$lib/components/pp/ScanSheet.svelte';

	let { children } = $props();

	onMount(() => {
		conn.loadPreference();
		// Before the socket: whether this device reads the tale aloud is announced
		// as soon as it opens, and it has to be known by then.
		loadAudioPrefs();
		// Nothing is played until somebody touches the page; this only starts
		// listening for the tap that says we may.
		unlockSound();
		conn.connect();
		return () => conn.disconnect();
	});

	/** The designer is a different application wearing the same repository. */
	const isDesigner = $derived(page.url.pathname.startsWith('/design'));

	const inLobby = $derived(conn.game?.phase === 'lobby');

	/** Which gradient bleeds out behind the frame. */
	const backdrop = $derived.by(() => {
		if (!conn.game || conn.game.phase === 'lobby') {
			return ui.lobbyView === 'lobby' ? 'bg-screen-lobby' : 'bg-screen-config';
		}
		return 'bg-screen-lobby';
	});

	const confirmQuestion = $derived.by(() => {
		const t = conn.t.confirm;
		if (ui.confirm === 'leave-round') return t.leaveRound;
		if (ui.confirm === 'inject') {
			const target = conn.game?.players
				.find((p) => p.id === ui.selectedId)
				?.memory.find((line) => line.id === ui.injectLineId);
			return fmt(t.inject, { before: target?.text ?? '', after: ui.pendingInject });
		}
		return '';
	});

	/**
	 * Out of this round, and back to the front door — which opens one of its own.
	 *
	 * The table is told, rather than the tab quietly going quiet: the seat is taken
	 * over by a bot so the round you were in carries on being a round, and a match
	 * you were the last one at is shut down instead of being left to play itself.
	 */
	function leaveRound() {
		conn.leaveGame();
		closeOverlay();
		ui.configured = false;
		ui.lobbyView = 'qr';
		void goto(resolve('/'));
	}

	/**
	 * The same exit, except a tale has been picked on the way out.
	 *
	 * Neither the story nor the language can change under a match that already
	 * exists (see `SettingsSheet`), so choosing one is choosing to be somewhere
	 * else — and the front door would open the *previous* tale, which is why this
	 * asks for the new round itself rather than navigating.
	 */
	function newRound(slug?: string, locale?: Locale) {
		conn.leaveGame();
		if (locale) conn.setPreference(locale);
		closeOverlay();
		ui.configured = false;
		ui.lobbyView = 'qr';
		conn.createGame(openingName(), slug);
	}

	function confirmYes() {
		if (ui.confirm === 'leave-round') return leaveRound();
		if (ui.confirm === 'inject') {
			const target = conn.game?.players.find((p) => p.id === ui.selectedId);
			const index = target?.memory.findIndex((line) => line.id === ui.injectLineId) ?? -1;
			if (target && index >= 0) conn.sabotage(target.id, index, ui.pendingInject);
			ui.injectLineId = null;
			ui.pendingInject = '';
			closeOverlay();
		}
	}

	function joinScanned(code: string) {
		closeOverlay();
		void goto(resolve('/j/[code]', { code }));
	}
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Prompt &amp; Pray</title>
	<meta
		name="description"
		content="Teach an AI agent to find its way home, twenty characters at a time."
	/>
</svelte:head>

{#if isDesigner}
	{@render children()}
{:else}
	<PhoneFrame {backdrop}>
		{@render children()}

		<Toast toast={conn.toast} onDismiss={() => (conn.toast = null)} />

		{#if conn.status === 'closed' || conn.status === 'offline'}
			<div class="absolute inset-x-0 top-0 z-[90] bg-p5 py-1 text-center">
				<span class="font-mono text-[10px] tracking-[0.2em] text-white uppercase">
					{conn.status === 'offline' ? conn.t.toast.offline : conn.t.toast.reconnecting}
				</span>
			</div>
		{/if}

		{#if conn.error}
			<div class="pointer-events-none absolute inset-x-3.5 bottom-6 z-[85] flex justify-center">
				<p
					class="pointer-events-auto rounded-2xl bg-p5 px-4 py-2.5 text-center text-xs text-white"
					role="alert"
				>
					{conn.error}
				</p>
			</div>
		{/if}

		{#if ui.overlay === 'menu'}
			<MenuSheet canPickStory={inLobby} />
		{:else if ui.overlay === 'rules'}
			<RulesSheet />
		{:else if ui.overlay === 'settings'}
			<SettingsSheet onPick={(slug, locale) => newRound(slug, locale)} />
		{:else if ui.overlay === 'scan'}
			<ScanSheet onCode={joinScanned} onCancel={closeOverlay} />
		{:else if ui.overlay === 'confirm'}
			<ConfirmSheet question={confirmQuestion} onYes={confirmYes} />
		{/if}
	</PhoneFrame>
{/if}
