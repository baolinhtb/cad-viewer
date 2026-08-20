import {
  AcApDocManager,
  acapRunGroupedEdit
} from '@mlightcad/cad-simple-viewer'
import type { AcTpParamValues, AcTpTemplate } from '@mlightcad/cad-template-sdk'
import {
  createDrawContext,
  validateParamValues
} from '@mlightcad/cad-template-sdk'
import type { AcDbDatabase } from '@mlightcad/data-model'

import { markTemplateVerified } from './remoteTemplates'
// Re-exported so `defaultValues` keeps its existing import path.
export { defaultValues } from './templateValues'
import { toDrawingPlacement } from './placement'
import { nextRunId } from './runIdentity'
import { findRemoteSource, roleLayers } from './templateRegistry'

/** Outcome of a run, enough to tell the user what was produced. */
export interface AcApTemplateRunResult {
  /** Id of the run, so a caller can find or replace exactly what it drew. */
  runId?: string
  /** Number of entities the template drew. */
  entityCount: number
  /** Distinct layers touched. */
  layers: string[]
  /** Validation messages; when non-empty nothing was drawn. */
  errors: string[]
}

/**
 * Runs a template into the current drawing.
 *
 * The whole run sits inside one grouped edit, so a generated drawing is undone
 * by a single `Ctrl+Z` no matter how many entities it contains — a template
 * that leaves two hundred separate undo marks is unusable in practice.
 *
 * Parameters are validated first: a bad value is reported against the field
 * the engineer typed it into rather than surfacing later as broken geometry.
 *
 * @param template - Template to run.
 * @param values - Values entered for its declared parameters.
 * @param database - Target database. Defaults to the open drawing; passing one
 * explicitly lets callers (and tests) generate into a database of their own
 * without going through the document manager.
 */
export async function runTemplate(
  template: AcTpTemplate,
  values: AcTpParamValues,
  database?: AcDbDatabase
): Promise<AcApTemplateRunResult> {
  // Kiểm trên đúng con số người ta gõ. Dải `x`, `y` của template là vị trí so
  // với gốc đang dùng; dời sang toạ độ thế giới trước rồi mới kiểm thì trên bản
  // vẽ theo lý trình mọi vị trí đều vượt dải, kể cả vị trí đúng.
  const errors = validateParamValues(template.params, values)
  if (errors.length > 0) {
    return { entityCount: 0, layers: [], errors }
  }

  // Dời gốc ngay trước khi vẽ, nên mọi lối vào `runTemplate` đều được, và chỉ
  // dời đúng một lần.
  const placed = toDrawingPlacement(values)

  const db = database ?? AcApDocManager.instance.curDocument.database
  let entityCount = 0
  let layers: string[] = []

  // Recorded before drawing so every entity carries it: the drawing then says
  // not just what each part is, but which call made it and with what arguments.
  const runId = nextRunId(db)
  await acapRunGroupedEdit(db, template.meta.name, async () => {
    const ctx = createDrawContext(db, template.meta.id, roleLayers(), {
      id: runId,
      version: template.meta.version,
      // Ghi lại con số người ta gõ, không phải toạ độ thế giới: sửa lần chạy
      // này về sau là sửa lại chính những trị số ấy.
      values: values as Record<string, number | string | boolean>
    })
    await template.generate(ctx, placed)
    entityCount = ctx.drawn.length
    layers = [...new Set(ctx.drawn.map(e => e.layer))]
  })

  // Only the open drawing needs repainting; a caller-supplied database has no
  // view attached to it.
  if (!database) {
    await AcApDocManager.instance.regen()
  }

  // A library template proves itself by producing a drawing. Reported after
  // the run rather than at upload, because the browser is the only place it
  // can be proven at all. A failure here is not the engineer's problem: they
  // got their drawing, and the template stays a draft until the next run.
  const source = findRemoteSource(template.meta.id)
  if (source && source.source.status === 'draft' && entityCount > 0) {
    try {
      const published = await markTemplateVerified(
        source.source.templateId,
        source.source.version
      )
      if (published) source.source.status = 'published'
    } catch {
      // Left as a draft; the next successful run tries again.
    }
  }

  return { entityCount, layers, errors: [], runId }
}
