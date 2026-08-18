import {
  acdbAssignWorkingDatabase,
  acdbGetWorkingDatabase,
  AcDbDatabase,
  AcDbAlignedDimension,
  AcDbDataGenerator
} from '@mlightcad/data-model'

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
    db.tables.blockTable.add(dim.createDimBlock(name))
    dim.dimBlockId = name
  })
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
