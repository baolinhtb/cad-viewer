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
  INVALID: 'standard_invalid',
  IN_USE: 'standard_in_use'
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
    if (clashing.length > 0)
      conflicts.push({ role: row.role, aliases: clashing })
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
    {
      role,
      label: input.label ?? existing.label,
      aliases: input.aliases ?? existing.aliases
    },
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
    // Set when this name is kept only to recognise old drawings: the `_33_`
    // layer it stands for. Such a layer is never served for drawing.
    legacyOf: row.legacy_of ?? null,
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
      reason:
        'Tên layer không được rỗng và không chứa < > / \\ " : ; ? * | , = \''
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

/**
 * A layer colour is an ACI index, because that is what the office's own
 * drawings carry in their layer tables and what AutoCAD round-trips. Empty
 * means "not decided", stored as NULL; anything else outside 1–255 is refused
 * rather than clamped — a colour that quietly became white is the kind of
 * wrong nobody notices until the plot comes back.
 */
function assertColor(value) {
  if (value === undefined || value === null || value === '') return null
  const n = typeof value === 'number' ? value : Number(String(value).trim())
  if (!Number.isInteger(n) || n < 1 || n > 255) {
    throw new StandardsError(ERRORS.INVALID, {
      field: 'color',
      reason: 'Màu phải là chỉ số ACI nguyên từ 1 đến 255, hoặc để trống'
    })
  }
  return n
}

function cleanLineType(value) {
  if (value === undefined || value === null) return null
  const text = String(value).trim()
  return text ? text : null
}

/**
 * Checks the `_33_` layer an old name is said to stand for.
 *
 * The target must exist and must itself be a real layer: an old name pointing
 * at another old name would make "which layer do I draw on" a chain to follow,
 * and a name pointing at itself would make it a loop.
 */
function assertLegacyOf(db, value, selfName) {
  if (value === undefined) return undefined
  if (value === null || String(value).trim() === '') return null
  const target = String(value).trim()
  const reason = text =>
    new StandardsError(ERRORS.INVALID, { field: 'legacyOf', reason: text })
  if (target.toLowerCase() === String(selfName).toLowerCase()) {
    throw reason('Layer không thể là tên cũ của chính nó')
  }
  const row = getLayer(db, target)
  if (!row) throw reason(`Không có layer "${target}" trong danh mục`)
  if (row.legacyOf) {
    throw reason(`"${row.name}" cũng là tên cũ; hãy trỏ tới layer đang dùng`)
  }
  if (legacyNamesOf(db, selfName).length > 0) {
    throw reason('Layer này đang có tên cũ trỏ tới, không thể thành tên cũ')
  }
  return row.name
}

/** Old names that stand for this layer. */
function legacyNamesOf(db, name) {
  return db
    .prepare(
      `SELECT name FROM standard_layers WHERE lower(legacy_of) = lower(?)`
    )
    .all(String(name ?? ''))
    .map(row => row.name)
}

