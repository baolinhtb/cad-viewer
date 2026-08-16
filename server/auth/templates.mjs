/**
 * The template library.
 *
 * A template is built JavaScript that an author uploads and every member's
 * browser then runs. The server stores it, versions it and gates who may add
 * one; it never executes it. Running templates server-side would mean putting
 * a CAD runtime and someone else's code on the machine that holds the
 * company's drawings, to gain nothing — the rendering already happens in the
 * browser.
 */

import { createHash } from 'node:crypto'

/**
 * Size ceiling for an uploaded template.
 *
 * Generous for a built module and far below the drawing limit: a template is
 * a few hundred lines of geometry, and anything approaching a megabyte is a
 * bundle that forgot to mark its dependencies external.
 */
export const MAX_TEMPLATE_BYTES = 2 * 1024 * 1024

export const ERRORS = {
  NOT_FOUND: 'template_not_found',
  VERSION_CONFLICT: 'template_version_conflict',
  TOO_LARGE: 'template_too_large',
  INVALID: 'template_invalid',
  FORBIDDEN: 'template_forbidden'
}

/** Templates everyone can see, versus ones still on trial. */
export const STATUS = { DRAFT: 'draft', PUBLISHED: 'published' }

const ID_SLUG = /^[a-z0-9_]+$/
/**
 * Parameter keys are identifiers, not role slugs.
 *
 * A role is matched against what an engineer says out loud, so it is lowercase
 * and unaccented. A parameter key is a JSON key and an Excel column header
 * written by the template author — `B`, `h`, `tLopPhu` are the real ones in
 * use. Holding them to the role rule would reject the only template that
 * exists.
 */
const PARAM_KEY = /^[A-Za-z][A-Za-z0-9_]*$/
/** Loose semver: authors version their own work, we only need it ordered. */
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/

class TemplateError extends Error {
  constructor(code, detail) {
    super(code)
    this.code = code
    this.detail = detail
  }
}

/** Content hash of the uploaded module, used to pin a version to its code. */
export function hashCode(code) {
  return createHash('sha256').update(code, 'utf8').digest('hex')
}

function rowToSummary(row) {
  return {
    templateId: row.template_id,
    version: row.version,
    name: row.name,
    category: row.category ?? null,
    description: row.description ?? null,
    params: JSON.parse(row.params),
    roleLayers: JSON.parse(row.role_layers),
    contentHash: row.content_hash,
    status: row.status,
    uploadedBy: row.uploaded_by ?? null,
    createdAt: row.created_at,
    verifiedAt: row.verified_at ?? null
  }
}

/**
 * Lists templates.
 *
 * Drafts are visible to the person who uploaded them and to nobody else: an
 * author needs to see their own template in order to trial it, and everyone
 * else needs a library where every entry is known to work.
 */
export function listTemplates(db, viewerId, { includeDrafts = true } = {}) {
  const rows = includeDrafts
    ? db
        .prepare(
          `SELECT * FROM templates
            WHERE status = ? OR uploaded_by = ?
            ORDER BY name, template_id, version`
        )
        .all(STATUS.PUBLISHED, viewerId ?? -1)
    : db
        .prepare(
          `SELECT * FROM templates WHERE status = ? ORDER BY name, template_id, version`
        )
        .all(STATUS.PUBLISHED)
  return rows.map(rowToSummary)
}

/** Fetches one template including its code. */
export function getTemplate(db, templateId, version) {
  const row = db
    .prepare(`SELECT * FROM templates WHERE template_id = ? AND version = ?`)
    .get(String(templateId ?? ''), String(version ?? ''))
  if (!row) return undefined
  return { ...rowToSummary(row), code: row.code }
}

function assertUploadInput(input) {
  const meta = input?.meta ?? {}
  const templateId = String(meta.id ?? '').trim()
  const version = String(meta.version ?? '').trim()
  const name = String(meta.name ?? '').trim()
  const code = typeof input?.code === 'string' ? input.code : ''

  if (!ID_SLUG.test(templateId)) {
    throw new TemplateError(ERRORS.INVALID, {
      field: 'meta.id',
      reason: 'Mã template phải là slug ASCII không dấu (a-z, 0-9, _)'
    })
  }
  if (!VERSION.test(version)) {
    throw new TemplateError(ERRORS.INVALID, {
      field: 'meta.version',
      reason: 'Phiên bản phải theo dạng x.y.z'
    })
  }
  if (!name) {
    throw new TemplateError(ERRORS.INVALID, {
      field: 'meta.name',
      reason: 'Tên template không được để trống'
    })
  }
  if (!code.trim()) {
    throw new TemplateError(ERRORS.INVALID, {
      field: 'code',
      reason: 'Thiếu nội dung template'
    })
  }
  if (Buffer.byteLength(code, 'utf8') > MAX_TEMPLATE_BYTES) {
    throw new TemplateError(ERRORS.TOO_LARGE, {
      limit: MAX_TEMPLATE_BYTES
    })
  }

  const params = Array.isArray(input?.params) ? input.params : []
  for (const param of params) {
    if (!param || typeof param.key !== 'string' || !PARAM_KEY.test(param.key)) {
      throw new TemplateError(ERRORS.INVALID, {
        field: 'params',
        reason: `Khóa thông số không hợp lệ: ${param?.key ?? '(trống)'}`
      })
    }
  }

  const roleLayers =
    input?.roleLayers && typeof input.roleLayers === 'object'
      ? input.roleLayers
      : {}

  return { templateId, version, name, code, params, roleLayers, meta }
}

