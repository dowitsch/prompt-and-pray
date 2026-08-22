import { Fbm, RidgeNoise, smoothstep } from './noise';
// Surface heißt hier schon die Oberflächen-Maske, deshalb umbenannt importiert.
import {
	sampleLuma,
	sampleSurface,
	type Surface as SurfaceTexture,
	type SurfaceSet
} from './textures';
import {
	BIOMES,
	blendFraction,
	blendIndex,
	defaultBiome,
	type BiomeId,
	type Params,
	type RGB
} from './biomes';

/**
 * Abschnittsgröße in Weltunits — fix, damit ein Resize die Karte nicht verändert.
 * Klein genug, dass man nah am Gelände ist: ein Abschnitt füllt immer genau den Viewport.
 */
/**
 * Section size in world units.
 *
 * Square, and smaller than the spike's 432x252. The spike sized a section to
 * exactly fill its landscape viewport, because its camera moved a whole section
 * at a time. This camera follows a walker continuously across a portrait phone,
 * so a section is no longer a unit of framing — only of how finely the ground is
 * diced for streaming. Square keeps the arithmetic honest in both directions,
 * and 192 keeps one section at 384x384 texels, around 35ms to generate.
 *
 * World scale is untouched by this: every noise frequency below is per world
 * unit, so terrain features stay exactly the size they were.
 */
export const SECTION_W = 192;
export const SECTION_H = 192;

/**
 * Texel je Weltunit.
 *
 * Bestimmt zwei Dinge zugleich: die Schärfe der Karte und wie klein ein Texturmuster sein kann,
 * ohne unscharf zu werden. Eine Texturkachel belegt ganze Kartentexel — bei zu grober Karte
 * müsste man die Textur verkleinern, um das Muster zu verkleinern, und verliert dabei Detail.
 * Deshalb hier hoch angesetzt; der teure Höhenfeld-Pass zahlt das nicht mit, weil FIELD_STEP in
 * Texeln zählt und mitwächst.
 */
export const TEXEL_PER_UNIT = 2;
export const TEX_W = Math.round(SECTION_W * TEXEL_PER_UNIT);
export const TEX_H = Math.round(SECTION_H * TEXEL_PER_UNIT);

/**
 * Das Höhenfeld wird nur jedes FIELD_STEP-te Texel berechnet und dazwischen interpoliert.
 *
 * Begründung: es kostet 15 der 25 Rauschoktaven pro Texel, ist aber durchweg niederfrequent —
 * Küstenlinien und Seeformen ändern sich über viele Texel hinweg. Die hochfrequente Schicht
 * (Grassprenkel, Baumkronen, Flussläufe) bleibt voll aufgelöst, und genau die bestimmt, ob
 * das Bild scharf wirkt. FIELD_STEP wächst mit TEXEL_PER_UNIT mit, damit die Weltauflösung des
 * Feldes gleich bleibt und eine feinere Karte den teuren Pass nicht teurer macht.
 */
const FIELD_STEP = 4;

/**
 * Texelschritt des Ridge-Gitters für die Flüsse. Feiner als FIELD_STEP, weil Flussläufe dünn
 * sind; bei 2 Texeln je Stützstelle liegt die Weltauflösung dort, wo sie vor der Erhöhung von
 * TEXEL_PER_UNIT ohnehin war.
 */
const RIVER_STEP = 2;
const RW = Math.ceil(TEX_W / RIVER_STEP) + 3;
const RH = Math.ceil(TEX_H / RIVER_STEP) + 3;
const FW = Math.ceil(TEX_W / FIELD_STEP) + 3; // +3: ein Knoten links, zwei rechts für die Interpolation
const FH = Math.ceil(TEX_H / FIELD_STEP) + 3;

// --- Feldparameter (Frequenzen pro Weltunit) ---
const CONT_SCALE = 0.0011;
const ELEV_SCALE = 0.0055;
const WARP_STRENGTH = 1.6;
const LAKE_SCALE = 0.0062;
const RIVER_SCALE_A = 0.0053;
const RIVER_SCALE_B = 0.0089;

