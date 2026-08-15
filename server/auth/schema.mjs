/**
 * Database schema and migrations.
 *
 * `CREATE TABLE IF NOT EXISTS` alone cannot evolve a schema: on a database
 * that already has the table, adding a column is a silent no-op — no error, no
 * column, and the bug only shows up as missing data later. Every change
 * therefore goes through a numbered migration, and `user_version` records how
 * far a given database has been taken.
 *
 * Rules for adding one: append a new entry, never edit an existing one, and
 * make it safe to run on a database that already carries real drawings.
 */

/** Ordered migrations. Index + 1 is the resulting `user_version`. */
const MIGRATIONS = [
  // v1 — accounts and sessions (the shape that shipped first).
  db => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        pass_hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        is_admin INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        expires_at INTEGER NOT NULL
      );
    `)
  },

  // v2 — drawings.
  //
  // `dxf` holds the drawing itself: the record of truth for a submission,
  // stored as opaque bytes because the server has no business parsing CAD.
  // `template_id` / `template_version` / `params` are the recipe — enough to
  // regenerate or to produce a variant, pinned to the exact template version
  // so a later template update cannot change an approved drawing.
  //
  // `revision` is the optimistic lock: a write carrying a stale revision is
  // refused rather than silently overwriting whatever arrived first.
  db => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS drawings (
        id TEXT PRIMARY KEY,
        owner_id INTEGER NOT NULL REFERENCES users(id),
        name TEXT NOT NULL,
        template_id TEXT,
        template_version TEXT,
        params TEXT,
        batch_id TEXT,
        dxf BLOB,
        revision INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_drawings_owner
        ON drawings(owner_id, updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_drawings_batch
        ON drawings(owner_id, batch_id);
    `)
  }
]

/**
 * Brings a database up to the current schema version.
 *
 * @param db - Open database.
 * @returns The version the database is now at.
 */
export function migrate(db) {
  db.exec('PRAGMA journal_mode = WAL;')

  const current = db.prepare('PRAGMA user_version').get().user_version ?? 0

  for (let version = current; version < MIGRATIONS.length; version++) {
    MIGRATIONS[version](db)
    // PRAGMA does not accept bound parameters, and `version` is a loop counter
    // over a fixed array — never user input.
    db.exec(`PRAGMA user_version = ${version + 1}`)
  }

  return MIGRATIONS.length
}

/** Schema version this code expects. */
export const SCHEMA_VERSION = MIGRATIONS.length
