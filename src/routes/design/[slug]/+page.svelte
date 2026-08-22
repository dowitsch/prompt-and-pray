<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import DesignCanvas from '$lib/components/design/DesignCanvas.svelte';
	import { BIOME_IDS, NODE_KINDS } from '$lib/db/schema';
	import { BIOME_LABEL, type BiomeId } from '$lib/map/biomes';
	import type { DesignChoice, DesignNode, DesignStory } from '$lib/db/design';
	import type { NodeKind, EndingType, ChoiceResult } from '$lib/engine/types';
	import type { Validation } from '$lib/engine/validate';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	/**
	 * The story as the server last described it.
	 *
	 * Every edit round-trips and replaces this wholesale rather than being applied
	 * optimistically — par, publishability and roads dropped by an edit are all
	 * derived from the graph, and a client guessing at them would drift.
	 *
	 * `edited` shadows the loaded data until a form action reloads the page, at
	 * which point it is cleared and the server's copy takes over again.
	 */
	let edited = $state<{ story: DesignStory; validation: Validation } | null>(null);
	const story = $derived(edited?.story ?? data.story);
	const validation = $derived(edited?.validation ?? data.validation);

	let selected = $state<{ kind: 'node' | 'choice'; id: number } | null>(null);
	let problem = $state<string | null>(null);
	let saving = $state(false);

	/** Publish, arrange and rename all reload the story; drop our copy first. */
	const reload =
		() =>
		async ({ update }: { update: () => Promise<void> }) => {
			edited = null;
			await update();
		};

	/** What the palette is holding, waiting to be put down on the canvas. */
	let holding = $state<{ kind: NodeKind; title: string; templateId: number | null } | null>(null);
	let paletteKind = $state<NodeKind>('LOCATION');

	const selectedNode = $derived.by(() => {
		const it = selected;
		if (it?.kind !== 'node') return null;
		return story.nodes.find((n) => n.id === it.id) ?? null;
	});
	const selectedChoice = $derived.by(() => {
		const it = selected;
		if (it?.kind !== 'choice') return null;
		return story.choices.find((c) => c.id === it.id) ?? null;
	});
	const templates = $derived(data.palette.templates.filter((t) => t.kind === paletteKind));
	const attributesFor = $derived((kind: NodeKind) =>
		data.palette.attributes.filter((a) => a.appliesTo.includes(kind))
	);

	async function send(edit: Record<string, unknown>): Promise<void> {
		saving = true;
		problem = null;
		try {
			const response = await fetch(`/design/${story.slug}/edit`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(edit)
			});
			if (!response.ok) throw new Error('The workshop did not answer.');

			const result = await response.json();
			edited = { story: result.story, validation: result.validation };
			problem = result.problem ?? null;

			// Whatever was selected may have been dropped by the edit.
			const was = selected;
			if (was?.kind === 'node' && !result.story.nodes.some((n: DesignNode) => n.id === was.id)) {
				selected = null;
			}
			if (
				was?.kind === 'choice' &&
				!result.story.choices.some((c: DesignChoice) => c.id === was.id)
			) {
				selected = null;
			}
		} catch (error) {
			problem = error instanceof Error ? error.message : 'That did not work.';
		} finally {
			saving = false;
		}
	}

	function place(x: number, y: number): void {
		if (!holding) return;
		void send({ do: 'addNode', ...holding, x, y });
		holding = null;
	}

	/** Fire an edit after typing stops, so a title is not one request per keystroke. */
	let pending: ReturnType<typeof setTimeout> | null = null;
	function sendSoon(edit: Record<string, unknown>): void {
		if (pending) clearTimeout(pending);
		pending = setTimeout(() => void send(edit), 400);
	}

	const errorsHere = $derived((nodeId: number) =>
		validation.problems.filter((p) => p.nodeId === String(nodeId))
	);
</script>

<svelte:head><title>{story.name} · HOMEWARD</title></svelte:head>

