import { databasePath, getDb } from './db.ts';
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
 * Both halves are idempotent. Migrations are tracked in Drizzle's own journal,
 * and seeding replaces the built-in stories while leaving anything an author
 * made alone — which also means a redeploy carries story edits from the code
 * into the running database.
 */
export function prepareDatabase(): string {
	runMigrations();
	seed(getDb());
	return databasePath();
}
