<script lang="ts">
	/**
	 * The global menu. Its one destructive item goes through a second confirmation,
	 * because one stray tap should not walk you out of a round you are winning.
	 *
	 * There used to be two of them — "new round" and "play again" — and between
	 * them they meant three different things depending on which screen you were
	 * looking at, one of which was "drag everybody back to a lobby". Leaving is now
	 * the only way out and it means one thing everywhere: you are out, and your
	 * seat carries on without you.
	 *
	 * Three of the items are switches rather than actions, and they are the reason
	 * this sheet does not close on a tap: sound is something you adjust while
	 * listening to it, and a menu that shut itself after every tap would make
	 * turning the music down a matter of reopening it. They sit below the rules so
	 * the one destructive item stays where the hand already knows to find it.
	 *
	 * "Story & language" only appears before a match exists: inside one the
	 * language is fixed, and it has to be — players write their agent's memory by
	 * hand and the agent matches those words against the road names in front of it,
	 * so two languages in one match would break the matching outright.
	 */
	import Sheet from './Sheet.svelte';
	import Icon from './Icon.svelte';
	import { conn } from '$lib/client/connection.svelte';
	import { audio, setMusic, setSfx } from '$lib/client/audio.svelte';
	import { cue } from '$lib/client/sound';
	import { ask, closeOverlay, ui } from '$lib/client/ui.svelte';

	type Props = { canPickStory: boolean };
	let { canPickStory }: Props = $props();

	const t = $derived(conn.t.menu);

	const items = $derived(
		[
			{
				key: 'leave',
				icon: 'leave' as const,
				label: t.leaveRound,
				on: null,
				run: () => ask('leave-round')
			},
			{
				key: 'rules',
				icon: 'info' as const,
				label: t.showRules,
				on: null,
				run: () => (ui.overlay = 'rules')
			},
			{
				key: 'voice',
				icon: 'speaker' as const,
				label: t.readAloud,
				on: audio.voice,
				run: () => conn.setVoice(!audio.voice)
			},
			{
				key: 'sfx',
				icon: 'bang' as const,
				label: t.soundEffects,
				on: audio.sfx,
				run: () => {
					const on = !audio.sfx;
					setSfx(on);
					// Switching it on plays the thing you just switched on. Without this
					// the row is a claim you cannot check until the next agent dies.
					if (on) cue('agent-survive');
				}
			},
			{
				key: 'music',
				icon: 'music' as const,
				label: t.backgroundMusic,
				on: audio.music,
				run: () => setMusic(!audio.music)
			},
			...(canPickStory
				? [
						{
							key: 'settings',
							icon: 'info' as const,
							label: t.storyAndLanguage,
							on: null,
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
			{@const isSwitch = item.on !== null}
			<button
				type="button"
				data-shot="menu-{item.key}"
				onclick={item.run}
				aria-pressed={isSwitch ? item.on : undefined}
				class="flex items-center gap-5 text-left transition hover:translate-x-[3px]
					hover:opacity-65 {item.on === false ? 'opacity-45' : ''}"
			>
				<Icon name={item.icon} size={22} colour="#fff" />
				<span class="flex-1 text-base font-bold text-white">{item.label}</span>
				{#if item.on}
					<!-- A tick rather than a rail: it is the mark the rest of this design uses. -->
					<Icon name="check" size={18} width={3} colour="#fff" />
				{/if}
			</button>
		{/each}
	</div>
</Sheet>
