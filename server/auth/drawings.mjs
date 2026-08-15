/**
 * Drawing storage.
 *
 * The server stores bytes and metadata; it never parses CAD. That keeps the
 * machine free of a CAD runtime and matches where the work actually happens —
 * generating, rendering and editing all run in the browser.
 */

import { randomUUID } from 'node:crypto'

/**
 * Size ceiling for a drawing payload.
 *
 * The auth endpoints cap bodies at 10 KiB, which is right for a login form and
 * fatal for a DXF: a real bridge drawing runs to megabytes, so a shared limit
 * would reject every upload with a 413 nobody could explain.
 */
export const MAX_DRAWING_BYTES = 32 * 1024 * 1024

/** Error codes clients map to messages; never show the raw string to a user. */
export const ERRORS = {
  NOT_FOUND: 'drawing_not_found',
  CONFLICT: 'drawing_revision_conflict',
  TOO_LARGE: 'drawing_too_large',
  INVALID: 'drawing_invalid'
}

/**
 * Lists the caller's drawings, newest first.
 *
 * Ownership is filtered in the query rather than after the fact: a filter that
 * lives in the UI is one forgotten call away from serving someone else's work.
 */
export function listDrawings(db, userId, { search } = {}) {
  const like = search ? `%${search.toLowerCase()}%` : null
  const rows = like
    ? db
        .prepare(
          `SELECT id, name, template_id, template_version, batch_id, revision,
                  created_at, updated_at, length(dxf) AS size_bytes
           FROM drawings
           WHERE owner_id = ?
             AND (lower(name) LIKE ? OR lower(coalesce(template_id, '')) LIKE ?)
           ORDER BY updated_at DESC`
        )
        .all(userId, like, like)
    : db
        .prepare(
          `SELECT id, name, template_id, template_version, batch_id, revision,
                  created_at, updated_at, length(dxf) AS size_bytes
           FROM drawings
           WHERE owner_id = ?
           ORDER BY updated_at DESC`
        )
        .all(userId)

  return rows
}

/** Reads one drawing, or `undefined` when it is missing or owned by someone else. */
export function getDrawing(db, userId, id) {
  return db
    .prepare('SELECT * FROM drawings WHERE id = ? AND owner_id = ?')
    .get(id, userId)
}

/**
 * Creates a drawing.
 *
 * The id comes from the client so the drawing has an identity before it is
 * ever saved — the semantic tags baked into its geometry refer to it, and
 * waiting for a server-assigned id would mean stamping them after the fact.
 */
export function createDrawing(db, userId, input) {
  const id = typeof input.id === 'string' && input.id ? input.id : randomUUID()
  const dxf = toBuffer(input.dxf)

  db.prepare(
    `INSERT INTO drawings
       (id, owner_id, name, template_id, template_version, params, batch_id, dxf, revision)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`
  ).run(
    id,
    userId,
    String(input.name ?? 'Bản vẽ không tên'),
    input.templateId ?? null,
    input.templateVersion ?? null,
    input.params ? JSON.stringify(input.params) : null,
    input.batchId ?? null,
    dxf
  )

  return { id, revision: 1 }
}

/**
 * Updates a drawing, refusing a write that carries a stale revision.
 *
 * Two tabs open on one drawing is the ordinary case, not the exotic one. With
 * version history deferred to a later phase, a silent overwrite is
 * unrecoverable — so the conflict surfaces to the user instead.
 */
export function updateDrawing(db, userId, id, input) {
  const existing = getDrawing(db, userId, id)
  if (!existing) return { error: ERRORS.NOT_FOUND }

  const expected = Number(input.revision)
  if (!Number.isInteger(expected) || expected !== existing.revision) {
    return {
      error: ERRORS.CONFLICT,
      currentRevision: existing.revision
    }
  }

  const revision = existing.revision + 1
  db.prepare(
    `UPDATE drawings
        SET name = ?, params = ?, dxf = ?, revision = ?, updated_at = datetime('now')
      WHERE id = ? AND owner_id = ? AND revision = ?`
  ).run(
    String(input.name ?? existing.name),
    input.params ? JSON.stringify(input.params) : existing.params,
    input.dxf === undefined ? existing.dxf : toBuffer(input.dxf),
    revision,
    id,
    userId,
    existing.revision
  )

  return { id, revision }
}

/** Deletes a drawing the caller owns. */
export function deleteDrawing(db, userId, id) {
  const result = db
    .prepare('DELETE FROM drawings WHERE id = ? AND owner_id = ?')
    .run(id, userId)
  return result.changes > 0
}

/** Accepts either raw text or base64, and always stores bytes. */
function toBuffer(value) {
  if (value === undefined || value === null) return null
  if (typeof value === 'string') return Buffer.from(value, 'utf8')
  if (value && typeof value === 'object' && typeof value.base64 === 'string') {
    return Buffer.from(value.base64, 'base64')
  }
  return null
}
