import { getDb } from '$lib/db/db';
import { listStories } from '$lib/db/story';
import type { PageServerLoad } from './$types';

/**
 * The tales on offer.
 *
 * Only names and shapes — nothing here says where any road leads, so this is
 * safe to hand the browser. Drafts are left out: an unfinished tale is not
 * something anyone should be able to start a match on.
 */
export const load: PageServerLoad = async () => ({
	stories: listStories(getDb(), true).map((story) => ({
		slug: story.slug,
		name: story.name,
		description: story.description,
		locale: story.locale,
		parSteps: story.parSteps,
		builtIn: story.builtIn
	}))
});
