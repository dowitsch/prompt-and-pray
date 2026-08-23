<script lang="ts">
	/**
	 * Somebody got home.
	 *
	 * The card is the winner's colour, which is the payoff of every other screen
	 * having used that colour to mean that person.
	 *
	 * The old victory screen's numbers are kept underneath rather than thrown away —
	 * how many rounds it took, how many letters were spent, the road that worked,
	 * what you had written. That is the part players actually talk about
	 * afterwards, and the design's card had nowhere to put it, so it scrolls.
	 *
	 * There is one way out of it, and it is the door: dismissing it left you looking
	 * at a finished board with a dead clock and no way back to the card, which read
	 * as the app having lost the result. The match is over — the only thing left to
	 * do is leave it, which lands you at a fresh round of your own.
	 */
	import CharacterCard from './CharacterCard.svelte';
	import Icon from './Icon.svelte';
	import { conn } from '$lib/client/connection.svelte';
	import { characterNameOf, characterOf, colorOf } from '$lib/client/identity';
	import { fmt } from '$lib/i18n';
	import { PLAYER_COLORS } from '$lib/client/theme';

	type Props = { onLeave: () => void };
	let { onLeave }: Props = $props();

	const t = $derived(conn.t.end);
	const tv = $derived(conn.t.victory);
	const game = $derived(conn.game!);

	const winner = $derived(game.players.find((p) => game.winnerIds.includes(p.id)) ?? null);
	const youWon = $derived(Boolean(conn.you && game.winnerIds.includes(conn.you)));
	const ground = $derived(winner ? colorOf(winner) : PLAYER_COLORS[0]);
	const me = $derived(conn.me);
	const road = $derived(winner?.lastRun?.decisions.map((d) => d.choiceLabel) ?? []);
</script>

<div class="animate-pp-fade absolute inset-0 z-[70]">
	<div class="absolute inset-0 bg-[#0E0F10]/[0.62]"></div>

	<div
		class="animate-pp-pop absolute inset-x-5 top-[150px] max-h-[600px] overflow-hidden
			rounded-[30px] shadow-[0_26px_60px_rgba(0,0,0,0.45)]"
		style:background={ground}
		role="dialog"
		aria-modal="true"
	>
		<div class="pp-scroll max-h-[600px] overflow-y-auto px-[26px] pt-[34px] pb-[30px]">
			<h2 class="text-center display text-4xl leading-tight text-balance text-white">
				{youWon ? t.youWin : fmt(t.wins, { name: winner ? characterNameOf(winner) : tv.nobody })}
			</h2>

			{#if winner}
				<!-- The agent walked it; the person who taught it is named underneath. -->
				<p class="mt-2 text-center text-xs tracking-[0.14em] text-white/65 uppercase">
					{fmt(tv.taughtBy, { name: winner.name })}
				</p>
				<div class="my-7 flex justify-center">
					<CharacterCard index={characterOf(winner)} width={200} height={250} detail={false} />
				</div>
			{/if}

			<button
				type="button"
				onclick={onLeave}
				class="flex h-[74px] w-full items-center justify-center gap-4 rounded-[22px] bg-dark
					shadow-[0_16px_34px_rgba(28,31,34,0.3)] transition hover:-translate-y-0.5
					hover:bg-[#2A2E31]"
			>
				<span class="display text-2xl text-white">{t.leaveRound}</span>
				<Icon name="leave" size={22} width={2.4} colour="#fff" />
			</button>

			<!-- What happened, for the argument afterwards. -->
			<dl class="mt-7 grid grid-cols-2 gap-3 text-white">
				<div class="rounded-2xl bg-dark/25 px-4 py-3">
					<dt class="text-[10px] tracking-[0.18em] uppercase opacity-70">{tv.rounds}</dt>
					<dd class="display text-xl">{game.round}</dd>
				</div>
				<div class="rounded-2xl bg-dark/25 px-4 py-3">
					<dt class="text-[10px] tracking-[0.18em] uppercase opacity-70">{tv.lettersSpent}</dt>
					<dd class="display text-xl">{me?.memoryChars ?? 0}</dd>
				</div>
				<div class="rounded-2xl bg-dark/25 px-4 py-3">
					<dt class="text-[10px] tracking-[0.18em] uppercase opacity-70">{tv.partingsPassed}</dt>
					<dd class="display text-xl">{me?.bestDepth ?? 0}/{game.depth}</dd>
				</div>
				<div class="rounded-2xl bg-dark/25 px-4 py-3">
					<dt class="text-[10px] tracking-[0.18em] uppercase opacity-70">{tv.misled}</dt>
					<dd class="display text-xl">{me?.sabotageUsed ? tv.misledOnce : tv.misledNever}</dd>
				</div>
			</dl>

			{#if road.length}
				<div class="mt-5">
					<h3 class="text-[10px] tracking-[0.18em] text-white/70 uppercase">{tv.roadItTook}</h3>
					<p class="mt-2 text-sm leading-relaxed text-white">{road.join(' → ')}</p>
				</div>
			{/if}

			{#if me?.memory.length}
				<div class="mt-5">
					<h3 class="text-[10px] tracking-[0.18em] text-white/70 uppercase">{tv.whatYouWrote}</h3>
					<ul class="mt-2 flex flex-col gap-1.5">
						{#each me.memory as line (line.id)}
							<li class="text-sm text-white">
								{line.text}
								{#if line.sabotagedBy}
									<span class="ml-1 text-xs text-white/70 italic">
										{fmt(conn.t.memory.struckOutBy, { name: line.sabotagedBy })}
									</span>
								{/if}
							</li>
						{/each}
					</ul>
				</div>
			{/if}
		</div>
	</div>
</div>
