<script lang="ts">
	import type { Toast } from '$lib/client/connection.svelte';

	type Props = { toast: Toast | null; onDismiss: () => void };
	let { toast, onDismiss }: Props = $props();
</script>

{#if toast}
	<div class="pointer-events-none fixed inset-x-0 top-5 z-50 flex justify-center px-4">
		{#key toast.id}
			<div
				class="pointer-events-auto max-w-md panel px-5 py-3.5
					{toast.tone === 'danger' ? 'animate-shake border-blood/60' : 'border-verdant/50'}"
				style:box-shadow={toast.tone === 'danger'
					? '0 0 40px -12px rgba(224,86,74,0.6)'
					: '0 0 40px -14px rgba(88,195,160,0.5)'}
			>
				<div class="flex items-start gap-3">
					<span
						class="mt-0.5 font-mono text-xs {toast.tone === 'danger'
							? 'text-blood'
							: 'text-verdant'}">{toast.tone === 'danger' ? '✖' : '●'}</span
					>
					<div class="min-w-0">
						<p
							class="font-mono text-[11px] tracking-[0.2em] uppercase {toast.tone === 'danger'
								? 'text-blood'
								: 'text-verdant'}"
						>
							{toast.title}
						</p>
						<p class="mt-1 text-xs leading-relaxed text-muted">{toast.body}</p>
					</div>
					<button
						type="button"
						onclick={onDismiss}
						aria-label="Dismiss"
						class="ml-auto shrink-0 font-mono text-xs text-faint transition hover:text-parchment"
					>
						✕
					</button>
				</div>
			</div>
		{/key}
	</div>
{/if}
