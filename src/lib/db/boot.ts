import { databasePath, getDb } from './db.ts';
import { dropStaleMatches } from './matches.ts';
import { runMigrations } from './migrate.ts';
import { seed } from './seed.ts';

/**
 * Get the database ready before anything asks it a question.
 *
 * Both entry points call this — `server.ts` in production and the Vite plugin in
 * development — so a fresh clone and a fresh volume both come up playable
 * without anyone remembering a setup step. It runs before the hub restores its
 * matches, because there is nothing to restore them *into* until the stories
 * exist.
 *
 * Migrations go through `runMigrations` rather than calling drizzle's `migrate`
 * here. That is not tidiness: a migration that rebuilds a table has to drop the
 * old one while `choices` and `node_attributes` still point at it, and the
 * `PRAGMA foreign_keys=OFF` the generated SQL asks for is silently ignored
 * inside the migrator's transaction. Boot used its own bare `migrate()` call
 * and so missed that guard, which is what broke the 0004 deploy.
 *
 * All three steps are idempotent. Migrations are tracked in Drizzle's own
 * journal, and seeding replaces the built-in stories while leaving anything an
 * author made alone — which also means a redeploy carries story edits from the
 * code into the running database.
 *
 * The sweep in the middle is what keeps that last promise true. Seeding will not
 * replace a story a match is still pointing at, and match rows outlive the
 * process that made them: without this, an abandoned lobby from last week would
 * quietly veto every future deploy of that tale. It runs *before* seeding, and
 * before the hub restores anything, because both of those read the rows it is
 * there to clear out.
 */
export function prepareDatabase(): string {
	runMigrations();
	const dropped = dropStaleMatches(getDb());
	if (dropped) console.log(`[homeward] dropped ${dropped} match(es) nobody has touched in hours.`);
	seed(getDb());
	return databasePath();
}
