import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'

import { hasRoleAtLeast, migrate, ROLES } from './schema.mjs'

test('the three roles rank in order of trust', () => {
  assert.equal(hasRoleAtLeast(ROLES.ADMIN, ROLES.AUTHOR), true)
  assert.equal(hasRoleAtLeast(ROLES.AUTHOR, ROLES.AUTHOR), true)
  assert.equal(hasRoleAtLeast(ROLES.MEMBER, ROLES.AUTHOR), false)
  assert.equal(hasRoleAtLeast(ROLES.AUTHOR, ROLES.ADMIN), false)
})

test('an unknown or missing role is never treated as trusted', () => {
  // A row written before the migration, or a value someone typed by hand,
  // must fail closed rather than pass every check.
  for (const role of [undefined, null, '', 'superuser', 'ADMIN']) {
    assert.equal(hasRoleAtLeast(role, ROLES.MEMBER), false, `role ${role}`)
  }
})

test('migrating an existing database carries the admin flag across', () => {
  // The live database has one account created as is_admin = 1. Losing its
  // privilege on migration would lock the company out of its own admin page.
  const db = new DatabaseSync(':memory:')

  // Build the v1 shape by hand, then migrate the whole way up.
  db.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      pass_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      is_admin INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      expires_at INTEGER NOT NULL
    );
    PRAGMA user_version = 1;
  `)
  db.prepare(
    `INSERT INTO users (email, name, pass_hash, salt, status, is_admin)
     VALUES ('boss@x.vn', 'Boss', 'h', 's', 'active', 1),
            ('ky@x.vn', 'Kỹ sư', 'h', 's', 'active', 0)`
  ).run()

  migrate(db)

  const rows = db.prepare('SELECT email, role FROM users ORDER BY email').all()
  assert.deepEqual(rows.map(r => [r.email, r.role]), [
    ['boss@x.vn', 'admin'],
    ['ky@x.vn', 'member']
  ])
})

test('the old flag is gone, so nothing can consult a stale copy', () => {
  const db = new DatabaseSync(':memory:')
  migrate(db)
  const columns = db.prepare(`PRAGMA table_info(users)`).all().map(c => c.name)
  assert.ok(columns.includes('role'))
  assert.ok(!columns.includes('is_admin'))
})
