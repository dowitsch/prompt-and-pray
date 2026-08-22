import { vocabulary } from '../agent/vocabulary.ts';
import { MEMORY_GRANT_CHARS, type StoryGraph, type StoryNode } from './types.ts';
import type { Locale } from '../i18n/index.ts';

/**
 * What makes a designed story *playable*.
 *
 * The schema stops a story being malformed — no cross-story edges, no self-
 * loops, no duplicate labels at a node. None of that stops a story being
 * unplayable, which is a different and much easier mistake to make: a gate
 * nobody can reach, a crossroads with one road, a place with no way out.
 *
 * The rule worth the most here is the keyword collision. The offline brain
 * decides by matching a player's twenty handwritten characters against the names
 * of the roads in front of it, so two roads out of one place that share a word
 * make a single note fire for both. Nothing looks broken; agents just quietly
 * stop learning. It is the rule a designer will break constantly and the only
 * one whose failure is invisible from the outside.
 */

export type ProblemSeverity =
	/** Publishing is refused. */
	| 'error'
	/** Publishing is allowed; the story is playable but probably not as intended. */
	| 'warning';

export type Problem = {
	severity: ProblemSeverity;
	/** Stable machine name, so the designer can point at the right control. */
	code: string;
	message: string;
	/** The node this is about, when it is about one. */
	nodeId?: string;
	choiceId?: string;
};

export type Validation = {
	problems: Problem[];
	errors: Problem[];
	warnings: Problem[];
	/** True when nothing is an error. Warnings do not block. */
	publishable: boolean;
};

/**
 * Words in a label that a note could plausibly be keyed on: long enough to be
 * distinctive, and not something the brain already ignores.
 */
export function significantWords(label: string, locale: Locale): string[] {
	const { stopwords } = vocabulary(locale);
	return label
		.toLowerCase()
		.split(/[^\p{L}\p{N}]+/u)
		.filter((word) => word.length >= 3 && !stopwords.has(word));
}

/** Every node reachable from the start by following roads. */
export function reachableFrom(graph: StoryGraph, startNodeId: string): Set<string> {
	const seen = new Set([startNodeId]);
	const queue = [startNodeId];

	while (queue.length) {
		const node = graph.nodes[queue.shift()!];
		if (!node) continue;
		for (const choice of node.choices) {
			if (!seen.has(choice.nextNode)) {
				seen.add(choice.nextNode);
				queue.push(choice.nextNode);
			}
		}
	}
	return seen;
}

function describe(node: StoryNode): string {
	return node.title.trim() || `node ${node.id}`;
}

export function validateStory(graph: StoryGraph, locale: Locale): Validation {
	const problems: Problem[] = [];
	const add = (
		severity: ProblemSeverity,
		code: string,
		message: string,
		extra: { nodeId?: string; choiceId?: string } = {}
	) => problems.push({ severity, code, message, ...extra });

	const nodes = Object.values(graph.nodes);

	if (!nodes.length) {
		add('error', 'empty', 'This story has no places in it yet.');
		return finish(problems);
	}

	/* --------------------------------------------------------------- the start */

	const start = graph.nodes[graph.startNode];
	if (!start) {
		add('error', 'no-start', 'No opening place is set. Pick the one the agents set out from.');
	} else if (start.endingType) {
		add('error', 'start-is-ending', `"${describe(start)}" is both the opening and an ending.`, {
			nodeId: start.id
		});
	}

	/* ------------------------------------------------------------- the endings */

	const homes = nodes.filter((n) => n.endingType === 'SUCCESS');
	if (!homes.length) {
		add('error', 'no-home', 'Nowhere to get to: no place is marked as home.');
	}

	const reachable = start ? reachableFrom(graph, start.id) : new Set<string>();

	if (homes.length && !homes.some((h) => reachable.has(h.id))) {
		add('error', 'home-unreachable', 'Home cannot be reached from the opening place by any road.');
	}

	if (!nodes.some((n) => n.endingType === 'FAILURE')) {
		add(
			'warning',
			'no-failure',
			'No wrong turn is fatal, so there is nothing for a player to warn their agent about.'
		);
	}

	/* --------------------------------------------------------------- the roads */

	for (const node of nodes) {
		const here = describe(node);

		if (node.endingType) {
			if (node.choices.length) {
				add(
					'error',
					'ending-has-exits',
					`"${here}" is an ending, but roads still lead out of it.`,
					{
						nodeId: node.id
					}
				);
			}
			if (!node.description.trim()) {
				add('warning', 'ending-silent', `"${here}" ends a run with nothing to read out.`, {
					nodeId: node.id
				});
			}
			continue;
		}

		// A single road is not a choice, and the whole game is choices.
		if (node.choices.length === 0) {
			add('error', 'dead-end', `"${here}" has no way out and is not an ending.`, {
				nodeId: node.id
			});
		} else if (node.choices.length === 1) {
			add('error', 'one-way', `"${here}" offers only one road, so there is nothing to decide.`, {
				nodeId: node.id
			});
		}

		if (!node.title.trim()) {
			add('warning', 'untitled', `A place has no name.`, { nodeId: node.id });
		}

		/* --------------------------------------------- the rule that matters most */

		const byWord = new Map<string, string[]>();
		for (const choice of node.choices) {
			if (!choice.label.trim()) {
				add('error', 'unlabelled', `A road out of "${here}" has no name.`, {
					nodeId: node.id,
					choiceId: choice.id
				});
				continue;
			}

			const words = significantWords(choice.label, locale);
			if (!words.length) {
				add(
					'warning',
					'label-not-distinctive',
					`"${choice.label}" out of "${here}" has no word a note could name it by.`,
					{ nodeId: node.id, choiceId: choice.id }
				);
			}

			// Twenty characters have to hold a name and something about it. A road
			// whose shortest distinctive word already fills the grant cannot be
			// written about at all.
			const shortest = words.length ? Math.min(...words.map((w) => w.length)) : 0;
			if (shortest > MEMORY_GRANT_CHARS - 6) {
				add(
					'warning',
					'label-too-long',
					`"${choice.label}" out of "${here}" leaves almost none of the ${MEMORY_GRANT_CHARS} characters for what to say about it.`,
					{ nodeId: node.id, choiceId: choice.id }
				);
			}

			for (const word of words) {
				byWord.set(word, [...(byWord.get(word) ?? []), choice.label]);
			}
		}

		for (const [word, labels] of byWord) {
			if (labels.length > 1) {
				add(
					'error',
					'keyword-collision',
					`"${labels.join('" and "')}" out of "${here}" both contain "${word}" — one note would name both roads at once.`,
					{ nodeId: node.id }
				);
			}
		}
	}

	/* ------------------------------------------------------ nowhere and no way */

	for (const node of nodes) {
		if (!reachable.has(node.id)) {
			add('warning', 'unreachable', `"${describe(node)}" cannot be reached from the opening.`, {
				nodeId: node.id
			});
		} else if (!node.endingType && graph.distanceHome[node.id] === undefined && homes.length) {
			// Reachable, alive, and no road home: an agent that gets here is walking
			// until its daylight runs out.
			add(
				'warning',
				'no-way-home',
				`No road leads home from "${describe(node)}" — an agent that reaches it can only wander.`,
				{ nodeId: node.id }
			);
		}
	}

	return finish(problems);
}

function finish(problems: Problem[]): Validation {
	const errors = problems.filter((p) => p.severity === 'error');
	const warnings = problems.filter((p) => p.severity === 'warning');
	return { problems, errors, warnings, publishable: errors.length === 0 };
}
