import {
  AcCmColor,
  AcCmColorMethod,
  AcDbEntity,
  AcDbLinetypeTableRecord,
  AcDbMText,
  AcDbText,
  AcGePoint3d
} from '@mlightcad/data-model'

import { getDrawingContext } from '../context/DrawingContextProvider'
import type { CadSession } from '../session/CadSession'
import { requireDocument } from '../session/documentAccess'
import { runInsideScriptEdit } from '../session/editDepth'
import { isEntityOnLockedLayer } from '../session/lockedLayer'
import { runSessionEdit } from '../session/runSessionEdit'
import { CadActionExecutor } from '../tools/CadActionExecutor'
import type { CadScriptAudit, Point2dInput, ToolResult } from '../tools/types'
import { createCadMeasure } from './createCadMeasure'
import {
  type EntitySnapshot,
  iterateDatabaseEntities,
  openEntityFilterView,
  toEntitySnapshot
} from './entitySnapshot'
import {
  type CadScriptDxfSaveRequest,
  normalizeDxfSaveRequest
} from './saveDxf'
import { CAD_EDIT_TX_METHODS, CAD_SCRIPT_API_TREE } from './scriptApi'
import { toBlockSnapshots, toDatabaseTables } from './tableSnapshot'

/** Queued screenshot request from `cad.view.capturePreview`. */
export interface CadScriptPreviewRequest {
  /** Optional max dimension in pixels for the PNG. */
  longSide?: number
}

/** Side effects collected while a script runs. */
export interface CadScriptEffects {
  /** Messages passed to `cad.log`. */
  log: string[]
  /** Ids from the latest `cad.selection` change. */
  highlightedIds: string[]
  /** Entity ids created inside `cad.edit.transaction`. */
  createdIds: string[]
  /**
   * Preview captures requested during the script body.
   * Fulfilled asynchronously after the script returns.
   */
  previewRequests: CadScriptPreviewRequest[]
  /**
   * DXF saves requested by `cad.file.saveDxf`.
   * Fulfilled after the script returns; the DXF body is not part of this list.
   */
  dxfSaveRequests: CadScriptDxfSaveRequest[]
}

/**
 * How a script may treat entities that belong to something larger than
 * themselves — a template run, in the CAD viewer.
 *
 * The runtime cannot know what a template run is (it depends on
 * `@mlightcad/data-model` only), so the host names an entity's owner.
 */
export interface CadScriptEntityGuard {
  /**
   * Label of the run an entity belongs to (e.g. `ho_so_mo_m1 r1`), or
   * `undefined` for free drawing content. `tx.erase` refuses owned entities
   * unless {@link allowOwnedErase} is set; every change to one is recorded in
   * {@link CadScriptAudit.runs}.
   */
  entityOwner?: (entity: AcDbEntity) => string | undefined
  /** The user explicitly asked to delete part of a template run. */
  allowOwnedErase?: boolean
}

/**
 * Collects {@link CadScriptAudit} while a script runs. Changes are staged per
 * `cad.edit.transaction` and kept only when the transaction commits.
 */
export class CadScriptAuditTracker {
  private erased = 0
  private modified = new Set<string>()
  private layers = new Set<string>()
  private runs = new Set<string>()
  private blocked = 0
  private saved?: [number, Set<string>, Set<string>, Set<string>]

  constructor(
    private readonly owner?: (entity: AcDbEntity) => string | undefined
  ) {}

  /** Starts staging the changes of one transaction. */
  begin(): void {
    this.saved = [
      this.erased,
      new Set(this.modified),
      new Set(this.layers),
      new Set(this.runs)
    ]
  }

  /** Drops the changes staged since {@link begin} (the transaction threw). */
  rollback(): void {
    if (!this.saved) return
    ;[this.erased, this.modified, this.layers, this.runs] = this.saved
    this.saved = undefined
  }

  /** Keeps the staged changes. */
  commit(): void {
    this.saved = undefined
  }

  /** Records entities about to be changed. */
  touch(entities: AcDbEntity[], erased = false): void {
    for (const entity of entities) {
      this.layers.add(entity.layer)
      const run = this.owner?.(entity)
      if (run) this.runs.add(run)
      if (!erased) this.modified.add(entity.objectId)
    }
  }

