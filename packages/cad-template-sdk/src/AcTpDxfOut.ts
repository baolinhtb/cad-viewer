/**
 * DXF output that keeps what the SDK draws.
 *
 * `AcDbDatabase.dxfOut` (data-model 1.15) loses three things a template sets
 * on purpose, and a drawing that is meant to look like the engineer's own
 * cannot afford any of them:
 *
 * - **Lineweight per entity** (group 370) is written only for AutoCAD 2000+
 *   targets, and a new database is AC1014 (R14).
 * - **Dimension style variables**: the DIMSTYLE writer stores scale and sizes
 *   but not DIMTAD, DIMDEC, DIMZIN, DIMDLE, DIMRND, DIMLFAC, DIMTFAC or the
 *   three colours — the reader understands all of them.
 * - **TrueType font files**: the text-style table strips the extension, so
 *   group 3 says `arial` and AutoCAD looks for `arial.shx`. The full name
 *   survives as the style's extended font.
 *
 * This writes AutoCAD 2013 DXF (UTF-8) when the drawing is older than 2000,
 * then fills the missing DIMSTYLE groups and font names from the records.
 * Binary output is returned unchanged.
 */
import {
  AcDbDatabase,
  AcDbDimStyleTableRecord,
  AcDbTextStyleTableRecord
} from '@mlightcad/data-model'

/** First DXF version that carries lineweight (AutoCAD 2000). */
const LINEWEIGHT_VERSION = 23
/** Version written when the drawing is older than that: AutoCAD 2013. */
const OUT_VERSION = 'AC1027'

/**
 * An attribute of a table record that may not have it (`getAttr` throws for
 * unknown names). Used for DIMFXL/DIMFXLON, which the data model lacks.
 */
export function acTpRecordAttr(
  record: { getAttr(name: never): unknown },
  name: string
): unknown {
  try {
    return record.getAttr(name as never)
  } catch {
    return undefined
  }
}

/** DIMSTYLE groups the data-model writer omits, and their record property. */
const MISSING_DIM_GROUPS: readonly [number, keyof AcDbDimStyleTableRecord][] = [
  [45, 'dimrnd'],
  [46, 'dimdle'],
  [77, 'dimtad'],
  [78, 'dimzin'],
  [144, 'dimlfac'],
  [146, 'dimtfac'],
  [176, 'dimclrd'],
  [177, 'dimclre'],
  [178, 'dimclrt'],
  [271, 'dimdec']
]
/** Groups the data model has no property for, kept as record attributes. */
const ATTR_DIM_GROUPS: readonly [number, string][] = [
  [49, 'dimfxl'],
  [290, 'dimfxlon']
]

/**
 * Writes `db` as DXF with lineweights, full dimension styles and TrueType
 * font names intact. Use it wherever a generated drawing is saved as DXF.
 *
 * @param db - The drawing.
 * @param precision - Decimal places for real numbers (as `dxfOut`).
 */
export function acTpDxfOut(
  db: AcDbDatabase,
  precision = 6
): string | Uint8Array {
  const version =
    db.version.value >= LINEWEIGHT_VERSION ? db.version.name : OUT_VERSION
  const out = db.dxfOut(undefined, precision, version)
  return typeof out === 'string' ? acTpCompleteDxf(db, out) : out
}

/**
 * Adds to ASCII DXF text written from `db` the DIMSTYLE groups and font file
 * names the data-model writer leaves out. Groups already present are kept.
 */
export function acTpCompleteDxf(db: AcDbDatabase, dxf: string): string {
  const eol = dxf.includes('\r\n') ? '\r\n' : '\n'
  const lines = dxf.split(eol)
  const result: string[] = []
  let i = 0
  while (i + 1 < lines.length) {
    const code = lines[i].trim()
    const value = lines[i + 1].trim()
    if (code === '0' && (value === 'DIMSTYLE' || value === 'STYLE')) {
      // Collect the record up to the next group 0.
      let end = i + 2
      while (end + 1 < lines.length && lines[end].trim() !== '0') end += 2
      const record = lines.slice(i, end)
      result.push(
        ...(value === 'DIMSTYLE'
          ? completeDimStyle(db, record)
          : completeTextStyle(db, record))
      )
      i = end
      continue
    }
    result.push(lines[i], lines[i + 1])
    i += 2
  }
  result.push(...lines.slice(i))
  return result.join(eol)
}

const pairsOf = (record: string[]): [string, string][] => {
  const pairs: [string, string][] = []
  for (let k = 0; k + 1 < record.length; k += 2)
    pairs.push([record[k].trim(), record[k + 1]])
  return pairs
}

const nameOf = (pairs: [string, string][]): string | undefined =>
  pairs.find(([c]) => c === '2')?.[1].trim()

function completeDimStyle(db: AcDbDatabase, record: string[]): string[] {
  const pairs = pairsOf(record)
  const name = nameOf(pairs)
  // The DIMSTYLE table header also starts `0 / DIMSTYLE`; it has no record.
  const style = name ? db.tables.dimStyleTable.getAt(name) : undefined
  if (!style || !pairs.some(([c]) => c === '100')) return record
  const present = new Set(pairs.map(([c]) => c))
  const extra: string[] = []
  for (const [group, key] of MISSING_DIM_GROUPS) {
    const value = style[key]
    if (present.has(String(group)) || typeof value !== 'number') continue
    extra.push(String(group), String(value))
  }
  for (const [group, key] of ATTR_DIM_GROUPS) {
    const value = acTpRecordAttr(style, key)
    if (present.has(String(group)) || typeof value !== 'number') continue
    extra.push(String(group), String(value))
  }
  if (!extra.length) return record
  // Before the text-style handle, where AutoCAD writes them; else at the end.
  const at = pairs.findIndex(([c]) => c === '340')
  const index = at < 0 ? record.length : at * 2
  return [...record.slice(0, index), ...extra, ...record.slice(index)]
}

function completeTextStyle(db: AcDbDatabase, record: string[]): string[] {
  const pairs = pairsOf(record)
  const name = nameOf(pairs)
  const style = name ? db.tables.textStyleTable.getAt(name) : undefined
  if (!style) return record
  const full = (style as AcDbTextStyleTableRecord).getAttr('extendedFont')
  if (typeof full !== 'string' || !/\.(ttf|ttc|otf)$/i.test(full)) return record
  const at = pairs.findIndex(([c]) => c === '3')
  if (at < 0) return record
  const written = pairs[at][1].trim()
  if (written.toLowerCase() !== full.replace(/\.[^.]+$/, '').toLowerCase())
    return record
  const copy = record.slice()
  copy[at * 2 + 1] = full
  return copy
}
