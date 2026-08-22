import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import * as schema from './schema.ts';

/**
 * The database handle.
 *
 * One SQLite file, opened once per process. That single-writer shape is not a
 * compromise here — the WebSocket hub already has to be the only process
 * driving a match, because it holds the live round loop. See the deployment
 * notes in the README.
 */

export type Db = BetterSQLite3Database<typeof schema>;

let instance: Db | null = null;
let handle: Database.Database | null = null;

export function databasePath(env: Record<string, string | undefined> = process.env): string {
	return resolve(env.DATABASE_PATH ?? './data/homeward.db');
}

export function getDb(env: Record<string, string | undefined> = process.env): Db {
	if (instance) return instance;

	const path = databasePath(env);
	mkdirSync(dirname(path), { recursive: true });

	handle = new Database(path);
	// WAL lets the round loop write while a page reads, and is the right default
	// for a long-lived single-writer process.
	handle.pragma('journal_mode = WAL');
	handle.pragma('busy_timeout = 5000');
	// Off by default in SQLite, and this schema leans on foreign keys hard —
	// without this, cross-story edges would silently be allowed.
	handle.pragma('foreign_keys = ON');

	instance = drizzle(handle, { schema });
	return instance;
}

/**
 * Tests and scripts open their own database rather than the shared one.
 *
 * The same pragmas as `getDb`, on purpose — `busy_timeout` in particular. A
 * script run against a database the live server is writing to should wait its
 * turn, not die with SQLITE_BUSY.
 */
export function openDb(path: string): { db: Db; close: () => void } {
	mkdirSync(dirname(resolve(path)), { recursive: true });
	const raw = new Database(resolve(path));
	raw.pragma('journal_mode = WAL');
	raw.pragma('busy_timeout = 5000');
	raw.pragma('foreign_keys = ON');
	return { db: drizzle(raw, { schema }), close: () => raw.close() };
}

export function closeDb(): void {
	handle?.close();
	handle = null;
	instance = null;
}

export { schema };
