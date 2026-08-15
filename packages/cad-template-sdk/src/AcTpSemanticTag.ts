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
 */
export const SEMANTIC_TAG_SCHEMA_VERSION = 1

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
}

/**
 * Field order written into XData. Fixed on purpose: two templates writing the
 * same fields in a different order would both "have tags" yet only one would
 * be readable by the query tools.
 */
const FIELD_ORDER = ['schemaVersion', 'role', 'partId', 'templateId'] as const

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
    { code: AcDbDxfCode.ExtendedDataAsciiString, value: tag.templateId }
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

  if (strings.length < FIELD_ORDER.length) return undefined

  const [schemaVersion, role, partId, templateId] = strings
  if (Number(schemaVersion) !== SEMANTIC_TAG_SCHEMA_VERSION) return undefined

  return { role, partId, templateId }
}

/**
 * True when the entity carries a readable semantic tag for the given role.
 */
export function hasRole(object: AcDbObject, role: string): boolean {
  return readSemanticTag(object)?.role === role
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
