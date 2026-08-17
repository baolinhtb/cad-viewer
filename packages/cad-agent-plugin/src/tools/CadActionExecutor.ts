import {
  AcApDocManager,
  acapRunDatabaseEdit
} from '@mlightcad/cad-simple-viewer'
import {
  type AcTpSide,
  ensureSemanticTagRegApp,
  formatPartId,
  writeSemanticTag
} from '@mlightcad/cad-template-sdk'
import {
  AcDbArc,
  AcDbCircle,
  AcDbDatabase,
  AcDbEllipse,
  AcDbEntity,
  AcDbHatch,
  AcDbHatchPatternType,
  AcDbHatchStyle,
  AcDbLine,
  AcDbMText,
  AcDbPoint,
  AcDbPolyline,
  AcDbRay,
  AcDbSpline,
  AcDbXline,
  AcGeLine2d,
  AcGeLoop2d,
  AcGePoint2d,
  AcGePoint3d,
  AcGeTol,
  HATCH_PATTERN_SOLID
} from '@mlightcad/data-model'

import { requireDocument, requireView } from './documentAccess'
import type { DrawingContextSnapshot } from './DrawingContextProvider'
import { getDrawingContext } from './DrawingContextProvider'

/** 2D point in WCS used by agent tool inputs. */
export interface Point2dInput {
  x: number
  y: number
}

/**
 * Outcome of a CAD agent tool invocation.
 *
 * Serialized back to the LLM as JSON from each tool's `execute` handler.
 */
export interface ToolResult {
  /** Whether the operation completed without error. */
  success: boolean
  /** Short human-readable summary for the model. */
  message: string
  /** Object ids of entities created, when applicable. */
  entityIds?: string[]
  /** Machine-readable error code or message when `success` is false. */
  error?: string
}

/**
 * Converts a 2D tool input to a 3D point with the given Z elevation.
 *
 * @param point - WCS x/y coordinates.
 * @param z - Z coordinate (defaults to 0).
 * @returns A new {@link AcGePoint3d}.
 */
function toPoint3d(point: Point2dInput, z = 0): AcGePoint3d {
  return new AcGePoint3d(point.x, point.y, z)
}

/**
 * Assigns a layer name to an entity when the tool input specifies one.
 *
 * @param entity - Entity about to be appended to model space.
 * @param layer - Optional layer name from tool input.
 */
function applyLayer(entity: AcDbEntity, layer?: string): void {
  if (layer) {
    entity.layer = layer
  }
}

const POSITIVE_NORMAL = { x: 0, y: 0, z: 1 }

function degToRad(degrees: number): number {
  return (degrees * Math.PI) / 180
}

/**
 * Builds a unit direction vector from `start` toward `through`, or `undefined` if degenerate.
 */
function resolveUnitDirection(
  start: Point2dInput,
  through: Point2dInput
): AcGePoint3d | undefined {
  const direction = new AcGePoint3d(through.x, through.y, 0).sub(
    new AcGePoint3d(start.x, start.y, 0)
  )
  if (!AcGeTol.isPositive(direction.length())) {
    return undefined
  }
  return direction.normalize()
}

/**
 * Creates a closed polyline hatch boundary loop from WCS vertices.
 */
function createClosedBoundaryLoop(points: Point2dInput[]): AcGeLoop2d {
  const loop = new AcGeLoop2d()
  for (let index = 0; index < points.length; index++) {
    const start = points[index]
    const end = points[(index + 1) % points.length]
    loop.add(
      new AcGeLine2d(
        new AcGePoint2d(start.x, start.y),
        new AcGePoint2d(end.x, end.y)
      )
    )
  }
  return loop
}

/**
 * Verifies that a layer exists before creating geometry on it.
 *
 * @param layer - Optional layer name from tool input.
 * @returns A failed {@link ToolResult} when the layer is missing; otherwise `undefined`.
 */
