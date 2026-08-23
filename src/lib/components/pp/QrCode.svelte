<script lang="ts">
	/**
	 * A real, scannable QR code.
	 *
	 * It encodes a URL rather than the bare four-character code, so any phone's
	 * own camera app opens the round directly — which matters, because the in-app
	 * scanner cannot work everywhere (see ScanSheet).
	 *
	 * Dark modules on a light ground, and that is not a style choice. A decoder
	 * hunts for three dark-on-light finder squares; an inverted code — which is
	 * what the mockups drew, white modules on the near-black panel — is a guess
	 * no camera app is obliged to make, and most Android ones decline. The design
	 * loses the dark panel here and keeps the white card it already uses for the
	 * two buttons beside it.
	 *
	 * The quiet zone is measured in *modules*, because that is the unit the spec is
	 * written in: four of them survive the card being drawn at any size, where a
	 * fixed pixel padding stops being a quiet zone as soon as the code gets denser.
	 *
	 * One `<path>` for every dark module rather than one rect each — the previous
	 * version was a CSS grid of `1fr` divs, and fractional track widths left
	 * hairline seams through the middle of modules. Subpaths of a single fill
	 * cannot seam against each other. `uqr` also ships `renderSVG()`, but it
	 * arrives as `{@html}` and owns the border and both colours, so the path is
	 * walked by hand here.
	 */
	import { encode } from 'uqr';

	type Props = {
		value: string;
		/** Quiet zone, in modules. Four is what the spec asks for. */
		quiet?: number;
		dark?: string;
		light?: string;
	};

	let { value, quiet = 4, dark = '#1C1F22', light = '#FFFFFF' }: Props = $props();

	const matrix = $derived.by(() => {
		try {
			return encode(value, { ecc: 'M' });
		} catch {
			return null;
		}
	});

	/** The whole drawing, in module units: the code plus its border on both sides. */
	const side = $derived((matrix?.size ?? 0) + quiet * 2);

	/** Every dark module, coalesced into horizontal runs so the path stays short. */
	const modules = $derived.by(() => {
		if (!matrix) return '';
		let d = '';
		for (let y = 0; y < matrix.size; y += 1) {
			const row = matrix.data[y];
			let x = 0;
			while (x < matrix.size) {
				if (!row[x]) {
					x += 1;
					continue;
				}
				let run = 1;
				while (row[x + run]) run += 1;
				d += `M${x + quiet} ${y + quiet}h${run}v1h-${run}z`;
				x += run;
			}
		}
		return d;
	});
</script>

{#if matrix}
	<svg
		class="block h-full w-full"
		viewBox="0 0 {side} {side}"
		shape-rendering="crispEdges"
		role="img"
		aria-label={value}
	>
		<rect width={side} height={side} fill={light} />
		<path d={modules} fill={dark} />
	</svg>
{/if}
