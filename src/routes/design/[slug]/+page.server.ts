import { error, fail } from '@sveltejs/kit';
import { getDb } from '$lib/db/db';
import {
	NotFound,
	autoArrange,
	loadDesignStory,
	loadPalette,
	renameStory,
	setStatus,
	storyInPlay
} from '$lib/db/design';
import { loadStory } from '$lib/db/story';
import { validateStory } from '$lib/engine/validate';
import { requireDesigner } from '$lib/server/designer';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	requireDesigner();
	const db = getDb();

	try {
		const story = loadDesignStory(db, params.slug);
		return {
			story,
			palette: loadPalette(db, story.locale),
			// The validator reads the *playable* shape, so what the designer shows is
			// exactly what the engine would be handed.
			validation: validateStory(loadStory(db, params.slug), story.locale),
			matches: storyInPlay(db, story.id)
		};
	} catch (cause) {
		if (cause instanceof NotFound) error(404, cause.message);
		throw cause;
	}
};

export const actions: Actions = {
	rename: async ({ request, params }) => {
		requireDesigner();
		const form = await request.formData();
		renameStory(
			getDb(),
			params.slug,
			String(form.get('name') ?? ''),
			String(form.get('description') ?? '')
		);
		return { renamed: true };
	},

	publish: async ({ params }) => {
		requireDesigner();
		const db = getDb();
		const story = loadDesignStory(db, params.slug);
		const { errors } = validateStory(loadStory(db, params.slug), story.locale);

		// The validator is the gate, not a suggestion: a story that cannot be
		// finished must not be something a player can pick.
		if (errors.length) {
			return fail(400, {
				message: `Not ready yet — ${errors.length} thing${errors.length === 1 ? '' : 's'} to put right first.`
			});
		}

		setStatus(db, params.slug, 'published');
		return { published: true };
	},

	unpublish: async ({ params }) => {
		requireDesigner();
		setStatus(getDb(), params.slug, 'draft');
		return { published: false };
	},

	arrange: async ({ params }) => {
		requireDesigner();
		autoArrange(getDb(), params.slug);
		return { arranged: true };
	}
};