function validateLayer(layer?: string): ToolResult | undefined {
  if (!layer) {
    return undefined
  }
  const layerNames = AcApDocManager.instance.curDocument.layerStore
    .getLayers()
    .map(entry => entry.name)
  if (!layerNames.includes(layer)) {
    return {
      success: false,
      message: `Layer not found: ${layer}`,
      error: 'layer_not_found'
    }
  }
  return undefined
}

/**
 * Runs a database mutation inside an undoable edit transaction.
 *
 * @param label - Undo stack label shown in the editor.
 * @param fn - Callback that performs the edit and returns a result.
 * @returns The value returned by `fn`.
 */
function runEdit<T>(label: string, fn: () => T): T {
  const db = AcApDocManager.instance.curDocument.database
  let result!: T
  acapRunDatabaseEdit(db, label, () => {
    result = fn()
  })
  return result
}

/**
 * Written into the tag of everything the assistant draws by hand.
 *
 * Distinct from a real template id so a later reader can tell "a template
 * produced this part, and its parameters are recorded" apart from "the
 * assistant drew this from a description, and the numbers behind it live in
 * the conversation".
 */
const AGENT_TEMPLATE_ID = 'tro_ly_ai'

/** What the assistant says it is drawing, until it says otherwise. */
export interface CurrentPart {
  /** Dictionary key — an ASCII slug such as `lan_can`. */
  role: string
  side?: AcTpSide
  /** 1-based position along the structure, for parts there are several of. */
  ordinal?: number
  /** The numbers that define the part, as the assistant chose them. */
  params?: Record<string, number | string | boolean>
}

/**
 * Executes CAD drawing operations on behalf of the LLM agent tools.
 *
 * All geometry is created in model space of the active document.
 */
export class CadActionExecutor {
  /**
   * The part every subsequent draw call belongs to.
   *
   * Modelled on the current layer, and for the same reason: repeating the
   * identity on each of the forty calls that make up one railing is both
   * costly and something the model will forget halfway through, which would
   * leave half a railing addressable.
   */
  private currentPart?: CurrentPart

  /**
   * Declares what the assistant is drawing from now on.
   *
   * @param part - The part, or `undefined` to go back to drawing untagged
   * geometry.
   * @returns The tag that will be written, so the model can see what it just
   * committed to.
   */
  setCurrentPart(part?: CurrentPart): ToolResult {
    if (!part) {
      this.currentPart = undefined
      return { success: true, message: 'Đã bỏ đánh dấu bộ phận hiện tại.' }
    }

    // `formatPartId` rejects a malformed role or ordinal. Letting it throw
    // here — before anything is drawn — is the point: a tag written wrong is
    // invisible until someone asks for that part and it is not there.
    let partId: string
    try {
      partId = formatPartId({
        role: part.role,
        side: part.side,
        ordinal: part.ordinal
      })
    } catch (error) {
      return {
        success: false,
        message: 'Không đặt được bộ phận hiện tại',
        error: error instanceof Error ? error.message : String(error)
      }
    }

    this.currentPart = part
    return {
      success: true,
      message: `Đang vẽ bộ phận "${partId}". Mọi đối tượng vẽ sau đây sẽ mang nhãn này cho tới khi đổi.`
    }
  }

  /** The part currently being drawn, if any. */
  getCurrentPart(): CurrentPart | undefined {
    return this.currentPart
  }

