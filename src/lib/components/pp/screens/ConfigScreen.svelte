<script lang="ts">
	/**
	 * Screen 2: who you are going to be.
	 *
	 * Name, figure, colour. The colour is the one that is contested, so it is the
	 * server that decides: a swatch somebody else holds is drawn struck through and
	 * refuses the tap, and if two people reach for the same one in the same instant
	 * the loser gets told rather than quietly ending up as a twin.
	 */
	import CharacterCard from '../CharacterCard.svelte';
	import Icon from '../Icon.svelte';
	import DotMenu from '../DotMenu.svelte';
	import { conn } from '$lib/client/connection.svelte';
	import { nextCharacter, ui } from '$lib/client/ui.svelte';
	import { CHARACTER_COUNT, colorOf } from '$lib/client/identity';
	import { PLAYER_COLORS } from '$lib/client/theme';
	import { rememberName } from '$lib/client/names';

	type Props = { onDone: () => void; onShowQr: () => void };
	let { onDone, onShowQr }: Props = $props();

	const t = $derived(conn.t.config);
	const me = $derived(conn.me);
	const mine = $derived(me ? colorOf(me) : PLAYER_COLORS[0]);

	/** Colours somebody else is already wearing. */
	const taken = $derived(
		new Set((conn.game?.players ?? []).filter((p) => p.id !== conn.you).map((p) => p.colour))
	);

	function startEdit() {
		ui.nameDraft = me?.name ?? '';
		ui.editingName = true;
	}

	function commitName() {
		const name = ui.nameDraft.trim();
		ui.editingName = false;
		if (!name || name === me?.name) return;
		// Only a hand-typed name is remembered; that is what stops the random one
		// from being rerolled out from under someone who liked it.
		rememberName(name);
		conn.configure({ name });
	}

	function pickCharacter(step: number) {
		nextCharacter(step);
		conn.configure({ character: ui.character });
	}

	/* The carousel follows the server, so a refused change snaps back. */
	$effect(() => {
		if (me) ui.character = me.character;
	});

	let swipeFrom = 0;
</script>

