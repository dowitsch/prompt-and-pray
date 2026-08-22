import type { Locale } from '../i18n/index.ts';

/**
 * Who the four agents *are*.
 *
 * A character used to be a bare integer that picked a portrait file and nothing
 * else. It is now the agent's identity: the name in the speech bubble, the name
 * the model is told it answers to, and — through `src/lib/agent/personas.ts` —
 * the way it decides. The player's typed name belongs to the *operator*; the
 * agent that walks the map is Krotz or Aurelia or PENGU-01 or Malakor.
 *
 * This file is deliberately data only, and deliberately in `engine/`: the client
 * needs the name and the portrait, the server needs the same index to look up a
 * persona, and neither should own the list. The prompt text and the sampling
 * parameters live server-side in `agent/personas.ts` and never reach the bundle.
 *
 * The order is the order of the carousel on the config screen and the order
 * `Game.freeCharacter()` hands seats out in. Changing it re-skins saved matches,
 * because a match stores the index and not the id.
 */

export type CharacterId = 'krotz' | 'aurelia' | 'pengu' | 'malakor';

export type Character = {
	id: CharacterId;
	/**
	 * Display name, and the name the model is given.
	 *
	 * The same in every language, because it is a proper noun — and because the
	 * agent has to be recognisably the same figure to a German and an English
	 * table, the way the path ids are.
	 */
	name: string;
	/** The half of the title that *is* translated. */
	epithet: Record<Locale, string>;
	/** One line for the character-select carousel, in the player's language. */
	blurb: Record<Locale, string>;
};

export const CHARACTERS: readonly Character[] = [
	{
		id: 'krotz',
		name: 'KROTZ',
		epithet: { de: 'der Unrat-Gnom', en: 'the Refuse Gnome' },
		blurb: {
			de: 'Zusammengeschustert aus faulendem Sumpfholz. Folgt den Notizen und beschimpft sie dabei; sind sie unklar, nimmt er aus Bosheit den dreckigsten Weg.',
			en: 'Cobbled together from rotting swamp wood. Follows your notes while cursing them; when they are unclear he takes the filthiest road out of spite.'
		}
	},
	{
		id: 'aurelia',
		name: 'AURELIA',
		epithet: { de: 'die Mahagoni-Elfin', en: 'the Mahogany Elf' },
		blurb: {
			de: 'Aus poliertem Mahagoni, von goldenen Harzadern durchzogen. Nimmt jede Notiz wörtlich — und wendet eine unsaubere lieber gar nicht an.',
			en: 'Carved from polished mahogany, veined with gold resin. Takes every note literally — and would rather not apply a sloppy one at all.'
		}
	},
	{
		id: 'pengu',
		name: 'PENGU-01',
		epithet: { de: 'der Ritter-Pinguin', en: 'the Knight Penguin' },
		blurb: {
			de: 'Birkenholz, schiefe Blechkrone, ein Rucksack voll Dynamit. Entscheidet sofort, wählt das Abenteuer — und glaubt jeder Abkürzung.',
			en: 'Birch wood, a crooked tin crown, a pack full of dynamite. Decides instantly, picks the adventure — and believes any shortcut.'
		}
	},
	{
		id: 'malakor',
		name: 'MALAKOR',
		epithet: { de: 'der Verkohlte Magier', en: 'the Charred Mage' },
		blurb: {
			de: 'Blitzgetroffene Eiche, violettes Seelenfeuer in den Rissen. Prüft jede Notiz gegen den bisherigen Weg und wittert überall Sabotage.',
			en: 'Lightning-struck oak, violet soul-fire in the cracks. Checks every note against the route so far and smells sabotage everywhere.'
		}
	}
];

/**
 * How many characters there are.
 *
 * `scripts/check-graph.ts` asserts this stays >= `MAX_PLAYERS`, which is what
 * makes `Game.freeCharacter()` total: there is always an unused one for a
 * joiner, so a full lobby can never wedge on identity.
 */
export const CHARACTER_COUNT = CHARACTERS.length;

/** The character at a seat's index. Wraps rather than throwing — a stored index
 * from an older schema must still resolve to *somebody*. */
export function characterAt(index: number): Character {
	return CHARACTERS[((index % CHARACTER_COUNT) + CHARACTER_COUNT) % CHARACTER_COUNT];
}

/** "KROTZ, der Unrat-Gnom" — the carousel's heading and the prompt's YOU ARE line. */
export function characterTitle(index: number, locale: Locale): string {
	const character = characterAt(index);
	return `${character.name}, ${character.epithet[locale] ?? character.epithet.en}`;
}
