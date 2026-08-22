<script lang="ts">
	/**
	 * The one thing worth interrupting for: somebody rewrote your agent's memory.
	 */
	import Icon from './Icon.svelte';
	import type { Toast } from '$lib/client/connection.svelte';

	type Props = { toast: Toast | null; onDismiss: () => void };
	let { toast, onDismiss }: Props = $props();
</script>

{#if toast}
	{#key toast.id}
		<div class="animate-pp-rise absolute inset-x-3.5 top-5 z-[80]">
			<button
				type="button"
				onclick={onDismiss}
				class="flex w-full items-start gap-3 rounded-[20px] px-4 py-3.5 text-left
					shadow-[0_16px_40px_rgba(0,0,0,0.45)]"
				style:background={toast.tone === 'danger' ? '#7B4A5F' : '#1C1F22'}
			>
				<span class="mt-0.5 shrink-0">
					<Icon name={toast.tone === 'danger' ? 'bang' : 'check'} size={20} colour="#fff" />
				</span>
				<span class="min-w-0">
					<span class="block text-[11px] tracking-[0.2em] text-white uppercase">
						{toast.title}
					</span>
					<span class="mt-0.5 block text-xs text-white/80">{toast.body}</span>
				</span>
			</button>
		</div>
	{/key}
{/if}
