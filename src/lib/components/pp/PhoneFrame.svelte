<script lang="ts">
	/**
	 * The stage.
	 *
	 * The design is drawn as absolute coordinates inside a 390×844 phone, and a
	 * responsive desktop version of it would be a second design rather than a port
	 * of this one. So on a big screen the frame is scaled as a whole and centred,
	 * with the screen's own gradient blurred out to the window edges behind it —
	 * one geometry, honest at any size. On an actual phone it is simply full bleed.
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
</script>

<!-- The bleed. Purely decorative; the frame above it carries the real content. -->
<div class="pointer-events-none fixed inset-0 -z-10 hidden sm:block">
	<div class="absolute inset-0 scale-125 {backdrop} blur-[64px] saturate-[1.05]"></div>
	<div class="absolute inset-0 bg-dark/45"></div>
</div>

<div class="stage">
	<div class="frame {backdrop}">
		{@render children()}
	</div>
</div>

<style>
	.stage {
		display: grid;
		place-items: center;
		min-height: 100dvh;
	}

	.frame {
		position: relative;
		width: 390px;
		height: 844px;
		overflow: hidden;
		background-color: var(--color-dark);
	}

	/*
	 * A real phone: no frame, no rounding, and dvh so the address bar collapsing
	 * does not leave a strip of nothing at the bottom.
	 */
	@media (max-width: 429px) {
		.stage {
			min-height: 100dvh;
		}

		.frame {
			width: 100vw;
			height: 100dvh;
		}
	}

	@media (min-width: 430px) {
		.frame {
			border-radius: 38px;
			box-shadow: 0 40px 90px rgb(0 0 0 / 55%);
			/* Scale rather than relayout, so one set of coordinates stays true. */
			transform: scale(min(1, (100dvh - 48px) / 844));
			transform-origin: center;
		}
	}
</style>
