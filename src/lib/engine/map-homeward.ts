import type { DecisionMap, DecisionNode, DecisionChoice } from './types.ts';

/**
 * THE LONG WAY HOME — the prototype's single hand-designed map.
 *
 * 8 decision levels, 3 choices each, exactly one correct choice per level and
 * exactly one path to HOME. Every wrong choice leads to its own terminal death
 * node with its own epitaph, so the tree reads as a place rather than a graph.
 *
 * The correct path: Forest -> Mountain -> Valley -> Orchard -> Ferry ->
 * Lantern Road -> Ash Road -> The Gate.
 *
 * This map is data. Adding another one means adding another file of this
 * shape — the layout, the engine and the UI make no assumptions about it
 * beyond "one correct choice per node".
 */

type LevelSpec = {
	/** Node the player is standing on when they make this decision. */
	node: string;
	title: string;
	description: string;
	choices: {
		id: string;
		label: string;
		/** The one true choice of the level. */
		correct?: true;
		/** Shown when an agent dies here. */
		epitaph?: string;
		/** Title of the death node, e.g. "The River". */
		deathTitle?: string;
	}[];
};

const LEVELS: LevelSpec[] = [
	{
		node: 'start',
		title: 'The Three Trails',
		description: 'Your carrier signal died somewhere over this valley. Three ways lead out of it.',
		choices: [
			{
				id: 'river',
				label: 'River',
				deathTitle: 'The River',
				epitaph: 'The current took it. Nothing came back downstream.'
			},
			{ id: 'forest', label: 'Forest', correct: true },
			{
				id: 'volcano',
				label: 'Volcano',
				deathTitle: 'The Volcano',
				epitaph: 'The ash was warm, then it was not warm at all.'
			}
		]
	},
	{
		node: 'forest',
		title: 'Under the Canopy',
		description: 'The trees close overhead. Three gaps in the green, and no sky to steer by.',
		choices: [
			{ id: 'mountain', label: 'Mountain', correct: true },
			{
				id: 'water',
				label: 'Black Water',
				deathTitle: 'The Black Water',
				epitaph: 'It waded in. The water did not ripple when it stopped moving.'
			},
			{
				id: 'cave',
				label: 'Cave',
				deathTitle: 'The Cave',
				epitaph: 'Something in there was already awake.'
			}
		]
	},
	{
		node: 'mountain',
		title: 'The Ridge',
		description: 'Above the treeline at last. The wind is loud enough to think in.',
		choices: [
			{
				id: 'bridge',
				label: 'Bridge',
				deathTitle: 'The Bridge',
				epitaph: 'The rope held for four steps. There were nine steps.'
			},
			{ id: 'valley', label: 'Valley', correct: true },
			{
				id: 'tunnel',
				label: 'Tunnel',
				deathTitle: 'The Tunnel',
				epitaph: 'It walked in straight and never found the far end.'
			}
		]
	},
	{
		node: 'valley',
		title: 'The Valley Floor',
		description: 'Soft ground, low mist, and the smell of something that used to be a town.',
		choices: [
			{
				id: 'mill',
				label: 'Mill',
				deathTitle: 'The Mill',
				epitaph: 'The wheel was still turning. There was no water to turn it.'
			},
			{ id: 'orchard', label: 'Orchard', correct: true },
			{
				id: 'pit',
				label: 'Pit',
				deathTitle: 'The Pit',
				epitaph: 'It went down to look. Down was further than it looked.'
			}
		]
	},
	{
		node: 'orchard',
		title: 'The Wide River',
		description: 'Old fruit trees give way to a river too broad to see across.',
		choices: [
			{ id: 'ferry', label: 'Ferry', correct: true },
			{
				id: 'raft',
				label: 'Raft',
				deathTitle: 'The Raft',
				epitaph: 'Six planks and good intentions. The river was unimpressed.'
			},
			{
				id: 'swim',
				label: 'Swim',
				deathTitle: 'The Crossing',
				epitaph: 'It was a strong swimmer for about ninety seconds.'
			}
		]
	},
	{
		node: 'ferry',
		title: 'The Far Bank',
		description: 'The ferryman does not speak. Ahead, three lit ways into the dark.',
		choices: [
			{
				id: 'market',
				label: 'Market',
				deathTitle: 'The Night Market',
				epitaph: 'Everyone was very friendly. That was the problem.'
			},
			{
				id: 'chapel',
				label: 'Chapel',
				deathTitle: 'The Chapel',
				epitaph: 'The door closed behind it, politely, and stayed closed.'
			},
			{ id: 'lantern', label: 'Lantern Road', correct: true }
		]
	},
	{
		node: 'lantern',
		title: 'Where the Lights End',
		description: 'The last lantern gutters out. Three roads continue without it.',
		choices: [
			// Deliberately shares no significant word with any other label at any
			// level: memory notes are matched by keyword, so overlapping names
			// ("Lantern Road" / "Ash Road") would make a note fire in two places.
			{ id: 'ash', label: 'Ashfall', correct: true },
			{
				id: 'mirror',
				label: 'Mirror Lake',
				deathTitle: 'Mirror Lake',
				epitaph: 'It saw itself arrive home. It kept walking toward that.'
			},
			{
				id: 'hollow',
				label: 'Hollow',
				deathTitle: 'The Hollow',
				epitaph: 'The ground was thin here. It is thinner now.'
			}
		]
	},
	{
		node: 'ash',
		title: 'The Last Gate',
		description: 'Grey ash, grey air, and the outline of somewhere you know.',
		choices: [
			{ id: 'gate', label: 'The Gate', correct: true },
			{
				id: 'wall',
				label: 'Wall',
				deathTitle: 'The Wall',
				epitaph: 'It climbed. The wall was taller on the other side.'
			},
			{
				id: 'well',
				label: 'Well',
				deathTitle: 'The Well',
				epitaph: 'It heard voices down there. They were not saying come back.'
			}
		]
	}
];

