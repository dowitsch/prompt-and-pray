import { json } from '@sveltejs/kit';
import { getDb } from '$lib/db/db';
import { listStories } from '$lib/db/story';
import type { RequestHandler } from './$types';

/**
 * The tales on offer, for the menu's story picker.
 *
 * Published only, and only the parts that are nobody's secret — name, slug,
 * language, how long the shortest way home is. The graph itself never leaves the
 * server: that is where the answer lives.
 *
 * An endpoint rather than layout data because the picker is reachable from the
 * global menu, and threading a server load through every route to feed one sheet
 * would be worse than one small fetch.
 */
export const GET: RequestHandler = async () => {
	const stories = listStories(getDb(), true).map((story) => ({
		slug: story.slug,
		name: story.name,
		locale: story.locale,
		parSteps: story.parSteps
	}));
	return json({ stories });
};
