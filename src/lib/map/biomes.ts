import { fbm, smoothstep } from './noise';
import type { SurfaceId } from './textures';

export type RGB = [number, number, number];

/** Alles, was ein Biom am Aussehen und an der Geologie eines Ortes ändert. */
/** Welche Art Zeichen dieses Biom auf die Fläche streut. */
export type SymbolKind = 'baum' | 'nadel' | 'duene' | 'tuft';

/** Alles, was ein Biom am Aussehen und an der Geologie eines Ortes ändert. */
export type Params = {
	/** Höhe, unter der Wasser steht. Höher = mehr Gewässer. */
	waterLevel: number;
	/** Verstärkung der Senken, in denen Seen entstehen. */
	lakeAmount: number;
	/** Kernbreite der Flussläufe. */
	riverWidth: number;
	/**
	 * Schwelle auf dem Kronenfeld für die POI-Regel "im Wald" — nur bei grünen Biomen sinnvoll.
	 */
	treeDensity: number;
	/**
	 * Anteil der Zellen, die das Leitzeichen des Bioms tragen. Getrennt von treeDensity, weil
	 * eine Wüste dicht mit Dünenbögen bedeckt ist, aber kein Wald ist.
	 */
	symbolDensity: number;
	/**
	 * Untergrundtextur in drei Höhenbändern: Tiefland, Hochland, Gipfel. Die Höhe mischt
	 * zwischen ihnen — deshalb braucht kein Biom eigene Texturen, es verweist auf Fels und
	 * Schneeberge. Das dritte Band ist der Grund, warum Berge weiße Kappen bekommen.
	 *
	 * "schnee" und "schneeberge" sind bewusst verschieden: das erste ist eine flache Schneefläche
	 * (Untergrund des Schnee-Bioms), das zweite ein Relief mit Gipfeln.
	 */
	surface: SurfaceId;
	surfaceHigh: SurfaceId;
	surfacePeak: SurfaceId;
	/** Rückfallfarbe, solange die Textur fehlt. */
	tint: RGB;
	/** Lasur im Hochland. */
	tintHigh: RGB;
	/** Deckkraft der Lasur. */
	tintAlpha: number;
	symbolKind: SymbolKind;
	/** Wasserlasur nah am Ufer und in der Tiefe. */
	water: RGB;
	waterDeep: RGB;
};

export type BiomeId = 'wiese' | 'wald' | 'wueste' | 'seenland' | 'schnee' | 'berge';

export const BIOME_LABEL: Record<BiomeId, string> = {
	wiese: 'Wiese',
	wald: 'Wald',
	wueste: 'Wüste',
	seenland: 'Seenland',
	schnee: 'Schnee',
	berge: 'Berge'
};

/**
 * Gedeckte Lasuren auf Pergament statt gesättigter Höhenfarben.
 *
 * Der Unterschied zum vorherigen Stand ist grundsätzlich: dort trug die *Fläche* die Information
 * (Farbe nach Höhe, wie in einem Atlas), hier tragen sie die *Zeichen*. Die Lasur gibt nur noch
 * einen Hauch Region, alles Erkennbare kommt aus Symbolen und Tuschelinien.
 */
