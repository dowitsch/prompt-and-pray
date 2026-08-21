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
	import RunResult from '$lib/components/RunResult.svelte';
	import VictoryScreen from '$lib/components/VictoryScreen.svelte';

	const game = $derived(conn.game);
	const me = $derived(conn.me);
	const finished = $derived(game?.status === 'finished');

	let sabotageTarget = $state<PublicPlayer | null>(null);

	const canDeploy = $derived(
		Boolean(me) && !finished && (me!.agent.status === 'idle' || me!.agent.status === 'dead')
	);

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

			<div class="ml-auto flex items-center gap-4">
				<div class="hidden items-center gap-2 sm:flex">
					<span class="eyebrow">Your agent</span>
					<span
						class="grid h-6 w-6 place-items-center rounded-full border font-mono text-[9px] font-bold"
						style:border-color={colour}
						style:color={colour}>{sigil(me.name)}</span
					>
					<span class="font-mono text-xs tracking-[0.14em]" style:color={colour}>{me.name}</span>
				</div>

				<div class="flex items-center gap-3 font-mono text-[10px] text-faint">
					<span>RUN <span class="text-parchment tabular-nums">{me.runCount}</span></span>
					<span>
						DEPTH
						<span class="text-parchment tabular-nums">{me.bestDepth}/{game.depth}</span>
					</span>
					<span class="hidden sm:inline">
						MEM <span class="text-parchment tabular-nums">{me.memoryChars}</span>
					</span>
				</div>

				<span
					class="rounded-full px-2.5 py-1 font-mono text-[9px] tracking-[0.18em] uppercase"
					style:color={me.agent.thinking ? colour : '#575c6e'}
					style:border={`1px solid ${me.agent.thinking ? colour + '66' : '#1e2230'}`}
				>
					{#if finished}over{:else if me.agent.thinking}thinking{:else if me.agent.status === 'running'}
						in the field
					{:else if me.agent.status === 'dead'}lost{:else}ready{/if}
				</span>
			</div>
		</header>

		<!-- Board -->
		<div
			class="grid min-h-0 flex-1 gap-3 p-3 lg:grid-cols-[minmax(240px,300px)_1fr_minmax(280px,340px)]"
		>
			<!-- Left: what the agents are saying -->
			<div class="hidden min-h-0 flex-col gap-3 lg:flex">
				<AgentLog log={conn.log} youId={conn.you} />
			</div>

			<!-- Centre: the tree -->
			<div class="min-h-0 overflow-hidden panel">
				<TreeCanvas
					tree={game.tree}
					players={game.players}
					youId={conn.you}
					effects={conn.effects}
				/>
			</div>

			<!-- Right: teaching, results, rivals -->
			<div class="flex min-h-0 flex-col gap-3 overflow-y-auto">
				<RunResult {me} depth={game.depth} />
				<MemoryPanel
					{me}
					{canDeploy}
					{finished}
					onAdd={(text) => conn.addMemory(text)}
					onDeploy={() => conn.deploy()}
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

		<!-- The log matters too much to hide entirely on small screens. -->
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
