<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { conn } from '$lib/client/connection.svelte';
	import type { PublicPlayer } from '$lib/engine/game';
	import { agentColor, roman } from '$lib/client/palette';
	import TreeCanvas from '$lib/components/TreeCanvas.svelte';
	import Narration from '$lib/components/Narration.svelte';
	import MemoryScroll from '$lib/components/MemoryScroll.svelte';
	import Roster from '$lib/components/Roster.svelte';
	import RoundTale from '$lib/components/RoundTale.svelte';
	import CarriedMemory from '$lib/components/CarriedMemory.svelte';
	import SabotagePanel from '$lib/components/SabotagePanel.svelte';
	import VictoryScreen from '$lib/components/VictoryScreen.svelte';

	const game = $derived(conn.game);
	const me = $derived(conn.me);
	const phase = $derived(game?.phase ?? 'lobby');
	const finished = $derived(phase === 'over');
	const running = $derived(phase === 'running');

	const activeAgent = $derived((game?.players ?? []).find((p) => p.id === conn.activeId) ?? null);

	/** Who the round is still waiting for during teaching. */
	const waitingOn = $derived(
		(game?.players ?? []).filter((p) => !p.ready && p.id !== conn.you && p.connected)
	);

	let sabotageTarget = $state<PublicPlayer | null>(null);

	function confirmSabotage(lineIndex: number, text: string) {
		if (!sabotageTarget) return;
		conn.sabotage(sabotageTarget.id, lineIndex, text);
		sabotageTarget = null;
	}

	function playAgain() {
		conn.leave();
		void goto(resolve('/'));
	}
</script>

{#if !game || !me}
	<main class="grid min-h-screen place-items-center">
		<p class="rubric">{conn.synced ? 'No tale in progress' : 'Finding your place…'}</p>
	</main>
{:else}
	{@const colour = agentColor(me.seat, true)}

	<main class="flex h-screen flex-col overflow-hidden">
		<!-- A running head, like the top of a page. -->
		<header class="flex shrink-0 items-baseline gap-4 px-6 py-3 rule-b">
			<span class="title text-sm text-parchment">HOMEWARD</span>
			<span class="rubric">{game.code}</span>

			<span class="mx-auto text-[13px] tracking-[0.2em] text-quill uppercase">
				{#if running}
					Round {roman(game.round)}
				{:else if phase === 'teaching'}
					Between rounds
				{:else}
					The end
				{/if}
			</span>

			<span class="title text-[13px]" style:color={colour}>{me.name}</span>
			<span class="rubric">{me.bestDepth} of {game.depth}</span>
		</header>

		<!-- Two columns: the illustration, and the page beside it. -->
		<div class="grid min-h-0 flex-1 gap-4 p-4 lg:grid-cols-[1fr_minmax(320px,380px)]">
			<div class="relative flex min-h-0 flex-col overflow-hidden leaf">
				<div class="min-h-0 flex-1">
					<TreeCanvas
						tree={game.tree}
						players={game.players}
						youId={conn.you}
						effects={conn.effects}
						activeId={conn.activeId}
						hiddenIds={conn.waitingTurn}
					/>
				</div>

				<!-- The tale, told beneath the illustration. -->
				{#if running}
					<div class="shrink-0 px-4 pb-4">
						<Narration
							lines={conn.lines}
							agent={activeAgent}
							youId={conn.you}
							turnIndex={conn.turnIndex}
							turnTotal={conn.turnTotal}
						/>
					</div>
				{:else if phase === 'teaching'}
					<div class="shrink-0 px-4 pb-4 text-center">
						<p class="text-[15px] text-quill italic">
							The four are back at the beginning. Give yours one more line before they set out
							again.
						</p>
					</div>
				{/if}
			</div>

			<!-- Right: what happened, what you know, who else is out there. -->
			<div class="flex min-h-0 flex-col gap-4 overflow-y-auto [&>*]:shrink-0">
				{#if running && activeAgent}
					<CarriedMemory agent={activeAgent} youId={conn.you} />
				{/if}

				{#if conn.summary && !running && !finished}
					<RoundTale summary={conn.summary} youId={conn.you} depth={game.depth} />
				{/if}

				<MemoryScroll
					{me}
					{phase}
					round={game.round}
					teachingEndsAt={game.teachingEndsAt}
					{waitingOn}
					onAdd={(text) => conn.addMemory(text)}
					onReady={() => conn.readyUp()}
				/>

				<Roster
					players={game.players}
					youId={conn.you}
					activeId={conn.activeId}
					depth={game.depth}
					sabotageUsed={me.sabotageUsed}
					{finished}
					onSabotage={(player) => (sabotageTarget = player)}
				/>
			</div>
		</div>
	</main>

	{#if sabotageTarget}
		<SabotagePanel
			target={sabotageTarget}
			onCancel={() => (sabotageTarget = null)}
			onConfirm={confirmSabotage}
		/>
	{/if}

	{#if finished}
		<VictoryScreen {game} youId={conn.you} onPlayAgain={playAgain} />
	{/if}
{/if}