export const BIOMES: Record<BiomeId, Params> = {
	wiese: {
		waterLevel: 0.335,
		lakeAmount: 1.15,
		riverWidth: 1.2,
		treeDensity: 0.42,
		symbolDensity: 0.16,
		surface: 'gras',
		surfaceHigh: 'fels',
		surfacePeak: 'schneeberge',
		tint: [206, 208, 152],
		tintHigh: [186, 190, 138],
		tintAlpha: 0.5,
		symbolKind: 'baum',
		water: [170, 200, 208],
		waterDeep: [126, 168, 190]
	},
	wald: {
		waterLevel: 0.345,
		lakeAmount: 1.3,
		riverWidth: 1.4,
		treeDensity: 0.62,
		symbolDensity: 0.34,
		surface: 'wald',
		surfaceHigh: 'fels',
		surfacePeak: 'schneeberge',
		tint: [184, 198, 148],
		tintHigh: [158, 176, 132],
		tintAlpha: 0.55,
		symbolKind: 'nadel',
		water: [162, 194, 204],
		waterDeep: [116, 160, 184]
	},
	wueste: {
		waterLevel: 0.275,
		lakeAmount: 0.35,
		riverWidth: 0.5,
		treeDensity: 0.08,
		symbolDensity: 0.3,
		surface: 'sand',
		surfaceHigh: 'sand',
		surfacePeak: 'fels',
		tint: [238, 216, 162],
		tintHigh: [224, 196, 140],
		tintAlpha: 0.6,
		symbolKind: 'duene',
		// Oasen-Türkis: das wenige Wasser soll umso deutlicher lesen.
		water: [158, 204, 196],
		waterDeep: [104, 172, 170]
	},
	seenland: {
		waterLevel: 0.405,
		lakeAmount: 2.7,
		riverWidth: 1.5,
		treeDensity: 0.4,
		symbolDensity: 0.18,
		surface: 'gras',
		surfaceHigh: 'fels',
		surfacePeak: 'schneeberge',
		tint: [196, 208, 156],
		tintHigh: [172, 188, 146],
		tintAlpha: 0.5,
		symbolKind: 'baum',
		water: [172, 202, 212],
		waterDeep: [122, 166, 192]
	},
	schnee: {
		waterLevel: 0.335,
		lakeAmount: 1.2,
		riverWidth: 1.0,
		treeDensity: 0.3,
		symbolDensity: 0.14,
		surface: 'schnee',
		surfaceHigh: 'schnee',
		surfacePeak: 'schneeberge',
		tint: [232, 234, 232],
		tintHigh: [212, 220, 228],
		tintAlpha: 0.72,
		symbolKind: 'nadel',
		water: [198, 216, 226],
		waterDeep: [150, 184, 206]
	},
	berge: {
		/**
		 * Deutlich tiefer als bei den anderen Biomen — und das ist der Punkt: s = Höhe minus
		 * Wasserstand, ein tieferer Wasserstand hebt also das ganze Gelände an. Vorher war
		 * "Berge" nur eine Texturwahl auf normalhohem Land und bekam deshalb keine Gipfel.
		 */
		waterLevel: 0.21,
		lakeAmount: 0.85,
		riverWidth: 1.3,
		treeDensity: 0.3,
		symbolDensity: 0.15,
		surface: 'fels',
		surfaceHigh: 'fels',
		surfacePeak: 'schneeberge',
		tint: [214, 200, 172],
		tintHigh: [196, 182, 158],
		tintAlpha: 0.5,
		symbolKind: 'nadel',
		water: [166, 196, 208],
		waterDeep: [118, 158, 184]
	}
};

/**
 * Deterministisches Biom eines Abschnitts, wenn nichts überschrieben wurde.
 *
 * Zwei niederfrequente Felder über den *Abschnitts*-Koordinaten ergeben Temperatur und Feuchte;
 * ein drittes legt Gebirgszüge darüber. Dadurch entstehen zusammenhängende Regionen statt eines
 * Schachbretts — Nachbarabschnitte gehören meist zur selben Landschaft.
 */
export function defaultBiome(sx: number, sy: number, seed: number): BiomeId {
	const ridgeline = fbm(sx * 0.31 + 3.5, sy * 0.31 - 2.5, seed + 1499, 2);
	if (ridgeline > 0.62) return 'berge';

	const temp = fbm(sx * 0.24, sy * 0.24, seed + 1201, 2);
	const humid = fbm(sx * 0.24 + 11.7, sy * 0.24 + 7.3, seed + 1307, 2);

	if (temp < 0.36) return 'schnee';
	if (humid < 0.37) return 'wueste';
	if (humid > 0.63) return 'seenland';
	if (temp > 0.58) return 'wald';
	return 'wiese';
}

/**
 * Überblendung zwischen den vier umliegenden Abschnittsmittelpunkten.
 *
 * Die Mittelpunkte liegen bei ganzzahligen Werten von (worldX / SECTION_W - 0.5). Der steile
 * smoothstep sorgt dafür, dass etwa die mittleren 40 % eines Abschnitts reines Biom zeigen und
 * nur ein Band an den Rändern überblendet — sonst wäre eine Vorgabe wie "Wüste" nirgends
 * wirklich Wüste.
 *
 * Zwei Funktionen statt eines Rückgabeobjekts: bei einem Aufruf pro Texel wäre das Objekt
 * eine Allokation zu viel.
 */
export function blendIndex(coord: number): number {
	return Math.floor(coord - 0.5);
}

export function blendFraction(coord: number, index: number): number {
	return smoothstep(0.3, 0.7, coord - 0.5 - index);
}