const ELEV_CONTRAST = 1.85;
const BASIN_T = 0.34;
const BASIN_DEPTH = 0.085;
const OCEAN_CONT = 0.28;
const RIVER_BASE = 0.0225;

// --- Zeichenstil: Feder und Tusche auf Pergament ---
/** Grundfläche, wenn für ein Biom weder Textur noch pergament.png vorliegt. */
const PAPER: RGB = [239, 227, 199];
/** Anteil Biomfarbe über der Wassertextur. */
const WATER_TINT = 0.22;

/**
 * Höhe über Wasser, in der die Biomtextur in die Hochlandtextur übergeht.
 *
 * Gemessen, nicht geschätzt: die Höhe auf Land liegt im Median bei 0.20, p90 bei 0.40. Mit dem
 * früheren Übergang bei 0..0.26 war 70 % des Landes Fels — bei kaum unterscheidbaren Lasuren fiel
 * das nicht auf, bei zwei echten Texturen entscheidet diese Schwelle das ganze Bild.
 * 0.28..0.46 lässt Fels auf rund 13 % des Landes, also auf Gebirgszüge.
 */
const HIGHLAND_FROM = 0.26;
const HIGHLAND_TO = 0.34;
/**
 * Und darüber das Gipfelband.
 *
 * Die Obergrenze ist gemessen, nicht gewählt: mit 0.52 lag sie über der Höhe, die Wiesen
 * überhaupt erreichen (max 0.470), und es entstand nur ein Teilanteil Schnee, nie voller. Bei
 * 0.46 tragen die höchsten Punkte jedes Bioms eine echte weiße Kappe — im Gebirge rund 9 % der
 * Fläche, in der Wiese unter einem Prozent.
 */
const PEAK_FROM = 0.38;
const PEAK_TO = 0.46;

/**
 * Radius des Nachbarblocks, den Blend.at abtasten darf, in Abschnitten.
 *
 * Die Überblendung selbst reicht nur einen halben Abschnitt weit, ein Radius von 1 würde also
 * für den Farbpass genügen. Der Vorlauf der Symbolzellen tastet aber Zellmittelpunkte des
 * *gedrehten* Gitters ab, und dessen Hülle liegt bis zu 0,61 Abschnitte außerhalb — mit Radius 1
 * greift Blend.at dort ins Leere und liest undefined. Radius 2 trägt bis 1,5 Abschnitte.
 */
const GRID_R = 2;
const GRID_N = GRID_R * 2 + 1;

/** How many sections' parameters to keep. A 3x3 ring plus room to wander. */
const PARAM_CACHE_MAX = 512;

/**
 * Flächenanteile eines Abschnitts, in Texeln.
 *
 * `peak` zählt, wo die Gipfeltextur überwiegt. Das ist der belastbare Weg, die Schneemenge zu
 * messen — die naheliegende Alternative, im gerenderten Bild helle Texel zu zählen, hat in diesem
 * Projekt schon zweimal falsche Ergebnisse geliefert (Schnee-Hochland zählte als Wasser,
 * Wüstenflüsse als Land), und mit einer Gipfeltextur von mittlerer Helligkeit würde sie erneut
 * versagen.
 */
export type Stats = { ocean: number; lake: number; river: number; peak: number; land: number };

/**
 * Was der Renderer an einem Texel entschieden hat. Über den optionalen mask-Parameter von
 * render() abrufbar — Grundlage dafür, Wegpunkt-Regeln gegen das tatsächlich gezeichnete
 * Bild zu prüfen statt gegen die Platzierungslogik selbst.
 */
export const Surface = { Ocean: 0, Lake: 1, River: 2, Dry: 3 } as const;

/**
 * Ein Satz Rauschgeneratoren mit Gitter-Cache.
 *
 * Je Aufrufstelle eine eigene Instanz — warpX und warpY teilen zwar den Seed, tasten das Feld
 * aber an versetzten Koordinaten ab und würden sich sonst gegenseitig aus dem Cache werfen.
 */
