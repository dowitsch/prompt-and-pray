<script lang="ts">
	/**
	 * Every glyph in the design, in one table.
	 *
	 * The mockups are drawn with stroked 24×24 paths at a handful of weights, so
	 * one component with a lookup beats twenty files. Anything that is a control
	 * gets a label from the caller — almost every button in this design is an
	 * unlabelled icon, and a screen reader would otherwise find nothing at all.
	 */

	type Name =
		| 'right'
		| 'left'
		| 'check'
		| 'camera'
		| 'pencil'
		| 'qr'
		| 'clock'
		| 'send'
		| 'down'
		| 'close'
		| 'again'
		| 'leave'
		| 'info'
		| 'question'
		| 'cross'
		| 'bang'
		| 'map'
		| 'flask'
		| 'speaker'
		| 'speakerOff'
		| 'music'
		| 'gear';

	type Props = {
		name: Name;
		size?: number;
		width?: number;
		colour?: string;
	};

	let { name, size = 22, width = 2, colour = 'currentColor' }: Props = $props();

	/** Stroked paths, in a 24×24 box. */
	const STROKED: Record<string, string[]> = {
		right: ['M8 4l9 8-9 8'],
		left: ['M16 4l-9 8 9 8'],
		check: ['M4 12.5l5.2 5L20 6.5'],
		camera: [
			'M3 6.5A2.5 2.5 0 015.5 4h1.2l1.1-2h6.4l1.1 2h1.2A2.5 2.5 0 0119 6.5v8A2.5 2.5 0 0116.5 17h-11A2.5 2.5 0 013 14.5z'
		],
		pencil: ['M4 20h4.3L20 8.3 15.7 4 4 15.7z', 'M14.2 5.6l4.2 4.2'],
		send: ['M12 20V5', 'M5 11.5L12 4.5l7 7'],
		down: ['M12 4v15', 'M5 12.5l7 7 7-7'],
		close: ['M5 5l14 14M19 5L5 19'],
		again: ['M20 12a8 8 0 10-3 6.2', 'M20 5v5h-5'],
		// A door left open, and the way out of it.
		leave: ['M12 4H5v16h7', 'M10.5 12H21', 'M16.5 7.5L21 12l-4.5 4.5'],
		cross: ['M6 6l12 12M18 6L6 18'],
		// A folded map: three creases and a route across it.
		map: ['M3 6.5l6-2.5 6 2.5 6-2.5v15l-6 2.5-6-2.5-6 2.5z', 'M9 4v15', 'M15 6.5v15']
	};
</script>

