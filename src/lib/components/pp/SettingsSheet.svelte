<script lang="ts">
	/**
	 * Which land, and in which language.
	 *
	 * The design has no room for this, but there are two tales in each language and
	 * without it one of them is unreachable — so it lives as a third menu item
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

	/**
	 * A tale's name, in a case you can read a whole line of.
	 *
	 * The names are stored in capitals because that is how they are set on the map
	 * and on the end card, where they are two or three words on their own line.
	 * Here they are a list of four, and DIE MITTERNACHTSPFORTE in caps is both
	 * wider than the sheet and slower to read than the same word in title case.
	 * Only touched when the stored name is *entirely* capitals, so a name that was
	 * written with its own casing keeps it.
	 */
	function titled(name: string): string {
		if (name !== name.toUpperCase()) return name;
		return name
			.toLowerCase()
			.replace(
				/(^|[\s(«"'\u2013\u2014-])(\p{L})/gu,
				(_, before, letter) => before + letter.toUpperCase()
			);
	}
</script>

<Sheet onClose={closeOverlay} fill label={t.settings}>
	<div class="flex shrink-0 items-start justify-between gap-3 px-5 pt-5 pb-4">
		<h2 class="pt-1 pl-1.5 display text-[22px] text-white">{t.settings}</h2>
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

		<!--
			The tales are all one thing — which land you are about to walk — so they
			are gathered under a heading that says so rather than sitting loose under
			the language buttons as four unexplained names.
		-->
		<section class="flex flex-col gap-2">
			<h3 class="pl-1 font-mono text-[10px] tracking-[0.14em] text-white/55 uppercase">
				{t.mapSection}
			</h3>
			<ul class="flex flex-col gap-2">
				{#each shown as story (story.slug)}
					<li>
						<button
							type="button"
							onclick={() => onPick(story.slug, story.locale)}
							class="flex w-full items-center justify-between gap-3 rounded-2xl bg-white/10 px-4
								py-3 text-left transition hover:bg-white/20"
						>
							<!-- No truncation: the whole name is the thing being chosen. -->
							<span class="min-w-0 text-sm leading-snug font-bold text-white">
								{titled(story.name)}
							</span>
							<Icon name="right" size={15} width={3} colour="#fff" />
						</button>
					</li>
				{/each}
			</ul>
		</section>
	</div>
</Sheet>