  /** Records `count` entities erased. */
  erase(count: number): void {
    this.erased += count
  }

  /** Records an erase refused by the guard. */
  block(count: number): void {
    this.blocked += count
  }

  /** The audit of the script so far. */
  result(created: number): CadScriptAudit {
    return {
      erased: this.erased,
      modified: this.modified.size,
      created,
      layers: [...this.layers].sort(),
      runs: [...this.runs].sort(),
      blockedErase: this.blocked
    }
  }
}

/** Limits enforced by `cad.__tick`. */
export interface CadScriptLimits {
  /** Maximum tick calls before the script is stopped. */
  maxTicks: number
  /** Maximum wall-clock time in milliseconds. */
  maxMilliseconds: number
}

const DEFAULT_LIMITS: CadScriptLimits = {
  maxTicks: 100_000,
  maxMilliseconds: 2_000
}

/**
 * Builds the `cad` value injected into a script.
 *
 * The returned object is sealed with a proxy. Only members declared in
 * {@link CAD_SCRIPT_API_TREE} can be read.
 *
 * @param session - Drawing and view access.
 * @param effects - Mutable log, highlight, and created-id collectors.
 * @param limits - Tick budget. Defaults to 100000 statements or 2 seconds.
 * @param guard - Owner lookup and erase permission for template content.
 * @param audit - Collector for what the script changes.
 * @returns The host passed as the `cad` argument.
 */
