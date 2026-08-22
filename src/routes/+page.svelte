<script lang="ts">
	import { conn } from '$lib/client/connection.svelte';

	let name = $state('');
	let code = $state('');
	let mode = $state<'create' | 'join'>('create');

	const ready = $derived(conn.status === 'open');

	function create(event: SubmitEvent) {
		event.preventDefault();
		conn.createGame(name.trim() || 'YOU');
	}

	function join(event: SubmitEvent) {
		event.preventDefault();
		if (code.trim().length < 3) return;
		conn.joinGame(code, name.trim() || 'AGENT');
	}
</script>

<main class="relative grid min-h-screen place-items-center px-5 py-12">
	<div class="w-full max-w-xl">
		<header class="text-center">
			<p class="rubric">A tale of four agents</p>
			<h1 class="mt-5 title text-5xl text-parchment sm:text-6xl">HOMEWARD</h1>

			<p class="mx-auto mt-7 max-w-md text-[15px] leading-relaxed text-quill">
				Your agent is lost in a land of three-way partings. At every one, a single road goes on and
				the other two do not. You cannot lead it — you may only write it
				<span class="text-candle">twenty letters</span> between rounds, and those letters are the whole
				of what it will ever know.
			</p>
		</header>

		<div class="mt-10 overflow-hidden leaf">
			<div class="flex rule-b">
				{#each [{ id: 'create', label: 'Begin a tale' }, { id: 'join', label: 'Join a tale' }] as tab (tab.id)}
					<button
						type="button"
						onclick={() => (mode = tab.id as 'create' | 'join')}
						class="flex-1 px-4 py-3.5 text-xs tracking-[0.22em] uppercase transition
							{mode === tab.id ? 'text-candle' : 'text-faded hover:text-quill'}"
					>
						{tab.label}
						{#if mode === tab.id}
							<span class="mt-3 block h-px bg-candle/60"></span>
						{/if}
					</button>
				{/each}
			</div>

			<div class="px-7 py-7">
				{#if mode === 'create'}
					<form onsubmit={create} class="space-y-4">
						<div>
							<label for="name" class="mb-2.5 block rubric">What are you called?</label>
							<input
								id="name"
								bind:value={name}
								maxlength="18"
								placeholder="YOU"
								autocomplete="off"
								class="w-full rounded border border-rule-bright bg-black/30 px-3.5 py-3 text-[15px]
									tracking-wide text-parchment placeholder:text-faded/70 focus:border-candle focus:ring-0"
							/>
						</div>
						<button
							type="submit"
							disabled={!ready}
							class="w-full rounded border border-candle/50 bg-candle/10 px-4 py-3.5 text-xs
								tracking-[0.22em] text-candle uppercase transition hover:bg-candle/20 disabled:opacity-40"
						>
							{ready ? 'Begin' : 'Lighting the candle…'}
						</button>
						<p class="text-center text-[13px] text-faded italic">
							Any empty seats are taken by agents of the tale, so one window is enough.
						</p>
					</form>
				{:else}
					<form onsubmit={join} class="space-y-4">
						<div>
							<label for="jname" class="mb-2.5 block rubric">What are you called?</label>
							<input
								id="jname"
								bind:value={name}
								maxlength="18"
								placeholder="AGENT"
								autocomplete="off"
								class="w-full rounded border border-rule-bright bg-black/30 px-3.5 py-3 text-[15px]
									tracking-wide text-parchment placeholder:text-faded/70 focus:border-candle focus:ring-0"
							/>
						</div>
						<div>
							<label for="code" class="mb-2.5 block rubric">The word of passage</label>
							<input
								id="code"
								bind:value={code}
								maxlength="4"
								placeholder="X7KD"
								autocomplete="off"
								spellcheck="false"
								oninput={() => (code = code.toUpperCase())}
								class="w-full rounded border border-rule-bright bg-black/30 px-3.5 py-3 text-center
									title text-2xl tracking-[0.5em] text-parchment placeholder:text-faded/40 focus:border-candle focus:ring-0"
							/>
						</div>
						<button
							type="submit"
							disabled={!ready || code.trim().length < 3}
							class="w-full rounded border border-candle/50 bg-candle/10 px-4 py-3.5 text-xs
								tracking-[0.22em] text-candle uppercase transition hover:bg-candle/20 disabled:opacity-40"
						>
							Join
						</button>
					</form>
				{/if}
			</div>
		</div>

		<p class="mt-9 text-center rubric">No name kept · no account · no record</p>
	</div>
</main>
