<script lang="ts">
	/**
	 * Screen 4: the round.
	 *
	 * The map is the screen. Nothing docks to it and nothing scrolls over it — the
	 * revised design took the story panel away, and what is left is the land, a
	 * line of dialogue from whoever is walking, and the faces.
	 *
	 * While a round runs the screen belongs to whoever's turn it is: camera, title
	 * colour and bubble all follow the teller (`spotlight.svelte.ts`). That was
	 * already true when there was a feed to follow, and it matters more now — the
	 * bubble *is* the teller, so pinning the camera to your own agent would show
	 * you a stationary token talking in somebody else's voice. Between rounds it
	 * comes back to you, which is when you are writing.
	 */
	import GameMap from '../GameMap.svelte';
	import BubbleStack from '../BubbleStack.svelte';
	import BottomBar from '../BottomBar.svelte';
	import PhaseBar from '../PhaseBar.svelte';
	import DotMenu from '../DotMenu.svelte';
	import { conn } from '$lib/client/connection.svelte';
	import { ui } from '$lib/client/ui.svelte';
	import { followTurn, spotlightId } from '$lib/client/spotlight.svelte';
	import { characterNameOf, colorOf } from '$lib/client/identity';
	import { PLAYER_COLORS } from '$lib/client/theme';
	import { fmt } from '$lib/i18n';

	$effect(followTurn);

	const game = $derived(conn.game!);
	const me = $derived(conn.me);
	const t = $derived(conn.t.map);

	/** Whose story is on the screen. Never null once the match has players. */
	const watched = $derived(
		game.players.find((p) => p.id === spotlightId()) ?? me ?? game.players[0]
	);
	const tint = $derived(watched ? colorOf(watched) : PLAYER_COLORS[0]);

	const running = $derived(game.phase === 'running');
	const isMine = $derived(watched?.id === conn.you);

	/** The bubbles belong to a turn, so they go when the round is not running. */
	const bubbles = $derived(running ? conn.bubbles : []);
</script>

<div class="animate-pp-fade absolute inset-0 overflow-hidden">
	<GameMap
		tree={game.tree}
		players={game.players}
		youId={conn.you}
		effects={conn.effects}
		step={conn.lastStep}
		paceScale={game.paceScale ?? 1}
		focusId={watched?.id ?? null}
		hiddenIds={conn.waitingTurn.filter((id) => id !== watched?.id)}
	/>

	<div class="absolute top-[26px] right-5 left-6 flex items-center gap-3.5">
		<PhaseBar
			{tint}
			title={running && watched && !isMine
				? fmt(t.nowRunning, { name: characterNameOf(watched) })
				: null}
		/>
		<DotMenu padded={false} />
	</div>

	{#if bubbles.length}
		<BubbleStack {bubbles} players={game.players} />
	{/if}

	<BottomBar
		players={game.players}
		youId={conn.you}
		activeId={watched?.id ?? null}
		mode="map"
		onToggle={() => {
			ui.view = 'brain';
			// Keep reading whoever you were watching.
			ui.selectedId = watched?.id ?? conn.you ?? '';
		}}
		onPick={(id) => (ui.peekId = id)}
	/>
</div>
