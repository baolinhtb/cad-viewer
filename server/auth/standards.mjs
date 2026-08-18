/**
 * The standardisation layer: what the trade's words mean, and which layer each
 * kind of part is drawn on.
 *
 * This is the table an assistant reads to turn "nâng lan can lên 1.27m" into a
 * `role` it can look for in a drawing. It is deliberately data rather than
 * code: the company adds a term the day it needs one, without waiting for a
 * release. Every member may edit it — a standard only stays accurate if the
 * people using it can correct it.
 */

/** Error codes clients map to messages; never show the raw string to a user. */
export const ERRORS = {
  NOT_FOUND: 'standard_not_found',
  DUPLICATE: 'standard_duplicate',
  ALIAS_CONFLICT: 'standard_alias_conflict',
  INVALID: 'standard_invalid'
}

/** Roles are matched by machine, so they are ASCII slugs with no diacritics. */
const ROLE_SLUG = /^[a-z0-9_]+$/

/**
 * Characters AutoCAD refuses in a layer name.
 *
 * The rule is a deny-list because that is what AutoCAD's is, and an allow-list
 * built around one office's convention locks every other office out. This one
 * was `^[A-Za-z0-9][A-Za-z0-9_-]*$`, modelled on `KC-BAN` — and it rejected
 * every layer in a real drawing an engineer sent, because that office names
 * them `_33_CAU_MO_Tuongdau` and a leading underscore was not allowed for.
 * Names are still compared case-insensitively: AutoCAD treats `KC-Ban` and
 * `KC-BAN` as one layer, so two rows for them would describe the same thing.
 */
