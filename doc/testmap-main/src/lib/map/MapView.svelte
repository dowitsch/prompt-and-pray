<script lang="ts">
	import type { Application, Container, Sprite } from 'pixi.js';
	import { BIOME_LABEL, type BiomeId } from './biomes';
	import { loadSurfaces } from './textures';
	import {
		POI_ICON,
		POI_LABEL,
		SECTION_H,
		SECTION_W,
		TEX_H,
		TEX_W,
		WISH_LABEL,
		World,
		type PoiKind,
		type Wish
	} from './terrain';

	let { seed = 1337 }: { seed?: number } = $props();

	const SLIDE_MS = 320;
	const WISHES: Wish[] = ['wiese', 'wald', 'wueste', 'seenland', 'schnee', 'berge', 'fluss', 'see'];
	const LEGEND: PoiKind[] = ['burg', 'furt', 'wald', 'hafen', 'gipfel', 'boot'];
	/** Icon-Durchmesser in Bildschirmpixeln — bleibt konstant, unabhängig von der Skalierung. */
	const PIN_R = 15;

	let host: HTMLDivElement;

	// Von Pixi verwaltete Werte — absichtlich NICHT $state: würde der $effect sie lesen,
	// würde jede Kamerabewegung den Effect neu ausführen und die App neu aufbauen.
	let PIXI: typeof import('pixi.js') | undefined;
	let app: Application | undefined;
	let board: Container | undefined;
	let terra: World | undefined;
	let sections = new Map<string, Container>();
	let stale = new Set<string>();
	let queue: Array<[number, number]> = [];
	/**
	 * Frames Pause zwischen zwei vorgeladenen Abschnitten.
	 *
	 * Ein Abschnitt kostet rund 100 ms. Vier Nachbarn Frame für Frame zu bauen wäre eine knappe
	 * halbe Sekunde am Stück; verteilt bleiben es dieselben vier Aussetzer, aber mit glatten
	 * Frames dazwischen, und das liest sich deutlich ruhiger.
	 */
	const PREFETCH_GAP = 4;
	let cooldown = 0;
	let curX = 0;
	let curY = 0;
	let scale = 1;
	let slide: { fromX: number; fromY: number; toX: number; toY: number; elapsed: number } | null = null;

	// Spiegel für die UI.
	let animating = $state(false);
	let coords = $state({ x: 0, y: 0 });
	let biome = $state<BiomeId>('wiese');
	let wish = $state<Wish | null>(null);

	function key(sx: number, sy: number) {
		return `${sx},${sy}`;
	}

	/**
	 * Ein Wegpunkt: Kreis mit Rand plus Emoji.
	 *
	 * Der Kreis ist nicht nur Zierde — fehlt auf dem System eine Emoji-Schrift, bleibt der Pin
	 * als Markierung sichtbar. Die Größe wird in layout() gegenskaliert, damit Icons unabhängig
	 * von der Zoomstufe gleich groß bleiben.
	 */
	function buildPin(kind: PoiKind, x: number, y: number): Container {
		const pin = new PIXI!.Container();
		pin.position.set(x, y);
		pin.eventMode = 'none';

		const disc = new PIXI!.Graphics()
			.circle(0, 0, PIN_R)
			.fill({ color: 0xf6efdd, alpha: 0.94 })
			.circle(0, 0, PIN_R)
			.stroke({ color: 0x28363f, width: 2 });
		pin.addChild(disc);

		const label = new PIXI!.Text({
			text: POI_ICON[kind],
			style: { fontSize: PIN_R * 1.35, fill: 0x28363f }
		});
		label.anchor.set(0.5);
		pin.addChild(label);

		return pin;
	}

	/** Ein Abschnitt: Geländetextur plus seine Wegpunkte. */
	function build(sx: number, sy: number): Container {
		const canvas = document.createElement('canvas');
		canvas.width = TEX_W;
		canvas.height = TEX_H;
		const ctx = canvas.getContext('2d')!;
		ctx.putImageData(new ImageData(terra!.render(sx, sy), TEX_W, TEX_H), 0, 0);

		const texture = PIXI!.Texture.from(canvas);
		// Lineare Filterung: die Textur wird weich hochskaliert statt kachelig.
		texture.source.scaleMode = 'linear';

		const sprite: Sprite = new PIXI!.Sprite(texture);
		sprite.setSize(SECTION_W, SECTION_H);

		const section = new PIXI!.Container();
		section.position.set(sx * SECTION_W, sy * SECTION_H);
		section.addChild(sprite);

		// Wegpunkte liegen in Weltkoordinaten, deshalb relativ zum Abschnittsursprung.
		for (const poi of terra!.poisAt(sx, sy)) {
			section.addChild(buildPin(poi.kind, poi.x - sx * SECTION_W, poi.y - sy * SECTION_H));
		}

		applyPinScale(section);
		return section;
	}

	/** Icons gegen die Board-Skalierung ausgleichen, damit sie konstant groß bleiben. */
	function applyPinScale(section: Container) {
		const inv = 1 / scale;
		// Kind 0 ist die Geländetextur, alles danach sind Pins.
		for (let i = 1; i < section.children.length; i++) section.children[i].scale.set(inv);
	}

	function drop(k: string) {
		const section = sections.get(k);
		if (!section) return;
		section.destroy({ children: true, texture: true, textureSource: true });
		sections.delete(k);
		stale.delete(k);
	}

	/** Baut den Abschnitt, falls er fehlt oder veraltet ist. */
	function ensure(sx: number, sy: number) {
		if (!board || !PIXI || !terra) return;
		const k = key(sx, sy);
		if (sections.has(k) && !stale.has(k)) return;
		drop(k);
		const section = build(sx, sy);
		sections.set(k, section);
		board.addChild(section);
	}

	function around(sx: number, sy: number): Array<[number, number]> {
		return [
			[sx, sy],
			[sx + 1, sy],
			[sx - 1, sy],
			[sx, sy + 1],
			[sx, sy - 1]
		];
	}

	/**
	 * Nachbarn einen pro Frame bauen — alle vier auf einmal wären rund 300 ms Blockade.
	 * Wer schneller klickt als der Prefetch, bekommt in move() die Notbremse.
	 */
	function refill() {
		const keep = new Set(around(curX, curY).map(([x, y]) => key(x, y)));
		for (const k of [...sections.keys()]) if (!keep.has(k)) drop(k);
		cooldown = 0;
		queue = around(curX, curY).filter(([x, y]) => {
			const k = key(x, y);
			return !sections.has(k) || stale.has(k);
		});
	}

	/**
	 * Ein Wunsch verändert nicht nur seinen Abschnitt: die Biom-Parameter blenden einen
	 * Abschnitt weit über die Grenze. Also muss der 3x3-Block neu gezeichnet werden.
	 */
	function invalidate(sx: number, sy: number) {
		for (let dy = -1; dy <= 1; dy++)
			for (let dx = -1; dx <= 1; dx++) {
				const k = key(sx + dx, sy + dy);
				if (sections.has(k)) stale.add(k);
			}
	}

	export function move(dx: number, dy: number) {
		if (!app || !board || !terra || animating) return;

		const tx = curX + dx;
		const ty = curY + dy;

		if (wish) {
			terra.setWish(tx, ty, wish);
			invalidate(tx, ty);
			wish = null;
		}

		curX = tx;
		curY = ty;
		coords = { x: tx, y: ty };
		biome = terra.biomeAt(tx, ty);

		ensure(tx, ty); // Notbremse: das Ziel muss stehen, bevor die Kamera losfährt.
		refill();

		const target = cameraTarget();
		slide = {
			fromX: board.position.x,
			fromY: board.position.y,
			toX: target.x,
			toY: target.y,
			elapsed: 0
		};
		animating = true;
	}

	/** Wo muss der board-Container stehen, damit Abschnitt (curX, curY) zentriert liegt? */
	function cameraTarget() {
		if (!app) return { x: 0, y: 0 };
		return {
			x: -curX * SECTION_W * scale + (app.screen.width - SECTION_W * scale) / 2,
			y: -curY * SECTION_H * scale + (app.screen.height - SECTION_H * scale) / 2
		};
	}

	/** Skalierung neu berechnen, sodass genau ein Abschnitt in den Viewport passt. */
	function layout() {
		if (!app || !board) return;
		scale = Math.min(app.screen.width / SECTION_W, app.screen.height / SECTION_H);
		board.scale.set(scale);
		for (const section of sections.values()) applyPinScale(section);
		const target = cameraTarget();
		// Beim Resize hart setzen; eine laufende Animation würde sonst am alten Ziel hängen.
		board.position.set(Math.round(target.x), Math.round(target.y));
		if (slide) {
			slide.fromX = slide.toX = target.x;
			slide.fromY = slide.toY = target.y;
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		const deltas: Record<string, [number, number]> = {
			ArrowLeft: [-1, 0],
			ArrowRight: [1, 0],
			ArrowUp: [0, -1],
			ArrowDown: [0, 1]
		};
		const delta = deltas[event.key];
		if (!delta) return;
		event.preventDefault();
		move(delta[0], delta[1]);
	}

	$effect(() => {
		// Dynamischer Import hält Pixi aus dem SSR-Bundle heraus.
		let disposed = false;
		let observer: ResizeObserver | undefined;

		(async () => {
			// Untergrundtexturen zuerst: der erste Abschnitt wird gleich gerendert, und ein
			// Nachladen würde ihn nicht neu zeichnen. Fehlende Dateien sind in Ordnung —
			// loadSurfaces überspringt sie und terrain.ts fällt auf die Farbwerte zurück.
			const surfaces = await loadSurfaces();

			// `seed` hier gelesen: macht ihn zur Abhängigkeit dieses Effects, sodass ein
			// Seed-Wechsel die Welt samt Texturen korrekt neu aufbaut.
			terra = new World(seed, surfaces);
			curX = 0;
			curY = 0;
			coords = { x: 0, y: 0 };
			biome = terra.biomeAt(0, 0);

			PIXI = await import('pixi.js');

			const instance = new PIXI.Application();
			await instance.init({ resizeTo: host, background: '#2a6a92', antialias: true });

			// Während des await kann die Komponente längst zerstört worden sein.
			if (disposed) {
				instance.destroy(true, { children: true });
				return;
			}

			app = instance;
			host.appendChild(app.canvas);

			board = new PIXI.Container();
			app.stage.addChild(board);

			layout(); // vor ensure: build() braucht scale für die Icon-Gegenskalierung
			ensure(0, 0);
			refill();
			layout();

			observer = new ResizeObserver(() => layout());
			observer.observe(host);

			app.ticker.add((ticker) => {
				if (!board) return;

				if (slide) {
					slide.elapsed += ticker.deltaMS;
					const p = Math.min(1, slide.elapsed / SLIDE_MS);
					const eased = 1 - Math.pow(1 - p, 3); // ease-out cubic
					// Auf ganze Pixel runden: sonst zeigt sich zwischen zwei Abschnitten
					// bei krummen Subpixel-Positionen eine Haarlinie.
					board.position.set(
						Math.round(slide.fromX + (slide.toX - slide.fromX) * eased),
						Math.round(slide.fromY + (slide.toY - slide.fromY) * eased)
					);
					if (p >= 1) {
						slide = null;
						animating = false;
					}
				} else if (queue.length > 0) {
					// Nur wenn die Kamera steht — ein Ruckler mitten im Slide wäre sichtbar.
					if (cooldown > 0) {
						cooldown--;
					} else {
						const next = queue.shift()!;
						ensure(next[0], next[1]);
						cooldown = PREFETCH_GAP;
					}
				}
			});
		})();

		return () => {
			disposed = true;
			observer?.disconnect();
			sections.clear();
			stale.clear();
			queue = [];
			app?.destroy(true, { children: true });
			app = undefined;
			board = undefined;
			terra = undefined;
			slide = null;
		};
	});
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="map">
	<div bind:this={host} class="canvas-host"></div>

	<button class="peil up" disabled={animating} onclick={() => move(0, -1)} aria-label="Nach oben">▲</button>
	<button class="peil down" disabled={animating} onclick={() => move(0, 1)} aria-label="Nach unten">▼</button>
	<button class="peil left" disabled={animating} onclick={() => move(-1, 0)} aria-label="Nach links">◀</button>
	<button class="peil right" disabled={animating} onclick={() => move(1, 0)} aria-label="Nach rechts">▶</button>

	<div class="badge">{coords.x} / {coords.y} · {BIOME_LABEL[biome]}</div>
</div>

<div class="wishes">
	<span class="hint">
		{#if wish}
			Nächster Abschnitt: <strong>{WISH_LABEL[wish]}</strong> — jetzt eine Richtung wählen
		{:else}
			Nächster Abschnitt: was soll dort sein?
		{/if}
	</span>
	<div class="chips">
		{#each WISHES as w (w)}
			<button class="chip" class:active={wish === w} onclick={() => (wish = wish === w ? null : w)}>
				{WISH_LABEL[w]}
			</button>
		{/each}
	</div>
</div>

<p class="legend">
	{#each LEGEND as kind (kind)}
		<span>{POI_ICON[kind]} {POI_LABEL[kind]}</span>
	{/each}
</p>

<style>
	.map {
		position: relative;
		width: 100%;
		aspect-ratio: 12 / 7;
		max-height: 78vh;
		overflow: hidden;
		border-radius: 10px;
		background: #2a6a92;
	}

	.canvas-host {
		position: absolute;
		inset: 0;
	}

	.canvas-host :global(canvas) {
		display: block;
	}

	.peil {
		position: absolute;
		display: grid;
		place-items: center;
		width: 44px;
		height: 44px;
		border: 1px solid rgba(255, 255, 255, 0.35);
		border-radius: 8px;
		background: rgba(16, 30, 40, 0.5);
		color: #fff;
		font-size: 1rem;
		cursor: pointer;
		backdrop-filter: blur(4px);
	}

	.peil:hover:not(:disabled) {
		background: rgba(16, 30, 40, 0.82);
		border-color: rgba(255, 255, 255, 0.7);
	}

	.peil:disabled {
		opacity: 0.35;
		cursor: default;
	}

	.up {
		top: 8px;
		left: 50%;
		translate: -50% 0;
	}

	.down {
		bottom: 8px;
		left: 50%;
		translate: -50% 0;
	}

	.left {
		left: 8px;
		top: 50%;
		translate: 0 -50%;
	}

	.right {
		right: 8px;
		top: 50%;
		translate: 0 -50%;
	}

	.badge {
		position: absolute;
		top: 8px;
		left: 8px;
		padding: 3px 9px;
		border-radius: 6px;
		background: rgba(16, 30, 40, 0.5);
		color: #fff;
		font: 12px/1.6 ui-monospace, monospace;
		backdrop-filter: blur(4px);
	}

	.wishes {
		margin-top: 12px;
	}

	.hint {
		display: block;
		margin-bottom: 6px;
		font-size: 0.85rem;
		opacity: 0.75;
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}

	.chip {
		padding: 5px 11px;
		border: 1px solid currentColor;
		border-radius: 999px;
		background: transparent;
		color: inherit;
		font: inherit;
		font-size: 0.85rem;
		cursor: pointer;
		opacity: 0.6;
	}

	.chip:hover {
		opacity: 1;
	}

	.chip.active {
		background: currentColor;
		color: #2f7d4f;
		opacity: 1;
	}

	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 16px;
		margin-top: 14px;
		font-size: 0.8rem;
		opacity: 0.7;
	}
</style>
