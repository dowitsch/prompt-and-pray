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
	<div class="animate-rise w-full max-w-lg leaf border-rose/40">
		<header class="px-5 py-4 rule-b">
			<h2 class="text-sm tracking-[0.2em] text-rose uppercase">A false page</h2>
			<p class="mt-1 text-xs text-quill">
				You may do this <span class="text-rose">once, and never again</span>. Rewrite one line of
				<span style:color={colour}>{target.name}</span>'s memory in your own hand — up to
				{MEMORY_GRANT_CHARS} letters.
			</p>
		</header>

		<div class="px-5 py-4">
			<h3 class="mb-2 rubric">Which line to strike out</h3>
			<ul class="mb-4 space-y-1">
				{#each target.memory as line, index (line.id)}
					<li>
						<button
							type="button"
							onclick={() => (selected = index)}
							class="flex w-full gap-2 rounded border px-2.5 py-1.5 text-left text-xs transition
								{selected === index
								? 'border-rose/60 bg-rose/10 text-parchment'
								: 'border-rule text-quill hover:border-rule-bright'}"
						>
							<span class="w-4 shrink-0 text-right text-[10px] text-faded">{index + 1}</span>
							<span class="truncate">{line.text}</span>
						</button>
					</li>
				{/each}
			</ul>

			<h3 class="mb-2 rubric">And write instead</h3>
			<input
				bind:value={replacement}
				maxlength={MEMORY_GRANT_CHARS}
				placeholder="Valley kills"
				spellcheck="false"
				autocomplete="off"
				class="w-full rounded border border-rule-bright bg-black/40 px-3 py-2 text-sm
					text-parchment placeholder:text-faded/60 focus:border-rose focus:ring-0"
			/>
			<div class="mt-1.5 flex items-center justify-between">
				<span class="text-[10px] text-faded"> Leave it blank and the line is simply gone. </span>
				<span
					class="text-[10px] tabular-nums {replacement.length >= MEMORY_GRANT_CHARS
						? 'text-rose'
						: 'text-faded'}"
				>
					{replacement.length} / {MEMORY_GRANT_CHARS}
				</span>
			</div>

			<div class="mt-4 rounded border border-rule bg-black/30 p-3 text-xs">
				<div class="mb-1.5 rubric">How it will read</div>
				<div class="text-faded line-through">{current}</div>
				<div class="text-rose">{replacement.trim() || '…'}</div>
			</div>
		</div>

		<footer class="flex gap-2 border-t border-rule px-5 py-4">
			<button
				type="button"
				onclick={onCancel}
				class="flex-1 rounded border border-rule-bright px-3 py-2 text-[11px]
					tracking-[0.16em] text-quill uppercase transition hover:text-parchment"
			>
				Think better of it
			</button>
			<button
				type="button"
				onclick={confirm}
				disabled={target.memory.length === 0}
				class="flex-1 rounded border border-rose/60 bg-rose/15 px-3 py-2 text-[11px]
					tracking-[0.16em] text-rose uppercase transition hover:bg-rose/25 disabled:opacity-40"
			>
				Write the lie
			</button>
		</footer>
	</div>
</div>
