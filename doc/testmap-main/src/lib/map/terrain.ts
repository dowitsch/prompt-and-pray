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
	type RGB,
	type SymbolKind
} from './biomes';

/**
 * Abschnittsgröße in Weltunits — fix, damit ein Resize die Karte nicht verändert.
 * Klein genug, dass man nah am Gelände ist: ein Abschnitt füllt immer genau den Viewport.
 */
export const SECTION_W = 432;
export const SECTION_H = 252; // 432/252 = 12/7, gleich dem Seitenverhältnis der Anzeige

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
const CANOPY_SCALE = 0.052;

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

const SYM_L = 7; // Weltunits je Bodensymbol-Zelle
const MTN_L = 15; // Gebirgszeichen sind größer
const MTN_FROM = 0.095; // Höhe über Wasser, ab der eine Zelle ein Gebirgszeichen bekommt

/**
 * Das Symbolgitter ist gegen die Weltachsen gedreht, und ein Teil der Zellen bleibt leer.
 *
 * Ohne beides sieht ein Bestand nach Tapete aus: achsparallele Reihen und Spalten verraten das
 * Raster sofort. Die Drehung ist umkehrbar, deshalb kann der Vorlauf die Zellmittelpunkte
 * weiterhin exakt in Weltkoordinaten zurückrechnen — anders als eine Verzerrung per Rauschen.
 */
const SYM_ROT = 0.3927; // rund 22.5 Grad
const SYM_COS = Math.cos(SYM_ROT);
const SYM_SIN = Math.sin(SYM_ROT);
const SYM_SKIP = 0.45; // Anteil leerer Zellen innerhalb eines Bestands
/** Wahrscheinlichkeit für ein Grasbüschel auf offener Fläche. */
const TUFT_CHANCE = 0.07;
const TREE_MIN_H = 0.012; // etwas über der Wasserlinie, damit nichts im Ufer steht
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

export type Wish = BiomeId | 'fluss' | 'see';

export const WISH_LABEL: Record<Wish, string> = {
	wiese: 'Wiese',
	wald: 'Wald',
	wueste: 'Wüste',
	seenland: 'Seenland',
	schnee: 'Schnee',
	berge: 'Berge',
	fluss: 'Flüsse',
	see: 'Seen'
};

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

// --- Wegpunkte ---
export type PoiKind = 'burg' | 'furt' | 'wald' | 'hafen' | 'gipfel' | 'boot';

export const POI_ICON: Record<PoiKind, string> = {
	burg: '🏰',
	furt: '🌉',
	wald: '🌳',
	hafen: '⚓',
	gipfel: '🗻',
	boot: '⛵'
};

export const POI_LABEL: Record<PoiKind, string> = {
	burg: 'Burg',
	furt: 'Furt',
	wald: 'Wald',
	hafen: 'Hafen',
	gipfel: 'Gipfel',
	boot: 'Boot'
};

/** Wegpunkt in Weltkoordinaten. */
export type Poi = { kind: PoiKind; x: number; y: number };

export const POI_PER_SECTION = 3;

/**
 * Ein Geländezeichen: Position in Weltkoordinaten plus eine Variantennummer, aus der die
 * Sprite-Schicht ihr Bild aus dem Satz wählt.
 */
export type Decoration = { kind: SymbolKind | 'berg'; x: number; y: number; variant: number };

function clamp01(v: number) {
	return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Posterisierung: stuft einen 0..1-Wert auf n Stufen — der Kern des gezeichneten Looks. */
function step(v: number, steps: number) {
	return Math.round(clamp01(v) * (steps - 1)) / (steps - 1);
}

function hash3(x: number, y: number, z: number): number {
	let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 1442695041);
	h = Math.imul(h ^ (h >>> 13), 1274126177);
	h ^= h >>> 16;
	return (h >>> 0) / 4294967296;
}

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

/** Voll aufgelöst — für Einzelabfragen wie die Wegpunkt-Sonde. */
function riverAt(F: Fields, x: number, y: number, signed: number, riverWidth: number): number {
	return riverFrom(ridgeAt(F, x, y), signed, riverWidth);
}

/** 0 = offen, 1 = dicht bewaldet. */
function canopyAt(F: Fields, x: number, y: number, treeDensity: number): number {
	const field = F.canopy.at(x * CANOPY_SCALE, y * CANOPY_SCALE);
	return smoothstep(treeDensity, treeDensity - 0.045, field);
}

