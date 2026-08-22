<script lang="ts">
	/**
	 * A character portrait, or an honest hole where one goes.
	 *
	 * The art does not exist yet, so the dashed frame from the mockups is the real
	 * state of this component rather than a nicety — it is what will be on screen
	 * for most of the work, and it has to look deliberate. `loaded` starts false
	 * and only an actual load flips it, so a missing file is the quiet path.
	 */
	import { characterSrc } from '$lib/client/identity';
	import { conn } from '$lib/client/connection.svelte';
	import { fmt } from '$lib/i18n';

	type Props = {
		index: number;
		width?: number;
		height?: number;
		radius?: number;
	};

	let { index, width = 212, height = 300, radius = 20 }: Props = $props();

	const t = $derived(conn.t.config);
	let failed = $state(false);

	// A new index is a new file, so the old verdict does not apply to it.
	$effect(() => {
		void index;
		failed = false;
	});
</script>

<div
	class="relative grid place-items-center overflow-hidden"
	style:width="{width}px"
	style:height="{height}px"
	style:border-radius="{radius}px"
>
	{#if failed}
		<div class="placeholder" style:border-radius="{radius}px">
			<span class="font-mono text-[9px] leading-relaxed tracking-[0.06em] text-white/55">
				{t.artMissing}
			</span>
		</div>
	{:else}
		<img
			src={characterSrc(index)}
			alt={fmt(t.character, { n: index + 1 })}
			class="h-full w-full object-contain"
			onerror={() => (failed = true)}
		/>
	{/if}
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
