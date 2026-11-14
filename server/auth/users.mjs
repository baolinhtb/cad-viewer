import { randomBytes, scryptSync } from 'node:crypto'

import { ROLES } from './schema.mjs'

export class UserError extends Error {
  constructor(status, code, message) {
    super(message)
    this.status = status
    this.code = code
  }
}
const fail = (status, code, message) => {
  throw new UserError(status, code, message)
}
const fields = 'id, email, name, role, status, created_at'
const statuses = ['pending', 'active', 'disabled']
export const ROLE_DESCRIPTIONS = {
  member: {
    label: 'Thành viên',
    description:
      'Sử dụng CAD Agent, xem thư viện đã công bố và quản lý bản vẽ của mình.'
  },
  author: {
    label: 'Tác giả thư viện',
    description:
      'Quyền thành viên; sửa quy ước kỹ thuật; tải lên, công bố và quản lý template, hướng dẫn của mình.'
  },
  admin: {
    label: 'Quản trị viên',
    description:
      'Quyền tác giả và toàn quyền thêm, sửa, xóa, phân quyền tài khoản.'
  }
}
function requireAdmin(db, actorId) {
  const actor = db
    .prepare('SELECT id, role, status FROM users WHERE id = ?')
    .get(actorId)
  if (actor?.role !== ROLES.ADMIN || actor.status !== 'active')
    fail(403, 'forbidden', 'Bạn không có quyền quản lý tài khoản.')
}
function target(db, id) {
  if (!Number.isSafeInteger(id) || id <= 0)
    fail(404, 'user_not_found', 'Không tìm thấy tài khoản.')
  const row = db
    .prepare(`SELECT ${fields} FROM users WHERE id = ? AND status != 'deleted'`)
    .get(id)
  if (!row) fail(404, 'user_not_found', 'Không tìm thấy tài khoản.')
  return row
}
function validate(input, creating) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    fail(400, 'invalid_user', 'Dữ liệu tài khoản không hợp lệ.')
  if (
    Object.keys(input).some(
      k => !['name', 'email', 'password', 'role', 'status'].includes(k)
    )
  )
    fail(400, 'unknown_field', 'Có trường thông tin không được phép sửa.')
  if (!creating && !Object.keys(input).length)
    fail(400, 'empty_update', 'Chưa có thông tin cần cập nhật.')
  const out = {}
  for (const key of ['name', 'email']) {
    if (!(key in input) && !creating) continue
    if (typeof input[key] !== 'string')
      fail(
        400,
        'invalid_' + key,
        key === 'name' ? 'Họ tên không hợp lệ.' : 'Email không hợp lệ.'
      )
    const value = input[key].trim()
    if (key === 'name' && (!value || value.length > 100))
      fail(400, 'invalid_name', 'Họ tên phải từ 1 đến 100 ký tự.')
    if (
      key === 'email' &&
      (value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
    )
      fail(400, 'invalid_email', 'Email không hợp lệ.')
    out[key] = key === 'email' ? value.toLowerCase() : value
  }
  for (const [key, allowed, fallback] of [
    ['role', Object.values(ROLES), 'member'],
    ['status', statuses, 'active']
  ]) {
    if (!(key in input) && !creating) continue
    const value = key in input ? input[key] : fallback
    if (!allowed.includes(value))
      fail(
        400,
        'invalid_' + key,
        key === 'role' ? 'Vai trò không hợp lệ.' : 'Trạng thái không hợp lệ.'
      )
    out[key] = value
  }
  if ('password' in input || creating) {
    if (
      typeof input.password !== 'string' ||
      input.password.length < 8 ||
      input.password.length > 200
    )
      fail(400, 'invalid_password', 'Mật khẩu phải từ 8 đến 200 ký tự.')
    out.salt = randomBytes(16).toString('hex')
    out.pass_hash = scryptSync(input.password, out.salt, 64).toString('hex')
  }
  return out
}
function uniqueEmail(db, email, except = 0) {
  if (
    email &&
    db
      .prepare('SELECT id FROM users WHERE lower(email) = ? AND id != ?')
      .get(email, except)
  )
    fail(409, 'email_exists', 'Email đã được sử dụng.')
}
function transaction(db, fn) {
  db.exec('BEGIN IMMEDIATE')
  try {
    const result = fn()
    db.exec('COMMIT')
    return result
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}
/** List safe account fields only; deleted identity records preserve attribution. */
export function listUsers(db, actorId) {
  requireAdmin(db, actorId)
  return db
    .prepare(
      `SELECT ${fields}, (SELECT count(*) FROM drawings d WHERE d.owner_id = users.id) AS drawing_count, (SELECT count(*) FROM templates t WHERE t.uploaded_by = users.id) AS template_count, (SELECT count(*) FROM skills s WHERE s.uploaded_by = users.id) AS skill_count FROM users WHERE status != 'deleted' ORDER BY id DESC`
    )
    .all()
}
/** Create an account with a freshly salted password. */
export function createUser(db, actorId, input) {
  requireAdmin(db, actorId)
  const values = validate(input, true)
  uniqueEmail(db, values.email)
  const result = db
    .prepare(
      'INSERT INTO users(name,email,role,status,pass_hash,salt) VALUES(?,?,?,?,?,?)'
    )
    .run(
      values.name,
      values.email,
      values.role,
      values.status,
      values.pass_hash,
      values.salt
    )
  return target(db, Number(result.lastInsertRowid))
}
/** Apply validated account updates and revoke sessions on security changes. */
export function updateUser(db, actorId, id, input) {
  requireAdmin(db, actorId)
  const previous = target(db, id)
  const changes = validate(input, false)
  uniqueEmail(db, changes.email, id)
  if (
    id === actorId &&
    ((changes.role && changes.role !== 'admin') ||
      (changes.status && changes.status !== 'active'))
  )
    fail(
      400,
      'cannot_restrict_self',
      'Không thể tự hạ quyền hoặc khóa tài khoản đang sử dụng.'
    )
  return transaction(db, () => {
    const entries = Object.entries(changes)
    db.prepare(
      'UPDATE users SET ' +
        entries.map(([key]) => key + ' = ?').join(', ') +
        ' WHERE id = ?'
    ).run(...entries.map(([, value]) => value), id)
    if (
      changes.pass_hash ||
      ['email', 'role', 'status'].some(
        k => k in changes && changes[k] !== previous[k]
      )
    )
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id)
    return target(db, id)
  })
}
/** Remove login access and transfer drawings without destroying design data.
 * Keep the identity row for historical template, guide and usage references. */
