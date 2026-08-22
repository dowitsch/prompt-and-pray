<script lang="ts">
	/**
	 * A real, scannable QR code, drawn the way the mockups draw it.
	 *
	 * It encodes a URL rather than the bare four-character code, so any phone's
	 * own camera app opens the round directly — which matters, because the in-app
	 * scanner cannot work everywhere (see ScanSheet).
	 *
	 * Rendered as a grid of divs rather than an SVG or a canvas purely to match the
	 * design: white modules on the dark panel, gaps left transparent.
	 */
	import { encode } from 'uqr';

	type Props = {
		value: string;
		/** Quiet zone, in px. A QR needs one or scanners struggle. */
		pad?: number;
	};

	let { value, pad = 22 }: Props = $props();

	const matrix = $derived.by(() => {
		try {
			return encode(value, { ecc: 'M' });
		} catch {
			return null;
		}
	});
</script>

<div class="h-full w-full" style:padding="{pad}px">
	{#if matrix}
		<div
			class="grid h-full w-full"
			style:grid-template-columns="repeat({matrix.size}, 1fr)"
			style:grid-template-rows="repeat({matrix.size}, 1fr)"
			role="img"
			aria-label={value}
		>
			{#each matrix.data as row, y (y)}
				{#each row as on, x (x)}
					<div style:background={on ? '#fff' : 'transparent'}></div>
				{/each}
			{/each}
		</div>
	{/if}
</div>
