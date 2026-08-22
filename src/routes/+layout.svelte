<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { onMount } from 'svelte';
	import { conn } from '$lib/client/connection.svelte';
	import Toast from '$lib/components/Toast.svelte';

	let { children } = $props();

	onMount(() => {
		conn.connect();
		return () => conn.disconnect();
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>HOMEWARD</title>
	<meta
		name="description"
		content="Teach an AI agent to find its way home, twenty characters at a time."
	/>
</svelte:head>

<Toast toast={conn.toast} onDismiss={() => (conn.toast = null)} />

{#if conn.error}
	<div class="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
		<p
			class="pointer-events-auto leaf border-rose/50 px-4 py-2 font-mono text-xs text-rose"
			role="alert"
		>
			{conn.error}
		</p>
	</div>
{/if}

{#if conn.status === 'closed'}
	<div class="fixed top-0 right-0 left-0 z-40 bg-rose/90 py-1 text-center">
		<span class="font-mono text-[10px] tracking-[0.2em] text-night uppercase">
			Connection lost — reconnecting
		</span>
	</div>
{/if}

{@render children()}