export function deleteUser(db, actorId, id) {
  requireAdmin(db, actorId)
  target(db, id)
  if (actorId === id)
    fail(400, 'cannot_delete_self', 'Không thể xóa tài khoản đang sử dụng.')
  return transaction(db, () => {
    const moved = db
      .prepare('UPDATE drawings SET owner_id = ? WHERE owner_id = ?')
      .run(actorId, id)
    const templates = db
      .prepare('UPDATE templates SET uploaded_by = ? WHERE uploaded_by = ?')
      .run(actorId, id)
    const skills = db
      .prepare('UPDATE skills SET uploaded_by = ? WHERE uploaded_by = ?')
      .run(actorId, id)
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id)
    db.prepare(
      "UPDATE users SET email = ?, status = 'deleted', role = 'member', pass_hash = ?, salt = ? WHERE id = ?"
    ).run(
      `deleted-${id}-${randomBytes(8).toString('hex')}@deleted.invalid`,
      randomBytes(64).toString('hex'),
      randomBytes(16).toString('hex'),
      id
    )
    return {
      id,
      transferredDrawings: Number(moved.changes),
      transferredTemplates: Number(templates.changes),
      transferredSkills: Number(skills.changes)
    }
  })
}
/** Seed exactly once: restarting must never undo account edits or recreate a renamed admin. */
export function initializeAdmin(db, email, password) {
  if (
    db
      .prepare("SELECT value FROM auth_meta WHERE key = 'bootstrap_admin'")
      .get()
  )
    return
  if (db.prepare("SELECT id FROM users WHERE role = 'admin'").get()) {
    db.prepare(
      "INSERT INTO auth_meta(key,value) VALUES('bootstrap_admin','1')"
    ).run()
    return
  }
  if (!email || !password) return
  const values = validate(
    { name: 'Administrator', email, password, role: 'admin', status: 'active' },
    true
  )
  transaction(db, () => {
    const existing = db
      .prepare('SELECT id FROM users WHERE email = ?')
      .get(values.email)
    if (existing)
      db.prepare(
        "UPDATE users SET role='admin',status='active',pass_hash=?,salt=? WHERE id=?"
      ).run(values.pass_hash, values.salt, existing.id)
    else
      db.prepare(
        'INSERT INTO users(name,email,role,status,pass_hash,salt) VALUES(?,?,?,?,?,?)'
      ).run(
        values.name,
        values.email,
        values.role,
        values.status,
        values.pass_hash,
        values.salt
      )
    db.prepare(
      "INSERT INTO auth_meta(key,value) VALUES('bootstrap_admin','1')"
    ).run()
  })
}
