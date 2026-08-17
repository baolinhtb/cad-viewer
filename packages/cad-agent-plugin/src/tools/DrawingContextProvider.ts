import { AcApDocManager } from '@mlightcad/cad-simple-viewer'
import { readDrawingDigest } from '@mlightcad/cad-template-sdk'

/** One part of the drawing, as the assistant needs to see it. */
export interface DrawingPartSummary {
  /** Dictionary key — `lan_can`, `ban_mat_cau`. */
  role: string
  /** Vietnamese display name, when the role is a known one. */
  roleLabel?: string
  /** Which one it is: `lan_can_trai`, `ong_thoat_nuoc_03`. */
  partId: string
  layers: string[]
  entityCount: number
  /** Values recorded when the part was drawn, if any. */
  params?: Record<string, number | string | boolean>
}

/**
 * Snapshot of the active drawing passed to the LLM via `get_drawing_context`.
 */
export interface DrawingContextSnapshot {
  /** Name of the current layer (CLAYER). */
  currentLayer: string
  /** All layer names in the document. */
  layers: string[]
  /** Drawing units code (INSUNITS). */
  insunits: number
  /**
   * Axis-aligned bounding box of the database.
   *
   * A coordinate is `null` when the drawing has no geometry to bound — see
   * {@link finite} for why that distinction has to survive into the tool
   * result rather than being papered over with a zero.
   */
  extents: {
    min: { x: number | null; y: number | null; z: number | null }
    max: { x: number | null; y: number | null; z: number | null }
    isEmpty: boolean
  }
  /** Human-readable document title. */
  documentTitle: string
  /**
   * How many entities sit on each layer.
   *
   * Cheap, and it answers "is there anything on KC-LANCAN" without a tool call
   * per layer — which is the question that decides whether a request means
   * "draw one" or "change the one that is there".
   */
  entityCountByLayer: Record<string, number>
  /**
   * The parts this drawing is made of, when it carries semantic tags.
   *
   * This is the difference between an assistant that reasons about a drawing
   * and one that remembers what it did. A conversation is lost on reload, is
   * truncated when it grows, and says nothing at all about a drawing somebody
   * else made; the tags are in the file. Empty means the drawing carries no
   * tags — which is a fact about the drawing, not a failure to find any.
   */
  parts: DrawingPartSummary[]
  /** Entities carrying no semantic tag. */
  untaggedEntityCount: number
  /**
   * `untagged` — nothing here can be addressed by name.
   * `tagged` — at least one part can.
   * `schema-mismatch` — tags exist but this build cannot read them, which is
   * not the same as their absence and must not be reported as such.
   */
  semanticStatus: 'untagged' | 'tagged' | 'schema-mismatch'
}

/**
 * Keeps a coordinate only if it is a real number.
 *
 * An empty drawing has no extents, and the database reports that as `NaN`
 * (`±Infinity` on some paths). Neither is JSON: `JSON.stringify` turns both
 * into `null`, so the value looks harmless in a log and in the request that
 * goes to the model — while the object kept in the chat history still holds
 * `NaN`. On the next message that history is validated as a prompt, `NaN` is
 * not a number as far as the schema is concerned, and the whole turn dies with
 * "Invalid prompt: The messages must be a ModelMessage[]".
 *
 * That failure cost a session: the first message drew correctly and every
 * correction after it was refused. So the conversion happens here, at the only
 * place that knows the value came from an empty bounding box.
 */
function finite(value: number): number | null {
  return Number.isFinite(value) ? value : null
}

/**
 * Keeps a coordinate only if it is a real number.
 *
 * An empty drawing has no extents, and the database reports that as `NaN`
 * (`±Infinity` on some paths). Neither is JSON: `JSON.stringify` turns both
 * into `null`, so the value looks harmless in a log and in the request that
 * goes to the model — while the object kept in the chat history still holds
 * `NaN`. On the next message that history is validated as a prompt, `NaN` is
 * not a number as far as the schema is concerned, and the whole turn dies with
 * "Invalid prompt: The messages must be a ModelMessage[]".
 *
 * That failure cost a session: the first message drew correctly and every
 * correction after it was refused. So the conversion happens here, at the only
 * place that knows the value came from an empty bounding box.
 */
function finite(value: number): number | null {
  return Number.isFinite(value) ? value : null
}

/**
 * Collects layer, unit, and extent metadata from the active document.
 *
 * @returns A JSON-serializable context object for agent tool calls.
 */
export function getDrawingContext(): DrawingContextSnapshot {
  const doc = AcApDocManager.instance.curDocument
  const db = doc.database

  const layers = doc.layerStore.getLayers().map(layer => layer.name)
  const extents = db.extents
  const digest = readDrawingDigest(db)

  const entityCountByLayer: Record<string, number> = {}
  for (const entity of db.tables.blockTable.modelSpace.newIterator()) {
    const layer = entity.layer || '0'
    entityCountByLayer[layer] = (entityCountByLayer[layer] ?? 0) + 1
  }

  return {
    currentLayer: doc.layerStore.getCurrentLayerName(),
    layers,
    insunits: db.insunits,
    extents: {
      min: {
        x: finite(extents.min.x),
        y: finite(extents.min.y),
        z: finite(extents.min.z)
      },
      max: {
        x: finite(extents.max.x),
        y: finite(extents.max.y),
        z: finite(extents.max.z)
      },
      isEmpty: extents.isEmpty()
    },
    documentTitle: doc.docTitle,
    entityCountByLayer,
    // `objectIds` and `bounds` are deliberately dropped here: the context is
    // read at the start of every turn, and a list of ids per part grows with
    // the drawing for no benefit. `tim_bo_phan` returns them when a part is
    // actually being worked on.
    parts: digest.parts.map(part => ({
      role: part.role,
      ...(part.roleLabel ? { roleLabel: part.roleLabel } : {}),
      partId: part.partId,
      layers: part.layers,
      entityCount: part.entityCount,
      ...(part.params ? { params: part.params } : {})
    })),
    untaggedEntityCount: digest.untaggedEntityCount,
    semanticStatus: digest.status
  }
}
