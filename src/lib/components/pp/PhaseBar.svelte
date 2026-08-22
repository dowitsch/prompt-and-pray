<script lang="ts">
	/**
	 * What the round is doing, and how long you have.
	 *
	 * The countdown is `teachingEndsAt - now`: the server owns when the phase ends,
	 * so this can never drift away from it or keep counting after it closed.
	 */
	import Icon from './Icon.svelte';
	import { conn } from '$lib/client/connection.svelte';
	import { clock, secondsUntil, tick } from '$lib/client/clock.svelte';
	import { colorOf } from '$lib/client/identity';

	type Props = { title?: string | null };
	let { title = null }: Props = $props();

	$effect(tick);

	const t = $derived(conn.t.map);
	const phase = $derived(conn.game?.phase ?? 'lobby');
	const teaching = $derived(phase === 'teaching');
	const mine = $derived(conn.me ? colorOf(conn.me) : '#fff');
	const left = $derived(secondsUntil(conn.game?.teachingEndsAt ?? 0, clock.now));

	const label = $derived(
		title ?? (teaching ? t.cluePhase : phase === 'over' ? t.theEnd : t.roundRunning)
	);
</script>

<div
	class="min-w-0 flex-1 truncate display text-[19px] transition-colors duration-300"
	style:color={teaching ? '#fff' : mine}
>
	{label}
</div>

<div class="grid h-[52px] w-[52px] shrink-0 place-items-center rounded-2xl bg-dark">
	{#if teaching}
		<span class="display text-[22px] tabular-nums" style:color={mine} aria-live="polite">
			{left}
		</span>
	{:else}
		<span class="animate-pp-pulse">
			<Icon name="clock" size={24} colour="#fff" />
		</span>
	{/if}
</div>
