import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { databasePath, getDb, withForeignKeysOff } from './db.ts';

/**
 * Apply pending migrations. Safe to run repeatedly — Drizzle tracks what has
 * already been applied in its own journal table.
 *
 * Foreign keys are off for the duration, because a migration that rebuilds a
 * table has to drop the old one while other tables still point at it. See
 * `withForeignKeysOff`, which also checks afterwards that nothing was orphaned.
 */
export function runMigrations(): void {
	const db = getDb();
	withForeignKeysOff(() => migrate(db, { migrationsFolder: './drizzle' }));
	console.log(`[homeward] database ready at ${databasePath()}`);
}