// Scratch-Puffer: bei ~170k Texeln pro Abschnitt wären frische Objekte reine GC-Last.
const cTint: RGB = [0, 0, 0];
const cTintHigh: RGB = [0, 0, 0];
const cWater: RGB = [0, 0, 0];
const cWaterDeep: RGB = [0, 0, 0];
const cTmp: RGB = [0, 0, 0];
const out: RGB = [0, 0, 0];

function blend4(into: RGB, a: RGB, b: RGB, c: RGB, d: RGB, wa: number, wb: number, wc: number, wd: number) {
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
		this.set(grid, ix - (sx - GRID_R), iy - (sy - GRID_R), blendFraction(cx, ix), blendFraction(cy, iy));
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

/** Das am stärksten gewichtete Biom — für Entscheidungen, die pro Zelle fallen müssen. */
function dominant(b: Blend): Params {
	let best = b.p00;
	let w = b.w00;
	if (b.w10 > w) {
		best = b.p10;
		w = b.w10;
	}
	if (b.w01 > w) {
		best = b.p01;
		w = b.w01;
	}
	if (b.w11 > w) best = b.p11;
	return best;
}

/** Weltpunkt -> gedrehte Lattice-Koordinate. */
function latX(x: number, y: number, L: number) {
	return (x * SYM_COS - y * SYM_SIN) / L;
}
function latY(x: number, y: number, L: number) {
	return (x * SYM_SIN + y * SYM_COS) / L;
}
/** Und zurück — decorationsAt braucht den Weltpunkt eines Zellmittelpunkts. */
function worldX(lx: number, ly: number, L: number) {
	return (lx * SYM_COS + ly * SYM_SIN) * L;
}
function worldY(lx: number, ly: number, L: number) {
	return (-lx * SYM_SIN + ly * SYM_COS) * L;
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
function blendSurface(into: RGB, b: Blend, set: SurfaceSet | undefined, band: number, u: number, v: number) {
	into[0] = 0;
	into[1] = 0;
	into[2] = 0;
	addCorner(into, b.p00, b.w00, set, band, u, v);
	addCorner(into, b.p10, b.w10, set, band, u, v);
	addCorner(into, b.p01, b.w01, set, band, u, v);
	addCorner(into, b.p11, b.w11, set, band, u, v);
}

const bRender = new Blend();
const bPoi = new Blend(); // eigene Instanz: darf den Render-Blend nicht überschreiben

/** Was an einem Punkt vorliegt — Grundlage der Wegpunkt-Bedingungen. */
type Spot = {
	x: number;
	y: number;
	water: boolean;
	river: number;
	forest: number;
	signed: number;
	nearWater: boolean;
};

/** Ob ein Wegpunkt dieser Art hier stehen darf. */
function fits(kind: PoiKind, s: Spot): boolean {
	switch (kind) {
		// Die beiden ausdrücklich geforderten Regeln:
		case 'burg':
			return s.signed > SHORE_MARGIN && s.river < 0.35;
		case 'furt':
			return s.signed > SHORE_MARGIN && s.river > 0.68;
		case 'wald':
			return s.signed > SHORE_MARGIN && s.forest > 0.55 && s.river < 0.3;
		case 'hafen':
			return s.signed > SHORE_MARGIN && s.river < 0.3 && s.nearWater && s.signed < 0.1;
		case 'gipfel':
			// Fluss ausschließen: ein Gipfel-Icon mitten im Wasser wäre genauso falsch
			// wie eine Burg dort.
			return s.river < 0.3 && s.signed > 0.2;
		case 'boot':
			return s.signed < -SHORE_MARGIN;
	}
}

/**
 * Sicherheitsabstand zur Wasserlinie für Wegpunkte.
 *
 * Die Platzierung rechnet die Höhe exakt, der Renderer interpoliert sie aus dem gröberen
 * Feldgitter. Direkt an der Uferlinie weichen beide um Bruchteile ab, und dann steht ein Boot auf
 * Land oder eine Burg im Wasser. Der Abstand hält Wegpunkte aus diesem Unsicherheitsband heraus.
 */
const SHORE_MARGIN = 0.02;

const ALL_KINDS: PoiKind[] = ['furt', 'gipfel', 'wald', 'hafen', 'burg', 'boot'];
const POI_GRID_X = 14;
const POI_GRID_Y = 9;
const NEAR_WATER_R = 10; // Weltunits: Abstand, ab dem ein Hafen als am Wasser gilt

/**
 * Eine Welt: deterministisch aus dem Seed, aber mit Wünschen pro Abschnitt überschreibbar.
 *
 * Die Wünsche sind der Grund, warum es diese Klasse gibt und nicht nur freie Funktionen —
 * ohne veränderlichen Zustand wäre die Karte reine Funktion von (x, y, seed).
 */
export class World {
	readonly seed: number;
	private readonly F: Fields;
	private readonly surfaces: SurfaceSet | undefined;
	private wishes = new Map<string, Wish>();
	private paramCache = new Map<string, Params>();
	private poiCache = new Map<string, Poi[]>();
	private decoCache = new Map<string, Decoration[]>();

	constructor(seed: number, surfaces?: SurfaceSet) {
		this.seed = seed;
		this.F = new Fields(seed);
		this.surfaces = surfaces;
	}

	private static key(sx: number, sy: number) {
		return `${sx},${sy}`;
	}

	/** Wunsch setzen oder mit null auf die deterministische Vorgabe zurückstellen. */
	setWish(sx: number, sy: number, wish: Wish | null) {
		const k = World.key(sx, sy);
		if (wish === null) this.wishes.delete(k);
		else this.wishes.set(k, wish);
		this.paramCache.delete(k);
		// Wegpunkte der Nachbarn hängen über die Überblendung mit am Gelände hier.
		for (let dy = -1; dy <= 1; dy++)
			for (let dx = -1; dx <= 1; dx++) {
				this.poiCache.delete(World.key(sx + dx, sy + dy));
				this.decoCache.delete(World.key(sx + dx, sy + dy));
			}
	}

	wishAt(sx: number, sy: number): Wish | undefined {
		return this.wishes.get(World.key(sx, sy));
	}

	biomeAt(sx: number, sy: number): BiomeId {
		const wish = this.wishes.get(World.key(sx, sy));
		if (wish && wish in BIOMES) return wish as BiomeId;
		return defaultBiome(sx, sy, this.seed);
	}

	/**
	 * Parameter eines Abschnitts. "fluss" und "see" sind keine Biome, sondern Verstärker auf
	 * das ohnehin vorgesehene Biom — so bleibt die Landschaft der Region erhalten.
	 */
	private paramsAt(sx: number, sy: number): Params {
		const k = World.key(sx, sy);
		const hit = this.paramCache.get(k);
		if (hit) return hit;

		const base = BIOMES[this.biomeAt(sx, sy)];
		const wish = this.wishes.get(k);
		let params = base;

		if (wish === 'fluss') {
			params = { ...base, riverWidth: base.riverWidth * 1.75 };
		} else if (wish === 'see') {
			params = { ...base, lakeAmount: base.lakeAmount * 2.4, waterLevel: base.waterLevel + 0.03 };
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

	/** Alles, was an einem Weltpunkt für die Wegpunkt-Bedingungen zählt. */
	private probe(grid: Params[], sx: number, sy: number, x: number, y: number): Spot {
		const F = this.F;
		bPoi.at(grid, sx, sy, x, y);
		const signed = signedAt(F, x, y, contAt(F, x, y), bPoi.waterLevel(), bPoi.lakeAmount());
		const water = signed < 0;
		const river = water ? 0 : riverAt(F, x, y, signed, bPoi.riverWidth());
		const forest = water ? 0 : canopyAt(F, x, y, bPoi.treeDensity());

		// Für den Hafen: liegt in Reichweite Wasser? Vier Sonden genügen bei dieser Distanz.
		let nearWater = water;
		if (!nearWater) {
			for (let d = 0; d < 4; d++) {
				const px = x + (d === 0 ? NEAR_WATER_R : d === 1 ? -NEAR_WATER_R : 0);
				const py = y + (d === 2 ? NEAR_WATER_R : d === 3 ? -NEAR_WATER_R : 0);
				bPoi.at(grid, sx, sy, px, py);
				if (signedAt(F, px, py, contAt(F, px, py), bPoi.waterLevel(), bPoi.lakeAmount()) < 0) {
					nearWater = true;
					break;
				}
			}
		}

		return { x, y, water, river, forest, signed, nearWater };
	}

	/**
	 * Die drei Wegpunkte eines Abschnitts.
	 *
	 * Vorgehen: ein gejittertes Kandidatenraster einmal klassifizieren, dann in einer per Hash
	 * gemischten Reihenfolge der Arten greedy zuweisen. Das Raster muss dicht genug sein, damit
	 * seltene Bedingungen erfüllbar sind — Flüsse bedecken nur rund 5 % der Fläche, bei 24
	 * Kandidaten wäre eine Furt oft nicht platzierbar.
	 */
	poisAt(sx: number, sy: number): Poi[] {
		const k = World.key(sx, sy);
		const hit = this.poiCache.get(k);
		if (hit) return hit;

		const grid = this.gridFor(sx, sy);
		const insetX = SECTION_W * 0.09;
		const insetY = SECTION_H * 0.11;
		const spanX = SECTION_W - insetX * 2;
		const spanY = SECTION_H - insetY * 2;

		const spots: Spot[] = [];
		for (let gy = 0; gy < POI_GRID_Y; gy++) {
			for (let gx = 0; gx < POI_GRID_X; gx++) {
				const cellX = sx * POI_GRID_X + gx;
				const cellY = sy * POI_GRID_Y + gy;
				const jx = hash3(cellX, cellY, this.seed + 31);
				const jy = hash3(cellX, cellY, this.seed + 97);
				const rawX = insetX + ((gx + 0.15 + jx * 0.7) / POI_GRID_X) * spanX;
				const rawY = insetY + ((gy + 0.15 + jy * 0.7) / POI_GRID_Y) * spanY;
				// Auf Texel-Mittelpunkte rasten: nur so prüft die Sonde exakt den Weltpunkt,
				// den der Renderer später einfärbt. Ohne das kippt an Uferlinien der
				// Rundungsversatz die Land/Wasser-Entscheidung.
				const x = sx * SECTION_W + Math.round(rawX * TEXEL_PER_UNIT) / TEXEL_PER_UNIT;
				const y = sy * SECTION_H + Math.round(rawY * TEXEL_PER_UNIT) / TEXEL_PER_UNIT;
				spots.push(this.probe(grid, sx, sy, x, y));
			}
		}

		// Reihenfolge der Arten deterministisch pro Abschnitt mischen.
		const ranked = ALL_KINDS.map((kind, i) => ({ kind, r: hash3(sx, sy, this.seed + i * 7919) }))
			.sort((a, b) => a.r - b.r)
			.map((o) => o.kind);

		const minDist = SECTION_W * 0.16;
		const chosen: Poi[] = [];
		const farEnough = (x: number, y: number) =>
			chosen.every((p) => Math.hypot(p.x - x, p.y - y) >= minDist);

		// Erster Durchgang: jede Art höchstens einmal.
		for (const kind of ranked) {
			if (chosen.length >= POI_PER_SECTION) break;
			const spot = spots.find((s) => fits(kind, s) && farEnough(s.x, s.y));
			if (spot) chosen.push({ kind, x: spot.x, y: spot.y });
		}

		// Auffüllen: Arten dürfen sich wiederholen, damit es immer drei werden.
		for (const kind of ranked) {
			if (chosen.length >= POI_PER_SECTION) break;
			for (const spot of spots) {
				if (chosen.length >= POI_PER_SECTION) break;
				if (fits(kind, spot) && farEnough(spot.x, spot.y)) {
					chosen.push({ kind, x: spot.x, y: spot.y });
				}
			}
		}

		// Letzte Rettung: Mindestabstand aufgeben, aber die Land/Wasser-Regel niemals — Punkte
		// direkt auf der Uferlinie bleiben ausgeschlossen.
		for (const spot of spots) {
			if (chosen.length >= POI_PER_SECTION) break;
			if (chosen.some((p) => p.x === spot.x && p.y === spot.y)) continue;
			if (spot.signed > SHORE_MARGIN) chosen.push({ kind: 'burg', x: spot.x, y: spot.y });
			else if (spot.signed < -SHORE_MARGIN) chosen.push({ kind: 'boot', x: spot.x, y: spot.y });
		}

		this.poiCache.set(k, chosen);
		return chosen;
	}

	/**
	 * Wo in diesem Abschnitt Geländezeichen stehen — Bäume, Dünen, Berge.
	 *
	 * Getrennt von render(), weil sie als Sprites über die Textur gelegt werden und nicht
	 * hineingezeichnet: gerechnete Formen sehen gerechnet aus, das war der Grund für den Umbau.
	 *
	 * Ob eine Zelle ein Zeichen trägt, wird am Zellmittelpunkt entschieden und nicht am Pixel —
	 * bei einer Prüfung je Pixel würden Zeichen am Rand eines Bestands oder an einem Ufer
	 * mittendurch abgeschnitten. Gerechnet wird aus der Weltformel, also unabhängig vom
	 * Abschnitt; sonst gäbe es an den Abschnittsgrenzen Sprünge.
	 */
	decorationsAt(sx: number, sy: number): Decoration[] {
		const hit = this.decoCache.get(World.key(sx, sy));
		if (hit) return hit;

		const F = this.F;
		const seed = this.seed;
		const grid = this.gridFor(sx, sy);
		const originX = sx * SECTION_W;
		const originY = sy * SECTION_H;
		const list: Decoration[] = [];

		// Zellbereich, der den Abschnitt überdeckt. Wegen der Drehung ist das die Hülle der vier
		// gedrehten Ecken, nicht einfach die Abschnittsbreite.
		const cornersX = [originX, originX + SECTION_W, originX, originX + SECTION_W];
		const cornersY = [originY, originY, originY + SECTION_H, originY + SECTION_H];
		const box = (L: number) => {
			let x0 = Infinity;
			let x1 = -Infinity;
			let y0 = Infinity;
			let y1 = -Infinity;
			for (let k = 0; k < 4; k++) {
				const lx = latX(cornersX[k], cornersY[k], L);
				const ly = latY(cornersX[k], cornersY[k], L);
				if (lx < x0) x0 = lx;
				if (lx > x1) x1 = lx;
				if (ly < y0) y0 = ly;
				if (ly > y1) y1 = ly;
			}
			return { i0: Math.floor(x0), j0: Math.floor(y0), i1: Math.floor(x1) + 1, j1: Math.floor(y1) + 1 };
		};

		const inSection = (x: number, y: number) =>
			x >= originX && x < originX + SECTION_W && y >= originY && y < originY + SECTION_H;

		const mt = box(MTN_L);
		const covered = new Set<string>();
		for (let cj = mt.j0; cj <= mt.j1; cj++) {
			for (let ci = mt.i0; ci <= mt.i1; ci++) {
				const jx = hash3(ci, cj, seed + 41);
				const jy = hash3(ci, cj, seed + 43);
				const x = worldX(ci + 0.3 + jx * 0.4, cj + 0.32 + jy * 0.36, MTN_L);
				const y = worldY(ci + 0.3 + jx * 0.4, cj + 0.32 + jy * 0.36, MTN_L);
				if (!inSection(x, y)) continue;
				bRender.at(grid, sx, sy, x, y);
				const h = signedAt(F, x, y, contAt(F, x, y), bRender.waterLevel(), bRender.lakeAmount());
				if (h <= MTN_FROM) continue;
				list.push({ kind: 'berg', x, y, variant: Math.floor(hash3(ci, cj, seed + 47) * 1024) });
				// Bodenzeichen unter einem Berg unterdrücken, sonst stapeln sich Sprites.
				covered.add(`${Math.floor(latX(x, y, SYM_L))},${Math.floor(latY(x, y, SYM_L))}`);
			}
		}

		const sym = box(SYM_L);
		for (let cj = sym.j0; cj <= sym.j1; cj++) {
			for (let ci = sym.i0; ci <= sym.i1; ci++) {
				if (hash3(ci, cj, seed + 31) < SYM_SKIP) continue;
				const jx = hash3(ci, cj, seed + 17);
				const jy = hash3(ci, cj, seed + 23);
				const x = worldX(ci + 0.3 + jx * 0.4, cj + 0.32 + jy * 0.36, SYM_L);
				const y = worldY(ci + 0.3 + jx * 0.4, cj + 0.32 + jy * 0.36, SYM_L);
				if (!inSection(x, y)) continue;
				if (covered.has(`${ci},${cj}`)) continue;
				bRender.at(grid, sx, sy, x, y);
				const h = signedAt(F, x, y, contAt(F, x, y), bRender.waterLevel(), bRender.lakeAmount());
				if (h < TREE_MIN_H) continue;

				const dom = dominant(bRender);
				const canopy = F.canopy.at(x * CANOPY_SCALE, y * CANOPY_SCALE);
				let kind: Decoration['kind'] | null = null;
				if (canopy <= bRender.symbolDensity()) kind = dom.symbolKind;
				else if (dom.symbolKind === 'baum' && hash3(ci, cj, seed + 37) < TUFT_CHANCE) kind = 'tuft';
				if (!kind) continue;

				list.push({ kind, x, y, variant: Math.floor(hash3(ci, cj, seed + 29) * 1024) });
			}
		}

		this.decoCache.set(World.key(sx, sy), list);
		return list;
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
		const seed = this.seed;
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
			const wy = originY + py * stepUnits;
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
				const wx = originX + px * stepUnits;
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
					blend4(cWaterDeep, p00.waterDeep, p10.waterDeep, p01.waterDeep, p11.waterDeep, w00, w10, w01, w11);

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
							blend4(cTmp, p00.waterDeep, p10.waterDeep, p01.waterDeep, p11.waterDeep, w00, w10, w01, w11);
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
