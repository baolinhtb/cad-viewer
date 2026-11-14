import assert from 'node:assert/strict'
import { scryptSync } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import { createDrawing } from './drawings.mjs'
import { migrate } from './schema.mjs'
import {
  createUser,
  deleteUser,
  initializeAdmin,
  listUsers,
  updateUser
} from './users.mjs'

function setup(t) {
  const db = new DatabaseSync(':memory:')
  migrate(db)
  db.exec('PRAGMA foreign_keys=ON')
  initializeAdmin(db, 'admin@example.invalid', 'initial-password-123')
  t.after(() => db.close())
  return db
}
const account = (email = 'member@example.invalid') => ({
  name: 'Kỹ sư thử',
  email,
  password: 'member-password-123'
})
const denied = (fn, code) => assert.throws(fn, e => e.code === code)

test('create normalizes email, hashes password and returns no credentials', t => {
  const db = setup(t)
  const user = createUser(db, 1, {
    ...account('  USER@EXAMPLE.INVALID '),
    role: 'author'
  })
  assert.equal(user.email, 'user@example.invalid')
  assert.equal(user.role, 'author')
  const raw = db.prepare('SELECT * FROM users WHERE id=?').get(user.id)
  assert.equal(
    raw.pass_hash,
    scryptSync('member-password-123', raw.salt, 64).toString('hex')
  )
  for (const row of [user, ...listUsers(db, 1)]) {
    assert.equal(row.pass_hash, undefined)
    assert.equal(row.salt, undefined)
    assert.equal(row.password, undefined)
  }
  denied(
    () => createUser(db, 1, account('USER@example.invalid')),
    'email_exists'
  )
})

test('permissions use current database role, including stale admin requests', t => {
  const db = setup(t)
  const user = createUser(db, 1, account())
  for (const role of ['member', 'author']) {
    updateUser(db, 1, user.id, { role })
    denied(() => listUsers(db, user.id), 'forbidden')
    denied(
      () => createUser(db, user.id, account('new@example.invalid')),
      'forbidden'
    )
    denied(() => updateUser(db, user.id, 1, { role: 'member' }), 'forbidden')
    denied(() => deleteUser(db, user.id, 1), 'forbidden')
  }
  updateUser(db, 1, user.id, { role: 'admin' })
  assert.ok(listUsers(db, user.id).length)
  updateUser(db, 1, user.id, { status: 'disabled' })
  denied(() => deleteUser(db, user.id, 1), 'forbidden')
})

test('credential and permission changes revoke sessions; name edits do not', t => {
  const db = setup(t)
  const user = createUser(db, 1, account())
  function session() {
    db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(
      'test-token',
      user.id,
      Date.now() + 99999
    )
  }
  session()
  updateUser(db, 1, user.id, { name: 'Tên mới' })
  assert.equal(db.prepare('SELECT count(*) AS n FROM sessions').get().n, 1)
  for (const change of [
    { role: 'author' },
    { email: 'changed@example.invalid' },
    { password: 'new-password-456' },
    { status: 'disabled' }
  ]) {
    if (!db.prepare('SELECT token FROM sessions').get()) session()
    updateUser(db, 1, user.id, change)
    assert.equal(db.prepare('SELECT count(*) AS n FROM sessions').get().n, 0)
  }
  const raw = db.prepare('SELECT * FROM users WHERE id=?').get(user.id)
  assert.equal(
    raw.pass_hash,
    scryptSync('new-password-456', raw.salt, 64).toString('hex')
  )
})

test('self deletion, demotion and disabling are blocked; other admins remain manageable', t => {
  const db = setup(t)
  denied(() => deleteUser(db, 1, 1), 'cannot_delete_self')
  denied(() => updateUser(db, 1, 1, { role: 'member' }), 'cannot_restrict_self')
  denied(
    () => updateUser(db, 1, 1, { status: 'disabled' }),
    'cannot_restrict_self'
  )
  const admin = createUser(db, 1, { ...account(), role: 'admin' })
  updateUser(db, 1, admin.id, { role: 'author' })
  assert.equal(listUsers(db, 1).find(u => u.id === admin.id).role, 'author')
})

test('invalid requests are atomic and cannot write arbitrary database fields', t => {
  const db = setup(t)
  const user = createUser(db, 1, account())
  for (const input of [
    { name: 'Changed', role: 'root' },
    { role: null },
    { status: 'deleted' },
    { password: 'short' },
    { email: 'invalid' },
    { name: ' ' },
    { pass_hash: 'x' },
    { id: 1 },
    {},
    []
  ])
    assert.throws(() => updateUser(db, 1, user.id, input))
  assert.equal(listUsers(db, 1).find(u => u.id === user.id).name, 'Kỹ sư thử')
  denied(() => updateUser(db, 1, 999, { name: 'X' }), 'user_not_found')
})

test('deleting an account preserves drawings, transfers library ownership and keeps historical references', t => {
  const db = setup(t)
  const user = createUser(db, 1, { ...account(), role: 'author' })
  const drawing = createDrawing(db, user.id, {
    name: 'M1',
    dxf: 'original design'
  })
  db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(
    'session',
    user.id,
    Date.now() + 10000
  )
  db.prepare(
    "INSERT INTO skills(skill_id,title,description,content_hash,uploaded_by) VALUES('guide','Guide','Description','hash',?)"
  ).run(user.id)
  db.prepare(
    "INSERT INTO ai_calls(user_id,command,model) VALUES(?,'draw','test')"
  ).run(user.id)
  const result = deleteUser(db, 1, user.id)
  assert.equal(result.transferredDrawings, 1)
  assert.equal(result.transferredSkills, 1)
  assert.equal(
    db.prepare('SELECT owner_id FROM drawings WHERE id=?').get(drawing.id)
      .owner_id,
    1
  )
  assert.equal(
    db.prepare("SELECT uploaded_by FROM skills WHERE skill_id='guide'").get()
      .uploaded_by,
    1
  )
  assert.equal(db.prepare('SELECT count(*) AS n FROM sessions').get().n, 0)
  assert.equal(
    db.prepare('SELECT user_id FROM ai_calls').get().user_id,
    user.id
  )
  assert.equal(
    listUsers(db, 1).some(u => u.id === user.id),
    false
  )
  denied(
    () => updateUser(db, 1, user.id, { status: 'active' }),
    'user_not_found'
  )
  assert.ok(createUser(db, 1, account()).id > user.id)
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0)
})

test('restart does not reset admin password, email or recreate the original account', t => {
  const db = setup(t)
  updateUser(db, 1, 1, {
    email: 'new-admin@example.invalid',
    password: 'changed-password-123'
  })
  const before = db.prepare('SELECT * FROM users WHERE id=1').get()
  initializeAdmin(db, 'admin@example.invalid', 'initial-password-123')
  assert.deepEqual(db.prepare('SELECT * FROM users WHERE id=1').get(), before)
  assert.equal(db.prepare('SELECT count(*) AS n FROM users').get().n, 1)
})

test('upgrading an existing installation never overwrites administrator credentials', t => {
  const db = setup(t)
  updateUser(db, 1, 1, { password: 'custom-password-456' })
  db.prepare("DELETE FROM auth_meta WHERE key='bootstrap_admin'").run()
  const before = db.prepare('SELECT * FROM users WHERE id=1').get()
  initializeAdmin(db, 'admin@example.invalid', 'old-deployment-password')
  assert.deepEqual(db.prepare('SELECT * FROM users WHERE id=1').get(), before)
  assert.equal(
    db.prepare("SELECT value FROM auth_meta WHERE key='bootstrap_admin'").get()
      .value,
    '1'
  )
})
