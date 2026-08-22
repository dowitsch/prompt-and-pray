<script lang="ts">
	/*
	 * The story designer keeps the old HOMEWARD look.
	 *
	 * The game itself is now Prompt & Pray — warm, mobile, Archivo Black — but the
	 * designer is an authoring tool for the same stories it always was, and its
	 * six hundred-odd lines are written against the parchment palette. Rather
	 * than restyle a tool nobody plays, the two identities are kept apart: the app
	 * body is flat dark and sans, and this wrapper puts the night gradients and
	 * the serif back for these routes only.
	 */
	let { children } = $props();
</script>

<div class="designer">
	{@render children()}
</div>

<style>
	.designer {
		min-height: 100vh;
		background:
			radial-gradient(120% 85% at 50% -15%, #1e2140 0%, transparent 62%),
			radial-gradient(85% 55% at 50% 115%, #171a2e 0%, transparent 58%), var(--color-night);
		color: var(--color-parchment);
		font-family: var(--font-serif);
	}

	/* The designer's own inputs and buttons inherit from here, not from body. */
	.designer :global(input),
	.designer :global(button),
	.designer :global(select),
	.designer :global(textarea) {
		font-family: inherit;
	}
</style>
