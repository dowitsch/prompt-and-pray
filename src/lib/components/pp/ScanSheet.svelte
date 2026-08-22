<script lang="ts">
	/**
	 * Joining somebody else's round.
	 *
	 * The camera path is the nice one and the typed code is the one that actually
	 * has to work: Safari has no BarcodeDetector at all, `getUserMedia` needs a
	 * secure context — which a phone pointed at a laptop's dev server over http is
	 * not — and the permission can simply be refused. So the code field is always
	 * there rather than being a fallback that appears after a failure.
	 *
	 * It matters less than it sounds, because the QR encodes a URL: any phone's own
	 * camera app opens the round without this screen existing.
	 */
	import { onDestroy } from 'svelte';
	import Icon from './Icon.svelte';
	import { conn } from '$lib/client/connection.svelte';

	type Props = { onCode: (code: string) => void; onCancel: () => void };
	let { onCode, onCancel }: Props = $props();

	const t = $derived(conn.t.pp);

	let video = $state<HTMLVideoElement | null>(null);
	let typed = $state('');
	let cameraLive = $state(false);
	let note = $state<string | null>(null);

	let stream: MediaStream | null = null;
	let poll: ReturnType<typeof setInterval> | null = null;

	/** Pull the code out of whatever the QR turned out to hold. */
	function readCode(raw: string): string | null {
		const cleaned = raw.trim();
		const fromUrl = cleaned.match(/\/j\/([A-Za-z0-9]{3,8})\b/);
		if (fromUrl) return fromUrl[1].toUpperCase();
		if (/^[A-Za-z0-9]{3,8}$/.test(cleaned)) return cleaned.toUpperCase();
		return null;
	}

	function stop() {
		if (poll) clearInterval(poll);
		poll = null;
		// Every track, or the camera light stays on after the sheet is gone.
		stream?.getTracks().forEach((track) => track.stop());
		stream = null;
		cameraLive = false;
	}

	onDestroy(stop);

	$effect(() => {
		let cancelled = false;

		(async () => {
			const Detector = (globalThis as unknown as { BarcodeDetector?: new (o: unknown) => unknown })
				.BarcodeDetector;
			if (!Detector || !navigator.mediaDevices?.getUserMedia) {
				note = t.cameraBlocked;
				return;
			}
			try {
				stream = await navigator.mediaDevices.getUserMedia({
					video: { facingMode: 'environment' }
				});
				if (cancelled || !video) {
					stream.getTracks().forEach((track) => track.stop());
					return;
				}
				video.srcObject = stream;
				await video.play();
				cameraLive = true;

				const detector = new Detector({ formats: ['qr_code'] }) as {
					detect: (source: unknown) => Promise<{ rawValue: string }[]>;
				};
				poll = setInterval(async () => {
					if (!video) return;
					try {
						const hits = await detector.detect(video);
						for (const hit of hits) {
							const code = readCode(hit.rawValue);
							if (code) {
								stop();
								onCode(code);
								return;
							}
						}
					} catch {
						/* A frame that will not decode is not an error worth showing. */
					}
				}, 220);
			} catch {
				if (!cancelled) note = t.cameraBlocked;
			}
		})();

		return () => {
			cancelled = true;
			stop();
		};
	});

	function submit(event: SubmitEvent) {
		event.preventDefault();
		const code = readCode(typed);
		if (code) onCode(code);
	}
</script>

<div
	class="animate-pp-fade absolute inset-0 z-40 flex flex-col items-center justify-center gap-7
		bg-[#0E0F10] px-6"
	role="dialog"
	aria-modal="true"
	aria-label={t.scanPrompt}
>
	<div class="scanlines pointer-events-none absolute inset-0"></div>

	<div class="relative h-[236px] w-[236px] overflow-hidden rounded-[14px]">
		<video
			bind:this={video}
			class="h-full w-full object-cover"
			style:opacity={cameraLive ? 1 : 0}
			playsinline
			muted
		></video>

		<span
			class="absolute top-0 left-0 h-[52px] w-[52px] rounded-tl-[14px] border-t-4 border-l-4 border-white"
		></span>
		<span
			class="absolute top-0 right-0 h-[52px] w-[52px] rounded-tr-[14px] border-t-4 border-r-4 border-white"
		></span>
		<span
			class="absolute bottom-0 left-0 h-[52px] w-[52px] rounded-bl-[14px] border-b-4 border-l-4 border-white"
		></span>
		<span
			class="absolute right-0 bottom-0 h-[52px] w-[52px] rounded-br-[14px] border-r-4 border-b-4 border-white"
		></span>

		{#if cameraLive}
			<span
				class="animate-pp-pulse absolute inset-x-2.5 top-1/2 h-0.5 bg-p1 shadow-[0_0_18px_#F59D89]"
			></span>
		{/if}
	</div>

	<p class="relative font-mono text-[11px] tracking-[0.14em] text-white/60 uppercase">
		{note ?? t.scanPrompt}
	</p>

	<form onsubmit={submit} class="relative flex w-full max-w-[300px] flex-col items-center gap-3">
		<label class="sr-only" for="pp-code">{t.typeCodeInstead}</label>
		<input
			id="pp-code"
			bind:value={typed}
			oninput={() => (typed = typed.toUpperCase())}
			maxlength="8"
			placeholder={t.codePlaceholder}
			autocomplete="off"
			spellcheck="false"
			class="w-full rounded-2xl border-0 bg-white/10 py-3.5 text-center display text-2xl
				tracking-[0.4em] text-white placeholder:text-white/30 focus:ring-2 focus:ring-p1"
		/>
		<button
			type="submit"
			disabled={!readCode(typed)}
			class="flex h-[60px] w-full items-center justify-center gap-3 rounded-[20px] bg-white
				display text-lg text-dark transition hover:-translate-y-0.5 hover:bg-white/90
				disabled:cursor-not-allowed disabled:opacity-40"
		>
			{t.codeSubmit}
			<Icon name="right" size={18} width={3} colour="#1C1F22" />
		</button>
	</form>

	<button
		type="button"
		onclick={onCancel}
		class="relative text-sm text-white/60 transition hover:text-white"
	>
		{t.scanCancel}
	</button>
</div>

<style>
	.scanlines {
		background-image: repeating-linear-gradient(
			0deg,
			rgb(255 255 255 / 4%) 0 2px,
			transparent 2px 5px
		);
	}
</style>
