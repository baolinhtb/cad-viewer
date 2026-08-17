import type { AcTpParamSpec, AcTpParamValues, AcTpSide } from '@mlightcad/cad-template-sdk'

/** Millimetres per metre; components are drawn in millimetres. */
export const M = 1000

/** Reads a numeric parameter, falling back to the declared default. */
export function num(
  values: AcTpParamValues,
  key: string,
  fallback: number
): number {
  const raw = values[key]
  const value = typeof raw === 'string' ? Number(raw) : raw
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

/** Reads the side, defaulting to the right-hand one. */
export function side(values: AcTpParamValues, key = 'ben'): AcTpSide {
  return values[key] === 'trai' ? 'trai' : 'phai'
}

/**
 * Placement inputs every component shares.
 *
 * Components are meant to be assembled: one call draws the deck, the next puts
 * a kerb on its edge, the next a railing on the kerb. That only works if every
 * component takes the point it hangs from, in the same units, measured the same
 * way — the origin of the drawing is the centre of the deck's top surface, and
 * every `x`/`y` below is an offset from there.
 */
export const PLACEMENT: readonly AcTpParamSpec[] = [
  {
    key: 'x',
    label: 'Vị trí X so với tim cầu',
    type: 'number',
    unit: 'mm',
    min: -30000,
    max: 30000,
    default: 0,
    group: 'Vị trí',
    hint: 'Dương là về phía phải theo chiều lý trình tăng dần.'
  },
  {
    key: 'y',
    label: 'Vị trí Y so với mặt bản',
    type: 'number',
    unit: 'mm',
    min: -30000,
    max: 30000,
    default: 0,
    group: 'Vị trí',
    hint: 'Dương là lên trên mặt bản mặt cầu.'
  }
]

/** Side selector, for components that exist in a left and a right copy. */
export const SIDE_PARAM: AcTpParamSpec = {
  key: 'ben',
  label: 'Bên',
  type: 'choice',
  choices: [
    { value: 'trai', label: 'Trái' },
    { value: 'phai', label: 'Phải' }
  ],
  default: 'phai',
  group: 'Vị trí',
  hint: 'Theo chiều lý trình tăng dần.'
}

/**
 * A point in the drawing plane.
 *
 * The data model wants three coordinates and these sections are flat, so the
 * zero is supplied here rather than repeated at every corner of every part.
 */
export function pt(x: number, y: number) {
  return { x, y, z: 0 }
}
