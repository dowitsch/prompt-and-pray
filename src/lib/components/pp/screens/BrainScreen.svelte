<script lang="ts">
	/**
	 * Screen 5: inside somebody's head.
	 *
	 * The ground is the selected player's colour, so which head you are in is never
	 * in doubt. Your own is the list of prompts you have written; a rival's is
	 * where you plant a lie.
	 *
	 * The revised design makes the mischief a property of a *line* rather than of
	 * the screen: each of a rival's notes carries its own flask, and pressing one
	 * is how you choose what to overwrite. That is a better fit for the rule than
	 * the free-text row it replaces — sabotage overwrites, so the target has to be
	 * visible before you type, and now you cannot help but see which belief you are
	 * about to replace.
	 */
	import PromptList from '../PromptList.svelte';
	import ClueInput from '../ClueInput.svelte';
	import BottomBar from '../BottomBar.svelte';
	import ReachDots from '../ReachDots.svelte';
	import Icon from '../Icon.svelte';
	import DotMenu from '../DotMenu.svelte';
	import { conn } from '$lib/client/connection.svelte';
	import { ask, ui } from '$lib/client/ui.svelte';
	import { characterNameOf, colorOf } from '$lib/client/identity';
	import { clock, secondsUntil, tick } from '$lib/client/clock.svelte';

	$effect(tick);

	const game = $derived(conn.game!);
	const t = $derived(conn.t.brain);
	const me = $derived(conn.me);

	const selected = $derived(
		game.players.find((p) => p.id === ui.selectedId) ?? conn.me ?? game.players[0]
	);
	const isMine = $derived(selected?.id === conn.you);
	const ground = $derived(selected ? colorOf(selected) : '#F59D89');

	const teaching = $derived(game.phase === 'teaching');
	const left = $derived(secondsUntil(game.teachingEndsAt, clock.now));

	/** The note this injection would replace, if one has been picked. */
	const target = $derived(
		isMine ? null : (selected?.memory.find((line) => line.id === ui.injectLineId) ?? null)
	);

	const spent = $derived(Boolean(me?.sabotageUsed));
	const noNotes = $derived(!isMine && (selected?.memory.length ?? 0) === 0);

	/** Why you cannot lie to this agent, if you cannot. */
	const blocked = $derived(isMine ? null : spent ? t.mischiefSpent : noNotes ? t.noNotes : null);

	/** A line may only be picked while there is still a lie left to tell. */
	const canPick = $derived(!isMine && teaching && !spent && !noNotes);

	/**
	 * The row is not standing furniture any more: on your own list it is where you
	 * write, on a rival's it only exists once you have chosen a line to overwrite.
	 */
	const showInput = $derived(isMine || Boolean(target));

	// A different head means a different set of notes; the old pick is meaningless.
	$effect(() => {
		void ui.selectedId;
		ui.injectLineId = null;
	});
</script>

<div
	class="animate-pp-fade absolute inset-0 overflow-hidden"
	style:background="linear-gradient(178deg, {ground} 0%, {ground}DD 55%, {ground}B8 100%)"
>
	<div class="absolute top-[26px] right-5 left-6 z-[4] flex items-center gap-3.5">
		<div class="flex min-w-0 flex-1 flex-col gap-2">
			<span data-shot="brain-name" class="truncate display text-[26px] text-white">
				{isMine ? t.yourOwn : selected ? characterNameOf(selected) : ''}
			</span>
			<!-- How far this agent has ever got: the only score in the game. -->
			<ReachDots reached={selected?.bestDepth ?? 0} total={game.depth} />
		</div>
		<!--
			The badge is the clock, so it goes when there is nothing to count. The
			mockup fades it rather than removing it, which keeps the row's rhythm while
			a round runs.
		-->
		<span
			class="grid h-[52px] w-[52px] shrink-0 place-items-center rounded-2xl bg-dark
				transition-opacity duration-300"
			style:opacity={teaching ? 1 : 0}
			aria-hidden={!teaching}
		>
			{#if teaching}
				<span class="display text-[22px] text-white tabular-nums">{left}</span>
			{/if}
		</span>
		<DotMenu padded={false} />
	</div>

	<div class="absolute inset-x-0 top-[130px] bottom-[196px] flex flex-col">
		{#if selected}
			<PromptList
				player={selected}
				players={game.players}
				mine={isMine}
				selectable={canPick}
				selectedLineId={ui.injectLineId}
				onSelect={(lineId) => (ui.injectLineId = lineId)}
			/>
		{/if}
	</div>

	{#if showInput}
		<!--
			Your own row hangs from the bottom of the panel, under the ration seam that
			only your own row has. An injection has no seam, so the same `justify-end`
			left it pinned low with a band of empty panel above it; centred, the row
			sits in the middle of its own box the way it looks like it should.
		-->
		<div
			class="animate-pp-rise absolute inset-x-[18px] bottom-24 flex h-[88px] flex-col
				rounded-3xl bg-dark {isMine ? 'justify-end' : 'justify-center'}"
		>
			{#if isMine}
				<ClueInput tint="#fff" onSend={(text) => conn.addMemory(text)} />
			{:else}
				<div class="flex items-center">
					<!--
						Backing out of a lie has to be as easy as starting one. Centred on the
						row it belongs to rather than sitting on its baseline: it is the twin
						of the send arrow at the other end, and the two were not level.
					-->
					<button
						type="button"
						onclick={() => (ui.injectLineId = null)}
						aria-label={t.cancelInject}
						class="flex h-[46px] w-11 shrink-0 items-center justify-start pl-3.5 transition
							hover:opacity-60"
					>
						<Icon name="cross" size={20} width={2.8} colour="#fff" />
					</button>
					<div class="min-w-0 flex-1">
						<ClueInput
							mode="inject"
							tint="#fff"
							targetLine={target?.text ?? null}
							disabledReason={blocked}
							onSend={(text) => {
								ui.pendingInject = text;
								ask('inject');
							}}
						/>
					</div>
				</div>
			{/if}
		</div>
	{/if}

	<BottomBar
		players={game.players}
		youId={conn.you}
		activeId={selected?.id ?? null}
		mode="brain"
		onToggle={() => (ui.view = 'map')}
		onPick={(id) => (ui.selectedId = id)}
	/>
</div>