class Fields {
	readonly cont: Fbm;
	readonly warpX: Fbm;
	readonly warpY: Fbm;
	readonly detail: Fbm;
	readonly basin: Fbm;
	readonly canopy: Fbm;
	readonly riverA: RidgeNoise;
	readonly riverB: RidgeNoise;

	constructor(seed: number) {
		this.cont = new Fbm(seed + 101, 4);
		this.warpX = new Fbm(seed + 7717, 2);
		this.warpY = new Fbm(seed + 9131, 2);
		this.detail = new Fbm(seed, 5);
		this.basin = new Fbm(seed + 888, 2);
		this.canopy = new Fbm(seed + 707, 2);
		this.riverA = new RidgeNoise(seed + 555, 3);
		this.riverB = new RidgeNoise(seed + 911, 2);
	}
}

// --- Feldformeln: einzige Quelle für Darstellung *und* Wegpunkt-Platzierung ---

function contAt(F: Fields, x: number, y: number): number {
	return F.cont.at(x * CONT_SCALE, y * CONT_SCALE);
}

/** Höhe minus lokalem Wasserstand. Negativ = Wasser. */
function signedAt(
	F: Fields,
	x: number,
	y: number,
	cont: number,
	waterLevel: number,
	lakeAmount: number
): number {
	const nx = x * ELEV_SCALE;
	const ny = y * ELEV_SCALE;
	// Domain Warping: Buchten und Halbinseln statt runder Blobs.
	const ux = nx + (F.warpX.at(nx + 5.2, ny + 1.3) - 0.5) * WARP_STRENGTH;
	const uy = ny + (F.warpY.at(nx + 8.3, ny + 2.8) - 0.5) * WARP_STRENGTH;
	const detail = F.detail.at(ux, uy);

	// Spreizen: die Mittelung zweier fbm-Felder verengt den Bereich sonst auf ~0.35..0.66.
	let e = 0.5 + (cont * 0.46 + detail * 0.54 - 0.5) * ELEV_CONTRAST;

	// Seenbecken als echte Senke, damit Flüsse hineinlaufen.
	const basinField = F.basin.at(x * LAKE_SCALE, y * LAKE_SCALE);
	e -= smoothstep(BASIN_T, BASIN_T - 0.1, basinField) * BASIN_DEPTH * lakeAmount;

	return e - waterLevel;
}

/**
 * Das Ridge-Feld der Flüsse: zwei Felder per max() -> verzweigtes Netz.
 *
 * Der teure Teil (fünf Rauschoktaven). Getrennt von der Schwelle, weil er auf einem gröberen
 * Gitter berechnet und interpoliert wird — das Feld ist glatt, die *Schwelle* darauf muss
 * scharf bleiben, damit Flussränder nicht verwaschen.
 */
function ridgeAt(F: Fields, x: number, y: number): number {
	const ra = F.riverA.at(x * RIVER_SCALE_A, y * RIVER_SCALE_A);
	const rb = F.riverB.at(x * RIVER_SCALE_B, y * RIVER_SCALE_B);
	return ra > rb ? ra : rb;
}

/** 0 = kein Fluss, 1 = Flussmitte. Billig, aus einem vorliegenden Ridge-Wert. */
function riverFrom(ridge: number, signed: number, riverWidth: number): number {
	const aboveWater = smoothstep(0, 0.2, signed);
	const width = RIVER_BASE * riverWidth * (1.3 - aboveWater * 0.7);
	return smoothstep(1 - width, 1 - width * 0.25, ridge);
}

// Scratch-Puffer: bei ~170k Texeln pro Abschnitt wären frische Objekte reine GC-Last.
const cTint: RGB = [0, 0, 0];
const cTintHigh: RGB = [0, 0, 0];
const cWater: RGB = [0, 0, 0];
const cWaterDeep: RGB = [0, 0, 0];
const cTmp: RGB = [0, 0, 0];
const out: RGB = [0, 0, 0];

