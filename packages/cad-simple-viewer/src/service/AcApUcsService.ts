import {
  AcDbDatabase,
  AcDbUcsTableRecord,
  AcGePoint2dLike,
  AcGePoint3d
} from '@mlightcad/data-model'

import { eventBus } from '../editor/global/eventBus'

/**
 * A working coordinate system: where the engineer says zero is.
 *
 * Held as origin plus rotation rather than as the two axis vectors DXF stores,
 * because every use here is planar and a rotation is the thing a person sets.
 * The vectors are reconstructed on the way out, so a drawing written from this
 * is a drawing AutoCAD reads.
 */
export interface AcApUcs {
  /** Empty for the world coordinate system. */
  name: string
  origin: AcGePoint2dLike
  /** Angle of the UCS x-axis from the WCS x-axis, in radians. */
  rotation: number
}

/** The coordinate system a drawing has before anyone sets one. */
export const ACAP_WORLD_UCS: AcApUcs = Object.freeze({
  name: '',
  origin: Object.freeze({ x: 0, y: 0 }),
  rotation: 0
})

/**
 * The working coordinate system of one drawing.
 *
 * A survey-based drawing puts its structure at coordinates like x = 311088,
 * and every dimension an engineer thinks in is relative to a site datum rather
 * than to that number. Without somewhere to say "zero is here", every position
 * typed into a template has to be the absolute one, which is both unreadable
 * and the easy place to drop a digit.
 *
 * **What persists and what does not.** Named systems live in the drawing's UCS
 * table and survive a save and reopen — measured, including through a DXF
 * round trip. Which one is *current* does not: the header variable AutoCAD
 * keeps that in (`$UCSORG`) is not among the variables this data model reads
 * or writes, so there is nowhere in the file to put it. Reopening a drawing
 * therefore starts in world coordinates with the named systems still there,
 * one `UCS` command away.
 */
export class AcApUcsService {
  private _current: AcApUcs = ACAP_WORLD_UCS

  constructor(private readonly db: AcDbDatabase) {}

  /** The system coordinates are currently entered and reported in. */
  get current(): AcApUcs {
    return this._current
  }

  /** True when nothing has been set — coordinates are world coordinates. */
  get isWorld(): boolean {
    return (
      this._current.origin.x === 0 &&
      this._current.origin.y === 0 &&
      this._current.rotation === 0
    )
  }

  /** Makes a system current without naming or storing it. */
  setCurrent(ucs: Omit<AcApUcs, 'name'> & { name?: string }) {
    this._current = {
      name: ucs.name ?? '',
      origin: { x: ucs.origin.x, y: ucs.origin.y },
      rotation: ucs.rotation
    }
    eventBus.emit('ucs-changed', { ucs: this._current })
  }

  /** Back to world coordinates. */
  setWorld() {
    this._current = ACAP_WORLD_UCS
    eventBus.emit('ucs-changed', { ucs: this._current })
  }

  /**
   * Stores the current system in the drawing under a name.
   *
   * Storing is what makes a datum outlive the session, and naming is what makes
   * it referable later — "đặt mố ở mốc M1" needs the mốc to have a name.
   */
  save(name: string): boolean {
    const trimmed = name.trim()
    if (!trimmed) return false

    const record = new AcDbUcsTableRecord({
      name: trimmed,
      origin: new AcGePoint3d(
        this._current.origin.x,
        this._current.origin.y,
        0
      ),
      xAxis: new AcGePoint3d(
        Math.cos(this._current.rotation),
        Math.sin(this._current.rotation),
        0
      ),
      yAxis: new AcGePoint3d(
        -Math.sin(this._current.rotation),
        Math.cos(this._current.rotation),
        0
      )
    })

    const table = this.db.tables.ucsTable
    if (table.has(trimmed)) table.remove(trimmed)
    table.add(record)
    this._current = { ...this._current, name: trimmed }
    eventBus.emit('ucs-changed', { ucs: this._current })
    return true
  }

  /** Makes a stored system current. */
  restore(name: string): boolean {
    const found = this.find(name)
    if (!found) return false
    this._current = found
    eventBus.emit('ucs-changed', { ucs: this._current })
    return true
  }

  /** One stored system by name. */
  find(name: string): AcApUcs | undefined {
    const trimmed = name.trim()
    for (const record of this.db.tables.ucsTable.newIterator()) {
      if (record.name !== trimmed) continue
      return toUcs(record)
    }
    return undefined
  }

  /** Every system stored in the drawing. */
  list(): AcApUcs[] {
    const found: AcApUcs[] = []
    for (const record of this.db.tables.ucsTable.newIterator()) {
      found.push(toUcs(record))
    }
    return found
  }

  /** Removes a stored system. Does not change what is current. */
  remove(name: string): boolean {
    const trimmed = name.trim()
    if (!this.db.tables.ucsTable.has(trimmed)) return false
    this.db.tables.ucsTable.remove(trimmed)
    return true
  }

  /** A point the engineer typed, turned into the drawing's own coordinates. */
  toWcs(point: AcGePoint2dLike, ucs: AcApUcs = this._current): AcGePoint2dLike {
    const cos = Math.cos(ucs.rotation)
    const sin = Math.sin(ucs.rotation)
    return {
      x: ucs.origin.x + point.x * cos - point.y * sin,
      y: ucs.origin.y + point.x * sin + point.y * cos
    }
  }

  /** A point in the drawing, expressed the way the engineer reads it. */
  toUcs(point: AcGePoint2dLike, ucs: AcApUcs = this._current): AcGePoint2dLike {
    const dx = point.x - ucs.origin.x
    const dy = point.y - ucs.origin.y
    const cos = Math.cos(ucs.rotation)
    const sin = Math.sin(ucs.rotation)
    return { x: dx * cos + dy * sin, y: -dx * sin + dy * cos }
  }
}

/** DXF stores axis vectors; this reads the rotation back out of them. */
function toUcs(record: AcDbUcsTableRecord): AcApUcs {
  const xAxis = record.xAxis
  return {
    name: record.name,
    origin: { x: record.origin?.x ?? 0, y: record.origin?.y ?? 0 },
    rotation: xAxis ? Math.atan2(xAxis.y, xAxis.x) : 0
  }
}
