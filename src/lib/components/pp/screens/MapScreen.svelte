<script lang="ts">
	/**
	 * Screen 4: the round.
	 *
	 * The map fills the whole frame and the panels float on it, which is what makes
	 * the land feel like the thing you are looking at rather than a widget.
	 *
	 * While a round runs the screen belongs to whoever's turn it is — camera, feed,
	 * title and colour all follow the teller (`spotlight.svelte.ts`). Pinning it to
	 * your own agent, as the mockups do, would leave the screen empty for three
	 * turns out of four: the feed is tagged per player, and your agent is standing
	 * still. Between rounds it comes back to you, which is when you are writing.
	 */
	import GameMap from '../GameMap.svelte';
	import Feed from '../Feed.svelte';
	import ClueInput from '../ClueInput.svelte';
	import TurnStrip from '../TurnStrip.svelte';
	import BottomBar from '../BottomBar.svelte';
	import PhaseBar from '../PhaseBar.svelte';
	import Avatar from '../Avatar.svelte';
	import DotMenu from '../DotMenu.svelte';
	import { conn } from '$lib/client/connection.svelte';
	import { ui } from '$lib/client/ui.svelte';
	import { followTurn, spotlightId } from '$lib/client/spotlight.svelte';
	import { colorOf } from '$lib/client/identity';
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
	const entries = $derived(conn.feedFor(watched?.id ?? null));

	const running = $derived(game.phase === 'running');
	const isMine = $derived(watched?.id === conn.you);
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
			title={running && watched && !isMine ? fmt(t.nowRunning, { name: watched.name }) : null}
		/>
		<DotMenu padded={false} />
	</div>

	<!-- The story on the screen, and the one line you get to add to your own. -->
	<div
		class="absolute inset-x-3.5 bottom-[104px] flex h-[300px] flex-col overflow-hidden panel
			shadow-[0_-10px_40px_rgba(0,0,0,0.35)]"
	>
		<!-- Whose head this is, said outright rather than left to the colour alone. -->
		<div
			class="flex flex-none items-center gap-2.5 border-t-2 px-4 pt-3"
			style:border-color={tint}
			aria-label={watched ? fmt(t.storyOf, { name: watched.name }) : undefined}
		>
			{#if watched}
				<Avatar player={watched} youId={conn.you} size={34} ring={2} />
				<span data-shot="spotlight-name" class="min-w-0 truncate display text-[15px] text-white">
					{watched.name}
				</span>
			{/if}
		</div>

		<Feed
			{entries}
			{tint}
			injectionFill={tint}
			resetKey={watched?.id ?? ''}
			padding="14px 18px 8px"
		/>

		{#if running}
			<TurnStrip />
		{:else}
			<ClueInput tint={me ? colorOf(me) : tint} onSend={(text) => conn.addMemory(text)} />
		{/if}
	</div>

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
