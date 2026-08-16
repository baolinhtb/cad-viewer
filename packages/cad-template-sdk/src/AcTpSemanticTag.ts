import {
  AcDbDatabase,
  AcDbDxfCode,
  AcDbObject,
  AcDbRegAppTableRecord,
  AcDbResultBuffer,
  AcDbTypedValue
} from '@mlightcad/data-model'

/**
 * RegApp name owned by this application's semantic tags.
 *
 * Deliberately distinct from the core's own `mlightcad` RegApp so that
 * template tags never mix with the annotation data the core writes. The core
 * seeds only `ACAD` and `mlightcad`, so this one has to be registered
 * explicitly — see {@link ensureSemanticTagRegApp}.
 */
export const SEMANTIC_TAG_APP_ID = 'codeco33'

/**
 * Version of the tag layout below. Bump when the field order changes so old
 * drawings stay readable instead of being silently misread.
 *
 * v2 appended {@link AcTpSemanticTag.params}. v1 tags are still read — a
 * drawing generated before the bump stays fully addressable, it just has no
 * recorded parameter values.
 */
export const SEMANTIC_TAG_SCHEMA_VERSION = 2

/** Schema versions this build can read. */
const READABLE_SCHEMA_VERSIONS = new Set([1, 2])

/**
 * A DXF 1000 group holds at most 255 characters. Parameter records are meant
 * to be the handful of numbers that define a part, not a place to park
 * arbitrary state, so exceeding this is a template bug rather than a limit to
 * work around.
 */
const MAX_PARAMS_JSON = 255

/**
 * Semantic identity attached to every entity a template draws.
 *
 * This is what lets a natural-language edit ("nâng lan can lên 1.27m") find
 * the right entities: the term dictionary maps the user's words to a
 * {@link AcTpSemanticTag.role}, and the role is matched against these tags.
 * Geometry and layer are not identity — a user may move an entity or rename a
 * layer, and the tag still has to hold.
 */
export interface AcTpSemanticTag {
  /**
   * Dictionary key for what this entity *is* — an ASCII slug such as
   * `lan_can`, never a display name and never accented, because it is matched
   * by machine.
   */
  role: string
  /** Identifies this part within the drawing, unique per drawing. */
  partId: string
  /** Template that drew the entity. */
  templateId: string
  /**
   * Values that define this part, as the template computed them — slab
   * thickness, rail height, pipe spacing.
   *
   * Recorded so that "bản dày bao nhiêu" can be answered by reading the
   * drawing instead of measuring geometry back. Measuring is not equivalent:
   * a dimension derived from two picked points cannot tell a 600mm slab from
   * a 600mm slab that was *meant* to be 650 and drawn wrong.
   *
   * Units are whatever the template drew in, which for these templates is
   * millimetres.
   */
  params?: Readonly<Record<string, number | string | boolean>>
}

/**
 * Field order written into XData. Fixed on purpose: two templates writing the
 * same fields in a different order would both "have tags" yet only one would
 * be readable by the query tools. Exported so a test can pin it — a silent
 * reorder would make every existing drawing misread rather than unreadable.
 */
export const FIELD_ORDER = [
  'schemaVersion',
  'role',
  'partId',
  'templateId',
  'params'
] as const

/** Number of fields written by each schema version. */
const FIELD_COUNT: Readonly<Record<number, number>> = { 1: 4, 2: 5 }

/**
 * Registers the semantic-tag RegApp on a database, once.
 *
 * `AcDbDatabase.ensureDatabaseDefaults()` seeds `ACAD` and `mlightcad` only,
 * so without this call the RegApp table has no record for our tags. Call it
 * from the single document-initialisation hook — registering from several
 * places is how two slightly different definitions end up in one file.
 *
 * Idempotent: calling it on a database that already has the record does
 * nothing.
 *
 * @param db - Database to register on.
 */
export function ensureSemanticTagRegApp(db: AcDbDatabase): void {
  const table = db.tables.appIdTable
  if (table.has(SEMANTIC_TAG_APP_ID)) return
  table.add(new AcDbRegAppTableRecord(SEMANTIC_TAG_APP_ID))
}

/**
 * Writes a semantic tag onto an entity.
 *
 * The **only** supported way to tag an entity. Templates must not assemble
 * result buffers themselves: a hand-rolled buffer is how the field order
 * drifts, and a drifted tag is invisible to the query tools even though it
 * looks present in the file.
 *
 * @param object - Entity being tagged.
 * @param tag - Semantic identity to attach.
 */
