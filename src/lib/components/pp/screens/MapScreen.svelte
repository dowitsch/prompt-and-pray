<script lang="ts">
	/**
	 * Screen 4: the round.
	 *
	 * The map fills the whole frame and the panels float on it, which is what makes
	 * the land feel like the thing you are looking at rather than a widget. The
	 * feed is yours alone — your agent's thoughts, in your colour — because the
	 * clue you are about to write is the only thing you can actually change.
	 */
	import GameMap from '../GameMap.svelte';
	import Feed from '../Feed.svelte';
	import ClueInput from '../ClueInput.svelte';
	import BottomBar from '../BottomBar.svelte';
	import PhaseBar from '../PhaseBar.svelte';
	import DotMenu from '../DotMenu.svelte';
	import { conn } from '$lib/client/connection.svelte';
	import { ui } from '$lib/client/ui.svelte';
	import { colorOf } from '$lib/client/identity';
	import { PLAYER_COLORS } from '$lib/client/theme';

	const game = $derived(conn.game!);
	const me = $derived(conn.me);
	const mine = $derived(me ? colorOf(me) : PLAYER_COLORS[0]);
	const entries = $derived(conn.feedFor(conn.you));
</script>

<div class="animate-pp-fade absolute inset-0 overflow-hidden">
	<GameMap
		tree={game.tree}
		players={game.players}
		youId={conn.you}
		effects={conn.effects}
		focusId={ui.focusId || conn.you}
		hiddenIds={conn.waitingTurn}
	/>

	<div class="absolute top-[26px] right-5 left-6 flex items-center gap-3.5">
		<PhaseBar />
		<DotMenu padded={false} />
	</div>

	<!-- Your agent's story, and the one line you get to add to it. -->
	<div
		class="absolute inset-x-3.5 bottom-[104px] flex h-[300px] flex-col overflow-hidden panel
			shadow-[0_-10px_40px_rgba(0,0,0,0.35)]"
	>
		<Feed {entries} tint={mine} injectionFill={mine} />
		<ClueInput tint={mine} onSend={(text) => conn.addMemory(text)} />
	</div>

	<BottomBar
		players={game.players}
		youId={conn.you}
		activeId={ui.focusId || conn.you}
		mode="map"
		onToggle={() => {
			ui.view = 'brain';
			ui.selectedId = conn.you ?? '';
		}}
		onPick={(id) => (ui.focusId = id)}
	/>
</div>
