<script lang="ts">
	import { conn } from '$lib/client/connection.svelte';
	import { ui } from '$lib/client/ui.svelte';

	type Props = { padded?: boolean };
	let { padded = true }: Props = $props();
</script>

<button
	type="button"
	data-shot="menu"
	onclick={() => (ui.overlay = 'menu')}
	aria-label={conn.t.pp.menu}
	class="flex flex-col items-center gap-1 transition hover:opacity-60 {padded
		? 'p-2'
		: 'px-1.5 py-2'}"
>
	{#each [0, 1, 2] as dot (dot)}
		<span class="block h-1 w-1 rounded-full bg-white"></span>
	{/each}
</button>
