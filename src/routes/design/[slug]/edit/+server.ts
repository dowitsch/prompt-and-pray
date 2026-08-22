import { json } from '@sveltejs/kit';
import { getDb } from '$lib/db/db';
import {
	addChoice,
	addNode,
	deleteChoice,
	deleteNode,
	loadDesignStory,
	moveNodes,
	setStatus,
	setStartNode,
	updateChoice,
	updateNode,
	type ChoicePatch,
	type NodePatch
} from '$lib/db/design';
import { loadStory } from '$lib/db/story';
import { validateStory } from '$lib/engine/validate';
import { requireDesigner } from '$lib/server/designer';
import type { NodeKind } from '$lib/engine/types';
import type { RequestHandler } from './$types';

/**
 * Every edit the canvas makes, in one place.
 *
 * The canvas sends what the author did and gets the whole story back, along with
 * the validator's verdict. Round-tripping the whole thing rather than patching
 * the client's copy is the point: derived values move when the graph does — par,
 * whether the story is still publishable, choices dropped because a place became
 * an ending — and a client trying to predict those would eventually be wrong.
 * A story is a few dozen rows, so the honest thing is also the cheap thing.
 */

type Edit =
	| { do: 'move'; moves: { id: number; x: number; y: number }[] }
	| {
			do: 'addNode';
			kind: NodeKind;
			title: string;
			templateId: number | null;
			x: number;
			y: number;
	  }
	| { do: 'updateNode'; nodeId: number; patch: NodePatch }
	| { do: 'deleteNode'; nodeId: number }
	| { do: 'setStart'; nodeId: number }
	| { do: 'addChoice'; fromNodeId: number; toNodeId: number; label?: string }
	| { do: 'updateChoice'; choiceId: number; patch: ChoicePatch }
	| { do: 'deleteChoice'; choiceId: number };

export const POST: RequestHandler = async ({ request, params }) => {
	requireDesigner();

	const db = getDb();
	const story = loadDesignStory(db, params.slug);
	const edit = (await request.json()) as Edit;

	try {
		switch (edit.do) {
			case 'move':
				moveNodes(db, story.id, edit.moves);
				break;
			case 'addNode':
				addNode(db, story.id, {
					kind: edit.kind,
					title: edit.title,
					templateId: edit.templateId,
					x: edit.x,
					y: edit.y
				});
				break;
			case 'updateNode':
				updateNode(db, story.id, edit.nodeId, edit.patch);
				break;
			case 'deleteNode':
				deleteNode(db, story.id, edit.nodeId);
				break;
			case 'setStart':
				setStartNode(db, story.id, edit.nodeId);
				break;
			case 'addChoice':
				// No label means "name it after where it leads" — see addChoice.
				addChoice(db, story.id, edit.fromNodeId, edit.toNodeId, edit.label ?? '');
				break;
			case 'updateChoice':
				updateChoice(db, story.id, edit.choiceId, edit.patch);
				break;
			case 'deleteChoice':
				deleteChoice(db, story.id, edit.choiceId);
				break;
		}
	} catch (cause) {
		// An author's mistake — a duplicate road name, a road out of an ending — is
		// not a server fault. Say what went wrong and give back the unchanged story.
		return json(
			{
				problem: cause instanceof Error ? cause.message : 'That did not work.',
				...view(params.slug)
			},
			{ status: 200 }
		);
	}

	return json(view(params.slug));
};

function view(slug: string) {
	const db = getDb();
	let story = loadDesignStory(db, slug);
	const validation = validateStory(loadStory(db, slug), story.locale);

	// An edit can break a story that was already published — a road renamed into
	// a keyword collision does not change par, so nothing else would catch it.
	// Publishing is what says "this is ready to be played", and it stops being
	// true the moment it stops being true.
	if (story.status === 'published' && !validation.publishable) {
		setStatus(db, slug, 'draft');
		story = { ...story, status: 'draft' };
	}

	return { story, validation };
}
