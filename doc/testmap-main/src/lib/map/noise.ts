/**
 * Deterministisches Value-Noise ohne Dependency.
 *
 * Alles hier ist eine reine Funktion von (x, y, seed) — kein interner Zustand, kein Math.random().
 * Das ist die Voraussetzung dafür, dass ein Kartenabschnitt beim Zurückkehren identisch aussieht.
 */

/** 32-bit-Integer-Hash. Math.imul, weil naive Multiplikation mit diesen Konstanten die Mantisse sprengt. */
function hash2(x: number, y: number, seed: number): number {
	let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 1442695041);
	h = Math.imul(h ^ (h >>> 13), 1274126177);
	h ^= h >>> 16;
	return (h >>> 0) / 4294967296;
}

/** Smoothstep — glättet die Interpolation, sonst sieht man das Gitter als Raute-Muster. */
function smooth(t: number): number {
	return t * t * (3 - 2 * t);
}

/** Value-Noise: bilineare Interpolation der vier Gitterecken um (x, y). */
export function valueNoise(x: number, y: number, seed: number): number {
	const x0 = Math.floor(x);
	const y0 = Math.floor(y);
	const fx = smooth(x - x0);
	const fy = smooth(y - y0);

	const n00 = hash2(x0, y0, seed);
	const n10 = hash2(x0 + 1, y0, seed);
	const n01 = hash2(x0, y0 + 1, seed);
	const n11 = hash2(x0 + 1, y0 + 1, seed);

	const top = n00 + (n10 - n00) * fx;
	const bottom = n01 + (n11 - n01) * fx;
	return top + (bottom - top) * fy;
}

/**
 * Fractional Brownian Motion: mehrere Oktaven mit doppelter Frequenz und halber Amplitude.
 * Erst das ergibt fransige Küsten — eine einzelne Oktave gibt nur weiche Blobs.
 * Rückgabe normalisiert auf 0..1.
 */
export function fbm(x: number, y: number, seed: number, octaves = 4): number {
	let value = 0;
	let amplitude = 1;
	let frequency = 1;
	let total = 0;

	for (let i = 0; i < octaves; i++) {
		// Seed pro Oktave variieren, sonst korrelieren die Oktaven an denselben Gitterpunkten.
		value += valueNoise(x * frequency, y * frequency, seed + i * 1013) * amplitude;
		total += amplitude;
		amplitude *= 0.5;
		frequency *= 2;
	}

	return value / total;
}

/** Weicher Übergang zwischen zwei Schwellen — für Farbverläufe und Kantenbreiten. */
export function smoothstep(edge0: number, edge1: number, x: number): number {
	const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
	return t * t * (3 - 2 * t);
}

/**
 * Ridge-Noise: 1 - |2n - 1|. Der Wert erreicht 1 genau dort, wo fbm den Wert 0.5 hat —
 * und diese Höhenlinie ist eine dünne, gewundene Kurve. Genau das brauchen Flussläufe.
 */
export function ridge(x: number, y: number, seed: number, octaves = 3): number {
	return 1 - Math.abs(fbm(x, y, seed, octaves) * 2 - 1);
}

/**
 * fbm mit Gitter-Cache — bit-identisch zu fbm(), aber für Rasterläufe gedacht.
 *
 * Der Gewinn kommt daher, dass die tiefen Oktaven sehr grobe Gitter haben: bei einer Frequenz
 * von 0.0011 pro Weltunit ist eine Zelle über 900 Texel breit, und die vier Ecken-Hashes werden
 * derzeit für jedes dieser Texel neu gerechnet. Der Cache behält die letzte Zelle je Oktave;
 * beim zeilenweisen Abtasten liegt die Trefferquote dadurch nahe 100 %.
 *
 * Pro Aufrufstelle eine eigene Instanz verwenden — zwei Aufrufstellen mit versetzten
 * Koordinaten würden sich sonst gegenseitig aus dem Cache werfen.
 */
export class Fbm {
	private readonly octaves: number;
	private readonly seeds: Int32Array;
	private readonly amp: Float64Array;
	private readonly freq: Float64Array;
	private readonly lx: Float64Array;
	private readonly ly: Float64Array;
	private readonly n00: Float64Array;
	private readonly n10: Float64Array;
	private readonly n01: Float64Array;
	private readonly n11: Float64Array;
	private readonly total: number;

	constructor(seed: number, octaves: number) {
		this.octaves = octaves;
		this.seeds = new Int32Array(octaves);
		this.amp = new Float64Array(octaves);
		this.freq = new Float64Array(octaves);
		this.lx = new Float64Array(octaves).fill(NaN);
		this.ly = new Float64Array(octaves).fill(NaN);
		this.n00 = new Float64Array(octaves);
		this.n10 = new Float64Array(octaves);
		this.n01 = new Float64Array(octaves);
		this.n11 = new Float64Array(octaves);

		let a = 1;
		let f = 1;
		let total = 0;
		for (let i = 0; i < octaves; i++) {
			this.seeds[i] = seed + i * 1013;
			this.amp[i] = a;
			this.freq[i] = f;
			total += a;
			a *= 0.5;
			f *= 2;
		}
		// Als Summe behalten und am Ende dividieren, nicht als Kehrwert multiplizieren:
		// sonst weicht das Ergebnis im letzten Bit von fbm() ab.
		this.total = total;
	}

	at(x: number, y: number): number {
		let value = 0;
		for (let i = 0; i < this.octaves; i++) {
			const fx = x * this.freq[i];
			const fy = y * this.freq[i];
			const x0 = Math.floor(fx);
			const y0 = Math.floor(fy);

			if (x0 !== this.lx[i] || y0 !== this.ly[i]) {
				this.lx[i] = x0;
				this.ly[i] = y0;
				const s = this.seeds[i];
				this.n00[i] = hash2(x0, y0, s);
				this.n10[i] = hash2(x0 + 1, y0, s);
				this.n01[i] = hash2(x0, y0 + 1, s);
				this.n11[i] = hash2(x0 + 1, y0 + 1, s);
			}

			const tx = smooth(fx - x0);
			const ty = smooth(fy - y0);
			const top = this.n00[i] + (this.n10[i] - this.n00[i]) * tx;
			const bottom = this.n01[i] + (this.n11[i] - this.n01[i]) * tx;
			value += (top + (bottom - top) * ty) * this.amp[i];
		}
		return value / this.total;
	}
}

/** Ridge-Noise auf Basis von Fbm — gleiche Cache-Regeln. */
export class RidgeNoise {
	private readonly f: Fbm;

	constructor(seed: number, octaves: number) {
		this.f = new Fbm(seed, octaves);
	}

	at(x: number, y: number): number {
		return 1 - Math.abs(this.f.at(x, y) * 2 - 1);
	}
}
