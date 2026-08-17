import { AcApDocManager } from '@mlightcad/cad-simple-viewer'

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
    documentTitle: doc.docTitle
  }
}
