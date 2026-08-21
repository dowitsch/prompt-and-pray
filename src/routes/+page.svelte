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
			<p class="eyebrow">An experiment in teaching</p>
			<h1 class="mt-4 font-mono text-5xl tracking-[0.22em] text-parchment sm:text-6xl">HOMEWARD</h1>
			<p class="mx-auto mt-5 max-w-md text-sm leading-relaxed text-muted">
				Your agent is lost. It walks a hidden tree of choices, and every level has exactly one that
				does not kill it. You cannot steer it — after each death you may add
				<span class="text-ember">twenty characters</span> to its memory. That is the whole of what it
				will ever know.
			</p>
		</header>

		<div class="mt-10 overflow-hidden panel">
			<div class="flex hairline">
				{#each [{ id: 'create', label: 'Create game' }, { id: 'join', label: 'Join game' }] as tab (tab.id)}
					<button
						type="button"
						onclick={() => (mode = tab.id as 'create' | 'join')}
						class="flex-1 px-4 py-3 font-mono text-[11px] tracking-[0.2em] uppercase transition
							{mode === tab.id ? 'text-ember' : 'text-faint hover:text-muted'}"
					>
						{tab.label}
						{#if mode === tab.id}
							<span class="mt-2.5 block h-px bg-ember/70"></span>
						{/if}
					</button>
				{/each}
			</div>

			<div class="px-6 py-6">
				{#if mode === 'create'}
					<form onsubmit={create} class="space-y-4">
						<div>
							<label for="name" class="mb-2 block eyebrow">Your name</label>
							<input
								id="name"
								bind:value={name}
								maxlength="18"
								placeholder="YOU"
								autocomplete="off"
								class="w-full rounded-md border border-edge-bright bg-black/40 px-3 py-2.5 font-mono
									text-sm tracking-[0.1em] text-parchment placeholder:text-faint/60 focus:border-ember focus:ring-0"
							/>
						</div>
						<button
							type="submit"
							disabled={!ready}
							class="w-full rounded-md border border-ember/60 bg-ember/10 px-4 py-3 font-mono text-xs
								tracking-[0.2em] text-ember uppercase transition hover:bg-ember/20 disabled:opacity-40"
						>
							{ready ? 'Create game' : 'Connecting…'}
						</button>
						<p class="text-center text-xs text-faint">
							Empty seats are filled with simulated agents, so one browser is enough.
						</p>
					</form>
				{:else}
					<form onsubmit={join} class="space-y-4">
						<div>
							<label for="jname" class="mb-2 block eyebrow">Your name</label>
							<input
								id="jname"
								bind:value={name}
								maxlength="18"
								placeholder="AGENT"
								autocomplete="off"
								class="w-full rounded-md border border-edge-bright bg-black/40 px-3 py-2.5 font-mono
									text-sm tracking-[0.1em] text-parchment placeholder:text-faint/60 focus:border-ember focus:ring-0"
							/>
						</div>
						<div>
							<label for="code" class="mb-2 block eyebrow">Game code</label>
							<input
								id="code"
								bind:value={code}
								maxlength="4"
								placeholder="X7KD"
								autocomplete="off"
								spellcheck="false"
								oninput={() => (code = code.toUpperCase())}
								class="w-full rounded-md border border-edge-bright bg-black/40 px-3 py-2.5 text-center
									font-mono text-2xl tracking-[0.5em] text-parchment placeholder:text-faint/40 focus:border-ember focus:ring-0"
							/>
						</div>
						<button
							type="submit"
							disabled={!ready || code.trim().length < 3}
							class="w-full rounded-md border border-ember/60 bg-ember/10 px-4 py-3 font-mono text-xs
								tracking-[0.2em] text-ember uppercase transition hover:bg-ember/20 disabled:opacity-40"
						>
							Join
						</button>
					</form>
				{/if}
			</div>
		</div>

		<p class="mt-8 text-center font-mono text-[10px] tracking-[0.14em] text-faint uppercase">
			No account · No sign-in · Temporary identity
		</p>
	</div>
</main>