  /**
   * Puts a finished entity into model space, on its layer and under whatever
   * part was declared.
   *
   * Every draw call goes through here for the reason the template SDK gives
   * for its own draw context: an entity that reaches `appendEntity` by another
   * route carries no semantic tag, and nothing notices until someone asks the
   * assistant to change "the railing" and the railing turns out to be a pile
   * of anonymous polylines.
   *
   * This does not simply call the SDK's `createDrawContext` because that
   * context draws five shapes and the assistant draws twelve; the tagging
   * order — tag, then append — is copied from it deliberately.
   */
  private place(
    entity: AcDbEntity,
    layer: string | undefined,
    entityIds: string[]
  ): void {
    const db = AcApDocManager.instance.curDocument.database
    applyLayer(entity, layer)

    if (this.currentPart) {
      // Registering the RegApp here rather than at plugin start keeps it to
      // the one path that actually writes tags; it is idempotent.
      ensureSemanticTagRegApp(db)
      writeSemanticTag(entity, {
        role: this.currentPart.role,
        partId: formatPartId({
          role: this.currentPart.role,
          side: this.currentPart.side,
          ordinal: this.currentPart.ordinal
        }),
        templateId: AGENT_TEMPLATE_ID,
        ...(this.currentPart.params ? { params: this.currentPart.params } : {})
      })
    }

    db.tables.blockTable.modelSpace.appendEntity(entity)
    entityIds.push(entity.objectId)
  }

