<script lang="ts">
	/**
	 * The global menu. Both destructive items go through a second confirmation,
	 * because one stray tap should not end three other people's match.
	 *
	 * "Story & language" only appears before a match exists: inside one the
	 * language is fixed, and it has to be — players write their agent's memory by
	 * hand and the agent matches those words against the road names in front of it,
	 * so two languages in one match would break the matching outright.
	 */
	import Sheet from './Sheet.svelte';
	import Icon from './Icon.svelte';
	import { conn } from '$lib/client/connection.svelte';
	import { ask, closeOverlay, ui } from '$lib/client/ui.svelte';

	type Props = { canPickStory: boolean };
	let { canPickStory }: Props = $props();

	const t = $derived(conn.t.menu);

	const items = $derived(
		[
			{ key: 'new', icon: 'newRound' as const, label: t.newRound, run: () => ask('new-round') },
			{ key: 'again', icon: 'again' as const, label: t.playAgain, run: () => ask('play-again') },
			{
				key: 'rules',
				icon: 'info' as const,
				label: t.showRules,
				run: () => (ui.overlay = 'rules')
			},
			...(canPickStory
				? [
						{
							key: 'settings',
							icon: 'info' as const,
							label: t.storyAndLanguage,
							run: () => (ui.overlay = 'settings')
						}
					]
				: [])
		].filter(Boolean)
	);
</script>

<Sheet onClose={closeOverlay} label={t.title}>
	<div class="flex flex-col gap-[34px] px-[26px] py-[30px]">
		{#each items as item (item.key)}
			<button
				type="button"
				data-shot="menu-{item.key}"
				onclick={item.run}
				class="flex items-center gap-5 text-left transition hover:translate-x-[3px] hover:opacity-65"
			>
				<Icon name={item.icon} size={22} colour="#fff" />
				<span class="text-base font-bold text-white">{item.label}</span>
			</button>
		{/each}
	</div>
</Sheet>
