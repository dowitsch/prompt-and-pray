<script lang="ts">
	import type { PublicPlayer } from '$lib/engine/game';
	import { MEMORY_GRANT_CHARS } from '$lib/engine/types';
	import { agentColor } from '$lib/client/palette';

	type Props = {
		target: PublicPlayer;
		onCancel: () => void;
		onConfirm: (lineIndex: number, text: string) => void;
	};

	let { target, onCancel, onConfirm }: Props = $props();

	let selected = $state(0);
	let replacement = $state('');

	const colour = $derived(agentColor(target.seat, false));
	const current = $derived(target.memory[selected]?.text ?? '');

	function confirm() {
		if (!target.memory[selected]) return;
		onConfirm(selected, replacement.trim());
	}

	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') onCancel();
	}
</script>

<svelte:window onkeydown={onKeydown} />

<div class="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4 backdrop-blur-sm">
	<div class="animate-slide-up w-full max-w-lg panel border-blood/40">
		<header class="px-5 py-4 hairline">
			<h2 class="font-mono text-sm tracking-[0.2em] text-blood uppercase">Sabotage</h2>
			<p class="mt-1 text-xs text-muted">
				You may do this <span class="text-blood">once per match</span>. Overwrite one line of
				<span style:color={colour}>{target.name}</span>'s memory with up to
				{MEMORY_GRANT_CHARS} characters of your own.
			</p>
		</header>

		<div class="px-5 py-4">
			<h3 class="mb-2 eyebrow">Choose a memory to destroy</h3>
			<ul class="mb-4 space-y-1">
				{#each target.memory as line, index (line.id)}
					<li>
						<button
							type="button"
							onclick={() => (selected = index)}
							class="flex w-full gap-2 rounded border px-2.5 py-1.5 text-left font-mono text-xs transition
								{selected === index
								? 'border-blood/60 bg-blood/10 text-parchment'
								: 'border-edge text-muted hover:border-edge-bright'}"
						>
							<span class="w-4 shrink-0 text-right text-[10px] text-faint">{index + 1}</span>
							<span class="truncate">{line.text}</span>
						</button>
					</li>
				{/each}
			</ul>

			<h3 class="mb-2 eyebrow">Replace it with</h3>
			<input
				bind:value={replacement}
				maxlength={MEMORY_GRANT_CHARS}
				placeholder="Valley kills"
				spellcheck="false"
				autocomplete="off"
				class="w-full rounded-md border border-edge-bright bg-black/40 px-3 py-2 font-mono text-sm
					text-parchment placeholder:text-faint/60 focus:border-blood focus:ring-0"
			/>
			<div class="mt-1.5 flex items-center justify-between">
				<span class="font-mono text-[10px] text-faint">
					Leave blank to simply erase the line.
				</span>
				<span
					class="font-mono text-[10px] tabular-nums {replacement.length >= MEMORY_GRANT_CHARS
						? 'text-blood'
						: 'text-faint'}"
				>
					{replacement.length} / {MEMORY_GRANT_CHARS}
				</span>
			</div>

			<div class="mt-4 rounded-md border border-edge bg-black/30 p-3 font-mono text-xs">
				<div class="mb-1.5 eyebrow">Result</div>
				<div class="text-faint line-through">{current}</div>
				<div class="text-blood">{replacement.trim() || '…'}</div>
			</div>
		</div>

		<footer class="hairline-top flex gap-2 border-t border-edge px-5 py-4">
			<button
				type="button"
				onclick={onCancel}
				class="flex-1 rounded-md border border-edge-bright px-3 py-2 font-mono text-[11px]
					tracking-[0.16em] text-muted uppercase transition hover:text-parchment"
			>
				Cancel
			</button>
			<button
				type="button"
				onclick={confirm}
				disabled={target.memory.length === 0}
				class="flex-1 rounded-md border border-blood/60 bg-blood/15 px-3 py-2 font-mono text-[11px]
					tracking-[0.16em] text-blood uppercase transition hover:bg-blood/25 disabled:opacity-40"
			>
				Corrupt memory
			</button>
		</footer>
	</div>
</div>