  /**
   * Returns a snapshot of the active drawing for the `get_drawing_context` tool.
   *
   * @returns Layer list, units, and extents.
   */
  getDrawingContext(): DrawingContextSnapshot | ToolResult {
    const accessError = requireDocument(false)
    if (accessError) {
      return accessError
    }
    try {
      return getDrawingContext()
    } catch (error) {
      return {
        success: false,
        message: 'Failed to read drawing context',
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }

  /**
   * Creates a line entity between two WCS points.
   *
   * @param input - Start and end points and optional layer.
   * @returns {@link ToolResult} with created entity ids on success.
   */
  drawLine(input: {
    start: Point2dInput
    end: Point2dInput
    layer?: string
  }): ToolResult {
    const accessError = requireDocument(true)
    if (accessError) {
      return accessError
    }
    const layerError = validateLayer(input.layer)
    if (layerError) {
      return layerError
    }
    try {
      const entityIds: string[] = []
      runEdit('Agent: draw_line', () => {
        const line = new AcDbLine(toPoint3d(input.start), toPoint3d(input.end))
        this.place(line, input.layer, entityIds)
      })
      return {
        success: true,
        message: 'Line created',
        entityIds
      }
    } catch (error) {
      return {
        success: false,
        message: 'Failed to draw line',
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }

  /**
   * Creates a circle by center and radius.
   *
   * @param input - Center, radius, and optional layer.
   * @returns {@link ToolResult} with created entity ids on success.
   */
  drawCircle(input: {
    center: Point2dInput
    radius: number
    layer?: string
  }): ToolResult {
    const accessError = requireDocument(true)
    if (accessError) {
      return accessError
    }
    const layerError = validateLayer(input.layer)
    if (layerError) {
      return layerError
    }
    try {
      const entityIds: string[] = []
      runEdit('Agent: draw_circle', () => {
        const circle = new AcDbCircle(toPoint3d(input.center), input.radius)
        this.place(circle, input.layer, entityIds)
      })
      return {
        success: true,
        message: 'Circle created',
        entityIds
      }
    } catch (error) {
      return {
        success: false,
        message: 'Failed to draw circle',
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }

  /**
   * Creates an arc by center, radius, and start/end angles in degrees.
   *
   * @param input - Arc parameters and optional layer.
   * @returns {@link ToolResult} with created entity ids on success.
   */
  drawArc(input: {
    center: Point2dInput
    radius: number
    startAngleDeg: number
    endAngleDeg: number
    layer?: string
  }): ToolResult {
    const accessError = requireDocument(true)
    if (accessError) {
      return accessError
    }
    const layerError = validateLayer(input.layer)
    if (layerError) {
      return layerError
    }
    try {
      const entityIds: string[] = []
      runEdit('Agent: draw_arc', () => {
        const arc = new AcDbArc(
          toPoint3d(input.center),
          input.radius,
          input.startAngleDeg,
          input.endAngleDeg
        )
        this.place(arc, input.layer, entityIds)
      })
      return {
        success: true,
        message: 'Arc created',
        entityIds
      }
    } catch (error) {
      return {
        success: false,
        message: 'Failed to draw arc',
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }

  /**
   * Creates a closed rectangular polyline from two opposite corners.
   *
   * @param input - Corner points and optional layer.
   * @returns {@link ToolResult} with created entity ids on success.
   */
  drawRectangle(input: {
    corner1: Point2dInput
    corner2: Point2dInput
    layer?: string
  }): ToolResult {
    const accessError = requireDocument(true)
    if (accessError) {
      return accessError
    }
    const layerError = validateLayer(input.layer)
    if (layerError) {
      return layerError
    }
    try {
      const entityIds: string[] = []
      runEdit('Agent: draw_rectangle', () => {
        const x1 = input.corner1.x
        const y1 = input.corner1.y
        const x2 = input.corner2.x
        const y2 = input.corner2.y
        const polyline = new AcDbPolyline()
        const corners = [
          new AcGePoint2d(x1, y1),
          new AcGePoint2d(x2, y1),
          new AcGePoint2d(x2, y2),
          new AcGePoint2d(x1, y2)
        ]
        corners.forEach((point, index) => {
          polyline.addVertexAt(index, point)
        })
        polyline.closed = true
        this.place(polyline, input.layer, entityIds)
      })
      return {
        success: true,
        message: 'Rectangle created',
        entityIds
      }
    } catch (error) {
      return {
        success: false,
        message: 'Failed to draw rectangle',
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }

  /**
   * Creates a polyline through an ordered list of vertices.
   *
   * @param input - Vertices, optional closed flag, and optional layer.
   * @returns {@link ToolResult} with created entity ids on success.
   */
  drawPolyline(input: {
    points: Point2dInput[]
    closed?: boolean
    layer?: string
  }): ToolResult {
    const accessError = requireDocument(true)
    if (accessError) {
      return accessError
    }
    if (input.points.length < 2) {
      return {
        success: false,
        message: 'Polyline requires at least 2 points',
        error: 'invalid_points'
      }
    }
    const layerError = validateLayer(input.layer)
    if (layerError) {
      return layerError
    }
    try {
      const entityIds: string[] = []
      runEdit('Agent: draw_polyline', () => {
        const polyline = new AcDbPolyline()
        input.points.forEach((point, index) => {
          polyline.addVertexAt(index, new AcGePoint2d(point.x, point.y))
        })
        if (input.closed) {
          polyline.closed = true
        }
        this.place(polyline, input.layer, entityIds)
      })
      return {
        success: true,
        message: 'Polyline created',
        entityIds
      }
    } catch (error) {
      return {
        success: false,
        message: 'Failed to draw polyline',
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }

  /**
   * Creates MTEXT at a WCS position.
   *
   * @param input - Position, string contents, optional height, and optional layer.
   * @returns {@link ToolResult} with created entity ids on success.
   */
  drawText(input: {
    position: Point2dInput
    text: string
    height?: number
    layer?: string
  }): ToolResult {
    const accessError = requireDocument(true)
    if (accessError) {
      return accessError
    }
    const layerError = validateLayer(input.layer)
    if (layerError) {
      return layerError
    }
    try {
      const entityIds: string[] = []
      runEdit('Agent: draw_text', () => {
        const mtext = new AcDbMText()
        mtext.location = toPoint3d(input.position)
        mtext.contents = input.text
        mtext.height = input.height ?? 2.5
        this.place(mtext, input.layer, entityIds)
      })
      return {
        success: true,
        message: 'Text created',
        entityIds
      }
    } catch (error) {
      return {
        success: false,
        message: 'Failed to draw text',
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }

  /**
   * Creates an ellipse or elliptical arc by center, radii, and optional rotation.
   *
   * @param input - Ellipse parameters and optional layer.
   * @returns {@link ToolResult} with created entity ids on success.
   */
  drawEllipse(input: {
    center: Point2dInput
    majorRadius: number
    minorRadius: number
    rotationDeg?: number
    startAngleDeg?: number
    endAngleDeg?: number
    layer?: string
  }): ToolResult {
    const accessError = requireDocument(true)
    if (accessError) {
      return accessError
    }
    if (
      !Number.isFinite(input.majorRadius) ||
      !Number.isFinite(input.minorRadius) ||
      input.majorRadius <= 0 ||
      input.minorRadius <= 0
    ) {
      return {
        success: false,
        message: 'Ellipse requires positive major and minor radii',
        error: 'invalid_radii'
      }
    }
    const layerError = validateLayer(input.layer)
    if (layerError) {
      return layerError
    }
    try {
      const entityIds: string[] = []
      runEdit('Agent: draw_ellipse', () => {
        const rotationRad = degToRad(input.rotationDeg ?? 0)
        const majorAxis = {
          x: Math.cos(rotationRad),
          y: Math.sin(rotationRad),
          z: 0
        }
        const hasArcAngles =
          input.startAngleDeg !== undefined && input.endAngleDeg !== undefined
        const startAngle = hasArcAngles ? degToRad(input.startAngleDeg!) : 0
        const endAngle = hasArcAngles ? degToRad(input.endAngleDeg!) : 0
        const ellipse = new AcDbEllipse(
          toPoint3d(input.center),
          POSITIVE_NORMAL,
          majorAxis,
          input.majorRadius,
          input.minorRadius,
          startAngle,
          endAngle
        )
        this.place(ellipse, input.layer, entityIds)
      })
      const isArc =
        input.startAngleDeg !== undefined && input.endAngleDeg !== undefined
      return {
        success: true,
        message: isArc ? 'Elliptical arc created' : 'Ellipse created',
        entityIds
      }
    } catch (error) {
      return {
        success: false,
        message: 'Failed to draw ellipse',
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }

  /**
   * Creates a hatch fill inside a closed polygon boundary.
   *
   * @param input - Boundary vertices, optional pattern settings, and optional layer.
   * @returns {@link ToolResult} with created entity ids on success.
   */
  drawHatch(input: {
    boundary: Point2dInput[]
    patternName?: string
    patternScale?: number
    patternAngleDeg?: number
    layer?: string
  }): ToolResult {
    const accessError = requireDocument(true)
    if (accessError) {
      return accessError
    }
    if (input.boundary.length < 3) {
      return {
        success: false,
        message: 'Hatch boundary requires at least 3 points',
        error: 'invalid_boundary'
      }
    }
    const layerError = validateLayer(input.layer)
    if (layerError) {
      return layerError
    }
    try {
      const entityIds: string[] = []
      runEdit('Agent: draw_hatch', () => {
        const db = AcApDocManager.instance.curDocument.database
        const hatch = new AcDbHatch()
        if (db instanceof AcDbDatabase) {
          hatch.database = db
        }
        const patternName = input.patternName?.trim() || HATCH_PATTERN_SOLID
        const isSolidFill = patternName === HATCH_PATTERN_SOLID
        hatch.patternName = patternName
        hatch.patternType = AcDbHatchPatternType.Predefined
        hatch.patternScale = input.patternScale ?? 1
        hatch.patternAngle = degToRad(input.patternAngleDeg ?? 0)
        hatch.hatchStyle = AcDbHatchStyle.Normal
        hatch.isSolidFill = isSolidFill
        hatch.add(createClosedBoundaryLoop(input.boundary))
        this.place(hatch, input.layer, entityIds)
      })
      return {
        success: true,
        message: 'Hatch created',
        entityIds
      }
    } catch (error) {
      return {
        success: false,
        message: 'Failed to draw hatch',
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }

  /**
   * Creates a point entity at a WCS position.
   *
   * @param input - Position and optional layer.
   * @returns {@link ToolResult} with created entity ids on success.
   */
  drawPoint(input: { position: Point2dInput; layer?: string }): ToolResult {
    const accessError = requireDocument(true)
    if (accessError) {
      return accessError
    }
    const layerError = validateLayer(input.layer)
    if (layerError) {
      return layerError
    }
    try {
      const entityIds: string[] = []
      runEdit('Agent: draw_point', () => {
        const point = new AcDbPoint()
        point.position = toPoint3d(input.position)
        this.place(point, input.layer, entityIds)
      })
      return {
        success: true,
        message: 'Point created',
        entityIds
      }
    } catch (error) {
      return {
        success: false,
        message: 'Failed to draw point',
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }

  /**
   * Creates a ray from a start point through another point.
   *
   * @param input - Start point, through point, and optional layer.
   * @returns {@link ToolResult} with created entity ids on success.
   */
  drawRay(input: {
    start: Point2dInput
    through: Point2dInput
    layer?: string
  }): ToolResult {
    const accessError = requireDocument(true)
    if (accessError) {
      return accessError
    }
    const unitDir = resolveUnitDirection(input.start, input.through)
    if (!unitDir) {
      return {
        success: false,
        message: 'Ray requires distinct start and through points',
        error: 'invalid_direction'
      }
    }
    const layerError = validateLayer(input.layer)
    if (layerError) {
      return layerError
    }
    try {
      const entityIds: string[] = []
      runEdit('Agent: draw_ray', () => {
        const ray = new AcDbRay()
        ray.basePoint = toPoint3d(input.start)
        ray.unitDir = unitDir
        this.place(ray, input.layer, entityIds)
      })
      return {
        success: true,
        message: 'Ray created',
        entityIds
      }
    } catch (error) {
      return {
        success: false,
        message: 'Failed to draw ray',
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }

  /**
   * Creates a construction line (xline) from a start point through another point.
   *
   * @param input - Start point, through point, and optional layer.
   * @returns {@link ToolResult} with created entity ids on success.
   */
  drawXline(input: {
    start: Point2dInput
    through: Point2dInput
    layer?: string
  }): ToolResult {
    const accessError = requireDocument(true)
    if (accessError) {
      return accessError
    }
    const unitDir = resolveUnitDirection(input.start, input.through)
    if (!unitDir) {
      return {
        success: false,
        message: 'Xline requires distinct start and through points',
        error: 'invalid_direction'
      }
    }
    const layerError = validateLayer(input.layer)
    if (layerError) {
      return layerError
    }
    try {
      const entityIds: string[] = []
      runEdit('Agent: draw_xline', () => {
        const xline = new AcDbXline()
        xline.basePoint = toPoint3d(input.start)
        xline.unitDir = unitDir
        this.place(xline, input.layer, entityIds)
      })
      return {
        success: true,
        message: 'Xline created',
        entityIds
      }
    } catch (error) {
      return {
        success: false,
        message: 'Failed to draw xline',
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }

  /**
   * Creates a fit spline through an ordered list of control/fit points.
   *
   * @param input - Vertices, optional closed flag, and optional layer.
   * @returns {@link ToolResult} with created entity ids on success.
   */
  drawSpline(input: {
    points: Point2dInput[]
    closed?: boolean
    layer?: string
  }): ToolResult {
    const accessError = requireDocument(true)
    if (accessError) {
      return accessError
    }
    if (input.points.length < 2) {
      return {
        success: false,
        message: 'Spline requires at least 2 points',
        error: 'invalid_points'
      }
    }
    const layerError = validateLayer(input.layer)
    if (layerError) {
      return layerError
    }
    try {
      const entityIds: string[] = []
      runEdit('Agent: draw_spline', () => {
        const points3d = input.points.map(point => toPoint3d(point))
        const degree = Math.min(3, Math.max(1, points3d.length - 1))
        const isClosed = Boolean(input.closed && points3d.length >= 3)
        const spline = new AcDbSpline(points3d, 'Chord', degree, isClosed)
        this.place(spline, input.layer, entityIds)
      })
      return {
        success: true,
        message: 'Spline created',
        entityIds
      }
    } catch (error) {
      return {
        success: false,
        message: 'Failed to draw spline',
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }

  /**
   * Sets the document current layer (CLAYER).
   *
   * @param layerName - Existing layer name.
   * @returns Success when the layer exists; otherwise `layer_not_found`.
   */
  setCurrentLayer(layerName: string): ToolResult {
    const accessError = requireDocument(true)
    if (accessError) {
      return accessError
    }
    try {
      const changed = runEdit('Agent: set_current_layer', () => {
        return AcApDocManager.instance.curDocument.layerService.setCurrentLayer(
          layerName
        )
      })
      return changed
        ? { success: true, message: `Current layer set to ${layerName}` }
        : {
            success: false,
            message: `Layer not found: ${layerName}`,
            error: 'layer_not_found'
          }
    } catch (error) {
      return {
        success: false,
        message: 'Failed to set current layer',
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }

  /**
   * Creates a layer when it does not already exist.
   *
   * @param layerName - Name of the layer to create.
   * @returns Success when created or already present.
   */
  createLayer(layerName: string): ToolResult {
    const accessError = requireDocument(true)
    if (accessError) {
      return accessError
    }
    try {
      const result = runEdit('Agent: create_layer', () => {
        return AcApDocManager.instance.curDocument.layerService.createLayers([
          layerName
        ])
      })
      if (result.created > 0) {
        return { success: true, message: `Layer created: ${layerName}` }
      }
      if (result.existed.includes(layerName)) {
        return {
          success: true,
          message: `Layer already exists: ${layerName}`
        }
      }
      return {
        success: false,
        message: `Failed to create layer: ${layerName}`,
        error: 'create_layer_failed'
      }
    } catch (error) {
      return {
        success: false,
        message: 'Failed to create layer',
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }

  /**
   * Erases entities by object id.
   *
   * @param input - Entity ids previously returned by drawing tools.
   * @returns {@link ToolResult} with the number of deleted entities on success.
   */
  deleteEntities(input: { entityIds: string[] }): ToolResult {
    const accessError = requireDocument(true)
    if (accessError) {
      return accessError
    }
    if (input.entityIds.length === 0) {
      return {
        success: false,
        message: 'At least one entity id is required',
        error: 'invalid_entity_ids'
      }
    }
    try {
      const requestedIds = [...new Set(input.entityIds)]
      let erasedCount = 0
      runEdit('Agent: delete_entities', () => {
        erasedCount =
          AcApDocManager.instance.curDocument.entityService.eraseEntities(
            requestedIds
          )
      })
      if (erasedCount === 0) {
        return {
          success: false,
          message: 'No entities found for the given ids',
          error: 'entity_not_found'
        }
      }
      const notFoundCount = requestedIds.length - erasedCount
      const message =
        notFoundCount > 0
          ? `Deleted ${erasedCount} entity(ies); ${notFoundCount} id(s) not found`
          : `Deleted ${erasedCount} entity(ies)`
      return {
        success: true,
        message
      }
    } catch (error) {
      return {
        success: false,
        message: 'Failed to delete entities',
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }

  /**
   * Zooms the active view to the full drawing extents.
   *
   * @returns Success when the view zoom completes.
   */
  zoomExtents(): ToolResult {
    const accessError = requireView()
    if (accessError) {
      return accessError
    }
    try {
      AcApDocManager.instance.context.view.zoomToFitDrawing()
      return { success: true, message: 'Zoomed to drawing extents' }
    } catch (error) {
      return {
        success: false,
        message: 'Failed to zoom extents',
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }
}

/** Shared singleton used by {@link createCadTools}. */
export const cadActionExecutor = new CadActionExecutor()
