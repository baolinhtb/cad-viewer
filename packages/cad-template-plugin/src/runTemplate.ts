import {
  AcApDocManager,
  acapRunGroupedEdit} from '@mlightcad/cad-simple-viewer'
import type { AcTpParamValues, AcTpTemplate } from '@mlightcad/cad-template-sdk'
import {
  createDrawContext,
  validateParamValues
} from '@mlightcad/cad-template-sdk'
import type { AcDbDatabase } from '@mlightcad/data-model'

import { roleLayers } from './templateRegistry'

/** Outcome of a run, enough to tell the user what was produced. */
export interface AcApTemplateRunResult {
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
  const errors = validateParamValues(template.params, values)
  if (errors.length > 0) {
    return { entityCount: 0, layers: [], errors }
  }

  const db = database ?? AcApDocManager.instance.curDocument.database
  let entityCount = 0
  let layers: string[] = []

  await acapRunGroupedEdit(db, template.meta.name, async () => {
    const ctx = createDrawContext(db, template.meta.id, roleLayers())
    await template.generate(ctx, values)
    entityCount = ctx.drawn.length
    layers = [...new Set(ctx.drawn.map(e => e.layer))]
  })

  // Only the open drawing needs repainting; a caller-supplied database has no
  // view attached to it.
  if (!database) {
    await AcApDocManager.instance.regen()
  }

  return { entityCount, layers, errors: [] }
}

/** Values a template starts with, taken from its own declarations. */
export function defaultValues(template: AcTpTemplate): AcTpParamValues {
  const values: AcTpParamValues = {}
  for (const spec of template.params) {
    if (spec.default !== undefined) values[spec.key] = spec.default
  }
  return values
}