function blend4(
	into: RGB,
	a: RGB,
	b: RGB,
	c: RGB,
	d: RGB,
	wa: number,
	wb: number,
	wc: number,
	wd: number
) {
	into[0] = a[0] * wa + b[0] * wb + c[0] * wc + d[0] * wd;
	into[1] = a[1] * wa + b[1] * wb + c[1] * wc + d[1] * wd;
	into[2] = a[2] * wa + b[2] * wb + c[2] * wc + d[2] * wd;
}

function mixInto(into: RGB, target: RGB, t: number) {
	into[0] += (target[0] - into[0]) * t;
	into[1] += (target[1] - into[1]) * t;
	into[2] += (target[2] - into[2]) * t;
}

function lerp3(into: RGB, a: RGB, b: RGB, t: number) {
	into[0] = a[0] + (b[0] - a[0]) * t;
	into[1] = a[1] + (b[1] - a[1]) * t;
	into[2] = a[2] + (b[2] - a[2]) * t;
}

/**
 * Überblendete Biomparameter an einem Weltpunkt.
 *
 * Als wiederverwendbares Objekt statt eines Rückgabewerts, damit im Texelloop nichts allokiert
 * wird. Dieselbe Klasse bedient Darstellung und Wegpunkt-Platzierung — dadurch können beide
 * nicht auseinanderlaufen.
 */
class Blend {
	p00!: Params;
	p10!: Params;
	p01!: Params;
	p11!: Params;
	w00 = 0;
	w10 = 0;
	w01 = 0;
	w11 = 0;

	/**
	 * Gewichte und Eckparameter setzen. gx/gy sind bereits gitterrelativ, tx/ty bereits geglättet
	 * — der Texelloop hat sie je Spalte und Zeile vorberechnet, weil sie nur von px bzw. py
	 * abhängen und Division, Floor und Smoothstep pro Texel reine Wiederholung wären.
	 */
	set(grid: Params[], gx: number, gy: number, tx: number, ty: number) {
		this.w00 = (1 - tx) * (1 - ty);
		this.w10 = tx * (1 - ty);
		this.w01 = (1 - tx) * ty;
		this.w11 = tx * ty;
		this.p00 = grid[gy * GRID_N + gx];
		this.p10 = grid[gy * GRID_N + gx + 1];
		this.p01 = grid[(gy + 1) * GRID_N + gx];
		this.p11 = grid[(gy + 1) * GRID_N + gx + 1];
	}

	/**
	 * grid ist der GRID_N x GRID_N Block der Nachbarparameter, beginnend bei
	 * (sx - GRID_R, sy - GRID_R). Für Einzelabfragen; im Texelloop set() verwenden.
	 */
	at(grid: Params[], sx: number, sy: number, x: number, y: number) {
		const cx = x / SECTION_W;
		const cy = y / SECTION_H;
		const ix = blendIndex(cx);
		const iy = blendIndex(cy);
		this.set(
			grid,
			ix - (sx - GRID_R),
			iy - (sy - GRID_R),
			blendFraction(cx, ix),
			blendFraction(cy, iy)
		);
	}

	// Die Skalare einzeln auf Abruf: der Farbpass braucht nur riverWidth, der Feldpass nur
	// waterLevel und lakeAmount. Alle fünf pauschal zu mischen war pro Texel verschenkt.
	waterLevel() {
		return (
			this.p00.waterLevel * this.w00 +
			this.p10.waterLevel * this.w10 +
			this.p01.waterLevel * this.w01 +
			this.p11.waterLevel * this.w11
		);
	}
	lakeAmount() {
		return (
			this.p00.lakeAmount * this.w00 +
			this.p10.lakeAmount * this.w10 +
			this.p01.lakeAmount * this.w01 +
			this.p11.lakeAmount * this.w11
		);
	}
	riverWidth() {
		return (
			this.p00.riverWidth * this.w00 +
			this.p10.riverWidth * this.w10 +
			this.p01.riverWidth * this.w01 +
			this.p11.riverWidth * this.w11
		);
	}
	treeDensity() {
		return (
			this.p00.treeDensity * this.w00 +
			this.p10.treeDensity * this.w10 +
			this.p01.treeDensity * this.w01 +
			this.p11.treeDensity * this.w11
		);
	}
	symbolDensity() {
		return (
			this.p00.symbolDensity * this.w00 +
			this.p10.symbolDensity * this.w10 +
			this.p01.symbolDensity * this.w01 +
			this.p11.symbolDensity * this.w11
		);
	}
}

