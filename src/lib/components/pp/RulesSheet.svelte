<script lang="ts">
	import Sheet from './Sheet.svelte';
	import Icon from './Icon.svelte';
	import { conn } from '$lib/client/connection.svelte';
	import { closeOverlay } from '$lib/client/ui.svelte';

	const t = $derived(conn.t.rules);
</script>

<Sheet onClose={closeOverlay} fill label={t.title}>
	<div class="flex shrink-0 items-start justify-between gap-3 px-5 pt-5 pb-[26px]">
		<h2 class="pt-1 pl-1.5 display text-[22px] text-white">{t.title}</h2>
		<button
			type="button"
			onclick={closeOverlay}
			aria-label={conn.t.menu.close}
			class="grid h-8 w-8 shrink-0 place-items-center transition hover:opacity-60"
		>
			<Icon name="close" size={18} width={2.6} colour="#fff" />
		</button>
	</div>
	<div class="flex pp-scroll min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-[26px] pb-[26px]">
		<!-- The lead says what the game *is*; the rest says how it works. -->
		<p class="text-[15px] leading-relaxed font-bold text-white">{t.lead}</p>
		{#each t.paragraphs as paragraph, i (i)}
			<p class="text-sm leading-relaxed text-white/[0.82]">{paragraph}</p>
		{/each}
	</div>
</Sheet>
