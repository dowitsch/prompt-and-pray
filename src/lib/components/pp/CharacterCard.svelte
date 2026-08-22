<script lang="ts">
	/**
	 * A character portrait, or an honest hole where one goes.
	 *
	 * The art exists now, and it is a cut-out on transparency rather than a
	 * picture in a frame — so the loaded state has no card behind it and no
	 * rounded clip, only the figure and its own drop shadow, the way the design
	 * draws it. The dashed frame stays for the failure path: it is what a missed
	 * deploy looks like, and it has to look deliberate rather than broken.
	 *
	 * The figure is sized to leave the caption room: the carousel band is 378px
	 * tall and the swatches sit immediately under it, so art plus caption has to
	 * fit inside that or the blurb lands on the colours. The design's own figure
	 * is taller because it has no caption to carry.
	 *
	 * What the frame no longer is, though, is anonymous. Choosing a character is a
	 * strategic choice now — Aurelia reads notes to the letter, PENGU-01 believes
	 * any shortcut — so the name, the title and one line about how this one decides
	 * sit under the frame whether or not the picture ever loads. This carousel is
	 * the only screen where that is legible before you commit to it.
	 */
	import { characterSrc } from '$lib/client/identity';
	import { characterAt } from '$lib/engine/characters';
	import { conn } from '$lib/client/connection.svelte';
	import { fmt } from '$lib/i18n';

	type Props = {
		index: number;
		/** The box the figure is fitted into; it is contained, never cropped. */
		width?: number;
		height?: number;
		/** Only the placeholder has an edge, so only the placeholder needs this. */
		radius?: number;
		/** The name and title always show; the line about how it decides is the
		 * carousel's job, where the choice is still open. */
		detail?: boolean;
	};

	let { index, width = 300, height = 284, radius = 20, detail = true }: Props = $props();

	const t = $derived(conn.t.config);
	const character = $derived(characterAt(index));
	const epithet = $derived(character.epithet[conn.locale] ?? character.epithet.en);
	const blurb = $derived(character.blurb[conn.locale] ?? character.blurb.en);
	const title = $derived(fmt(t.character, { name: character.name, epithet }));
	let failed = $state(false);

	// A new index is a new file, so the old verdict does not apply to it.
	$effect(() => {
		void index;
		failed = false;
	});
</script>

<div class="flex flex-col items-center gap-2.5">
	<div class="relative grid place-items-center" style:width="{width}px" style:height="{height}px">
		{#if failed}
			<div class="placeholder" style:border-radius="{radius}px">
				<span class="font-mono text-[9px] leading-relaxed tracking-[0.06em] text-white/55">
					{fmt(t.artMissing, { name: character.name })}
				</span>
			</div>
		{:else}
			<!--
				Sized in px rather than `h-full`: the four figures have four different
				aspect ratios, and a percentage height against this grid's auto row
				resolves to the image's own height — so the tall ones grew out of the
				card and over the caption. Explicit box, contained content.
			-->
			<img
				src={characterSrc(index)}
				alt={title}
				style:width="{width}px"
				style:height="{height}px"
				class="object-contain drop-shadow-[0_14px_24px_rgba(28,31,34,0.35)]"
				onerror={() => (failed = true)}
			/>
		{/if}
	</div>

	<div class="px-6 text-center">
		<p class="display text-lg leading-tight tracking-[0.04em] text-white">{character.name}</p>
		<p class="mt-0.5 text-[11px] leading-tight text-white/55">{epithet}</p>
		{#if detail}
			<p class="mt-1.5 line-clamp-3 text-[11px] leading-snug text-white/45">{blurb}</p>
		{/if}
	</div>
</div>

<style>
	.placeholder {
		display: grid;
		place-items: center;
		width: 100%;
		height: 100%;
		padding: 0 1rem;
		text-align: center;
		background-color: #2a2e31;
		background-image: repeating-linear-gradient(
			45deg,
			rgb(255 255 255 / 10%) 0 7px,
			transparent 7px 14px
		);
		border: 1px dashed rgb(255 255 255 / 40%);
	}
</style>
