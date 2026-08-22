<script lang="ts">
	import { conn } from '$lib/client/connection.svelte';
	import { LOCALES, LOCALE_NAMES, parts } from '$lib/i18n';
	import { MEMORY_GRANT_CHARS } from '$lib/engine/types';

	let name = $state('');
	let code = $state('');
	let mode = $state<'create' | 'join'>('create');

	const t = $derived(conn.t.home);
	const ready = $derived(conn.status === 'open');
	const blurb = $derived(parts(t.blurb, 'letters'));

	// The blurb names the ration in words, so it reads rather than counts.
	const letters = $derived(
		conn.locale === 'de' ? `zwanzig Buchstaben` : `${MEMORY_GRANT_CHARS} letters`
	);

	function create(event: SubmitEvent) {
		event.preventDefault();
		conn.createGame(name.trim() || t.namePlaceholder);
	}

	function join(event: SubmitEvent) {
		event.preventDefault();
		if (code.trim().length < 3) return;
		conn.joinGame(code, name.trim() || t.joinNamePlaceholder);
	}
</script>

<main class="relative grid min-h-screen place-items-center px-5 py-12">
	<div class="w-full max-w-xl">
		<header class="text-center">
			<p class="rubric">{t.eyebrow}</p>
			<h1 class="mt-5 title text-5xl text-parchment sm:text-6xl">HOMEWARD</h1>

			<p class="mx-auto mt-7 max-w-md text-[15px] leading-relaxed text-quill">
				{blurb.before}<span class="text-candle">{letters}</span>{blurb.after}
			</p>
		</header>

		<div class="mt-10 overflow-hidden leaf">
			<div class="flex rule-b">
				{#each [{ id: 'create', label: t.tabCreate }, { id: 'join', label: t.tabJoin }] as tab (tab.id)}
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
							<label for="name" class="mb-2.5 block rubric">{t.yourName}</label>
							<input
								id="name"
								bind:value={name}
								maxlength="18"
								placeholder={t.namePlaceholder}
								autocomplete="off"
								class="w-full rounded border border-rule-bright bg-black/30 px-3.5 py-3 text-[15px]
									tracking-wide text-parchment placeholder:text-faded/70 focus:border-candle focus:ring-0"
							/>
						</div>

						<!-- The language of the whole match, not just this screen. -->
						<div>
							<span class="mb-2.5 block rubric">{t.language}</span>
							<div class="flex gap-2">
								{#each LOCALES as locale (locale)}
									<button
										type="button"
										onclick={() => conn.setPreference(locale)}
										class="flex-1 rounded border px-3 py-2.5 text-[13px] transition
											{conn.preference === locale
											? 'border-candle/60 bg-candle/10 text-candle'
											: 'border-rule text-quill hover:border-rule-bright hover:text-parchment'}"
									>
										{LOCALE_NAMES[locale]}
									</button>
								{/each}
							</div>
						</div>

						<button
							type="submit"
							disabled={!ready}
							class="w-full rounded border border-candle/50 bg-candle/10 px-4 py-3.5 text-xs
								tracking-[0.22em] text-candle uppercase transition hover:bg-candle/20 disabled:opacity-40"
						>
							{ready ? t.begin : t.connecting}
						</button>
						<p class="text-center text-[13px] text-faded italic">{t.seatsNote}</p>
					</form>
				{:else}
					<form onsubmit={join} class="space-y-4">
						<div>
							<label for="jname" class="mb-2.5 block rubric">{t.yourName}</label>
							<input
								id="jname"
								bind:value={name}
								maxlength="18"
								placeholder={t.joinNamePlaceholder}
								autocomplete="off"
								class="w-full rounded border border-rule-bright bg-black/30 px-3.5 py-3 text-[15px]
									tracking-wide text-parchment placeholder:text-faded/70 focus:border-candle focus:ring-0"
							/>
						</div>
						<div>
							<label for="code" class="mb-2.5 block rubric">{t.passphrase}</label>
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
							{t.join}
						</button>
						<p class="text-center text-[13px] text-faded italic">
							{conn.locale === 'de'
								? 'Die Sprache bestimmt, wer die Geschichte begonnen hat.'
								: 'The language is whatever the teller chose.'}
						</p>
					</form>
				{/if}
			</div>
		</div>

		<p class="mt-9 text-center rubric">{t.footer}</p>
	</div>
</main>