export function writeSemanticTag(
  object: AcDbObject,
  tag: AcTpSemanticTag
): void {
  assertSlug(tag.role, 'role')
  assertNonEmpty(tag.partId, 'partId')
  assertNonEmpty(tag.templateId, 'templateId')

  const values: AcDbTypedValue[] = [
    {
      code: AcDbDxfCode.ExtendedDataRegAppName,
      value: SEMANTIC_TAG_APP_ID
    },
    {
      code: AcDbDxfCode.ExtendedDataAsciiString,
      value: String(SEMANTIC_TAG_SCHEMA_VERSION)
    },
    { code: AcDbDxfCode.ExtendedDataAsciiString, value: tag.role },
    { code: AcDbDxfCode.ExtendedDataAsciiString, value: tag.partId },
    { code: AcDbDxfCode.ExtendedDataAsciiString, value: tag.templateId },
    {
      code: AcDbDxfCode.ExtendedDataAsciiString,
      value: encodeParams(tag.params)
    }
  ]

  object.setXData(new AcDbResultBuffer(values))
}

/**
 * Reads the semantic tag back from an entity.
 *
 * @param object - Entity to inspect.
 * @returns The tag, or `undefined` when the entity carries none — which is a
 * meaningful answer in itself: drawings imported from DWG have no tags at all,
 * and callers must not treat that as "no match found".
 */
export function readSemanticTag(
  object: AcDbObject
): AcTpSemanticTag | undefined {
  const buffer = object.getXData?.(SEMANTIC_TAG_APP_ID)
  if (!buffer) return undefined

  const strings = buffer
    .toArray()
    .filter(v => v.code === AcDbDxfCode.ExtendedDataAsciiString)
    .map(v => String(v.value))

  // Length is checked against the version the tag declares, not against the
  // current one: a v1 tag has four fields and is complete at four.
  if (strings.length < FIELD_COUNT[1]) return undefined

  const [schemaVersion, role, partId, templateId, rawParams] = strings
  const version = Number(schemaVersion)
  if (!READABLE_SCHEMA_VERSIONS.has(version)) return undefined
  if (strings.length < FIELD_COUNT[version]) return undefined

  const params = decodeParams(rawParams)
  return params
    ? { role, partId, templateId, params }
    : { role, partId, templateId }
}

/**
 * True when the entity carries a readable semantic tag for the given role.
 */
export function hasRole(object: AcDbObject, role: string): boolean {
  return readSemanticTag(object)?.role === role
}

/** Serialises the parameter record; an absent or empty record becomes ''. */
function encodeParams(params: AcTpSemanticTag['params']): string {
  if (!params) return ''
  const keys = Object.keys(params)
  if (keys.length === 0) return ''

  // Sorted so the same values always produce the same string — otherwise two
  // identical drawings diff against each other for no reason.
  const ordered: Record<string, number | string | boolean> = {}
  for (const key of keys.sort()) ordered[key] = params[key]

  const json = JSON.stringify(ordered)
  if (json.length > MAX_PARAMS_JSON) {
    throw new Error(
      `Bản ghi thông số của bộ phận dài ${json.length} ký tự, vượt giới hạn ` +
        `${MAX_PARAMS_JSON} của một chuỗi XData. Chỉ ghi các giá trị định nghĩa ` +
        'bộ phận, không dùng nó để lưu trạng thái.'
    )
  }
  return json
}

/** Reads the parameter record back; anything unparseable is treated as absent. */
function decodeParams(
  raw: string | undefined
): AcTpSemanticTag['params'] | undefined {
  if (!raw) return undefined
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return undefined
    }
    return parsed as AcTpSemanticTag['params']
  } catch {
    // A tag whose other four fields are intact is still worth returning: the
    // part stays addressable, it just has no recorded values.
    return undefined
  }
}

const SLUG = /^[a-z0-9_]+$/

function assertSlug(value: string, field: string): void {
  if (!SLUG.test(value ?? '')) {
    throw new Error(
      `Trường '${field}' phải là slug ASCII không dấu (a-z, 0-9, _). Nhận được: '${value}'`
    )
  }
}

function assertNonEmpty(value: string, field: string): void {
  if (!value || !value.trim()) {
    throw new Error(`Trường '${field}' không được để trống.`)
  }
}
