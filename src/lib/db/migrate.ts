import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { databasePath, getDb } from './db.ts';

/**
 * Apply pending migrations. Safe to run repeatedly — Drizzle tracks what has
 * already been applied in its own journal table.
 */
export function runMigrations(): void {
	const db = getDb();
	migrate(db, { migrationsFolder: './drizzle' });
	console.log(`[homeward] database ready at ${databasePath()}`);
}