export function createLayer(db, userId, input) {
  const { name, meaning } = assertLayerInput(input)
  if (getLayer(db, name)) {
    throw new StandardsError(ERRORS.DUPLICATE, { field: 'name', value: name })
  }
  const legacyOf = assertLegacyOf(db, input.legacyOf, name) ?? null
  db.prepare(
    `INSERT INTO standard_layers
       (name, meaning, color, line_type, legacy_of, updated_by, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
  ).run(
    name,
    meaning,
    assertColor(input.color),
    cleanLineType(input.lineType),
    legacyOf,
    userId
  )
  return getLayer(db, name)
}

export function updateLayer(db, userId, name, input) {
  const existing = getLayer(db, name)
  if (!existing) throw new StandardsError(ERRORS.NOT_FOUND, { name })

  const legacyOf = assertLegacyOf(db, input.legacyOf, existing.name)
  db.prepare(
    `UPDATE standard_layers
        SET meaning = ?, color = ?, line_type = ?, legacy_of = ?,
            updated_by = ?, updated_at = datetime('now')
      WHERE lower(name) = lower(?)`
  ).run(
    String(input.meaning ?? existing.meaning).trim() || existing.meaning,
    // `undefined` keeps the current value; `null` or '' clears it. Distinct on
    // purpose: an edit form that omits the field must not wipe the colour.
    input.color === undefined ? existing.color : assertColor(input.color),
    input.lineType === undefined
      ? existing.lineType
      : cleanLineType(input.lineType),
    legacyOf === undefined ? existing.legacyOf : legacyOf,
    userId,
    name
  )
  return getLayer(db, name)
}

export function deleteLayer(db, name) {
  // Deleting a layer that old names stand for would leave those names pointing
  // at nothing, and the drawings on them unrecognisable. Refused, not
  // cascaded: which way to resolve it is a decision for a person.
  const dependants = legacyNamesOf(db, name)
  if (dependants.length > 0) {
    throw new StandardsError(ERRORS.IN_USE, { name, legacyNames: dependants })
  }
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
  const canonical = new Map()
  for (const layer of listLayers(db)) {
    if (layer.legacyOf) canonical.set(layer.name.toLowerCase(), layer.legacyOf)
  }
  const mapping = {}
  for (const term of listTerms(db)) {
    if (!term.layer) continue
    // A term left pointing at an old name still draws on the layer that name
    // stands for: old names are for reading old drawings, never for drawing.
    mapping[term.role] = canonical.get(term.layer.toLowerCase()) ?? term.layer
  }
  return mapping
}

/**
 * Old layer name → role, for recognising drawings made before `_33_`.
 *
 * Resolved through the layer the old name stands for, so renaming a term's
 * layer carries its old names along. An old name whose layer no term uses is
 * left out — there is no role to give its entities.
 */
export function legacyLayerMap(db) {
  const roleOf = new Map()
  for (const term of listTerms(db)) {
    if (term.layer) roleOf.set(term.layer.toLowerCase(), term.role)
  }
  const mapping = {}
  for (const layer of listLayers(db)) {
    if (!layer.legacyOf) continue
    const role = roleOf.get(layer.legacyOf.toLowerCase())
    if (role) mapping[layer.name] = role
  }
  return mapping
}

/**
 * Layer presentation the client applies when it has to create a layer.
 *
 * Only layers with something decided appear, so the client can tell "white
 * because the office chose white" from "white because nobody has said".
 */
export function layerStyleMap(db) {
  const styles = {}
  for (const layer of listLayers(db)) {
    if (layer.color === null && layer.lineType === null) continue
    styles[layer.name] = { color: layer.color, lineType: layer.lineType }
  }
  return styles
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
  const legacy = new Map(
    layers
      .filter(layer => layer.legacyOf)
      .map(layer => [layer.name.toLowerCase(), layer])
  )
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
    /** Layers no term draws on: harmless, but usually a rename left behind.
     * Old names are expected to be unused and are not listed. */
    unusedLayers: layers
      .filter(layer => !layer.legacyOf && !used.has(layer.name.toLowerCase()))
      .map(layer => ({ name: layer.name, meaning: layer.meaning })),
    /** Terms still pointing at an old name; they draw on its `_33_` layer. */
    rolesOnLegacyLayer: terms
      .filter(term => term.layer && legacy.has(term.layer.toLowerCase()))
      .map(term => ({
        role: term.role,
        layer: term.layer,
        drawsOn: legacy.get(term.layer.toLowerCase()).legacyOf
      })),
    /** Old names standing for a layer that is no longer in the catalogue. */
    legacyWithUnknownTarget: layers
      .filter(
        layer => layer.legacyOf && !known.has(layer.legacyOf.toLowerCase())
      )
      .map(layer => ({ name: layer.name, legacyOf: layer.legacyOf }))
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
