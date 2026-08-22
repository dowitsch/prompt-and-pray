/**
 * Untergrundtexturen für die Karte.
 *
 * Die Dateien liegen in src/lib/assets/textures und werden von Vite gebündelt (gehasht, mit
 * Cache-Headern) — deshalb ein Glob statt eines festen Pfads unter static/. Ein Glob und nicht
 * einzelne Imports, damit eine neu abgelegte Datei ohne Codeänderung mitgenommen wird und ein
 * fehlender Name den Build nicht bricht.
 *
 * Der Renderer bleibt ohne Texturen lauffähig: fehlt eine, färbt terrain.ts die Fläche weiter mit
 * dem Farbwert des Bioms.
 */

export type SurfaceId =
	| 'gras'
	| 'wald'
	| 'sand'
	| 'fels'
	| 'schnee'
	| 'schneeberge'
	| 'wasser'
	| 'meer'
	| 'pergament'
	| 'papierkorn';

export const SURFACE_IDS: SurfaceId[] = [
	'gras',
	'wald',
	'sand',
	'fels',
	'schnee',
	'schneeberge',
	'wasser',
	'meer',
	'pergament',
	'papierkorn'
];

export type Surface = {
	data: Uint8ClampedArray;
	w: number;
	h: number;
	/**
	 * Gespiegelt kacheln statt einfach wiederholen.
	 *
	 * Wird beim Laden automatisch gesetzt, wenn gegenüberliegende Ränder nicht zusammenpassen.
	 * Gespiegeltes Kacheln ist immer nahtlos — der Preis ist eine Spiegelachse, die bei 1024er
	 * Texturen aber knapp zwei Abschnitte auseinander liegt und damit selten im Bild ist.
	 */
	mirror: boolean;
	/** Mittlere Helligkeit, für die Verwendung als Modulation statt als Farbe. */
	mean: number;
};

export type SurfaceSet = Partial<Record<SurfaceId, Surface>>;

/** Mittlerer Kanalabstand gegenüberliegender Ränder, 0..255. */
function edgeMismatch(data: Uint8ClampedArray, w: number, h: number): number {
	let sum = 0;
	for (let y = 0; y < h; y++) {
		const l = (y * w) * 4;
		const r = (y * w + w - 1) * 4;
		sum += Math.abs(data[l] - data[r]) + Math.abs(data[l + 1] - data[r + 1]) + Math.abs(data[l + 2] - data[r + 2]);
	}
	for (let x = 0; x < w; x++) {
		const t = x * 4;
		const b = ((h - 1) * w + x) * 4;
		sum += Math.abs(data[t] - data[b]) + Math.abs(data[t + 1] - data[b + 1]) + Math.abs(data[t + 2] - data[b + 2]);
	}
	return sum / ((w + h) * 3);
}

/**
 * Verkleinerungsfaktor beim Laden.
 *
 * Die Abtastung bleibt 1 Texturpixel = 1 Kartentexel; kleiner erscheint die Textur also nur,
 * wenn das Bild selbst kleiner wird. Der Umweg ist Absicht: würde man stattdessen jeden n-ten
 * Pixel lesen, entstünde Aliasing — bei feinen Pinselstrichen als Moiré sichtbar. Das
 * Flächenmittel hier filtert vorher korrekt.
 *
 * 1 heißt: gar nicht verkleinern. Jeder Wert darüber wirft Detail weg — bei 2 ist die Hälfte der
 * Auflösung fort, bevor überhaupt gerendert wird, und die Texturen wirken sichtbar verwaschen.
 *
 * Der Faktor ist der Regler für einen echten Zielkonflikt. Ein Texturpixel fällt auf genau ein
 * Kartentexel, also gilt: Kachelgröße = Texturbreite / TEXEL_PER_UNIT. Bei 1254 Pixeln und
 * 2 Texeln je Weltunit deckt eine Kachel 627 Weltunits ab, das sind 0.7 Kacheln je Bildbreite.
 * Ein kleineres Muster bei gleicher Schärfe geht nur über eine feinere Karte (TEXEL_PER_UNIT),
 * und die kostet quadratisch Rechenzeit.
 */
export const SURFACE_REDUCE = 2;

/** Ab diesem Randabstand gilt eine Textur als nicht kachelbar. */
const MISMATCH_LIMIT = 18;

/**
 * Verkleinert per Flächenmittel. Liest über den Rand hinaus umlaufend, damit das Ergebnis
 * exakt weiterkachelt, auch wenn die Kantenlänge nicht durch den Faktor teilbar ist.
 */
