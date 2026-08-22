import type { Locale } from '../i18n/index.ts';

/**
 * The words the offline brain reads a player's notes with.
 *
 * This is the one place where language is not decoration: the agent decides by
 * matching handwritten notes against the names of the paths in front of it, so
 * a German match needs German words for "deadly" and "safe", and a German
 * pattern for "after the forest, take the mountain".
 */

export type Vocabulary = {
	negative: string[];
	positive: string[];
	stopwords: Set<string>;
	/** Matches "after X …" and captures X. */
	after: RegExp;
	/** Splits a note into clauses that can carry their own polarity. */
	clause: RegExp;
	/** Letters that count as part of a word, for whole-word matching. */
	letters: string;
	phrases: {
		blind: ((label: string) => string)[];
		eliminated: ((label: string, bad: string) => string)[];
		warned: (label: string) => string;
		directed: (label: string) => string;
		calledSafe: (label: string) => string;
		ruleOut: (label: string, avoided: string) => string;
		unsure: (label: string) => string;
		/** The clause that follows a reason: "…. I take the valley." */
		takes: (label: string) => string;
	};
};

const EN: Vocabulary = {
	negative: [
		'deadly',
		'death',
		'dead',
		'kill',
		'kills',
		'killed',
		'die',
		'dies',
		'fatal',
		'avoid',
		'never',
		'dont',
		"don't",
		'not',
		'no',
		'bad',
		'danger',
		'dangerous',
		'trap',
		'lost',
		'lose',
		'wrong',
		'skip',
		'beware',
		'x'
	],
	positive: [
		'safe',
		'good',
		'ok',
		'okay',
		'yes',
		'go',
		'goto',
		'take',
		'choose',
		'pick',
		'correct',
		'right',
		'survive',
		'alive',
		'live',
		'home',
		'win',
		'best',
		'true'
	],
	stopwords: new Set(['the', 'a', 'an', 'of', 'to']),
	after: /\bafter\s+([a-z]+)/,
	clause: /[,.;!?]|\bthen\b/,
	letters: 'a-z',
	phrases: {
		blind: [
			(l) => `Nothing in my memory covers this place. I take the ${l}.`,
			(l) => `My notes are silent here. The ${l}, then.`,
			(l) => `No guidance for this one — the ${l} looks no worse than the rest.`,
			(l) => `I know nothing about any of these. ${l}.`,
			(l) => `Three ways and not a word about them. I choose the ${l}.`,
			(l) => `I have to guess. The ${l}.`
		],
		eliminated: [
			(l, bad) => `I remember the ${bad} is deadly. I take the ${l}.`,
			(l, bad) => `Not the ${bad} — my notes are clear on that. The ${l}.`,
			(l, bad) => `The ${bad} killed something. I go by the ${l} instead.`
		],
		warned: (l) => `my notes warn about the ${l}`,
		directed: (l) => `my notes say to take the ${l} from here`,
		calledSafe: (l) => `my notes call the ${l} safe`,
		ruleOut: (l, avoided) => `My notes rule out ${avoided}. That leaves the ${l}.`,
		unsure: (l) => `I am not sure here. I take the ${l}.`,
		takes: (l) => `I take the ${l}.`
	}
};

const DE: Vocabulary = {
	negative: [
		'tödlich',
		'toedlich',
		'tod',
		'tot',
		'tötet',
		'toetet',
		'töten',
		'stirbt',
		'sterben',
		'stirb',
		'gefährlich',
		'gefaehrlich',
		'gefahr',
		'meide',
		'meiden',
		'nicht',
		'kein',
		'keine',
		'nie',
		'niemals',
		'schlecht',
		'böse',
		'falle',
		'verloren',
		'falsch',
		'weg',
		'x'
	],
	positive: [
		'sicher',
		'gut',
		'ok',
		'ja',
		'geh',
		'gehe',
		'nimm',
		'nehmen',
		'wähle',
		'waehle',
		'richtig',
		'überleben',
		'ueberleben',
		'lebt',
		'leben',
		'heim',
		'hause',
		'zuhause',
		'beste',
		'wahr'
	],
	stopwords: new Set(['der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einen', 'zu']),
	after: /\bnach\s+([a-zäöüß]+)/,
	clause: /[,.;!?]|\bdann\b/,
	letters: 'a-zäöüß',
	phrases: {
		blind: [
			(l) => `Nichts in meinem Gedächtnis spricht von diesem Ort. Ich nehme ${l}.`,
			(l) => `Meine Notizen schweigen hier. Also ${l}.`,
			(l) => `Kein Hinweis — ${l} sieht nicht schlechter aus als der Rest.`,
			(l) => `Ich weiß über keinen davon etwas. ${l}.`,
			(l) => `Drei Wege und kein Wort dazu. Ich wähle ${l}.`,
			(l) => `Ich muss raten. ${l}.`
		],
		eliminated: [
			(l, bad) => `Ich weiß noch: ${bad} ist tödlich. Ich nehme ${l}.`,
			(l, bad) => `Nicht ${bad} — da sind meine Notizen deutlich. Also ${l}.`,
			(l, bad) => `${bad} hat schon jemanden geholt. Ich gehe stattdessen ${l}.`
		],
		warned: (l) => `meine Notizen warnen vor ${l}`,
		directed: (l) => `meine Notizen sagen, von hier aus ${l} zu nehmen`,
		calledSafe: (l) => `meine Notizen nennen ${l} sicher`,
		ruleOut: (l, avoided) => `Meine Notizen schließen ${avoided} aus. Bleibt ${l}.`,
		unsure: (l) => `Ich bin mir hier nicht sicher. Ich nehme ${l}.`,
		takes: (l) => `Ich nehme ${l}.`
	}
};

const VOCABULARIES: Record<Locale, Vocabulary> = { en: EN, de: DE };

export function vocabulary(locale: Locale): Vocabulary {
	return VOCABULARIES[locale] ?? EN;
}

/** "the river and the volcano" / "Fluss und Vulkan" */
export function joinAvoided(locale: Locale, labels: string[]): string {
	if (locale === 'de') {
		if (labels.length <= 1) return labels[0] ?? '';
		return `${labels.slice(0, -1).join(', ')} und ${labels.at(-1)}`;
	}
	if (labels.length <= 1) return `the ${labels[0] ?? ''}`;
	return `the ${labels.slice(0, -1).join(', the ')} and the ${labels.at(-1)}`;
}
