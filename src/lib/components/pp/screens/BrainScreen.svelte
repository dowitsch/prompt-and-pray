<script lang="ts">
	/**
	 * Screen 5: inside somebody's head.
	 *
	 * The ground is the selected player's colour, so which head you are in is never
	 * in doubt. Your own is a read of your whole history; a rival's is where you
	 * plant a lie.
	 *
	 * The design draws that as free text. The game gives you exactly one act of
	 * mischief per match, and it *overwrites* a line rather than adding one — so
	 * here you tap one of their notes to choose it, and only then can you type. That
	 * keeps the rule intact and, better, makes the target visible: you can see
	 * which of their beliefs you are about to replace.
	 */
	import Feed from '../Feed.svelte';
	import ClueInput from '../ClueInput.svelte';
	import BottomBar from '../BottomBar.svelte';
	import Avatar from '../Avatar.svelte';
	import Icon from '../Icon.svelte';
	import DotMenu from '../DotMenu.svelte';
	import { conn } from '$lib/client/connection.svelte';
	import { ask, ui } from '$lib/client/ui.svelte';
	import { colorOf } from '$lib/client/identity';
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
	const entries = $derived(conn.feedFor(selected?.id ?? null));

	const teaching = $derived(game.phase === 'teaching');
	const left = $derived(secondsUntil(game.teachingEndsAt, clock.now));

	/** The note this injection would replace, if one has been picked. */
	const target = $derived(
		isMine ? null : (selected?.memory.find((line) => line.id === ui.injectLineId) ?? null)
	);

	const spent = $derived(Boolean(me?.sabotageUsed));
	const noNotes = $derived(!isMine && (selected?.memory.length ?? 0) === 0);

	const blocked = $derived(isMine ? null : spent ? t.mischiefSpent : noNotes ? t.noNotes : null);

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
		{#if selected}
			<Avatar player={selected} size={52} ring={2.5} ringColour="#fff" />
		{/if}
		<span class="min-w-0 flex-1 truncate display text-[22px] text-white">
			{isMine ? t.yourOwn : (selected?.name ?? '')}
		</span>
		<span class="grid h-[52px] w-[52px] shrink-0 place-items-center rounded-2xl bg-dark">
			{#if teaching}
				<span class="display text-[22px] text-white tabular-nums">{left}</span>
			{:else}
				<span class="animate-pp-pulse">
					<Icon name="clock" size={24} colour="#fff" />
				</span>
			{/if}
		</span>
		<DotMenu padded={false} />
	</div>

	<!-- On this ground the tint is white; the colour is already the background. -->
	<div class="absolute inset-x-0 top-24 bottom-[196px] flex flex-col">
		<Feed
			{entries}
			tint="#fff"
			injectionFill="rgba(255,255,255,0.42)"
			selectableLineId={isMine || spent || noNotes ? null : ''}
			selectedLineId={ui.injectLineId}
			onSelectLine={(lineId) => (ui.injectLineId = lineId)}
			gap={16}
			padding="8px 18px 20px"
			jumpBottom={12}
		/>
	</div>

	<div
		class="absolute inset-x-3.5 bottom-24 flex h-[88px] flex-col justify-end rounded-3xl bg-dark"
	>
		{#if isMine}
			<ClueInput tint="#fff" onSend={(text) => conn.addMemory(text)} />
		{:else}
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
		{/if}
	</div>

	<BottomBar
		players={game.players}
		youId={conn.you}
		activeId={selected?.id ?? null}
		mode="brain"
		onToggle={() => (ui.view = 'map')}
		onPick={(id) => (ui.selectedId = id)}
	/>
</div>