export function createCadScriptHost(
  session: CadSession,
  effects: CadScriptEffects,
  limits: CadScriptLimits = DEFAULT_LIMITS,
  guard: CadScriptEntityGuard = {},
  audit: CadScriptAuditTracker = new CadScriptAuditTracker(guard.entityOwner)
) {
  const executor = new CadActionExecutor(session)
  const startedAt = Date.now()
  let ticks = 0

  const entities = {
    where(predicate: (entity: EntitySnapshot) => boolean): EntitySnapshot[] {
      if (typeof predicate !== 'function') {
        throw new Error('cad.entities.where expects a function')
      }
      const doc = requireDocumentRecord(session)
      const matches: EntitySnapshot[] = []
      for (const entity of iterateDatabaseEntities(doc.database)) {
        const view = openEntityFilterView(entity)
        let matched = false
        try {
          matched = Boolean(predicate(view.value))
        } finally {
          view.release()
        }
        if (matched) matches.push(toEntitySnapshot(entity))
      }
      return matches
    },
    grips(id: string) {
      const entity = getWritableTarget(id, false)
      return entity.subGetGripPoints().map(p => ({ x: p.x, y: p.y, z: p.z }))
    },
    byId(id: string): EntitySnapshot | undefined {
      return snapshotById(session, id)
    },
    inBox(min: Point2dInput, max: Point2dInput): EntitySnapshot[] {
      const doc = requireDocumentRecord(session)
      const minX = Math.min(min.x, max.x)
      const maxX = Math.max(min.x, max.x)
      const minY = Math.min(min.y, max.y)
      const maxY = Math.max(min.y, max.y)
      const snapshots: EntitySnapshot[] = []
      for (const entity of iterateDatabaseEntities(doc.database)) {
        const view = openEntityFilterView(entity)
        const extents = view.value.extents
        view.release()
        if (!extents) continue
        const hits =
          extents.max.x >= minX &&
          extents.min.x <= maxX &&
          extents.max.y >= minY &&
          extents.min.y <= maxY
        if (hits) snapshots.push(toEntitySnapshot(entity))
      }
      return snapshots
    }
  }

  const selection = {
    get ids(): string[] {
      return [...requireView(session).selectionSet.ids]
    },
    get entities(): EntitySnapshot[] {
      const snapshots: EntitySnapshot[] = []
      for (const id of this.ids) {
        const snapshot = snapshotById(session, id)
        if (snapshot) snapshots.push(snapshot)
      }
      return snapshots
    },
    replace(ids: string[]): void {
      const view = requireView(session)
      view.selectionSet.clear()
      view.selectionSet.add(ids)
      effects.highlightedIds = [...ids]
    },
    add(ids: string[]): void {
      const view = requireView(session)
      view.selectionSet.add(ids)
      effects.highlightedIds = [...view.selectionSet.ids]
    },
    remove(ids: string[]): void {
      const view = requireView(session)
      view.selectionSet.delete(ids)
      effects.highlightedIds = [...view.selectionSet.ids]
    },
    clear(): void {
      requireView(session).selectionSet.clear()
      effects.highlightedIds = []
    }
  }

  const view = {
    zoomExtents(): void {
      const result = executor.zoomExtents()
      if (!result.success) throw new Error(result.message)
    },
    /**
     * Queues a PNG screenshot of the current drawing extents.
     *
     * Capture runs after the script body finishes (async WebGL). The image is
     * attached to the tool result for the model; it is not returned inline
     * (data URLs exceed the script JSON size limit).
     *
     * @param options - Optional `longSide` in pixels (default 1024).
     * @returns `{ queued: true, index }` identifying this capture.
     */
    capturePreview(options?: { longSide?: number }): {
      queued: true
      index: number
    } {
      const longSide =
        options && typeof options.longSide === 'number'
          ? options.longSide
          : undefined
      const index = effects.previewRequests.length
      effects.previewRequests.push(longSide !== undefined ? { longSide } : {})
      return { queued: true, index }
    }
  }

  const measure = createCadMeasure(id => snapshotById(session, id))

  const file = {
    /**
     * Queues a DXF export of the current drawing.
     *
     * The file is written after the script succeeds. In the in-app agent this
     * downloads; in cad-mcp-server the Node host writes `path`.
     *
     * @param options - Path string, or `{ path?, fileName? }`.
     * @returns Queue handle. The DXF text is not included.
     */
    saveDxf(options?: Parameters<typeof normalizeDxfSaveRequest>[1]): {
      queued: true
      index: number
      fileName: string
    } {
      const doc = requireDocumentRecord(session)
      const request = normalizeDxfSaveRequest(doc.docTitle, options)
      const index = effects.dxfSaveRequests.length
      effects.dxfSaveRequests.push(request)
      return { queued: true, index, fileName: request.fileName }
    }
  }

  const edit = {
    transaction(label: string, fn: (tx: CadEditTransaction) => void): void {
      if (typeof fn !== 'function') {
        throw new Error('cad.edit.transaction expects a function')
      }
      const accessError = requireDocument(session, true)
      if (accessError) throw new Error(accessError.error ?? accessError.message)
      const db = session.getDocument()!.database
      audit.begin()
      try {
        runInsideScriptEdit(() => {
          runSessionEdit(session, db, label || 'Agent script', () => {
            fn(
              seal(
                createTransaction(session, executor, effects, guard, audit),
                CAD_EDIT_TX_METHODS
              )
            )
          })
        })
      } catch (error) {
        audit.rollback()
        throw error
      }
      audit.commit()
    }
  }

  const host = {
    get drawing() {
      const doc = session.getDocument()
      if (!doc) throw new Error('no_document')
      const context = getDrawingContext(session)
      return {
        title: context.documentTitle,
        currentLayer: context.currentLayer,
        units: context.insunits,
        layers: doc.layerStore.getLayers().map(layer => ({
          name: layer.name,
          isOn: layer.isOn,
          isFrozen: layer.isFrozen,
          isLocked: layer.isLocked
        })),
        extents: context.extents
      }
    },
    entities,
    get tables() {
      return toDatabaseTables(requireDocumentRecord(session).database)
    },
    get blocks() {
      return toBlockSnapshots(requireDocumentRecord(session).database)
    },
    selection,
    view,
    file,
    measure,
    edit,
    log(...values: unknown[]): void {
      effects.log.push(values.map(formatLogValue).join(' '))
    },
    __tick(): void {
      ticks++
      if (
        ticks > limits.maxTicks ||
        Date.now() - startedAt > limits.maxMilliseconds
      ) {
        throw new Error('script_timeout')
      }
    }
  }

  return seal(host, Object.keys(CAD_SCRIPT_API_TREE))

  function getWritableTarget(id: string, writing = true): AcDbEntity {
    const db = requireDocumentRecord(session).database
    const entity = db.openObjectForRead(id)
    if (!(entity instanceof AcDbEntity)) throw new Error('entity_not_found')
    if (writing && isEntityOnLockedLayer(db, entity))
      throw new Error('entity_layer_locked')
    return entity
  }
}

