import { readSemanticTag } from '@mlightcad/cad-template-sdk'
import type { AcDbDatabase } from '@mlightcad/data-model'

/**
 * The next free run id for a drawing.
 *
 * Scanned from what is already in the drawing rather than held in a counter, so
 * it stays correct across a save and reopen — a counter in memory would restart
 * at 1 and hand the second session ids that collide with the first session's.
 *
 * The same reason the viewer names its dimension blocks `*D<n>` by scanning.
 */
export function nextRunId(db: AcDbDatabase): string {
  let max = 0
  for (const entity of db.tables.blockTable.modelSpace.newIterator()) {
    const id = readSemanticTag(entity)?.run?.id
    if (!id) continue
    const num = Number(id.replace(/^r/, ''))
    if (Number.isInteger(num) && num > max) max = num
  }
  return `r${max + 1}`
}

/**
 * Every entity produced by one run.
 *
 * This is what makes "change the footing thickness" and "delete this abutment"
 * possible: both are operations on a run, not on a polyline. Two runs of the
 * same template produce identical `partId`s, so the run id is the only thing
 * that separates the abutment on the left from the one on the right.
 */
export function entitiesOfRun(db: AcDbDatabase, runId: string) {
  const found = []
  for (const entity of db.tables.blockTable.modelSpace.newIterator()) {
    if (readSemanticTag(entity)?.run?.id === runId) found.push(entity)
  }
  return found
}

/**
 * Every run recorded in a drawing, in the order the ids sort.
 *
 * Derived from the entities rather than stored beside them: a list kept
 * separately can disagree with the geometry, and then nobody knows which one is
 * the drawing. The tags travel with the entities, so they cannot drift.
 */
export function listRuns(db: AcDbDatabase) {
  const runs = new Map<
    string,
    {
      id: string
      templateId: string
      version: string
      values: Readonly<Record<string, number | string | boolean>>
      entityCount: number
    }
  >()

  for (const entity of db.tables.blockTable.modelSpace.newIterator()) {
    const tag = readSemanticTag(entity)
    if (!tag?.run) continue
    const existing = runs.get(tag.run.id)
    if (existing) {
      existing.entityCount += 1
      continue
    }
    runs.set(tag.run.id, {
      id: tag.run.id,
      templateId: tag.templateId,
      version: tag.run.version,
      values: tag.run.values,
      entityCount: 1
    })
  }

  return [...runs.values()].sort((a, b) => a.id.localeCompare(b.id))
}
