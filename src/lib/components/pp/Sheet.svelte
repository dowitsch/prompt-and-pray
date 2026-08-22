<script lang="ts">
	/**
	 * The dark card every overlay in the design is: scrim, 26px radius, #1C1F22.
	 *
	 * Escape closes it and the scrim is a real button, because a modal you can only
	 * leave by finding the right icon is a trap on a phone.
	 */
	import type { Snippet } from 'svelte';
	import { conn } from '$lib/client/connection.svelte';

	type Props = {
		onClose: () => void;
		/** Distance from the top of the frame, matching the mockups. */
		top?: number;
		/** Let the card grow and scroll instead of hugging its content. */
		fill?: boolean;
		label?: string;
		children: Snippet;
	};

	let { onClose, top = 24, fill = false, label, children }: Props = $props();
	const t = $derived(conn.t.menu);
</script>

<svelte:window
	onkeydown={(event) => {
		if (event.key === 'Escape') onClose();
	}}
/>

<div class="animate-pp-fade absolute inset-0 z-50">
	<button
		type="button"
		class="absolute inset-0 w-full bg-[#0E0F10]/[0.66]"
		aria-label={t.close}
		onclick={onClose}
	></button>

	<div
		class="animate-pp-pop absolute right-6 left-6 flex flex-col rounded-[26px] bg-dark shadow-[0_24px_60px_rgba(0,0,0,0.5)]"
		style:top="{top}px"
		style:max-height={fill ? `calc(100% - ${top * 2}px)` : 'none'}
		role="dialog"
		aria-modal="true"
		aria-label={label}
	>
		{@render children()}
	</div>
</div>
