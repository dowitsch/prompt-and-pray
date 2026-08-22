<script lang="ts">
	/**
	 * Where a player writes the one thing their agent will know.
	 *
	 * The design draws a plain free-text row. The game gives each player exactly
	 * one twenty-character line per round, and that ration is the whole point —
	 * it is why a clue has to be a decision rather than an essay. So the ration
	 * survives, as a hairline seam along the top edge of the row filling in the
	 * player's colour: it reads as part of the panel rather than as a form widget,
	 * and you can see what you have left without a number shouting at you.
	 *
	 * The send arrow becomes a check once the ration is spent. That press is
	 * "I'm done", which starts the round early if everyone else has said it too.
	 * It is deliberately *not* automatic on spending the last letter — a player
	 * may well want to keep watching the clock before committing everyone.
	 */
	import Icon from './Icon.svelte';
	import { conn } from '$lib/client/connection.svelte';
	import { MEMORY_GRANT_CHARS } from '$lib/engine/types';

	type Props = {
		/** 'clue' writes your own memory; 'inject' overwrites a rival's line. */
		mode?: 'clue' | 'inject';
		tint: string;
		/** For 'inject': the line being overwritten, or null when none is picked. */
		targetLine?: string | null;
		disabledReason?: string | null;
		onSend: (text: string) => void;
	};

	let { mode = 'clue', tint, targetLine = null, disabledReason = null, onSend }: Props = $props();

	const t = $derived(conn.t.map);
	const tb = $derived(conn.t.brain);
	const me = $derived(conn.me);
	const teaching = $derived(conn.game?.phase === 'teaching');

	let draft = $state('');

	const spent = $derived(mode === 'clue' && (me?.pendingGrants ?? 0) <= 0);
	const ready = $derived(Boolean(me?.ready));

	/** Why the row cannot be used right now — the placeholder carries the reason. */
	const blocked = $derived.by(() => {
		if (disabledReason) return disabledReason;
		if (!teaching) return t.clueClosed;
		if (mode === 'inject') return targetLine ? null : tb.pickLineFirst;
		if (ready) return t.waitingOthers;
		if (spent) return t.rationSpent;
		return null;
	});

	const canType = $derived(!blocked);
	const canSend = $derived(canType && draft.trim().length > 0);

	/** With the ration gone, the arrow's job becomes "I'm done". */
	const asDone = $derived(mode === 'clue' && teaching && spent && !ready);

	const placeholder = $derived(
		blocked ?? (mode === 'inject' ? tb.injectPlaceholder : t.cluePlaceholder)
	);

	const ticks = Array.from({ length: MEMORY_GRANT_CHARS }, (_, i) => i);

	function send() {
		if (asDone) {
			conn.readyUp();
			return;
		}
		if (!canSend) return;
		onSend(draft.trim());
		draft = '';
	}
</script>

<div
	class="flex-none transition-opacity duration-300"
	style:opacity={teaching ? 1 : 0.35}
	style:pointer-events={teaching ? 'auto' : 'none'}
>
	<!--
		The ration, as a seam. Twenty segments because there are twenty letters;
		showing it as a bar rather than a counter keeps the row looking like the
		design instead of like a form.
	-->
	{#if mode === 'clue'}
		<div class="flex gap-px px-4" aria-hidden="true">
			{#each ticks as i (i)}
				<span
					class="h-[2px] flex-1 rounded-full transition-colors duration-150"
					style:background={i < draft.length ? tint : 'rgb(255 255 255 / 14%)'}
				></span>
			{/each}
		</div>
	{/if}

	<div class="flex items-center gap-2.5 px-4 pt-2.5 pb-3.5">
		{#if mode === 'inject' && targetLine}
			<span class="sr-only">{tb.overwrites}</span>
		{/if}

		<input
			bind:value={draft}
			data-shot="clue-input"
			maxlength={MEMORY_GRANT_CHARS}
			disabled={!canType}
			{placeholder}
			spellcheck="false"
			autocomplete="off"
			aria-label={mode === 'inject' ? tb.injectPlaceholder : t.cluePlaceholder}
			class="h-[46px] min-w-0 flex-1 border-0 bg-transparent px-1 text-sm text-white
				placeholder:text-white/45 focus:ring-0 disabled:cursor-not-allowed"
		/>

		{#if (me?.pendingGrants ?? 0) > 1}
			<!-- A round was missed, so there is more than one line to give. -->
			<span class="shrink-0 rounded-md bg-white/15 px-1.5 py-0.5 text-[10px] font-bold text-white">
				×{me?.pendingGrants}
			</span>
		{/if}

		<button
			type="button"
			data-shot="clue-send"
			onclick={send}
			disabled={!canSend && !asDone}
			aria-label={asDone ? t.imDone : t.send}
			class="grid h-[46px] w-[46px] shrink-0 place-items-center rounded-2xl transition
				hover:opacity-60 disabled:cursor-not-allowed disabled:opacity-30"
		>
			<Icon name={asDone ? 'check' : 'send'} size={20} width={3} colour="#fff" />
		</button>
	</div>
</div>