/** Transaction methods exposed inside `cad.edit.transaction`. */
export interface CadEditTransaction {
  drawLine(input: {
    start: Point2dInput
    end: Point2dInput
    layer?: string
  }): string
  drawCircle(input: {
    center: Point2dInput
    radius: number
    layer?: string
  }): string
  drawArc(input: {
    center: Point2dInput
    radius: number
    startAngleDeg: number
    endAngleDeg: number
    layer?: string
  }): string
  drawRectangle(input: {
    corner1: Point2dInput
    corner2: Point2dInput
    layer?: string
  }): string
  drawPolyline(input: {
    points: Point2dInput[]
    closed?: boolean
    layer?: string
  }): string
  drawEllipse(input: {
    center: Point2dInput
    majorRadius: number
    minorRadius: number
    rotationDeg?: number
    startAngleDeg?: number
    endAngleDeg?: number
    layer?: string
  }): string
  drawHatch(input: {
    boundary: Point2dInput[]
    patternName?: string
    patternScale?: number
    patternAngleDeg?: number
    layer?: string
  }): string
  drawPoint(input: { position: Point2dInput; layer?: string }): string
  drawRay(input: {
    start: Point2dInput
    through: Point2dInput
    layer?: string
  }): string
  drawXline(input: {
    start: Point2dInput
    through: Point2dInput
    layer?: string
  }): string
  drawSpline(input: {
    points: Point2dInput[]
    closed?: boolean
    layer?: string
  }): string
  drawText(input: {
    position: Point2dInput
    text: string
    height?: number
    layer?: string
  }): string
  erase(ids: string[]): number
  setLayer(ids: string[], layer: string): void
  /** Apply annotation presentation; locked layers are left untouched. */
  setStyle(
    ids: string[],
    style: { color?: number; lineType?: string; linetypeScale?: number }
  ): void
  /** Change native text content without replacing the entity or its styling. */
  setText(id: string, text: string): void
  /** Move selected native grips, preserving the entity and its other detail. */
  moveGrips(id: string, indices: number[], dx: number, dy: number): void
  move(ids: string[], dx: number, dy: number): number
  rotate(ids: string[], center: Point2dInput, angleDeg: number): number
  createLayer(name: string): void
  setCurrentLayer(name: string): void
}

