<script lang="ts">
	/**
	 * Screen 1: the round you are in, as something to hold up.
	 *
	 * The QR is of *this* lobby, so showing your phone to somebody is the whole
	 * joining flow. "Join a round" turns the camera the other way and reads
	 * somebody else's.
	 */
	import QrCode from '../QrCode.svelte';
	import Icon from '../Icon.svelte';
	import DotMenu from '../DotMenu.svelte';
	import { conn } from '$lib/client/connection.svelte';
	import { ui } from '$lib/client/ui.svelte';

	type Props = { code: string; onForward: () => void };
	let { code, onForward }: Props = $props();

	const t = $derived(conn.t.pp);

	/** The URL the code stands for, so any camera app can open it. */
	const target = $derived(
		typeof location === 'undefined' ? `/j/${code}` : `${location.origin}/j/${code}`
	);
</script>

<div class="animate-pp-fade absolute inset-0">
	<div class="absolute top-[26px] right-[22px] z-[5]">
		<DotMenu />
	</div>

	<h1
		class="absolute top-24 right-6 left-6 flex items-center justify-center gap-1.5 display
			text-white"
	>
		<span class="text-[40px] leading-[0.94]">
			<span class="block">Prompt</span>
			<span class="block text-right">Pray</span>
		</span>
		<span class="-mt-1.5 text-[78px] leading-[0.7]">&amp;</span>
	</h1>

	<div class="absolute top-[312px] left-[71px] h-[248px] w-[248px]">
		<button
			type="button"
			onclick={onForward}
			aria-label={t.forward}
			class="block h-full w-full rounded-[26px] bg-bright shadow-[0_18px_40px_rgba(28,31,34,0.35)]
				transition hover:scale-[1.02]"
		>
			<QrCode value={target} />
		</button>

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

	<div class="absolute inset-x-0 bottom-16 flex justify-center">
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
