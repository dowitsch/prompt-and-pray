<script lang="ts">
	/**
	 * The stage.
	 *
	 * The design is drawn as absolute coordinates inside a 390×844 phone, and a
	 * responsive desktop version of it would be a second design rather than a port
	 * of this one. So the frame keeps that one geometry everywhere and is scaled
	 * as a whole to whatever it is being shown on, with the screen's own gradient
	 * blurred out to the window edges behind it — one geometry, honest at any size.
	 *
	 * That includes real phones. Stretching the frame to the viewport instead used
	 * to look right only on a device that happens to be 390×844 with no browser
	 * chrome; anywhere shorter, screens laid out at fixed offsets from the top and
	 * from the bottom — the QR and the join column under it — grew into each other.
	 *
	 * The factor is measured rather than written in CSS: `scale()` needs a number,
	 * and CSS cannot divide the viewport by 844 to get one.
	 *
	 * Everything the app draws lives inside here, chrome included: a toast
	 * floating on the blurred backdrop outside the phone reads as a bug.
	 */
	import type { Snippet } from 'svelte';

	type Props = {
		/** The gradient class for the screen showing through behind the frame. */
		backdrop?: string;
		children: Snippet;
	};

	let { backdrop = 'bg-screen-qr', children }: Props = $props();

	/** The design's own size. Every coordinate in every screen is in these units. */
	const W = 390;
	const H = 844;

	let stage = $state<HTMLDivElement>();
	let scale = $state(1);
	/** Held in a phone, or shown on one? The frame is only drawn as an object on a screen. */
	let framed = $state(false);

	$effect(() => {
		const node = stage;
		if (!node) return;
		const ro = new ResizeObserver(([entry]) => {
			const { width, height } = entry.contentRect;
			if (!width || !height) return;
			// A phone gets the whole window; a window gets a margin to sit the phone in.
			framed = width >= 500;
			const inset = framed ? 48 : 0;
			const fit = Math.min((width - inset) / W, (height - inset) / H);
			// Never blown up past its own size on a desktop — it is a phone, not a poster.
			scale = framed ? Math.min(1, fit) : fit;
		});
		ro.observe(node);
		return () => ro.disconnect();
	});
</script>

<!-- The bleed. Purely decorative; the frame above it carries the real content. -->
<div class="pointer-events-none fixed inset-0 -z-10">
	<div class="absolute inset-0 scale-125 {backdrop} blur-[64px] saturate-[1.05]"></div>
	<div class="absolute inset-0 bg-dark/45"></div>
</div>

<div class="stage" bind:this={stage}>
	<div class="frame {backdrop}" class:framed style:transform="translate(-50%, -50%) scale({scale})">
		{@render children()}
	</div>
</div>

<style>
	.stage {
		position: relative;
		/*
		 * dvh so the address bar collapsing does not leave a strip of nothing at
		 * the bottom, and clipped because the frame keeps its full 390×844 layout
		 * box however far down it has been scaled.
		 */
		width: 100vw;
		height: 100dvh;
		overflow: hidden;
	}

	/*
	 * Centred by translation rather than by the grid: the layout box stays 844
	 * tall whatever the scale, and a box taller than its container is not
	 * reliably centred by alignment — browsers clamp it to the top to avoid
	 * cutting off the start of it.
	 */
	.frame {
		position: absolute;
		top: 50%;
		left: 50%;
		width: 390px;
		height: 844px;
		overflow: hidden;
		background-color: var(--color-dark);
		/* Scale rather than relayout, so one set of coordinates stays true. */
		transform-origin: center;
	}

	.frame.framed {
		border-radius: 38px;
		box-shadow: 0 40px 90px rgb(0 0 0 / 55%);
	}
</style>
