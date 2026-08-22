<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { LOCALE_NAMES, LOCALES } from '$lib/i18n';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let newName = $state('');
	let newLocale = $state<'en' | 'de'>('en');
	let confirming = $state<string | null>(null);
</script>

<svelte:head><title>Stories · HOMEWARD</title></svelte:head>

<main class="mx-auto max-w-4xl px-6 py-14">
	<header class="mb-10 text-center">
		<p class="rubric text-ash">The workshop</p>
		<h1 class="mt-2 title text-4xl text-parchment">STORIES</h1>
		<p class="mt-3 text-sm text-ash">
			Every tale is a land of partings. Build one, then let four agents lose themselves in it.
		</p>
	</header>

	{#if form?.message}
		<p
			class="mb-6 leaf border-rose/50 px-4 py-2 text-center font-mono text-xs text-rose"
			role="alert"
		>
			{form.message}
		</p>
	{/if}

	<section class="mb-8 leaf p-5">
		<h2 class="mb-3 rubric text-ash">Begin a new one</h2>
		<form method="POST" action="?/create" use:enhance class="flex flex-wrap items-end gap-3">
			<label class="min-w-52 flex-1">
				<span class="rubric text-ash">What is it called</span>
				<input
					name="name"
					bind:value={newName}
					maxlength="60"
					placeholder="The long way home"
					class="focus:border-ember mt-1 w-full rounded border border-rule bg-night px-3 py-2
					       text-parchment placeholder:text-ash/40 focus:outline-none"
				/>
			</label>

			<label>
				<span class="rubric text-ash">Language</span>
				<select
					name="locale"
					bind:value={newLocale}
					class="focus:border-ember mt-1 rounded border border-rule bg-night px-3 py-2 text-parchment focus:outline-none"
				>
					{#each LOCALES as locale (locale)}
						<option value={locale}>{LOCALE_NAMES[locale]}</option>
					{/each}
				</select>
			</label>

			<button
				type="submit"
				disabled={!newName.trim()}
				class="border-ember/60 bg-ember/10 text-ember hover:bg-ember/20 rounded border px-5 py-2
				       rubric disabled:opacity-30"
			>
				Begin
			</button>
		</form>
		<p class="mt-2 text-xs text-ash/70">
			A tale is written in one language: its agents read the names of its roads, so they cannot be
			mixed. To translate one, copy it and rewrite the copy.
		</p>
	</section>

	<ul class="space-y-3">
		{#each data.stories as story (story.slug)}
			<li class="flex flex-wrap items-center gap-x-4 gap-y-3 leaf p-4">
				<div class="min-w-56 flex-1">
					<a
						href={resolve('/design/[slug]', { slug: story.slug })}
						class="hover:text-ember title text-lg text-parchment"
					>
						{story.name}
					</a>
					<p class="mt-0.5 text-xs text-ash">
						{story.nodeCount} places · par {story.parSteps} · {LOCALE_NAMES[story.locale]}
						{#if story.builtIn}<span class="text-ash/60"> · built in</span>{/if}
						{#if story.matches > 0}
							<span class="text-ember"> · {story.matches} in play</span>
						{/if}
					</p>
				</div>

				<span
					class="rounded-full border px-2.5 py-0.5 font-mono text-[10px] tracking-[0.18em] uppercase
					       {story.status === 'published' ? 'border-moss/50 text-moss' : 'border-rule text-ash'}"
				>
					{story.status}
				</span>

				<div class="flex gap-2">
					<a
						href={resolve('/design/[slug]', { slug: story.slug })}
						class="hover:border-ember hover:text-ember rounded border border-rule px-3 py-1.5 rubric text-ash"
					>
						Open
					</a>

					<form method="POST" action="?/duplicate" use:enhance>
						<input type="hidden" name="slug" value={story.slug} />
						<button
							type="submit"
							class="hover:border-ember hover:text-ember rounded border border-rule px-3 py-1.5 rubric text-ash"
						>
							Copy
						</button>
					</form>

					{#if !story.builtIn}
						{#if confirming === story.slug}
							<form
								method="POST"
								action="?/remove"
								use:enhance={() => {
									confirming = null;
									return async ({ update }) => update();
								}}
							>
								<input type="hidden" name="slug" value={story.slug} />
								<button
									type="submit"
									class="rounded border border-rose/60 bg-rose/10 px-3 py-1.5 rubric text-rose hover:bg-rose/20"
								>
									Really?
								</button>
							</form>
						{:else}
							<button
								type="button"
								onclick={() => (confirming = story.slug)}
								class="rounded border border-rule px-3 py-1.5 rubric text-ash hover:border-rose hover:text-rose"
							>
								Burn it
							</button>
						{/if}
					{/if}
				</div>
			</li>
		{:else}
			<li class="leaf p-8 text-center text-sm text-ash">No tales yet.</li>
		{/each}
	</ul>

	<p class="mt-10 text-center">
		<a href={resolve('/')} class="hover:text-ember rubric text-ash">← Back to the tale</a>
	</p>
</main>
