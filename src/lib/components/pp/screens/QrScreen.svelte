<script lang="ts">
	/**
	 * Screen 1: the round you are in, as something to hold up.
	 *
	 * The QR is of *this* lobby, so showing your phone to somebody is the whole
	 * joining flow. "Join a round" turns the camera the other way and reads
	 * somebody else's.
	 *
	 * The revised design puts the title film behind it rather than a gradient —
	 * the first screen is the only place in the app that shows the *world* rather
	 * than the game's own diagram of it, and a scrim top and bottom is what keeps
	 * the logo and the button legible over whatever the picture is doing there.
	 *
	 * The film is decoration, so it is muted, loops, and gives way to its own
	 * poster frame when the reader has asked for less motion. The poster is also
	 * what covers the first few hundred milliseconds before the video has enough
	 * to play, which is why it is a real file rather than a black rectangle.
	 *
	 * Everything under the code is what makes holding it out actually work: the
	 * four characters spelled out, because the joiner's fallback is to type them
	 * and this screen used to be the one place they were not written down; and the
	 * seat strip, because the phone is pointed away from you while somebody scans
	 * and "did that work" otherwise has no answer until you leave the screen.
	 * They are anchored to the bottom as one column rather than at fixed offsets —
	 * a short phone should crowd them, not push them off the end.
	 */
	import QrCode from '../QrCode.svelte';
	import Icon from '../Icon.svelte';
	import DotMenu from '../DotMenu.svelte';
	import SeatStrip from '../SeatStrip.svelte';
	import { conn } from '$lib/client/connection.svelte';
	import { ui } from '$lib/client/ui.svelte';

	type Props = { code: string; onForward: () => void };
	let { code, onForward }: Props = $props();

	const t = $derived(conn.t.pp);

	/** Dark at the wordmark, dark at the button, and the picture itself in between. */
	const SCRIM =
		'linear-gradient(180deg, rgb(28 31 34 / 34%) 0%, rgb(28 31 34 / 8%) 45%, rgb(28 31 34 / 40%) 100%)';

	/** Asked once: a reader who wants less motion gets the poster frame instead. */
	const still =
		typeof matchMedia === 'undefined'
			? false
			: matchMedia('(prefers-reduced-motion: reduce)').matches;

	/** The URL the code stands for, so any camera app can open it. */
	const target = $derived(
		typeof location === 'undefined' ? `/j/${code}` : `${location.origin}/j/${code}`
	);
</script>

<div class="animate-pp-fade absolute inset-0 bg-dark">
	<!-- Decoration, so no alt text: the screen says everything this does not. -->
	{#if still}
		<img
			src="/theme-poster.webp"
			alt=""
			class="absolute inset-0 h-full w-full object-cover brightness-[0.82] contrast-[0.97]"
		/>
	{:else}
		<video
			src="/theme.mp4"
			poster="/theme-poster.webp"
			autoplay
			loop
			muted
			playsinline
			preload="auto"
			class="absolute inset-0 h-full w-full object-cover brightness-[0.82] contrast-[0.97]"
		></video>
	{/if}
	<div class="absolute inset-0" style="background: {SCRIM}"></div>

	<div class="absolute top-[26px] right-[22px] z-[5]">
		<DotMenu />
	</div>

	<h1 class="absolute top-24 right-6 left-6 flex items-center justify-center">
		<img
			src="/logo.webp"
			alt="Prompt &amp; Pray"
			width="280"
			height="170"
			class="h-[170px] w-[280px] object-contain
				drop-shadow-[0_10px_24px_rgba(28,31,34,0.45)]"
		/>
	</h1>

	<div class="absolute top-[300px] left-[77px] h-[236px] w-[236px]">
		<!--
			Deliberately not a button. The whole code used to be a second forward
			button, and this is the one screen you hold out to somebody else — a
			stray thumb on it skipped past the thing they were trying to scan. The
			arrow beside it is the way onward, and it is the only one.
		-->
		<div
			class="h-full w-full overflow-hidden rounded-[26px] bg-white
				shadow-[0_18px_40px_rgba(28,31,34,0.35)]"
		>
			<QrCode value={target} />
		</div>

		<button
			type="button"
			data-shot="qr-forward"
			onclick={onForward}
			aria-label={t.forward}
			class="absolute -right-[30px] -bottom-6 grid h-[72px] w-[72px] place-items-center
				rounded-[22px] bg-white shadow-[0_14px_30px_rgba(28,31,34,0.28)] transition
				hover:-translate-y-0.5 hover:bg-[#F2F2F2]"
		>
			<Icon name="right" size={22} width={3.2} colour="#1C1F22" />
		</button>
	</div>

	<div class="absolute inset-x-0 bottom-12 flex flex-col items-center gap-5">
		<div class="flex flex-col items-center gap-1.5">
			<p
				data-shot="join-code"
				aria-label={conn.t.lobby.passphrase}
				class="display text-[22px] tracking-[0.3em] text-white
					drop-shadow-[0_2px_10px_rgba(28,31,34,0.65)]"
			>
				{code}
			</p>
			<!--
				Says what the square above it is for. Nothing else on this screen did,
				and at arm's length it is read by whoever is *not* holding the phone —
				so it takes the width the code gave up and spends it on weight and
				full-strength white rather than on more line.
			-->
			<p
				class="max-w-[300px] text-center text-[15px] leading-snug font-semibold
					text-white drop-shadow-[0_2px_10px_rgba(28,31,34,0.9)]"
			>
				{t.scanToJoin}
			</p>
		</div>

		<SeatStrip />

		<button
			type="button"
			onclick={() => (ui.overlay = 'scan')}
			class="flex items-center gap-3 rounded-2xl px-4 py-2.5 transition hover:bg-white/[0.14]"
		>
			<Icon name="camera" size={22} colour="#fff" />
			<span class="display text-[17px] text-white">{t.joinRound}</span>
		</button>
	</div>
</div>
