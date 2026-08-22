import type { Locale } from '../i18n/index.ts';
import type { NODE_KINDS } from './schema.ts';

type Kind = (typeof NODE_KINDS)[number];

/**
 * The designer's palette.
 *
 * Building blocks a story author picks from: first a kind, then a template.
 * Seeded rather than hardcoded in the UI so an author can add their own later.
 */

export const TEMPLATES: { kind: Kind; en: string; de: string }[] = [
	{ kind: 'LOCATION', en: 'Crossroads', de: 'Wegkreuzung' },
	{ kind: 'LOCATION', en: 'Forest', de: 'Wald' },
	{ kind: 'LOCATION', en: 'River', de: 'Fluss' },
	{ kind: 'LOCATION', en: 'Lake', de: 'See' },
	{ kind: 'LOCATION', en: 'Mountain', de: 'Berg' },
	{ kind: 'LOCATION', en: 'Valley', de: 'Tal' },
	{ kind: 'LOCATION', en: 'Cave', de: 'Höhle' },
	{ kind: 'LOCATION', en: 'Tunnel', de: 'Tunnel' },
	{ kind: 'LOCATION', en: 'Pit', de: 'Grube' },
	{ kind: 'LOCATION', en: 'Bridge', de: 'Brücke' },
	{ kind: 'LOCATION', en: 'Village', de: 'Dorf' },
	{ kind: 'LOCATION', en: 'Market', de: 'Markt' },
	{ kind: 'LOCATION', en: 'Chapel', de: 'Kapelle' },
	{ kind: 'LOCATION', en: 'Castle', de: 'Burg' },
	{ kind: 'LOCATION', en: 'Mill', de: 'Mühle' },
	{ kind: 'LOCATION', en: 'Orchard', de: 'Obstgarten' },
	{ kind: 'LOCATION', en: 'Road', de: 'Weg' },
	{ kind: 'LOCATION', en: 'Gate', de: 'Tor' },
	{ kind: 'LOCATION', en: 'Wall', de: 'Mauer' },
	{ kind: 'LOCATION', en: 'Well', de: 'Brunnen' },
	{ kind: 'LOCATION', en: 'Volcano', de: 'Vulkan' },
	{ kind: 'LOCATION', en: 'Hollow', de: 'Senke' },
	{ kind: 'LOCATION', en: 'Crossing', de: 'Querung' },

	{ kind: 'CREATURE', en: 'Ork', de: 'Ork' },
	{ kind: 'CREATURE', en: 'Elf', de: 'Elf' },
	{ kind: 'CREATURE', en: 'Fairy', de: 'Fee' },
	{ kind: 'CREATURE', en: 'Wolf', de: 'Wolf' },
	{ kind: 'CREATURE', en: 'Dragon', de: 'Drache' },
	{ kind: 'CREATURE', en: 'Ferryman', de: 'Fährmann' },
	{ kind: 'CREATURE', en: 'Merchant', de: 'Händler' },
	{ kind: 'CREATURE', en: 'Stranger', de: 'Fremder' },

	{ kind: 'OBJECT', en: 'Sword', de: 'Schwert' },
	{ kind: 'OBJECT', en: 'Boat', de: 'Boot' },
	{ kind: 'OBJECT', en: 'Raft', de: 'Floß' },
	{ kind: 'OBJECT', en: 'Key', de: 'Schlüssel' },
	{ kind: 'OBJECT', en: 'Rope', de: 'Seil' },
	{ kind: 'OBJECT', en: 'Lantern', de: 'Laterne' },
	{ kind: 'OBJECT', en: 'Campfire', de: 'Lagerfeuer' },
	{ kind: 'OBJECT', en: 'Cart', de: 'Kutsche' },

	{ kind: 'EVENT', en: 'Storm', de: 'Sturm' },
	{ kind: 'EVENT', en: 'Ambush', de: 'Überfall' },
	{ kind: 'EVENT', en: 'Nightfall', de: 'Einbruch der Nacht' }
];

/**
 * Which kinds each tag makes sense on. "deep" belongs to a place, not to an ork;
 * "wounded" to a creature, not to a road. The designer filters by this so it
 * never offers a nonsense pairing.
 */
export const ATTRIBUTES: { en: string; de: string; appliesTo: Kind[] }[] = [
	{ en: 'large', de: 'gross', appliesTo: ['LOCATION', 'CREATURE', 'OBJECT'] },
	{ en: 'small', de: 'klein', appliesTo: ['LOCATION', 'CREATURE', 'OBJECT'] },
	{ en: 'dark', de: 'dunkel', appliesTo: ['LOCATION'] },
	{ en: 'bright', de: 'hell', appliesTo: ['LOCATION'] },
	{ en: 'evil', de: 'böse', appliesTo: ['CREATURE', 'LOCATION'] },
	{ en: 'kind', de: 'gutmütig', appliesTo: ['CREATURE'] },
	{ en: 'wide', de: 'weit', appliesTo: ['LOCATION'] },
	{ en: 'deep', de: 'tief', appliesTo: ['LOCATION'] },
	{ en: 'high', de: 'hoch', appliesTo: ['LOCATION'] },
	{ en: 'dangerous', de: 'gefährlich', appliesTo: ['LOCATION', 'CREATURE', 'EVENT'] },
	{ en: 'abandoned', de: 'verlassen', appliesTo: ['LOCATION', 'OBJECT'] },
	{ en: 'old', de: 'alt', appliesTo: ['LOCATION', 'CREATURE', 'OBJECT'] },
	{ en: 'noble', de: 'edel', appliesTo: ['CREATURE', 'OBJECT'] },
	{ en: 'dense', de: 'dicht', appliesTo: ['LOCATION'] },
	{ en: 'wounded', de: 'verletzt', appliesTo: ['CREATURE'] },
	{ en: 'friendly', de: 'freundlich', appliesTo: ['CREATURE'] },
	{ en: 'cursed', de: 'verflucht', appliesTo: ['LOCATION', 'OBJECT', 'CREATURE'] },
	{ en: 'sudden', de: 'plötzlich', appliesTo: ['EVENT'] }
];

export function templateName(index: number, locale: Locale): string {
	const t = TEMPLATES[index];
	return locale === 'de' ? t.de : t.en;
}
