<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { conn } from '$lib/client/connection.svelte';
	import type { PublicPlayer } from '$lib/engine/game';
	import { agentColor, sigil } from '$lib/client/palette';
	import TreeCanvas from '$lib/components/TreeCanvas.svelte';
	import MemoryPanel from '$lib/components/MemoryPanel.svelte';
	import AgentLog from '$lib/components/AgentLog.svelte';
	import OpponentList from '$lib/components/OpponentList.svelte';
	import SabotagePanel from '$lib/components/SabotagePanel.svelte';
	import RoundRecap from '$lib/components/RoundRecap.svelte';
	import VictoryScreen from '$lib/components/VictoryScreen.svelte';

	const game = $derived(conn.game);
	const me = $derived(conn.me);
	const phase = $derived(game?.phase ?? 'lobby');
	const finished = $derived(phase === 'over');
	const running = $derived(phase === 'running');

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
		<p class="font-mono text-xs tracking-[0.2em] text-faint uppercase">
			{conn.synced ? 'No match in progress' : 'Reconnecting…'}
		</p>
	</main>
{:else}
	{@const colour = agentColor(me.seat, true)}

	<main class="flex h-screen flex-col overflow-hidden">
		<!-- Status bar -->
		<header class="flex shrink-0 items-center gap-4 px-5 py-2.5 hairline">
			<span class="font-mono text-xs tracking-[0.28em] text-parchment">HOMEWARD</span>
			<span class="font-mono text-[10px] tracking-[0.2em] text-faint">{game.code}</span>

			<span
				class="rounded-full border px-2.5 py-1 font-mono text-[9px] tracking-[0.18em] uppercase"
				style:color={running ? colour : '#8b8fa0'}
				style:border-color={running ? colour + '55' : '#1e2230'}
			>
				Round {game.round}
				{#if running}· running{:else if phase === 'teaching'}· teaching{/if}
			</span>

			<div class="ml-auto flex items-center gap-4">
				<div class="hidden items-center gap-2 sm:flex">
					<span
						class="grid h-6 w-6 place-items-center rounded-full border font-mono text-[9px] font-bold"
						style:border-color={colour}
						style:color={colour}>{sigil(me.name)}</span
					>
					<span class="font-mono text-xs tracking-[0.14em]" style:color={colour}>{me.name}</span>
				</div>

				<div class="flex items-center gap-3 font-mono text-[10px] text-faint">
					<span>
						BEST <span class="text-parchment tabular-nums">{me.bestDepth}/{game.depth}</span>
					</span>
					<span class="hidden sm:inline">
						MEM <span class="text-parchment tabular-nums">{me.memoryChars}</span>
					</span>
				</div>
			</div>
		</header>

		<!-- Board -->
		<div
			class="grid min-h-0 flex-1 gap-3 p-3 lg:grid-cols-[minmax(240px,300px)_1fr_minmax(280px,340px)]"
		>
			<div class="hidden min-h-0 flex-col gap-3 lg:flex">
				<AgentLog log={conn.log} youId={conn.you} />
			</div>

			<!-- Centre: the tree, with the current beat called out over it -->
			<div class="relative min-h-0 overflow-hidden panel">
				<TreeCanvas
					tree={game.tree}
					players={game.players}
					youId={conn.you}
					effects={conn.effects}
					focusAll={running}
				/>

				{#if running && conn.stepLabel}
					<div class="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2">
						<span
							class="rounded-full border border-edge bg-black/60 px-3 py-1 font-mono
								text-[10px] tracking-[0.2em] text-muted uppercase backdrop-blur-sm"
						>
							{conn.stepLabel}
						</span>
					</div>
				{:else if phase === 'teaching'}
					<div class="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2">
						<span
							class="rounded-full border border-ember/40 bg-black/60 px-3 py-1 font-mono
								text-[10px] tracking-[0.2em] text-ember uppercase backdrop-blur-sm"
						>
							Teach your agent — round {game.round + 1} next
						</span>
					</div>
				{/if}
			</div>

			<!-- Right: the story, teaching, rivals -->
			<div class="flex min-h-0 flex-col gap-3 overflow-y-auto [&>*]:shrink-0">
				{#if conn.summary && !finished}
					<RoundRecap summary={conn.summary} youId={conn.you} depth={game.depth} />
				{/if}
				<MemoryPanel
					{me}
					{phase}
					round={game.round}
					teachingEndsAt={game.teachingEndsAt}
					{waitingOn}
					onAdd={(text) => conn.addMemory(text)}
					onReady={() => conn.readyUp()}
				/>
				<OpponentList
					opponents={conn.opponents}
					depth={game.depth}
					sabotageUsed={me.sabotageUsed}
					{finished}
					onSabotage={(player) => (sabotageTarget = player)}
				/>
			</div>
		</div>

		<div class="min-h-0 shrink-0 basis-48 p-3 pt-0 lg:hidden">
			<AgentLog log={conn.log} youId={conn.you} />
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