{#if name === 'camera'}
	<svg
		{...{ 'aria-hidden': 'true' }}
		width={size}
		height={size}
		viewBox="0 0 24 20"
		fill="none"
		stroke={colour}
		stroke-width={width}
		stroke-linecap="round"
		stroke-linejoin="round"
	>
		<path d={STROKED.camera[0]} />
		<circle cx="11" cy="10.5" r="3.4" />
	</svg>
{:else if name === 'clock'}
	<svg
		{...{ 'aria-hidden': 'true' }}
		width={size}
		height={size}
		viewBox="0 0 24 24"
		fill="none"
		stroke={colour}
		stroke-width={width}
		stroke-linecap="round"
	>
		<circle cx="12" cy="12" r="9.4" />
		<path d="M12 7.4V12l3.2 2.2" />
	</svg>
{:else if name === 'info'}
	<svg
		{...{ 'aria-hidden': 'true' }}
		width={size}
		height={size}
		viewBox="0 0 24 24"
		fill="none"
		stroke={colour}
		stroke-width={width}
		stroke-linecap="round"
	>
		<circle cx="12" cy="12" r="9" />
		<path d="M12 11v6" />
		<path d="M12 7.6v.6" />
	</svg>
{:else if name === 'flask'}
	<!--
		The poison bottle, filled. It is the only glyph in the set that has to read
		as an *object* rather than a mark: it is what a player presses to lie to
		somebody else's agent, and a stroked outline at 26px looked like a battery.
	-->
	<svg {...{ 'aria-hidden': 'true' }} width={size} height={size} viewBox="0 0 24 24" fill={colour}>
		<path
			d="M10.6 2.6h2.8v1.1h1.1v1.5l1.9 1.9c.7.7 1.1 1.6 1.1 2.6v7.2a2.6 2.6 0 01-2.6 2.6H9.1a2.6
				2.6 0 01-2.6-2.6V9.7c0-1 .4-1.9 1.1-2.6l1.9-1.9V3.7h1.1zM12 8.6a3.4 3.4 0 00-3.4 3.4c0
				1.2.6 2.2 1.5 2.8v1.3h1.2v-1h1.4v1h1.2v-1.3c.9-.6 1.5-1.6 1.5-2.8A3.4 3.4 0 0012
				8.6zm-1.5 3a.9.9 0 110 1.8.9.9 0 010-1.8zm3 0a.9.9 0 110 1.8.9.9 0 010-1.8z"
		/>
	</svg>
{:else if name === 'speaker' || name === 'speakerOff'}
	<!--
		The cone is filled and the rest is stroked, which is the only way a speaker
		reads as a speaker at 24px: an outlined cone is a triangle, and a triangle
		next to a QR block is not obviously about sound. Two glyphs rather than one
		with a slash through it, because this is a control whose state has to be
		legible without a label beside it.
	-->
	<svg {...{ 'aria-hidden': 'true' }} width={size} height={size} viewBox="0 0 24 24" fill="none">
		<path d="M3.4 9h3.3L12 4.7v14.6L6.7 15H3.4z" fill={colour} />
		{#if name === 'speaker'}
			<path
				d="M15.6 9.4a3.9 3.9 0 010 5.2M18.4 7a7.4 7.4 0 010 10"
				stroke={colour}
				stroke-width={width}
				stroke-linecap="round"
			/>
		{:else}
			<path
				d="M15.8 9.8l4.8 4.4M20.6 9.8l-4.8 4.4"
				stroke={colour}
				stroke-width={width}
				stroke-linecap="round"
			/>
		{/if}
	</svg>
{:else if name === 'gear'}
	<!--
		Eight teeth and a hub. Generated rather than hand-drawn so the teeth are
		evenly spaced, and it needs a circle inside it, so it cannot live in the
		path table either.
	-->
	<svg
		{...{ 'aria-hidden': 'true' }}
		width={size}
		height={size}
		viewBox="0 0 24 24"
		fill="none"
		stroke={colour}
		stroke-width={width}
		stroke-linecap="round"
		stroke-linejoin="round"
	>
		<path
			d="M10.1 2.7L13.9 2.7L13.1 5.2L16 6.4L17.3 4.1L19.9 6.7L17.6 8L18.8 10.9L21.3 10.1L21.3
				13.9L18.8 13.1L17.6 16L19.9 17.3L17.3 19.9L16 17.6L13.1 18.8L13.9 21.3L10.1 21.3L10.9
				18.8L8 17.6L6.7 19.9L4.1 17.3L6.4 16L5.2 13.1L2.7 13.9L2.7 10.1L5.2 10.9L6.4 8L4.1
				6.7L6.7 4.1L8 6.4L10.9 5.2Z"
		/>
		<circle cx="12" cy="12" r="3.4" />
	</svg>
{:else if name === 'music'}
	<!-- Two notes on a beam. Needs circles, so it cannot live in the path table. -->
	<svg
		{...{ 'aria-hidden': 'true' }}
		width={size}
		height={size}
		viewBox="0 0 24 24"
		fill="none"
		stroke={colour}
		stroke-width={width}
		stroke-linecap="round"
		stroke-linejoin="round"
	>
		<path d="M9.7 16.4V5.5l9.4-1.9v10.9" />
		<circle cx="7" cy="16.8" r="2.7" />
		<circle cx="16.4" cy="14.5" r="2.7" />
	</svg>
{:else if name === 'qr'}
	<!-- Filled rather than stroked: at 24px the design's QR mark reads as blocks. -->
	<svg {...{ 'aria-hidden': 'true' }} width={size} height={size} viewBox="0 0 24 24" fill={colour}>
		<rect x="2" y="2" width="8" height="8" rx="2" />
		<rect x="14" y="2" width="8" height="8" rx="2" />
		<rect x="2" y="14" width="8" height="8" rx="2" />
		<rect x="14" y="14" width="3" height="3" />
		<rect x="19" y="14" width="3" height="3" />
		<rect x="14" y="19" width="3" height="3" />
		<rect x="19" y="19" width="3" height="3" />
	</svg>
{:else if name === 'question' || name === 'bang'}
	<!-- Typographic, not drawn: these sit inside the feed's little circles. -->
	<span
		aria-hidden="true"
		style:font-size="{Math.round(size * 0.55)}px"
		style:font-weight="700"
		style:color={colour}
		style:line-height="1">{name === 'question' ? '?' : '!'}</span
	>
{:else}
	<svg
		{...{ 'aria-hidden': 'true' }}
		width={size}
		height={size}
		viewBox="0 0 24 24"
		fill="none"
		stroke={colour}
		stroke-width={width}
		stroke-linecap="round"
		stroke-linejoin="round"
	>
		{#each STROKED[name] ?? [] as d (d)}
			<path {d} />
		{/each}
	</svg>
{/if}