<div class="animate-pp-fade absolute inset-0">
	<div class="absolute top-[26px] right-[22px] z-[5]">
		<DotMenu />
	</div>

	<!-- The name pill, in your own colour. -->
	<div
		class="absolute top-[110px] right-8 left-8 flex h-[78px] items-center overflow-hidden
			rounded-[39px] transition-colors duration-300"
		style:background={mine}
		style:border="2px solid {mine}"
	>
		{#if ui.editingName}
			<!-- svelte-ignore a11y_autofocus -->
			<input
				bind:value={ui.nameDraft}
				onkeydown={(event) => {
					if (event.key === 'Enter') commitName();
				}}
				autofocus
				maxlength="18"
				placeholder={t.namePlaceholder}
				aria-label={t.namePlaceholder}
				class="h-full min-w-0 flex-1 border-0 bg-dark/[0.24] px-[26px] display text-[26px]
					text-white focus:ring-0"
			/>
			<button
				type="button"
				onclick={commitName}
				aria-label={t.commitName}
				class="grid h-full w-[78px] shrink-0 place-items-center transition hover:brightness-110"
			>
				<Icon name="check" size={24} width={3} colour="#fff" />
			</button>
		{:else}
			<span
				class="flex h-full min-w-0 flex-1 items-center truncate bg-dark/[0.24] px-[26px] display
					text-[28px] text-white"
			>
				{me?.name ?? ''}
			</span>
			<button
				type="button"
				onclick={startEdit}
				aria-label={t.editName}
				class="grid h-full w-[78px] shrink-0 place-items-center transition hover:brightness-110"
			>
				<Icon name="pencil" size={24} width={2.2} colour="#fff" />
			</button>
		{/if}
	</div>

	<!-- The figures. Swipe or tap; both end in the same CONFIGURE. -->
	<!--
		Swipe is the nice way through; the two arrows are the accessible one, which
		is why the region itself only needs to be announced as a group.
	-->
	<div
		role="group"
		aria-label={t.next}
		class="absolute top-[216px] right-0 left-0 h-[378px] touch-pan-y overflow-hidden"
		onpointerdown={(event) => (swipeFrom = event.clientX)}
		onpointerup={(event) => {
			const dx = event.clientX - swipeFrom;
			if (dx < -40) pickCharacter(1);
			else if (dx > 40) pickCharacter(-1);
		}}
	>
		<div
			class="absolute inset-0 flex transition-transform duration-[380ms]
				ease-[cubic-bezier(0.22,0.8,0.3,1)]"
			style:transform="translateX({-390 * ui.character}px)"
		>
			{#each Array.from({ length: CHARACTER_COUNT }, (_, i) => i) as index (index)}
				<div class="flex w-[390px] shrink-0 items-center justify-center">
					<CharacterCard {index} />
				</div>
			{/each}
		</div>

		<button
			type="button"
			onclick={() => pickCharacter(-1)}
			aria-label={t.previous}
			class="absolute top-[150px] left-2.5 grid h-10 w-10 place-items-center rounded-full
				bg-white/20 transition hover:bg-white/[0.38]"
		>
			<Icon name="left" size={16} width={3} colour="#fff" />
		</button>
		<button
			type="button"
			onclick={() => pickCharacter(1)}
			aria-label={t.next}
			class="absolute top-[150px] right-2.5 grid h-10 w-10 place-items-center rounded-full
				bg-white/20 transition hover:bg-white/[0.38]"
		>
			<Icon name="right" size={16} width={3} colour="#fff" />
		</button>
	</div>

	<!-- The five colours. -->
	<fieldset class="absolute top-[596px] right-12 left-12 flex items-center justify-between">
		<legend class="sr-only">{t.pickColour}</legend>
		{#each PLAYER_COLORS as colour, index (colour)}
			{@const isTaken = taken.has(index)}
			{@const isMine = me?.colour === index}
			<button
				type="button"
				data-shot="swatch"
				disabled={isTaken}
				onclick={() => conn.configure({ colour: index })}
				aria-label={isTaken ? t.colourTaken : t.pickColour}
				aria-pressed={isMine}
				class="relative grid h-[46px] w-[46px] place-items-center rounded-full transition
					hover:scale-105 disabled:cursor-not-allowed disabled:hover:scale-100"
				style:background={colour}
				style:opacity={isTaken ? 0.35 : 1}
				style:box-shadow={isMine ? '0 0 0 3px #fff' : 'none'}
			>
				{#if isTaken}
					<span class="absolute inset-x-1.5 h-0.5 -rotate-45 bg-white/75"></span>
				{/if}
			</button>
		{/each}
	</fieldset>

	<div class="absolute right-6 bottom-[76px] left-[110px]">
		<button
			type="button"
			data-shot="config-done"
			onclick={onDone}
			class="flex h-[74px] w-full items-center justify-end gap-4 rounded-[22px] bg-dark pr-7
				shadow-[0_16px_34px_rgba(28,31,34,0.3)] transition hover:-translate-y-0.5
				hover:bg-[#2A2E31]"
		>
			<span class="display text-2xl text-white">{t.done}</span>
			<Icon name="right" size={20} width={3.2} colour="#fff" />
		</button>
	</div>

	<button
		type="button"
		onclick={onShowQr}
		aria-label={conn.t.pp.showQr}
		class="absolute bottom-7 left-6 grid h-[54px] w-[54px] place-items-center rounded-2xl bg-white
			shadow-[0_10px_22px_rgba(28,31,34,0.25)] transition hover:-translate-y-0.5
			hover:bg-[#F2F2F2]"
	>
		<Icon name="qr" size={24} colour="#1C1F22" />
	</button>
</div>