const LAYER_NAME_FORBIDDEN = /[<>/\\":;?*|,='`]/

class StandardsError extends Error {
  constructor(code, detail) {
    super(code)
    this.code = code
    this.detail = detail
  }
}

/** Comparison form for an alias: case and surrounding space carry no meaning. */
function normalizeAlias(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
}

function parseAliases(raw) {
  try {
    const parsed = JSON.parse(raw ?? '[]')
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

function rowToTerm(row) {
  return {
    role: row.role,
    label: row.label,
    aliases: parseAliases(row.aliases),
    description: row.description ?? null,
    entityKind: row.entity_kind ?? null,
    layer: row.layer ?? null,
    updatedBy: row.updated_by ?? null,
    updatedAt: row.updated_at
  }
}

/**
 * Lists terms, newest edits last so the list reads in a stable order.
 *
 * `search` matches the canonical label *and* the aliases, because someone
 * looking for "tay vịn" will not find it by searching the word the dictionary
 * happens to have chosen as canonical.
 */
export function listTerms(db, { search } = {}) {
  const rows = db
    .prepare(`SELECT * FROM standard_terms ORDER BY role`)
    .all()
    .map(rowToTerm)

  if (!search) return rows
  const needle = normalizeAlias(search)
  return rows.filter(
    term =>
      term.role.includes(needle) ||
      normalizeAlias(term.label).includes(needle) ||
      term.aliases.some(alias => normalizeAlias(alias).includes(needle))
  )
}

export function getTerm(db, role) {
  const row = db
    .prepare(`SELECT * FROM standard_terms WHERE role = ?`)
    .get(String(role ?? ''))
  return row ? rowToTerm(row) : undefined
}

/**
 * Finds every term that already claims one of these aliases.
 *
 * Run on the server because only the server sees the whole dictionary: a
 * check in the browser can only compare against the rows that happen to be
 * loaded, which is exactly when a conflict slips through.
 */
function findAliasConflicts(db, aliases, exceptRole) {
  const wanted = new Set(aliases.map(normalizeAlias).filter(Boolean))
  if (wanted.size === 0) return []

  const conflicts = []
  for (const row of db.prepare(`SELECT * FROM standard_terms`).all()) {
    if (row.role === exceptRole) continue
    const taken = [row.label, ...parseAliases(row.aliases)].map(normalizeAlias)
    const clashing = [...wanted].filter(alias => taken.includes(alias))
    if (clashing.length > 0) conflicts.push({ role: row.role, aliases: clashing })
  }
  return conflicts
}

function assertTermInput(db, input, { existingRole } = {}) {
  const role = String(input.role ?? '').trim()
  if (!ROLE_SLUG.test(role)) {
    throw new StandardsError(ERRORS.INVALID, {
      field: 'role',
      reason: 'Khóa phải là slug ASCII không dấu (a-z, 0-9, _)'
    })
  }

  const label = String(input.label ?? '').trim()
  if (!label) {
    throw new StandardsError(ERRORS.INVALID, {
      field: 'label',
      reason: 'Tên chuẩn không được để trống'
    })
  }

  const aliases = Array.isArray(input.aliases)
    ? [...new Set(input.aliases.map(a => String(a).trim()).filter(Boolean))]
    : []

  // The canonical label is itself an alias for conflict purposes: two terms
  // where one's label is the other's alias are just as ambiguous.
  const conflicts = findAliasConflicts(db, [label, ...aliases], existingRole)
  if (conflicts.length > 0) {
    throw new StandardsError(ERRORS.ALIAS_CONFLICT, { conflicts })
  }

  return { role, label, aliases }
}

export function createTerm(db, userId, input) {
  const { role, label, aliases } = assertTermInput(db, input)
  if (getTerm(db, role)) {
    throw new StandardsError(ERRORS.DUPLICATE, { field: 'role', value: role })
  }

  db.prepare(
    `INSERT INTO standard_terms
       (role, label, aliases, description, entity_kind, layer, updated_by, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`
  ).run(
    role,
    label,
    JSON.stringify(aliases),
    input.description ?? null,
    input.entityKind ?? null,
    input.layer ? String(input.layer).trim() : null,
    userId
  )
  return getTerm(db, role)
}

export function updateTerm(db, userId, role, input) {
  const existing = getTerm(db, role)
  if (!existing) throw new StandardsError(ERRORS.NOT_FOUND, { role })

  const merged = assertTermInput(
    db,
    { role, label: input.label ?? existing.label, aliases: input.aliases ?? existing.aliases },
    { existingRole: role }
  )

  db.prepare(
    `UPDATE standard_terms
        SET label = ?, aliases = ?, description = ?, entity_kind = ?, layer = ?,
            updated_by = ?, updated_at = datetime('now')
      WHERE role = ?`
  ).run(
    merged.label,
    JSON.stringify(merged.aliases),
    input.description ?? existing.description,
    input.entityKind ?? existing.entityKind,
    input.layer !== undefined
      ? String(input.layer).trim() || null
      : existing.layer,
    userId,
    role
  )
  return getTerm(db, role)
}

export function deleteTerm(db, role) {
  const result = db
    .prepare(`DELETE FROM standard_terms WHERE role = ?`)
    .run(String(role ?? ''))
  return result.changes > 0
}

function rowToLayer(row) {
  return {
    name: row.name,
    meaning: row.meaning,
    color: row.color ?? null,
    lineType: row.line_type ?? null,
    updatedBy: row.updated_by ?? null,
    updatedAt: row.updated_at
  }
}

export function listLayers(db) {
  return db
    .prepare(`SELECT * FROM standard_layers ORDER BY name`)
    .all()
    .map(rowToLayer)
}

export function getLayer(db, name) {
  const row = db
    .prepare(`SELECT * FROM standard_layers WHERE lower(name) = lower(?)`)
    .get(String(name ?? ''))
  return row ? rowToLayer(row) : undefined
}

function assertLayerInput(input) {
  const name = String(input.name ?? '').trim()
  if (!name || LAYER_NAME_FORBIDDEN.test(name)) {
    throw new StandardsError(ERRORS.INVALID, {
      field: 'name',
      reason: 'Tên layer không được rỗng và không chứa < > / \\ " : ; ? * | , = \''
    })
  }
  const meaning = String(input.meaning ?? '').trim()
  if (!meaning) {
    throw new StandardsError(ERRORS.INVALID, {
      field: 'meaning',
      reason: 'Ý nghĩa của layer không được để trống'
    })
  }
  return { name, meaning }
}

export function createLayer(db, userId, input) {
  const { name, meaning } = assertLayerInput(input)
  if (getLayer(db, name)) {
    throw new StandardsError(ERRORS.DUPLICATE, { field: 'name', value: name })
  }
  db.prepare(
    `INSERT INTO standard_layers
       (name, meaning, color, line_type, updated_by, updated_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))`
  ).run(name, meaning, input.color ?? null, input.lineType ?? null, userId)
  return getLayer(db, name)
}

export function updateLayer(db, userId, name, input) {
  const existing = getLayer(db, name)
  if (!existing) throw new StandardsError(ERRORS.NOT_FOUND, { name })

  db.prepare(
    `UPDATE standard_layers
        SET meaning = ?, color = ?, line_type = ?,
            updated_by = ?, updated_at = datetime('now')
      WHERE lower(name) = lower(?)`
  ).run(
    String(input.meaning ?? existing.meaning).trim() || existing.meaning,
    input.color ?? existing.color,
    input.lineType ?? existing.lineType,
    userId,
    name
  )
  return getLayer(db, name)
}

export function deleteLayer(db, name) {
  const result = db
    .prepare(`DELETE FROM standard_layers WHERE lower(name) = lower(?)`)
    .run(String(name ?? ''))
  return result.changes > 0
}

/**
 * Role → layer mapping the client uses when drawing.
 *
 * Only terms that have been given a layer appear. A role with none cannot be
 * drawn, and silently mapping it to something plausible would put geometry on
 * a layer nobody chose.
 */
export function roleLayerMap(db) {
  const mapping = {}
  for (const term of listTerms(db)) {
    if (term.layer) mapping[term.role] = term.layer
  }
  return mapping
}

/**
 * Contradictions in the standardisation layer.
 *
 * Reported rather than refused. Every one of these is a legitimate midway
 * state — a term added before its layer has been decided, a layer created
 * before the terms that will use it — so blocking the save would force people
 * to enter things in an order nobody would guess. What must not happen is
 * that the state goes unnoticed and an assistant later fails to draw a part
 * for a reason nobody can see.
 */
export function findContradictions(db) {
  const terms = listTerms(db)
  const layers = listLayers(db)
  const known = new Set(layers.map(layer => layer.name.toLowerCase()))
  const used = new Set(
    terms.filter(term => term.layer).map(term => term.layer.toLowerCase())
  )

  return {
    /** Terms with no layer at all: nothing can be drawn for them. */
    rolesWithoutLayer: terms
      .filter(term => !term.layer)
      .map(term => ({ role: term.role, label: term.label })),
    /** Terms pointing at a layer the catalogue does not have. */
    rolesWithUnknownLayer: terms
      .filter(term => term.layer && !known.has(term.layer.toLowerCase()))
      .map(term => ({ role: term.role, layer: term.layer })),
    /** Layers no term draws on: harmless, but usually a rename left behind. */
    unusedLayers: layers
      .filter(layer => !used.has(layer.name.toLowerCase()))
      .map(layer => ({ name: layer.name, meaning: layer.meaning }))
  }
}

/**
 * Reports terms whose layer is missing from the catalogue.
 *
 * A role with no layer cannot be drawn, so this is the check a template upload
 * runs before being accepted (Story 2.5).
 */
export function findRolesWithoutLayer(db, roleLayers) {
  const known = new Set(listLayers(db).map(layer => layer.name.toLowerCase()))
  return Object.entries(roleLayers)
    .filter(([, layer]) => !known.has(String(layer).toLowerCase()))
    .map(([role, layer]) => ({ role, layer }))
}

export { StandardsError }