<div class="flex h-screen flex-col">
	<header class="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-rule px-5 py-3">
		<a href={resolve('/design')} class="hover:text-ember rubric text-ash">← Stories</a>

		<h1 class="title text-lg text-parchment">{story.name}</h1>

		<span class="font-mono text-[10px] tracking-[0.18em] text-ash uppercase">
			{story.nodes.length} places · par {story.parSteps}
		</span>

		{#if saving}
			<span class="font-mono text-[10px] tracking-[0.18em] text-ash uppercase">saving…</span>
		{/if}

		<div class="ml-auto flex items-center gap-2">
			<form method="POST" action="?/arrange" use:enhance={reload}>
				<button
					type="submit"
					class="hover:border-ember hover:text-ember rounded border border-rule px-3 py-1.5 rubric text-ash"
				>
					Arrange
				</button>
			</form>

			{#if story.status === 'published'}
				<form method="POST" action="?/unpublish" use:enhance={reload}>
					<button
						type="submit"
						class="rounded border border-moss/50 bg-moss/10 px-3 py-1.5 rubric text-moss hover:bg-moss/20"
					>
						Published
					</button>
				</form>
			{:else}
				<form method="POST" action="?/publish" use:enhance={reload}>
					<button
						type="submit"
						disabled={!validation.publishable}
						class="border-ember/60 bg-ember/10 text-ember hover:bg-ember/20 rounded border px-3 py-1.5
						       rubric disabled:opacity-30"
					>
						Publish
					</button>
				</form>
			{/if}
		</div>
	</header>

	{#if problem || form?.message}
		<p
			class="border-b border-rose/40 bg-rose/10 px-5 py-2 font-mono text-xs text-rose"
			role="alert"
		>
			{problem ?? form?.message}
		</p>
	{/if}

	<div class="flex min-h-0 flex-1">
		<!-- ─────────────────────────────────────────────── the palette -->
		<aside class="w-56 shrink-0 overflow-y-auto border-r border-rule p-4">
			<h2 class="mb-2 rubric text-ash">Put down</h2>

			<div class="mb-3 grid grid-cols-2 gap-1">
				{#each NODE_KINDS as kind (kind)}
					<button
						type="button"
						onclick={() => (paletteKind = kind)}
						class="rounded border px-2 py-1 font-mono text-[10px] tracking-[0.12em] uppercase
						       {paletteKind === kind
							? 'border-ember text-ember'
							: 'border-rule text-ash hover:text-parchment'}"
					>
						{kind.toLowerCase()}
					</button>
				{/each}
			</div>

			{#if holding}
				<p class="border-ember/50 bg-ember/10 text-ember mb-2 rounded border px-2 py-1.5 text-xs">
					Click the map to set down <b>{holding.title}</b>.
					<button type="button" class="underline" onclick={() => (holding = null)}
						>never mind</button
					>
				</p>
			{/if}

			<ul class="space-y-1">
				{#each templates as template (template.id)}
					<li>
						<button
							type="button"
							onclick={() =>
								(holding = {
									kind: template.kind as NodeKind,
									title: template.name,
									templateId: template.id
								})}
							class="hover:border-ember hover:text-ember w-full rounded border border-rule px-2 py-1.5 text-left
							       text-sm text-ash"
						>
							{template.name}
						</button>
					</li>
				{/each}
			</ul>
		</aside>

		<!-- ─────────────────────────────────────────────────── the map -->
		<main class="min-w-0 flex-1 bg-night-2">
			<DesignCanvas
				{story}
				problems={validation.problems}
				{selected}
				placing={Boolean(holding)}
				onSelect={(next) => (selected = next)}
				onMove={(moves) => void send({ do: 'move', moves })}
				onConnect={(fromNodeId, toNodeId) => void send({ do: 'addChoice', fromNodeId, toNodeId })}
				onPlace={place}
			/>
		</main>

		<!-- ────────────────────────────────────── inspector & verdict -->
		<aside class="w-80 shrink-0 overflow-y-auto border-l border-rule p-4">
			{#if selectedNode}
				{@const node = selectedNode}
				<h2 class="mb-3 rubric text-ash">This place</h2>

				<label class="mb-3 block">
					<span class="rubric text-ash">Its name</span>
					<input
						value={node.title}
						maxlength="60"
						oninput={(e) =>
							sendSoon({
								do: 'updateNode',
								nodeId: node.id,
								patch: { title: e.currentTarget.value }
							})}
						class="focus:border-ember mt-1 w-full rounded border border-rule bg-night px-2 py-1.5 text-sm text-parchment focus:outline-none"
					/>
				</label>

				<label class="mb-3 block">
					<span class="rubric text-ash">
						{node.endingType ? 'Read out when a run ends here' : 'What is here'}
					</span>
					<textarea
						value={node.body}
						rows="3"
						oninput={(e) =>
							sendSoon({
								do: 'updateNode',
								nodeId: node.id,
								patch: { body: e.currentTarget.value }
							})}
						class="focus:border-ember mt-1 w-full rounded border border-rule bg-night px-2 py-1.5 text-sm text-parchment focus:outline-none"
					></textarea>
				</label>

				<div class="mb-3">
					<span class="rubric text-ash">How a run ends here</span>
					<div class="mt-1 grid grid-cols-2 gap-1">
						{#each [{ value: null, label: 'It goes on' }, { value: 'SUCCESS', label: 'Home' }, { value: 'FAILURE', label: 'Death' }, { value: 'NEUTRAL', label: 'It stops' }] as option (option.label)}
							<button
								type="button"
								onclick={() =>
									void send({
										do: 'updateNode',
										nodeId: node.id,
										patch: { endingType: option.value as EndingType | null }
									})}
								class="rounded border px-2 py-1 font-mono text-[10px] tracking-[0.12em] uppercase
								       {node.endingType === option.value
									? 'border-ember text-ember'
									: 'border-rule text-ash hover:text-parchment'}"
							>
								{option.label}
							</button>
						{/each}
					</div>
					{#if !node.endingType}
						<p class="mt-1 text-[11px] text-ash/70">
							Marking a place an ending takes away the roads out of it.
						</p>
					{/if}
				</div>

				<div class="mb-3 grid grid-cols-2 gap-2">
					<label class="block">
						<span class="rubric text-ash">The land here</span>
						<select
							value={node.biome ?? ''}
							onchange={(e) =>
								void send({
									do: 'updateNode',
									nodeId: node.id,
									patch: { biome: (e.currentTarget.value || null) as BiomeId | null }
								})}
							class="focus:border-ember mt-1 w-full rounded border border-rule bg-night px-2 py-1.5 text-sm text-parchment focus:outline-none"
						>
							<option value="">Whatever grows there</option>
							{#each BIOME_IDS as id (id)}
								<option value={id}>{BIOME_LABEL[id]}</option>
							{/each}
						</select>
					</label>

					<label class="block">
						<span class="rubric text-ash">Its mark</span>
						<input
							value={node.sigil ?? ''}
							maxlength="8"
							placeholder="🌲"
							oninput={(e) =>
								sendSoon({
									do: 'updateNode',
									nodeId: node.id,
									patch: { sigil: e.currentTarget.value.trim() || null }
								})}
							class="focus:border-ember mt-1 w-full rounded border border-rule bg-night px-2 py-1.5 text-center text-sm text-parchment focus:outline-none"
						/>
					</label>
				</div>

				<label class="mb-3 block">
					<span class="rubric text-ash">Which stretch of the story</span>
					<input
						value={node.region ?? ''}
						maxlength="40"
						placeholder="schwarzholz"
						oninput={(e) =>
							sendSoon({
								do: 'updateNode',
								nodeId: node.id,
								patch: { region: e.currentTarget.value.trim() || null }
							})}
						class="focus:border-ember mt-1 w-full rounded border border-rule bg-night px-2 py-1.5 text-sm text-parchment focus:outline-none"
					/>
					<p class="mt-1 text-[11px] text-ash/70">
						Yours alone, like the tags — it only keeps a region together when you ask for an
						arrangement.
					</p>
				</label>

				<div class="mb-3">
					<span class="rubric text-ash">Tags</span>
					<p class="mb-1 text-[11px] text-ash/70">
						For your own sorting — the agents never read these.
					</p>
					<div class="flex flex-wrap gap-1">
						{#each attributesFor(node.kind) as attribute (attribute.id)}
							{@const on = node.attributeIds.includes(attribute.id)}
							<button
								type="button"
								onclick={() =>
									void send({
										do: 'updateNode',
										nodeId: node.id,
										patch: {
											attributeIds: on
												? node.attributeIds.filter((id) => id !== attribute.id)
												: [...node.attributeIds, attribute.id]
										}
									})}
								class="rounded-full border px-2 py-0.5 text-[11px]
								       {on ? 'border-ember text-ember' : 'border-rule text-ash hover:text-parchment'}"
							>
								{attribute.name}
							</button>
						{/each}
					</div>
				</div>

				<div class="flex gap-2">
					{#if story.startNodeId !== node.id && !node.endingType}
						<button
							type="button"
							onclick={() => void send({ do: 'setStart', nodeId: node.id })}
							class="rounded border border-rule px-3 py-1.5 rubric text-ash hover:border-moss hover:text-moss"
						>
							Start here
						</button>
					{/if}
					<button
						type="button"
						onclick={() => void send({ do: 'deleteNode', nodeId: node.id })}
						class="rounded border border-rule px-3 py-1.5 rubric text-ash hover:border-rose hover:text-rose"
					>
						Remove
					</button>
				</div>

				{#each errorsHere(node.id) as issue (issue.code)}
					<p
						class="mt-3 rounded border px-2 py-1.5 text-[11px]
						       {issue.severity === 'error' ? 'border-rose/50 text-rose' : 'border-rule text-ash'}"
					>
						{issue.message}
					</p>
				{/each}
			{:else if selectedChoice}
				{@const choice = selectedChoice}
				<h2 class="mb-3 rubric text-ash">This road</h2>

				<label class="mb-3 block">
					<span class="rubric text-ash">What the sign says</span>
					<input
						value={choice.label}
						maxlength="40"
						oninput={(e) =>
							sendSoon({
								do: 'updateChoice',
								choiceId: choice.id,
								patch: { label: e.currentTarget.value }
							})}
						class="focus:border-ember mt-1 w-full rounded border border-rule bg-night px-2 py-1.5 text-sm text-parchment focus:outline-none"
					/>
					<span class="mt-1 block text-[11px] text-ash/70">
						This is what an agent picks by, and what a player writes about in twenty characters. One
						plain word is best, and no two roads out of one place may share one.
					</span>
				</label>

				<div class="mb-3">
					<span class="rubric text-ash">What kind of road</span>
					<div class="mt-1 grid grid-cols-3 gap-1">
						{#each ['ADVANCE', 'DETOUR', 'SETBACK'] as result (result)}
							<button
								type="button"
								onclick={() =>
									void send({
										do: 'updateChoice',
										choiceId: choice.id,
										patch: { result: result as ChoiceResult }
									})}
								class="rounded border px-2 py-1 font-mono text-[10px] tracking-[0.12em] uppercase
								       {choice.result === result
									? 'border-ember text-ember'
									: 'border-rule text-ash hover:text-parchment'}"
							>
								{result.toLowerCase()}
							</button>
						{/each}
					</div>
					<p class="mt-1 text-[11px] text-ash/70">
						Colour in the telling only. Whether a run ends is decided by where the road leads, never
						by the road.
					</p>
				</div>

				<label class="mb-3 block">
					<span class="rubric text-ash">Where it leads</span>
					<select
						value={choice.toNodeId}
						onchange={(e) =>
							void send({
								do: 'updateChoice',
								choiceId: choice.id,
								patch: { toNodeId: Number(e.currentTarget.value) }
							})}
						class="focus:border-ember mt-1 w-full rounded border border-rule bg-night px-2 py-1.5 text-sm text-parchment focus:outline-none"
					>
						{#each story.nodes.filter((n) => n.id !== choice.fromNodeId) as node (node.id)}
							<option value={node.id}>{node.title || '(unnamed)'}</option>
						{/each}
					</select>
				</label>

				<button
					type="button"
					onclick={() => void send({ do: 'deleteChoice', choiceId: choice.id })}
					class="rounded border border-rule px-3 py-1.5 rubric text-ash hover:border-rose hover:text-rose"
				>
					Remove
				</button>
			{:else}
				<h2 class="mb-2 rubric text-ash">The tale</h2>
				<form method="POST" action="?/rename" use:enhance={reload} class="mb-4">
					<label class="mb-2 block">
						<span class="rubric text-ash">Its name</span>
						<input
							name="name"
							value={story.name}
							maxlength="60"
							class="focus:border-ember mt-1 w-full rounded border border-rule bg-night px-2 py-1.5 text-sm text-parchment focus:outline-none"
						/>
					</label>
					<label class="mb-2 block">
						<span class="rubric text-ash">In one line</span>
						<input
							name="description"
							value={story.description}
							maxlength="120"
							class="focus:border-ember mt-1 w-full rounded border border-rule bg-night px-2 py-1.5 text-sm text-parchment focus:outline-none"
						/>
					</label>
					<button
						type="submit"
						class="hover:border-ember hover:text-ember rounded border border-rule px-3 py-1.5 rubric text-ash"
					>
						Save
					</button>
				</form>

				<!-- One bit of how the tale is *played*, so it sits with the tale. -->
				<form method="POST" action="?/remember" use:enhance={reload} class="mb-4">
					<input type="hidden" name="on" value={String(!story.rememberPath)} />
					<span class="rubric text-ash">Known ground</span>
					<button
						type="submit"
						class="mt-1 w-full rounded border px-3 py-1.5 text-left rubric
						       {story.rememberPath
							? 'border-moss/50 bg-moss/10 text-moss hover:bg-moss/20'
							: 'hover:border-ember hover:text-ember border-rule text-ash'}"
					>
						{story.rememberPath ? 'Hurried over' : 'Decided every time'}
					</button>
					<p class="mt-1.5 text-[11px] leading-snug text-ash">
						{story.rememberPath
							? 'A road already proven safe collapses into one line — quicker to watch, but the agent is not asked.'
							: 'Every step is argued out loud, however often the same crossroads comes round.'}
					</p>
				</form>

				<p class="text-xs text-ash">
					Pick something from the palette and click the map to set it down. Drag a place to move it;
					drag from its rim to another place to lay a road. Click a place or a road to change it.
				</p>
			{/if}

			<!-- ───────────────────────────────────────── the verdict -->
			<section class="mt-6 border-t border-rule pt-4">
				<h2 class="mb-2 rubric text-ash">
					{validation.publishable ? 'Ready to play' : 'Not ready yet'}
				</h2>

				{#if !validation.problems.length}
					<p class="text-xs text-moss">Nothing wrong with it.</p>
				{/if}

				<ul class="space-y-1.5">
					{#each validation.problems as issue, i (issue.code + i)}
						<li>
							<button
								type="button"
								onclick={() =>
									(selected = issue.nodeId ? { kind: 'node', id: Number(issue.nodeId) } : null)}
								class="w-full text-left text-[11px] leading-snug
								       {issue.severity === 'error' ? 'text-rose' : 'text-ash'}
								       {issue.nodeId ? 'hover:underline' : 'cursor-default'}"
							>
								{issue.severity === 'error' ? '✖' : '•'}
								{issue.message}
							</button>
						</li>
					{/each}
				</ul>

				{#if data.matches > 0}
					<p class="text-ember mt-3 text-[11px]">
						{data.matches} match{data.matches === 1 ? ' is' : 'es are'} playing this tale. Changes reach
						them when their next match begins.
					</p>
				{/if}
			</section>
		</aside>
	</div>
</div>