function createTransaction(
  session: CadSession,
  executor: CadActionExecutor,
  effects: CadScriptEffects,
  guard: CadScriptEntityGuard,
  audit: CadScriptAuditTracker
): CadEditTransaction {
  const existing = (ids: readonly string[]): AcDbEntity[] => {
    const db = session.getDocument()!.database
    return ids.flatMap(id => {
      const entity = db.tables.blockTable.getEntityById(id)
      return entity ? [entity] : []
    })
  }
  const touch = (ids: readonly string[]) => {
    if (Array.isArray(ids)) audit.touch(existing(ids))
  }
  const created = (result: ToolResult): string => {
    if (!result.success || !result.entityIds?.length) {
      throw new Error(result.error ?? result.message)
    }
    effects.createdIds.push(...result.entityIds)
    return result.entityIds[0]
  }

  return {
    drawLine: input => created(executor.drawLine(input)),
    drawCircle: input => created(executor.drawCircle(input)),
    drawArc: input => created(executor.drawArc(input)),
    drawRectangle: input => created(executor.drawRectangle(input)),
    drawPolyline: input => created(executor.drawPolyline(input)),
    drawEllipse: input => created(executor.drawEllipse(input)),
    drawHatch: input => created(executor.drawHatch(input)),
    drawPoint: input => created(executor.drawPoint(input)),
    drawRay: input => created(executor.drawRay(input)),
    drawXline: input => created(executor.drawXline(input)),
    drawSpline: input => created(executor.drawSpline(input)),
    drawText: input => created(executor.drawText(input)),
    erase(ids) {
      const targets = Array.isArray(ids) ? existing(ids) : []
      const owned = guard.entityOwner
        ? targets.filter(entity => guard.entityOwner!(entity))
        : []
      if (owned.length && !guard.allowOwnedErase) {
        audit.block(owned.length)
        const runs = [
          ...new Set(owned.map(entity => guard.entityOwner!(entity)!))
        ].sort()
        // Thrown, so the whole transaction rolls back: nothing is erased.
        throw new Error(
          `erase_blocked_template_run: ${owned.length} of ${ids.length} entities belong to template run(s) ${runs.join(', ')}. ` +
            'Erasing them breaks that dossier without the user noticing. Change the run with its own tool (e.g. sua_ho_so_mo), ' +
            'or ask the user; only if they explicitly asked to delete these entities, run the script again with choPhepXoaHoSo: true.'
        )
      }
      audit.touch(targets, true)
      const count = session.getDocument()!.entityService.eraseEntities(ids)
      audit.erase(count)
      return count
    },
    setLayer(ids, layer) {
      touch(ids)
      const doc = session.getDocument()!
      const known = doc.layerStore
        .getLayers()
        .some(entry => entry.name === layer)
      if (!known) throw new Error('layer_not_found')
      const db = doc.database
      for (const id of ids) {
        const existing = db.tables.blockTable.getEntityById(id)
        if (existing && isEntityOnLockedLayer(db, existing)) {
          continue
        }
        const entity = db.openEntityForWrite(id)
        if (!entity || isEntityOnLockedLayer(db, entity)) {
          continue
        }
        entity.layer = layer
      }
    },
    setStyle(ids, style) {
      touch(ids)
      const { color, lineType, linetypeScale } = style
      if (
        color !== undefined &&
        (!Number.isInteger(color) || color < 1 || color > 256)
      ) {
        throw new Error('color must be an ACI index 1–255 or 256 (ByLayer)')
      }
      if (
        linetypeScale !== undefined &&
        (!Number.isFinite(linetypeScale) || linetypeScale <= 0)
      ) {
        throw new Error('linetypeScale must be finite and positive')
      }
      const db = session.getDocument()!.database
      const patterns: Record<string, number[]> = {
        CENTER: [1.25, -0.25, 0.25, -0.25],
        DASHED: [0.5, -0.25],
        HIDDEN: [0.25, -0.125],
        DASHDOT: [0.5, -0.25, 0, -0.25]
      }
      if (lineType !== undefined && !db.tables.linetypeTable.has(lineType)) {
        const pattern = patterns[lineType]
        if (!pattern) throw new Error('Unknown linetype: ' + lineType)
        db.tables.linetypeTable.add(
          new AcDbLinetypeTableRecord({
            name: lineType,
            standardFlag: 0,
            description: lineType,
            totalPatternLength: pattern.reduce(
              (sum, n) => sum + Math.abs(n),
              0
            ),
            pattern: pattern.map(n => ({
              elementLength: n,
              elementTypeFlag: 0
            }))
          })
        )
      }
      for (const id of ids) {
        const existing = db.tables.blockTable.getEntityById(id)
        if (!existing || isEntityOnLockedLayer(db, existing)) continue
        const entity = db.openEntityForWrite(id)
        if (!entity) continue
        if (color !== undefined)
          entity.color = new AcCmColor(AcCmColorMethod.ByACI, color)
        if (lineType !== undefined) entity.lineType = lineType
        if (linetypeScale !== undefined) entity.linetypeScale = linetypeScale
      }
    },
    setText(id, text) {
      touch([id])
      if (typeof text !== 'string' || text.length > 100000)
        throw new Error('text must be a string of at most 100000 characters')
      const entity = editableEntity(id)
      if (!(entity instanceof AcDbText) && !(entity instanceof AcDbMText))
        throw new Error(
          'setText requires Text, MText or Attribute; do not override a measured dimension'
        )
      const opened = session.getDocument()!.database.openEntityForWrite(entity)!
      if (opened instanceof AcDbMText) opened.contents = text
      else (opened as AcDbText).textString = text
    },
    moveGrips(id, indices, dx, dy) {
      touch([id])
      if (!Number.isFinite(dx) || !Number.isFinite(dy))
        throw new Error('grip displacement must be finite')
      const entity = editableEntity(id)
      const grips = entity.subGetGripPoints()
      if (
        !Array.isArray(indices) ||
        !indices.length ||
        indices.some(i => !Number.isInteger(i) || i < 0 || i >= grips.length)
      )
        throw new Error(
          'invalid_grip_indices; read cad.entities.grips(id) first'
        )
      if (
        entity.subMoveGripPointsAt === AcDbEntity.prototype.subMoveGripPointsAt
      )
        throw new Error('entity does not support native grip editing')
      const opened = session.getDocument()!.database.openEntityForWrite(entity)!
      opened.subMoveGripPointsAt([...new Set(indices)], { x: dx, y: dy, z: 0 })
    },
    move(ids, dx, dy) {
      touch(ids)
      const service = session.getDocument()!.entityService
      return service.translateEntities(service.getEntitiesByIds(ids), {
        x: dx,
        y: dy,
        z: 0
      })
    },
    rotate(ids, center, angleDeg) {
      touch(ids)
      const service = session.getDocument()!.entityService
      return service.rotateEntities(
        service.getEntitiesByIds(ids),
        new AcGePoint3d(center.x, center.y, 0),
        (angleDeg * Math.PI) / 180
      )
    },
    createLayer(name) {
      const result = executor.createLayer(name)
      if (!result.success) throw new Error(result.error ?? result.message)
    },
    setCurrentLayer(name) {
      const result = executor.setCurrentLayer(name)
      if (!result.success) throw new Error(result.error ?? result.message)
    }
  }

  function editableEntity(id: string): AcDbEntity {
    const db = session.getDocument()!.database
    const entity = db.openObjectForRead(id)
    if (!(entity instanceof AcDbEntity)) throw new Error('entity_not_found')
    if (isEntityOnLockedLayer(db, entity))
      throw new Error('entity_layer_locked')
    return entity
  }
}

