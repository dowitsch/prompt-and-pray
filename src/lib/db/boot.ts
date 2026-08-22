import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { databasePath, getDb } from './db.ts';
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
 * Both halves are idempotent. Migrations are tracked in Drizzle's own journal,
 * and seeding replaces the built-in stories while leaving anything an author
 * made alone — which also means a redeploy carries story edits from the code
 * into the running database.
 */
export function prepareDatabase(): string {
	const db = getDb();
	migrate(db, { migrationsFolder: './drizzle' });
	seed(db);
	return databasePath();
}