const cCorner: RGB = [0, 0, 0];

/** Auf einen Bereich begrenzen — Texturen mit hohem Kontrast sollen nichts überstrahlen. */
function clampMul(v: number, lo: number, hi: number) {
	return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Untergrund einer Ecke, gewichtet aufaddiert.
 *
 * Fällt pro Ecke einzeln auf die bisherige Farbe zurück, wenn deren Textur fehlt — und zwar auf
 * die *fertige* Mischung aus Papier und Lasur, damit ein fehlendes Bild nicht blasser aussieht als
 * der bisherige Stand. Dadurch ist eine unvollständige Lieferung ein brauchbarer Zustand.
 */
function addCorner(
	into: RGB,
	p: Params,
	w: number,
	set: SurfaceSet | undefined,
	band: number,
	u: number,
	v: number
) {
	if (w <= 0) return;
	const tex = set?.[band === 0 ? p.surface : band === 1 ? p.surfaceHigh : p.surfacePeak];
	if (tex) {
		sampleSurface(tex, u, v, cCorner);
	} else {
		const c = band === 0 ? p.tint : p.tintHigh;
		const paper = set?.pergament;
		if (paper) sampleSurface(paper, u, v, cCorner);
		else {
			cCorner[0] = PAPER[0];
			cCorner[1] = PAPER[1];
			cCorner[2] = PAPER[2];
		}
		cCorner[0] += (c[0] - cCorner[0]) * p.tintAlpha;
		cCorner[1] += (c[1] - cCorner[1]) * p.tintAlpha;
		cCorner[2] += (c[2] - cCorner[2]) * p.tintAlpha;
	}
	into[0] += cCorner[0] * w;
	into[1] += cCorner[1] * w;
	into[2] += cCorner[2] * w;
}

/** Gewichtete Mischung der Untergründe aller vier Eckbiome in einem Höhenband. */
function blendSurface(
	into: RGB,
	b: Blend,
	set: SurfaceSet | undefined,
	band: number,
	u: number,
	v: number
) {
	into[0] = 0;
	into[1] = 0;
	into[2] = 0;
	addCorner(into, b.p00, b.w00, set, band, u, v);
	addCorner(into, b.p10, b.w10, set, band, u, v);
	addCorner(into, b.p01, b.w01, set, band, u, v);
	addCorner(into, b.p11, b.w11, set, band, u, v);
}

const bRender = new Blend();
/**
 * A world: a pure function of (x, y, seed), wrapped in a class for its caches.
 *
 * The spike this was ported from also carried a "wish" mechanic that let a
 * player overwrite a section's biome, and a waypoint system that scattered
 * castles and fords across the land. Neither survived the port: the places on
 * this map are the story's own, put there by the designer rather than found in
 * the noise, and a second set of landmarks would only compete with them.
 */
export class World {
	readonly seed: number;
	private readonly F: Fields;
	private readonly surfaces: SurfaceSet | undefined;
	/**
	 * Section parameters, memoised — and bounded, unlike the spike's.
	 *
	 * An agent wanders for as long as the match lasts and never comes back to
	 * most of where it has been, so an unbounded cache here is a slow leak with
	 * no upside. Oldest-first eviction suits a camera that only moves on.
	 */
	private paramCache = new Map<string, Params>();

	constructor(seed: number, surfaces?: SurfaceSet) {
		this.seed = seed;
		this.F = new Fields(seed);
		this.surfaces = surfaces;
	}

	private static key(sx: number, sy: number) {
		return `${sx},${sy}`;
	}

	biomeAt(sx: number, sy: number): BiomeId {
		return defaultBiome(sx, sy, this.seed);
	}

	/** Parameters of a section. */
	private paramsAt(sx: number, sy: number): Params {
		const k = World.key(sx, sy);
		const hit = this.paramCache.get(k);
		if (hit) return hit;

		const params = BIOMES[this.biomeAt(sx, sy)];
		if (this.paramCache.size >= PARAM_CACHE_MAX) {
			this.paramCache.delete(this.paramCache.keys().next().value!);
		}
		this.paramCache.set(k, params);
		return params;
	}

	private gridFor(sx: number, sy: number): Params[] {
		const grid: Params[] = [];
		for (let gy = 0; gy < GRID_N; gy++)
			for (let gx = 0; gx < GRID_N; gx++)
				grid.push(this.paramsAt(sx - GRID_R + gx, sy - GRID_R + gy));
		return grid;
	}

	/**
	 * RGBA-Puffer eines Abschnitts, gezeichnet als Feder-und-Tusche-Karte auf Pergament.
	 *
	 * Vier Schritte: Höhenfeld auf dem groben FIELD_STEP-Gitter, dessen Steigung, dann die
	 * Symbolzellen, dann das Einfärben in voller Auflösung.
	 *
	 * Die Steigung ist nicht Zierde: nur mit ihr lässt sich der Abstand zur Wasserlinie in
	 * *Texeln* ausdrücken — und davon leben Küstenlinie und uferparallele Konturlinien, die
	 * sonst auf flachem Gelände beliebig breit auseinanderlaufen würden.
	 */
	render(sx: number, sy: number, stats?: Stats, mask?: Uint8Array): Uint8ClampedArray<ArrayBuffer> {
		const F = this.F;
		const field = new Float32Array(FW * FH);
		const cont = new Float32Array(FW * FH);
		const grid = this.gridFor(sx, sy);

		const originX = sx * SECTION_W;
		const originY = sy * SECTION_H;
		const stepUnits = 1 / TEXEL_PER_UNIT;
		const fieldUnits = FIELD_STEP * stepUnits;

		// --- Höhenfeld auf dem groben Gitter ---
		for (let fj = 0; fj < FH; fj++) {
			const wy = originY + (fj - 1) * fieldUnits;
			for (let fi = 0; fi < FW; fi++) {
				const wx = originX + (fi - 1) * fieldUnits;
				bRender.at(grid, sx, sy, wx, wy);
				const c = contAt(F, wx, wy);
				const i = fj * FW + fi;
				field[i] = signedAt(F, wx, wy, c, bRender.waterLevel(), bRender.lakeAmount());
				cont[i] = c;
			}
		}

		// --- Ridge-Feld der Flüsse auf dem gröberen Gitter ---
		const ridge = new Float32Array(RW * RH);
		const ridgeUnits = RIVER_STEP * stepUnits;
		for (let rj = 0; rj < RH; rj++) {
			const ry = originY + (rj - 1) * ridgeUnits;
			for (let ri = 0; ri < RW; ri++) {
				ridge[rj * RW + ri] = ridgeAt(F, originX + (ri - 1) * ridgeUnits, ry);
			}
		}

		// --- Einfärben in voller Auflösung ---
		const data = new Uint8ClampedArray(TEX_W * TEX_H * 4);
		if (stats) stats.ocean = stats.lake = stats.river = stats.peak = stats.land = 0;
		let o = 0;

		const surfaces = this.surfaces;

		// Blendfaktoren einmal je Spalte und Zeile. Sie hängen nur von px bzw. py ab; im
		// Texelloop wären Division, Floor und Smoothstep pro Texel reine Wiederholung.
		const colG = new Uint8Array(TEX_W);
		const colT = new Float32Array(TEX_W);
		for (let px = 0; px < TEX_W; px++) {
			const c = (originX + px * stepUnits) / SECTION_W;
			const ix = blendIndex(c);
			colG[px] = ix - (sx - GRID_R);
			colT[px] = blendFraction(c, ix);
		}
		const rowG = new Uint8Array(TEX_H);
		const rowT = new Float32Array(TEX_H);
		for (let py = 0; py < TEX_H; py++) {
			const c = (originY + py * stepUnits) / SECTION_H;
			const iy = blendIndex(c);
			rowG[py] = iy - (sy - GRID_R);
			rowT[py] = blendFraction(c, iy);
		}
		// Texturkoordinaten in Texeln. SECTION_W * TEXEL_PER_UNIT ist genau TEX_W, also ist
		// (sx * TEX_W + px) ganzzahlig — dadurch liegt ein Texturpixel exakt auf einem Kartentexel
		// und die Textur verrutscht über Abschnittsgrenzen hinweg nicht.
		const tuBase = sx * TEX_W;
		const tvBase = sy * TEX_H;

		for (let py = 0; py < TEX_H; py++) {
			const tv = tvBase + py;
			const gRow = rowG[py];
			const tRow = rowT[py];

			// Lage im Ridge-Gitter, glatt interpoliert.
			const rgv = py / RIVER_STEP + 1;
			const rj = Math.floor(rgv);
			const rv = rgv - rj;
			const rsv = rv * rv * (3 - 2 * rv);
			const rRowA = rj * RW;
			const rRowB = (rj + 1) * RW;
			const gv = py / FIELD_STEP + 1;
			const fj = Math.floor(gv);
			const v = gv - fj;
			const sv = v * v * (3 - 2 * v);
			const rowA = fj * FW;
			const rowB = (fj + 1) * FW;

			for (let px = 0; px < TEX_W; px++) {
				const tu = tuBase + px;

				const gu = px / FIELD_STEP + 1;
				const fi = Math.floor(gu);
				const u = gu - fi;
				const su = u * u * (3 - 2 * u);

				const s00 = field[rowA + fi];
				const s10 = field[rowA + fi + 1];
				const s01 = field[rowB + fi];
				const s11 = field[rowB + fi + 1];
				const top = s00 + (s10 - s00) * su;
				const bottom = s01 + (s11 - s01) * su;
				const s = top + (bottom - top) * sv;

				bRender.set(grid, colG[px], gRow, colT[px], tRow);
				const { p00, p10, p01, p11, w00, w10, w01, w11 } = bRender;

				// Korn nur aus papierkorn.png. Ohne die Datei bleibt es aus — die gelieferten
				// Geländetexturen bringen ihre eigene Körnung mit, ein zweites Korn darüber
				// macht sie nur schmutzig.
				const korn = surfaces?.papierkorn;
				const grain = korn ? clampMul(sampleLuma(korn, tu, tv, cTmp), 0.86, 1.14) : 1;
				if (s < 0) {
					// --- Wasser ---
					const depth = smoothstep(0, 0.1, -s);
					const cInterp =
						cont[rowA + fi] * (1 - su) * (1 - sv) +
						cont[rowA + fi + 1] * su * (1 - sv) +
						cont[rowB + fi] * (1 - su) * sv +
						cont[rowB + fi + 1] * su * sv;

					let tex: SurfaceTexture | undefined;
					if (cInterp < OCEAN_CONT) {
						tex = surfaces?.meer ?? surfaces?.wasser;
						if (mask) mask[py * TEX_W + px] = Surface.Ocean;
						if (stats) stats.ocean++;
					} else {
						tex = surfaces?.wasser;
						if (mask) mask[py * TEX_W + px] = Surface.Lake;
						if (stats) stats.lake++;
					}

					blend4(cWater, p00.water, p10.water, p01.water, p11.water, w00, w10, w01, w11);
					blend4(
						cWaterDeep,
						p00.waterDeep,
						p10.waterDeep,
						p01.waterDeep,
						p11.waterDeep,
						w00,
						w10,
						w01,
						w11
					);

					if (tex) {
						// Farbe *und* Struktur aus der Textur. Die Biomfarbe kommt nur als leichte
						// Tönung darüber — sie muss Oasen-Türkis und Eisblau unterscheidbar halten,
						// darf die Textur aber nicht überdecken.
						sampleSurface(tex, tu, tv, out);
						lerp3(cTmp, cWater, cWaterDeep, depth);
						mixInto(out, cTmp, WATER_TINT);
						const dim = 1 - depth * 0.28;
						out[0] *= dim;
						out[1] *= dim;
						out[2] *= dim;
					} else {
						lerp3(out, cWater, cWaterDeep, depth);
					}
				} else {
					// --- Land ---
					if (mask) mask[py * TEX_W + px] = Surface.Dry;
					if (stats) stats.land++;

					// Untergrund des Bioms in drei Höhenbändern. Die Fallunterscheidung ist nicht
					// Kosmetik: die Bänder überlappen nicht, deshalb genügt fast überall ein
					// Texturzugriff, und rund 80 % der Landtexel liegen im untersten Band.
					if (s <= HIGHLAND_FROM) {
						blendSurface(out, bRender, surfaces, 0, tu, tv);
					} else if (s < HIGHLAND_TO) {
						blendSurface(cTint, bRender, surfaces, 0, tu, tv);
						blendSurface(cTintHigh, bRender, surfaces, 1, tu, tv);
						lerp3(out, cTint, cTintHigh, smoothstep(HIGHLAND_FROM, HIGHLAND_TO, s));
					} else if (s <= PEAK_FROM) {
						blendSurface(out, bRender, surfaces, 1, tu, tv);
					} else if (s < PEAK_TO) {
						blendSurface(cTint, bRender, surfaces, 1, tu, tv);
						blendSurface(cTintHigh, bRender, surfaces, 2, tu, tv);
						const mix = smoothstep(PEAK_FROM, PEAK_TO, s);
						lerp3(out, cTint, cTintHigh, mix);
						if (stats && mix > 0.5) stats.peak++;
					} else {
						blendSurface(out, bRender, surfaces, 2, tu, tv);
						if (stats) stats.peak++;
					}

					if (korn) {
						out[0] *= grain;
						out[1] *= grain;
						out[2] *= grain;
					}

					// Flüsse mit derselben Wassertextur wie die Seen — sonst gehören sie
					// sichtbar nicht zum gleichen Gewässer.
					const rgu = px / RIVER_STEP + 1;
					const ri = Math.floor(rgu);
					const ru = rgu - ri;
					const rsu = ru * ru * (3 - 2 * ru);
					const r00 = ridge[rRowA + ri];
					const r10 = ridge[rRowA + ri + 1];
					const r01 = ridge[rRowB + ri];
					const r11 = ridge[rRowB + ri + 1];
					const rTop = r00 + (r10 - r00) * rsu;
					const rBot = r01 + (r11 - r01) * rsu;
					const river = riverFrom(rTop + (rBot - rTop) * rsv, s, bRender.riverWidth());
					if (river > 0) {
						const wtex = surfaces?.wasser;
						if (wtex) sampleSurface(wtex, tu, tv, cTmp);
						else
							blend4(
								cTmp,
								p00.waterDeep,
								p10.waterDeep,
								p01.waterDeep,
								p11.waterDeep,
								w00,
								w10,
								w01,
								w11
							);
						mixInto(out, cTmp, smoothstep(0.28, 0.62, river));
						if (mask && river > 0.5) mask[py * TEX_W + px] = Surface.River;
						if (stats && river > 0.5) stats.river++;
					}
				}

				data[o++] = out[0];
				data[o++] = out[1];
				data[o++] = out[2];
				data[o++] = 255;
			}
		}

		return data;
	}
}