/**
 * Accepts a template upload.
 *
 * @param standards - `{ knownRoles, knownLayers }` from the standardisation
 * layer. Gaps are returned as warnings rather than refusals: an author adding
 * a new kind of structure legitimately needs terms that do not exist yet, and
 * refusing would force them to edit the dictionary blind. The warning names
 * exactly what is missing so they can add it and re-upload.
 */
export function uploadTemplate(db, userId, input, standards = {}) {
  const parsed = assertUploadInput(input)
  const contentHash = hashCode(parsed.code)

  const existing = db
    .prepare(
      `SELECT content_hash, status FROM templates WHERE template_id = ? AND version = ?`
    )
    .get(parsed.templateId, parsed.version)

  if (existing && existing.content_hash !== contentHash) {
    // A drawing pins (template_id, version). Letting the code behind that pair
    // change would make an approved drawing regenerate into a different shape.
    throw new TemplateError(ERRORS.VERSION_CONFLICT, {
      templateId: parsed.templateId,
      version: parsed.version,
      reason:
        'Phiên bản này đã tồn tại với nội dung khác. Hãy tăng số phiên bản.'
    })
  }

  const warnings = collectStandardsGaps(parsed.roleLayers, standards)

  if (existing) {
    // Re-uploading identical content is idempotent, not an error.
    db.prepare(
      `UPDATE templates
          SET name = ?, category = ?, description = ?, params = ?, role_layers = ?
        WHERE template_id = ? AND version = ?`
    ).run(
      parsed.name,
      parsed.meta.category ?? null,
      parsed.meta.description ?? null,
      JSON.stringify(parsed.params),
      JSON.stringify(parsed.roleLayers),
      parsed.templateId,
      parsed.version
    )
  } else {
    db.prepare(
      `INSERT INTO templates
         (template_id, version, name, category, description, params, role_layers,
          code, content_hash, status, uploaded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      parsed.templateId,
      parsed.version,
      parsed.name,
      parsed.meta.category ?? null,
      parsed.meta.description ?? null,
      JSON.stringify(parsed.params),
      JSON.stringify(parsed.roleLayers),
      parsed.code,
      contentHash,
      STATUS.DRAFT,
      userId
    )
  }

  return {
    template: getTemplate(db, parsed.templateId, parsed.version),
    warnings
  }
}

/** Roles and layers a template needs that the standardisation layer lacks. */
export function collectStandardsGaps(roleLayers, standards = {}) {
  const knownRoles = new Set(standards.knownRoles ?? [])
  const knownLayers = new Set(
    (standards.knownLayers ?? []).map(name => String(name).toLowerCase())
  )
  const missingRoles = []
  const missingLayers = []

  for (const [role, layer] of Object.entries(roleLayers ?? {})) {
    if (!knownRoles.has(role)) missingRoles.push(role)
    if (!knownLayers.has(String(layer).toLowerCase())) {
      missingLayers.push({ role, layer })
    }
  }
  return { missingRoles, missingLayers }
}

/**
 * Marks a template as having produced a drawing, which is what publishes it.
 *
 * The trial runs in the uploader's browser and reports back, because that is
 * the only place the template can actually run. The server's part is to refuse
 * to show an unproven template to anyone else.
 */
export function publishTemplate(db, userId, templateId, version) {
  const row = db
    .prepare(
      `SELECT uploaded_by, status FROM templates WHERE template_id = ? AND version = ?`
    )
    .get(String(templateId ?? ''), String(version ?? ''))
  if (!row) throw new TemplateError(ERRORS.NOT_FOUND, { templateId, version })

  if (row.uploaded_by !== userId) {
    // Only the author can vouch for their own upload; otherwise one member
    // could publish another's untested template by calling the route.
    throw new TemplateError(ERRORS.FORBIDDEN, {
      reason: 'Chỉ người tải lên mới xác nhận được template đã chạy được.'
    })
  }

  db.prepare(
    `UPDATE templates SET status = ?, verified_at = datetime('now')
      WHERE template_id = ? AND version = ?`
  ).run(STATUS.PUBLISHED, templateId, version)
  return getTemplate(db, templateId, version)
}

export function deleteTemplate(db, templateId, version) {
  const result = db
    .prepare(`DELETE FROM templates WHERE template_id = ? AND version = ?`)
    .run(String(templateId ?? ''), String(version ?? ''))
  return result.changes > 0
}

export { TemplateError }
