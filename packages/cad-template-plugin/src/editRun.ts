import {
  AcApDocManager,
  acapRunGroupedEdit
} from '@mlightcad/cad-simple-viewer'
import type { AcTpParamValues } from '@mlightcad/cad-template-sdk'
import {
  createDrawContext,
  validateParamValues
} from '@mlightcad/cad-template-sdk'
import type { AcDbDatabase } from '@mlightcad/data-model'

import { entitiesOfRun, listRuns } from './runIdentity'
import { findTemplate, roleLayers } from './templateRegistry'

/** Outcome of editing an existing run. */
export interface AcApRunEditResult {
  runId: string
  /** Entities removed from the previous version of this run. */
  removed: number
  /** Entities the redraw produced. */
  entityCount: number
  layers: string[]
  /** The full value set after merging; empty errors means it was applied. */
  values: AcTpParamValues
  errors: string[]
}

/**
 * Changes what a previous template run drew, in place.
 *
 * This is the operation the drawing was tagged for. Without it the only way to
 * answer "make the abutment 8 m wide" is to run the template again, which
 * appends a second abutment on top of the first: the drawing gains geometry
 * with every correction and the engineer ends up deleting by hand what the
 * assistant should never have left behind. Measured on a real session — the
 * user's words were "càng sửa hình càng rối rắm".
 *
 * The old entities are erased and the template redrawn under the **same run
 * id**, so the part keeps its identity across edits: "the abutment" stays one
 * thing that changed, not a pile of attempts.
 *
 * Only the changed values need passing. They are merged over what the run
 * recorded, because an edit names one dimension and means the rest to stay —
 * requiring the full set would make every correction a chance to lose a value
 * nobody mentioned.
 *
 * Validation runs **before** anything is erased. A rejected edit must leave the
 * drawing exactly as it was; erasing first and failing second would delete a
 * correct part on the way to refusing an incorrect number.
 *
 * @param runId - Run to change, as reported by `mo_ta_ban_ve`.
 * @param changes - Only the values that differ.
 * @param database - Target database; defaults to the open drawing.
 */
export async function editTemplateRun(
  runId: string,
  changes: AcTpParamValues,
  database?: AcDbDatabase
): Promise<AcApRunEditResult> {
  const db = database ?? AcApDocManager.instance.curDocument.database

  const run = listRuns(db).find(candidate => candidate.id === runId)
  if (!run) {
    const known = listRuns(db).map(r => r.id)
    return {
      runId,
      removed: 0,
      entityCount: 0,
      layers: [],
      values: {},
      errors: [
        known.length
          ? `Bản vẽ không có lần chạy "${runId}". Đang có: ${known.join(', ')}.`
          : `Bản vẽ không có lần chạy nào do template dựng, nên không có gì để sửa.`
      ]
    }
  }

  const template = findTemplate(run.templateId)
  if (!template) {
    return {
      runId,
      removed: 0,
      entityCount: 0,
      layers: [],
      values: {},
      errors: [
        `Lần chạy "${runId}" do template "${run.templateId}" dựng, mà template ấy ` +
          'không còn trong thư viện nên không dựng lại được. Xoá phần cũ rồi vẽ mới, ' +
          'hoặc tải template ấy lên lại.'
      ]
    }
  }

  const values: AcTpParamValues = { ...run.values, ...changes }
  const errors = validateParamValues(template.params, values)
  if (errors.length > 0) {
    return { runId, removed: 0, entityCount: 0, layers: [], values, errors }
  }

  let removed = 0
  let entityCount = 0
  let layers: string[] = []

  await acapRunGroupedEdit(db, `Sửa ${template.meta.name}`, async () => {
    // Erase first: leaving the old geometry in place while the new is added is
    // exactly the state the user reported — both versions present, neither
    // identifiable on screen. `erase()` is the documented way and it reaches
    // the canvas: an e2e checks the old entities are gone from the rendered
    // scene, not merely from the database, because a removal the view never
    // hears about leaves both widths drawn on top of each other.
    for (const entity of entitiesOfRun(db, runId)) {
      if (entity.erase()) removed += 1
    }

    const ctx = createDrawContext(db, template.meta.id, roleLayers(), {
      id: runId,
      version: template.meta.version,
      values: values as Record<string, number | string | boolean>
    })
    await template.generate(ctx, values)
    entityCount = ctx.drawn.length
    layers = [...new Set(ctx.drawn.map(e => e.layer))]
  })

  if (!database) {
    AcApDocManager.instance.regen()
  }

  return { runId, removed, entityCount, layers, values, errors: [] }
}
