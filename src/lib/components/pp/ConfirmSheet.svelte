<script lang="ts">
	/**
	 * The second tap on anything irreversible.
	 *
	 * The mockups put two thumb icons here and nothing else. That is not a
	 * convention anyone reads reliably — thumbs-down-means-cancel is a guess — and
	 * this dialog ends matches and overwrites memory, so the buttons carry words.
	 * The shape, the radius and the coral confirm are the design's.
	 */
	import Sheet from './Sheet.svelte';
	import { conn } from '$lib/client/connection.svelte';
	import { closeOverlay } from '$lib/client/ui.svelte';

	type Props = { question: string; onYes: () => void };
	let { question, onYes }: Props = $props();

	const t = $derived(conn.t.confirm);
</script>

<Sheet onClose={closeOverlay} top={300} label={question}>
	<div class="px-6 py-7">
		<p class="display text-[22px] leading-tight text-white">{question}</p>
		<div class="mt-[26px] flex gap-3">
			<button
				type="button"
				onclick={closeOverlay}
				class="h-14 flex-1 rounded-[18px] bg-white/10 text-[15px] font-bold text-white
					transition hover:bg-white/20"
			>
				{t.no}
			</button>
			<button
				type="button"
				data-shot="confirm-yes"
				onclick={onYes}
				class="h-14 flex-1 rounded-[18px] bg-p1 text-[15px] font-bold text-dark
					transition hover:bg-p2"
			>
				{t.yes}
			</button>
		</div>
	</div>
</Sheet>
