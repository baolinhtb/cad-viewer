import {
  AcCmColor,
  AcCmColorMethod,
  AcDbAlignedDimension,
  acdbAssignWorkingDatabase,
  AcDbBlockReference,
  AcDbDatabase,
  AcDbDataGenerator,
  AcDbDimStyleTableRecord,
  acdbGetWorkingDatabase,
  AcDbMText
} from '@mlightcad/data-model'

/** Name of the arrowhead block the data model's dimension builder references. */
const ARROW_BLOCK = '_CAXARROW'

/**
 * Gives a dimension the block that makes it visible.
 *
 * A dimension entity holds only its definition points. Its arrows, extension
 * lines and text live in an anonymous `*D<n>` block built from the dimension
 * style, and the renderer draws that block — not the dimension. A dimension
 * appended without one is in the drawing, reports the right measurement, and
 * renders as nothing at all. That is exactly what happened the first time this
 * was wired up: the entity was there, the text read `7700.000`, and the canvas
 * showed the rectangle alone.
 *
 * Files read from DWG arrive with these blocks already built, which is why
 * dimensions drawn elsewhere display without any of this.
 *
 * The block the data model builds honours the style's extension-line offsets
 * but not its text or arrows: the text is 10 units high whatever `dimtxt`
 * says, sits on the dimension line whatever `dimtad` says, is ByBlock
 * whatever `dimclrt` says, and the arrowheads are 10 units whatever `dimasz`
 * says. On a millimetre drawing of a 16 m abutment that is a number nobody
 * can see — the engineer's words were "các thành phần đo đang không có chỉ
 * số thể hiện". {@link applyDimStyleToBlock} finishes the job from the style.
 */
export function buildDimensionBlock(
  db: AcDbDatabase,
  dim: AcDbAlignedDimension
) {
  withWorkingDatabase(db, () => {
    // The arrowheads are a block of their own, referenced by the dimension
    // block. Generating it is idempotent.
    new AcDbDataGenerator(db).createArrowBlock()
    const name = nextDimBlockName(db)
    const block = dim.createDimBlock(name)
    const style = dim.dimensionStyleName
      ? db.tables.dimStyleTable.getAt(dim.dimensionStyleName)
      : undefined
    if (style) applyDimStyleToBlock(block, dim, style)
    db.tables.blockTable.add(block)
    dim.dimBlockId = name
  })
}

/**
 * Applies what the data model's builder ignores: text height, text colour,
 * text placement above the line, and arrowhead size.
 *
 * `dimscale` is not multiplied in here. The engineer's drawings carry a style
 * scaled 100× with base values (`DIMTXT 1.5`, `DIMASZ 1.3`), and the builder
 * reads the base values raw, so the SDK's own styles store the final sizes
 * with `dimscale = 1` — see `TEMPLATE_DIM_STYLES`.
 */
export function applyDimStyleToBlock(
  block: { newIterator(): Iterable<unknown> },
  dim: AcDbAlignedDimension,
  style: AcDbDimStyleTableRecord
) {
  const rotation = (dim as { rotation?: number }).rotation ?? 0
  // Perpendicular to the dimension line, on the side "above" the text's
  // reading direction: up for a horizontal chain, left for a vertical one
  // read bottom-to-top — where AutoCAD puts DIMTAD = 1 text.
  const normal = { x: -Math.sin(rotation), y: Math.cos(rotation) }
  for (const entity of block.newIterator()) {
    if (entity instanceof AcDbMText) {
      entity.height = style.dimtxt
      if (Number.isInteger(style.dimclrt) && style.dimclrt >= 1 && style.dimclrt <= 255) {
        entity.color = new AcCmColor(AcCmColorMethod.ByACI, style.dimclrt)
      }
      if (style.dimtad !== 0) {
        const lift = style.dimtxt / 2 + style.dimgap
        const at = entity.location
        entity.location = {
          x: at.x + normal.x * lift,
          y: at.y + normal.y * lift,
          z: at.z ?? 0
        }
      }
    } else if (
      entity instanceof AcDbBlockReference &&
      entity.blockName === ARROW_BLOCK
    ) {
      const size = style.dimasz
      entity.scaleFactors = { x: size, y: size, z: size }
    }
  }
}

/**
 * Formats a measurement the way the dimension style says to.
 *
 * `dimrnd` rounds to a multiple; `dimdec` fixes the decimals; `dimzin` bit 8
 * drops trailing zeros. The engineer's `D100` style is rounded to 1 with two
 * decimals and trailing zeros suppressed, so 4793.385 prints as `4793`.
 */
export function formatDimensionText(
  value: number,
  style: Pick<AcDbDimStyleTableRecord, 'dimrnd' | 'dimdec' | 'dimzin' | 'dimlfac'>
): string {
  let measured = value * (style.dimlfac || 1)
  if (style.dimrnd > 0) measured = Math.round(measured / style.dimrnd) * style.dimrnd
  const decimals = Math.max(0, Math.min(8, Math.round(style.dimdec)))
  let text = measured.toFixed(decimals)
  if ((style.dimzin & 8) !== 0 && text.includes('.')) {
    text = text.replace(/0+$/, '').replace(/\.$/, '')
  }
  return text
}

/**
 * Runs `fn` with `db` as the working database, then puts back what was there.
 *
 * Building the block reaches for the working database rather than the owning
 * one — the hatch inside the arrowhead resolves its pattern scale that way. In
 * the viewer that global is already the open drawing and this changes nothing;
 * it is what lets the SDK also run against a database of its own, which is how
 * every template test and the upload check generate.
 */
function withWorkingDatabase<T>(db: AcDbDatabase, fn: () => T): T {
  let previous: AcDbDatabase | undefined
  try {
    previous = acdbGetWorkingDatabase()
  } catch {
    // None set: nothing to restore afterwards.
    previous = undefined
  }
  if (previous !== db) acdbAssignWorkingDatabase(db)
  try {
    return fn()
  } finally {
    if (previous && previous !== db) acdbAssignWorkingDatabase(previous)
  }
}

/**
 * The next free `*D<n>`, matching how the viewer's own DIMLINEAR names them.
 *
 * Reusing a name would silently repoint an existing dimension at different
 * geometry, so the scan is over every block, not a counter held somewhere.
 */
function nextDimBlockName(db: AcDbDatabase): string {
  let max = 0
  for (const block of db.tables.blockTable.newIterator()) {
    if (!block.name.startsWith('*D')) continue
    const num = Number(block.name.slice(2))
    if (Number.isInteger(num) && num > max) max = num
  }
  return `*D${max + 1}`
}
