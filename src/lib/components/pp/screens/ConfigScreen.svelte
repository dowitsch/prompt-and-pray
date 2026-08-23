<script lang="ts">
	/**
	 * Screen 2: who you are going to be.
	 *
	 * Name, figure, colour. The colour is the one that is contested, so it is the
	 * server that decides: a swatch somebody else holds is drawn struck through and
	 * refuses the tap, and if two people reach for the same one in the same instant
	 * the loser gets told rather than quietly ending up as a twin. The figure is
	 * *not* contested — two players may both be Krotz, in two different colours.
	 *
	 * The name follows the figure until it doesn't. Nobody has to type anything to
	 * get past this screen, so swiping the carousel renames you to whoever is on
	 * it; the first name typed by hand ends that for good (`storedName()` is the
	 * flag) and is remembered for the next match.
	 */
	import CharacterCard from '../CharacterCard.svelte';
	import Icon from '../Icon.svelte';
	import DotMenu from '../DotMenu.svelte';
	import { conn } from '$lib/client/connection.svelte';
	import { nextCharacter, ui } from '$lib/client/ui.svelte';
	import { CHARACTER_COUNT, colorOf } from '$lib/client/identity';
	import { PLAYER_COLORS } from '$lib/client/theme';
	import { rememberName, storedName } from '$lib/client/names';
	import { characterAt } from '$lib/engine/characters';

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
		// Only a hand-typed name is remembered, and remembering it is what stops the
		// carousel renaming them from under themselves on the next swipe.
		rememberName(name);
		conn.configure({ name });
	}

	/** The name that goes with a figure, for as long as the player has not chosen. */
	function followName(index: number): string | undefined {
		return storedName() === null ? characterAt(index).name : undefined;
	}

	function pickCharacter(step: number) {
		nextCharacter(step);
		conn.configure({ character: ui.character, name: followName(ui.character) });
	}

	/* The carousel follows the server, so a refused change snaps back. */
	$effect(() => {
		if (me) ui.character = me.character;
	});

	/*
	 * The seat was dealt a figure before this screen existed, and an unnamed
	 * player is still called whatever `Game.cleanName` fell back to. Put the two
	 * in step once, on the first snapshot, so the pill is right before anything
	 * is touched. Guarded on the name it would send, so this cannot loop.
	 */
	let synced = false;
	$effect(() => {
		if (synced || !me) return;
		const name = followName(me.character);
		synced = true;
		if (name && name !== me.name) conn.configure({ name });
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
		style:border="4px solid {mine}"
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
		class="absolute top-[206px] right-0 left-0 h-[378px] touch-pan-y"
		onpointerdown={(event) => (swipeFrom = event.clientX)}
		onpointerup={(event) => {
			const dx = event.clientX - swipeFrom;
			if (dx < -40) pickCharacter(1);
			else if (dx > 40) pickCharacter(-1);
		}}
	>
		<div
			class="absolute inset-0 flex overflow-visible transition-transform duration-[380ms]
				ease-[cubic-bezier(0.22,0.8,0.3,1)]"
			style:transform="translateX({-390 * ui.character}px)"
		>
			{#each Array.from({ length: CHARACTER_COUNT }, (_, i) => i) as index (index)}
				<div class="flex w-[390px] shrink-0 items-start justify-center">
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
				style:box-shadow={isMine ? '0 0 0 4px #fff' : 'none'}
			>
				{#if isTaken}
					<!-- A hairline read as a rendering artefact at this size; the revised
						 design strikes the swatch with something you cannot mistake. -->
					<span class="absolute inset-x-[3px] h-1 -rotate-45 rounded-sm bg-white/90"></span>
				{/if}
			</button>
		{/each}
	</fieldset>

	<!--
		Twelve pixels higher than the drawing has it, on this screen and on the
		lobby both. The invite button below is a labelled pill now rather than a
		54px square, and at "Einladen" it reaches far enough right to pass under
		this one — six pixels of overlap, which is exactly the kind of thing that
		reads as a broken layout. Moved on both screens rather than one, because
		they cross-fade into each other and a button that slides is worse than a
		button that sits slightly high.
	-->
	<div class="absolute right-6 bottom-[88px] left-[110px]">
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

	<!--
		Named, not just drawn. A bare QR glyph reads as "look at a code"; what it
		actually does from here is fetch the people you are about to play with, and
		this is the screen where somebody is deciding who they are rather than
		looking for a way out of it.
	-->
	<button
		type="button"
		data-shot="config-invite"
		onclick={onShowQr}
		class="absolute bottom-7 left-6 flex h-[54px] items-center gap-2.5 rounded-2xl bg-white px-4
			shadow-[0_10px_22px_rgba(28,31,34,0.25)] transition hover:-translate-y-0.5
			hover:bg-[#F2F2F2]"
	>
		<Icon name="qr" size={24} colour="#1C1F22" />
		<span class="display text-[15px] text-dark">{conn.t.pp.invite}</span>
	</button>
</div>