const HOME_NODE = 'home';

function build(): DecisionMap {
	const nodes: Record<string, DecisionNode> = {};

	for (const [level, spec] of LEVELS.entries()) {
		const isLastLevel = level === LEVELS.length - 1;
		const choices: DecisionChoice[] = [];

		for (const choice of spec.choices) {
			if (choice.correct) {
				choices.push({
					id: choice.id,
					label: choice.label,
					nextNode: isLastLevel ? HOME_NODE : choice.id,
					outcome: isLastLevel ? 'win' : 'continue'
				});
				continue;
			}

			const deathNodeId = `dead_${choice.id}`;
			nodes[deathNodeId] = {
				id: deathNodeId,
				title: choice.deathTitle ?? choice.label,
				description: choice.epitaph ?? 'The run ends here.',
				epitaph: choice.epitaph,
				choices: [],
				kind: 'death'
			};
			choices.push({
				id: choice.id,
				label: choice.label,
				nextNode: deathNodeId,
				outcome: 'death'
			});
		}

		nodes[spec.node] = {
			id: spec.node,
			title: spec.title,
			description: spec.description,
			choices,
			kind: level === 0 ? 'start' : 'path'
		};
	}

	nodes[HOME_NODE] = {
		id: HOME_NODE,
		title: 'HOME',
		description: 'The gate opens. The signal reconnects. It made it.',
		choices: [],
		kind: 'home'
	};

	return {
		id: 'homeward',
		name: 'THE LONG WAY HOME',
		tagline: 'Eight choices between your agent and the gate.',
		startNode: 'start',
		homeNode: HOME_NODE,
		depth: LEVELS.length,
		nodes
	};
}

export const HOMEWARD_MAP: DecisionMap = build();

/** The winning sequence of choice ids. Server-side only — never sent to a client. */
export const SOLUTION: string[] = LEVELS.map(
	(level) => level.choices.find((choice) => choice.correct)!.id
);