export function reduceSurface(
	data: Uint8ClampedArray,
	w: number,
	h: number,
	factor: number
): { data: Uint8ClampedArray; w: number; h: number } {
	if (factor <= 1) return { data, w, h };
	const nw = Math.max(1, Math.round(w / factor));
	const nh = Math.max(1, Math.round(h / factor));
	const out = new Uint8ClampedArray(nw * nh * 4);
	const stepX = w / nw;
	const stepY = h / nh;

	for (let y = 0; y < nh; y++) {
		const y0 = Math.floor(y * stepY);
		const y1 = Math.max(y0 + 1, Math.floor((y + 1) * stepY));
		for (let x = 0; x < nw; x++) {
			const x0 = Math.floor(x * stepX);
			const x1 = Math.max(x0 + 1, Math.floor((x + 1) * stepX));
			let r = 0;
			let g = 0;
			let b = 0;
			let a = 0;
			let n = 0;
			for (let yy = y0; yy < y1; yy++) {
				const ry = ((yy % h) + h) % h;
				for (let xx = x0; xx < x1; xx++) {
					const i = (ry * w + (((xx % w) + w) % w)) * 4;
					r += data[i];
					g += data[i + 1];
					b += data[i + 2];
					a += data[i + 3];
					n++;
				}
			}
			const o = (y * nw + x) * 4;
			out[o] = r / n;
			out[o + 1] = g / n;
			out[o + 2] = b / n;
			out[o + 3] = a / n;
		}
	}
	return { data: out, w: nw, h: nh };
}

export function analyseSurface(data: Uint8ClampedArray, w: number, h: number): Surface {
	let sum = 0;
	for (let i = 0; i < data.length; i += 4) sum += (data[i] + data[i + 1] + data[i + 2]) / 3;
	return {
		data,
		w,
		h,
		mirror: edgeMismatch(data, w, h) > MISMATCH_LIMIT,
		mean: sum / (data.length / 4)
	};
}

/**
 * Ein Texel der Textur, in *Textur*-Koordinaten. Die Abbildung 1 Texturpixel = 1 Kartentexel
 * macht jede Interpolation überflüssig, deshalb wird hier nur gerundet.
 */
export function sampleSurface(s: Surface, u: number, v: number, into: [number, number, number]) {
	let x = Math.floor(u);
	let y = Math.floor(v);
	if (s.mirror) {
		const w2 = s.w * 2;
		const h2 = s.h * 2;
		x = ((x % w2) + w2) % w2;
		y = ((y % h2) + h2) % h2;
		if (x >= s.w) x = w2 - 1 - x;
		if (y >= s.h) y = h2 - 1 - y;
	} else {
		x = ((x % s.w) + s.w) % s.w;
		y = ((y % s.h) + s.h) % s.h;
	}
	const i = (y * s.w + x) * 4;
	into[0] = s.data[i];
	into[1] = s.data[i + 1];
	into[2] = s.data[i + 2];
}

/** Helligkeit relativ zum Mittelwert — als Modulation über einer vorgegebenen Farbe. */
export function sampleLuma(s: Surface, u: number, v: number, scratch: [number, number, number]): number {
	sampleSurface(s, u, v, scratch);
	return (scratch[0] + scratch[1] + scratch[2]) / 3 / s.mean;
}

/**
 * Dateiname (klein, ohne Endung) -> Rolle. Mehrere Namen dürfen auf dieselbe Rolle zeigen,
 * damit die Benennung der Lieferung nicht vorgeschrieben ist.
 */
const ALIASES: Record<string, SurfaceId> = {
	gras: 'gras',
	grass: 'gras',
	wiese: 'gras',
	wald: 'wald',
	sand: 'sand',
	wueste: 'sand',
	'wüste': 'sand',
	fels: 'fels',
	berge: 'fels',
	gebirge: 'fels',
	schnee: 'schnee',
	schneeberge: 'schneeberge',
	schneeberg: 'schneeberge',
	gipfel: 'schneeberge',
	wasser: 'wasser',
	meer: 'meer',
	pergament: 'pergament',
	papier: 'pergament',
	papierkorn: 'papierkorn',
	korn: 'papierkorn'
};

const FILES = import.meta.glob('../assets/textures/*.{png,jpg,jpeg,webp}', {
	eager: true,
	query: '?url',
	import: 'default'
}) as Record<string, string>;

function roleOf(path: string): SurfaceId | undefined {
	const base = path.split('/').pop()!.replace(/\.[^.]+$/, '').toLowerCase();
	return ALIASES[base];
}

async function load(url: string): Promise<Surface | null> {
	try {
		const res = await fetch(url);
		if (!res.ok) return null;
		const bitmap = await createImageBitmap(await res.blob());
		const canvas = document.createElement('canvas');
		canvas.width = bitmap.width;
		canvas.height = bitmap.height;
		const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
		ctx.drawImage(bitmap, 0, 0);
		bitmap.close();
		const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
		const small = reduceSurface(img.data, img.width, img.height, SURFACE_REDUCE);
		return analyseSurface(small.data, small.w, small.h);
	} catch {
		return null;
	}
}

/** Lädt alles, was im Texturordner liegt und einer Rolle zugeordnet werden kann. */
export async function loadSurfaces(): Promise<SurfaceSet> {
	const set: SurfaceSet = {};
	await Promise.all(
		Object.entries(FILES).map(async ([path, url]) => {
			const role = roleOf(path);
			if (!role) return;
			const surface = await load(url);
			if (surface) set[role] = surface;
		})
	);
	return set;
}
