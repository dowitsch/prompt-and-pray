<script lang="ts">
	/**
	 * What the round is doing, and how long you have.
	 *
	 * The countdown is `teachingEndsAt - now`: the server owns when the phase ends,
	 * so this can never drift away from it or keep counting after it closed.
	 */
	import { conn } from '$lib/client/connection.svelte';
	import { clock, secondsUntil, tick } from '$lib/client/clock.svelte';
	import { colorOf } from '$lib/client/identity';

	type Props = {
		title?: string | null;
		/** The colour of whoever the screen currently belongs to. */
		tint?: string | null;
	};
	let { title = null, tint = null }: Props = $props();

	$effect(tick);

	const t = $derived(conn.t.map);
	const phase = $derived(conn.game?.phase ?? 'lobby');
	const teaching = $derived(phase === 'teaching');
	const mine = $derived(tint ?? (conn.me ? colorOf(conn.me) : '#fff'));
	const left = $derived(secondsUntil(conn.game?.teachingEndsAt ?? 0, clock.now));

	const label = $derived(
		title ?? (teaching ? t.cluePhase : phase === 'over' ? t.theEnd : t.roundRunning)
	);
</script>

<!--
	White whenever somebody is named, and a size down from the rest of the display
	type.

	"MALAKOR ist unterwegs" was set in the walker's own colour, which is a light
	warm hue laid over whatever the map happens to be — a green field, most of the
	time — and it was the one line on the screen you could not read. It is also the
	longest string this bar ever holds, and at 19px it ran under the countdown and
	got clipped mid-word. Both are fixed here rather than by shortening the
	sentence: the colour is already said by the bubble, the token and the ground of
	the memory screen, so this line does not need to say it a fourth time.
-->
<div
	data-shot="phase-title"
	class="min-w-0 flex-1 truncate display text-[15px] transition-colors duration-300"
	style:color={title ? '#fff' : teaching ? '#fff' : mine}
>
	{label}
</div>

<!--
	The badge is a countdown and nothing else, so it fades out rather than standing
	there holding a clock face. A round has no deadline you can act on — that is
	the server's business — and a ticking icon only invited you to wait for it.
-->
<div
	class="grid h-[52px] w-[52px] shrink-0 place-items-center rounded-2xl bg-dark
		transition-opacity duration-300"
	style:opacity={teaching ? 1 : 0}
	aria-hidden={!teaching}
>
	{#if teaching}
		<span class="display text-[22px] tabular-nums" style:color={mine} aria-live="polite">
			{left}
		</span>
	{/if}
</div>
