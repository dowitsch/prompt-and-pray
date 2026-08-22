<script lang="ts">
	/**
	 * Which land, and in which language.
	 *
	 * The design has no room for this, but there are two tales in each language and
	 * without it one of them is unreachable — so it lives as a fourth menu item
	 * rather than as a screen.
	 *
	 * Picking either one starts a fresh round, because neither can change under a
	 * match that already exists: the language especially, since players write their
	 * agent's notes by hand and the agent matches those words against the road
	 * names in front of it. Two languages in one match would silently stop notes
	 * from working at all.
	 */
	import Sheet from './Sheet.svelte';
	import Icon from './Icon.svelte';
	import { conn } from '$lib/client/connection.svelte';
	import { closeOverlay } from '$lib/client/ui.svelte';
	import { LOCALE_NAMES, LOCALES, type Locale } from '$lib/i18n';

	type Story = { slug: string; name: string; locale: Locale };

	type Props = { onPick: (slug: string, locale: Locale) => void };
	let { onPick }: Props = $props();

	const t = $derived(conn.t.menu);

	let stories = $state<Story[]>([]);
	let locale = $state<Locale>(conn.locale);

	$effect(() => {
		let live = true;
		fetch('/api/stories')
			.then((response) => (response.ok ? response.json() : { stories: [] }))
			.then((body: { stories: Story[] }) => {
				if (live) stories = body.stories;
			})
			.catch(() => {
				/* No list is a quiet failure: the current round still works. */
			});
		return () => {
			live = false;
		};
	});

	const shown = $derived(stories.filter((story) => story.locale === locale));
</script>

<Sheet onClose={closeOverlay} fill label={t.storyAndLanguage}>
	<div class="flex shrink-0 items-start justify-between gap-3 px-5 pt-5 pb-4">
		<h2 class="pt-1 pl-1.5 display text-[22px] text-white">{t.storyAndLanguage}</h2>
		<button
			type="button"
			onclick={closeOverlay}
			aria-label={t.close}
			class="grid h-8 w-8 shrink-0 place-items-center transition hover:opacity-60"
		>
			<Icon name="close" size={18} width={2.6} colour="#fff" />
		</button>
	</div>

	<div class="flex pp-scroll min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-[26px] pb-[26px]">
		<div class="flex gap-2">
			{#each LOCALES as option (option)}
				<button
					type="button"
					onclick={() => (locale = option)}
					aria-pressed={locale === option}
					class="flex-1 rounded-2xl px-4 py-3 text-sm font-bold transition
						{locale === option ? 'bg-p1 text-dark' : 'bg-white/10 text-white hover:bg-white/20'}"
				>
					{LOCALE_NAMES[option]}
				</button>
			{/each}
		</div>

		<ul class="flex flex-col gap-2">
			{#each shown as story (story.slug)}
				<li>
					<button
						type="button"
						onclick={() => onPick(story.slug, story.locale)}
						class="flex w-full items-center justify-between gap-3 rounded-2xl bg-white/10 px-4
							py-3.5 text-left transition hover:bg-white/20"
					>
						<span class="min-w-0 truncate display text-base text-white">{story.name}</span>
						<Icon name="right" size={16} width={3} colour="#fff" />
					</button>
				</li>
			{/each}
		</ul>
	</div>
</Sheet>
