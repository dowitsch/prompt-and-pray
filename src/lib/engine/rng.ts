/**
 * Seeded PRNG. The engine and the bots never call `Math.random`, so a match is
 * reproducible from its seed — which makes agent behaviour debuggable.
 */

export type Rng = {
	/** Float in [0, 1). */
	next(): number;
	/** Integer in [0, max). */
	int(max: number): number;
	pick<T>(items: readonly T[]): T;
	chance(probability: number): boolean;
};

/** mulberry32 — small, fast, good enough for game feel. */
export function createRng(seed: number): Rng {
	let state = seed >>> 0;

	const next = () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};

	return {
		next,
		int: (max) => Math.floor(next() * max),
		pick: (items) => items[Math.floor(next() * items.length)],
		chance: (probability) => next() < probability
	};
}

/** Stable 32-bit hash, for deriving a per-agent seed from a string id. */
export function hashSeed(input: string): number {
	let h = 2166136261 >>> 0;
	for (let i = 0; i < input.length; i++) {
		h ^= input.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return h >>> 0;
}
