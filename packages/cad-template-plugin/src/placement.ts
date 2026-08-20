import { AcApDocManager } from '@mlightcad/cad-simple-viewer'
import type { AcTpParamValues } from '@mlightcad/cad-template-sdk'

/**
 * Turns a placement the engineer typed into the coordinates the drawing uses.
 *
 * Every template takes its position as `x` and `y`, and those have always been
 * world coordinates. On a survey-based drawing that means typing 311087.7 to
 * put something at the site datum — unreadable, and the easiest place there is
 * to drop a digit. With a working coordinate system current, the same numbers
 * are read against it instead: `x: 0` means the datum, `x: 3850` means 3850 to
 * the right of it.
 *
 * **Only `x` and `y` are translated.** They are the position of the part by
 * convention across every template in this build, and every other parameter is
 * a length or a thickness that a change of origin must not touch. Translating
 * by guessing which keys look like coordinates would eventually move a wall
 * thickness.
 *
 * A rotated system rotates the placement point, but **not** the part: the
 * templates draw axis-aligned sections and have no rotation parameter to hand
 * one to. Rotating the point while the geometry stays upright is the honest
 * half of the job; claiming the whole of it would put parts at angles the
 * drawing never takes.
 */
export function toDrawingPlacement(values: AcTpParamValues): AcTpParamValues {
  const ucs = AcApDocManager.instance?.curDocument?.ucsService
  if (!ucs || ucs.isWorld) return values

  const x = numberOf(values.x)
  const y = numberOf(values.y)
  if (x === undefined && y === undefined) return values

  const world = ucs.toWcs({ x: x ?? 0, y: y ?? 0 })
  const translated: AcTpParamValues = { ...values }
  if (x !== undefined) translated.x = world.x
  if (y !== undefined) translated.y = world.y
  return translated
}

/** The name of the system a placement was read against, for saying so. */
export function currentPlacementFrame(): string | undefined {
  const ucs = AcApDocManager.instance?.curDocument?.ucsService
  if (!ucs || ucs.isWorld) return undefined
  return ucs.current.name || 'mốc chưa đặt tên'
}

function numberOf(value: unknown): number | undefined {
  const num = typeof value === 'string' ? Number(value) : value
  return typeof num === 'number' && Number.isFinite(num) ? num : undefined
}