/**
 * Reads one entity through the database id map.
 *
 * Opening the object by id avoids scanning every block once per selected id.
 *
 * @param session - Drawing access.
 * @param id - Entity object id.
 * @returns Snapshot, or `undefined` when the id is missing or not an entity.
 */
function snapshotById(
  session: CadSession,
  id: string
): EntitySnapshot | undefined {
  const doc = requireDocumentRecord(session)
  const opened = doc.database.openObjectForRead(id)
  const entity =
    opened instanceof AcDbEntity
      ? opened
      : doc.database.tables.blockTable.getEntityById(id)
  if (!entity) return undefined
  return toEntitySnapshot(entity)
}

function requireDocumentRecord(session: CadSession) {
  const doc = session.getDocument()
  if (!doc) throw new Error('no_document')
  return doc
}

function requireView(session: CadSession) {
  const view = session.getView()
  if (!view) throw new Error('no_view')
  return view
}

function formatLogValue(value: unknown): string {
  if (typeof value === 'string') return value
  try {
    return stringifyScriptValue(value) ?? String(value)
  } catch {
    return String(value)
  }
}

/**
 * JSON text for a script value.
 *
 * `JSON.stringify` omits functions, so an API object such as `cad.selection`
 * becomes `{}` and the result pane shows an object with no properties.
 * Function members are kept as `function name` strings.
 *
 * @param value - Return value or log argument.
 * @returns JSON text, or `undefined` when the value cannot be represented.
 */
export function stringifyScriptValue(value: unknown): string | undefined {
  return JSON.stringify(value, (key, current: unknown) => {
    if (key === '__tick') return undefined
    if (typeof current !== 'function') return current
    const name = current.name.replace(/^bound /, '')
    return name ? `function ${name}` : 'function'
  })
}

function seal<T extends object>(target: T, allowed: readonly string[]): T {
  const keys = new Set(allowed)
  return new Proxy(target, {
    get(obj, prop, receiver) {
      if (typeof prop !== 'string') return undefined
      if (!keys.has(prop)) {
        // JSON.stringify reads toJSON before enumerating. The script validator
        // still rejects a written `cad.toJSON` access.
        if (prop === 'toJSON') return undefined
        throw new Error(`unknown_api:${prop}`)
      }
      const value = Reflect.get(obj, prop, receiver)
      return typeof value === 'function' ? value.bind(obj) : value
    },
    set() {
      return false
    }
  })
}
