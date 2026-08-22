import { fail, redirect } from '@sveltejs/kit';
import { getDb } from '$lib/db/db';
import { createStory, deleteStory, duplicateStory, storyInPlay } from '$lib/db/design';
import { listStories } from '$lib/db/story';
import { requireDesigner } from '$lib/server/designer';
import { isLocale } from '$lib/i18n';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	requireDesigner();
	const db = getDb();

	return {
		stories: listStories(db).map((story) => ({
			...story,
			// A story being played cannot be deleted out from under the match.
			matches: storyInPlay(db, story.id)
		}))
	};
};

/** Turn a thrown error into something the page can show without a stack trace. */
function refuse(error: unknown) {
	return fail(400, { message: error instanceof Error ? error.message : 'That did not work.' });
}

export const actions: Actions = {
	create: async ({ request }) => {
		requireDesigner();
		const form = await request.formData();
		const name = String(form.get('name') ?? '').trim();
		const locale = String(form.get('locale') ?? 'en');

		if (!name) return fail(400, { message: 'Give the tale a name first.' });

		let slug: string;
		try {
			slug = createStory(getDb(), name, isLocale(locale) ? locale : 'en');
		} catch (error) {
			return refuse(error);
		}
		redirect(303, `/design/${slug}`);
	},

	duplicate: async ({ request }) => {
		requireDesigner();
		const form = await request.formData();

		let slug: string;
		try {
			slug = duplicateStory(getDb(), String(form.get('slug')));
		} catch (error) {
			return refuse(error);
		}
		redirect(303, `/design/${slug}`);
	},

	remove: async ({ request }) => {
		requireDesigner();
		const form = await request.formData();
		try {
			deleteStory(getDb(), String(form.get('slug')));
		} catch (error) {
			return refuse(error);
		}
		return { removed: true };
	}
};
