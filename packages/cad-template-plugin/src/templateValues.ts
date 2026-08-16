import type { AcTpParamValues, AcTpTemplate } from '@mlightcad/cad-template-sdk'

/**
 * Values a template starts with, taken from its own declarations.
 *
 * Kept apart from `runTemplate` deliberately. This is a pure function over a
 * template's declared parameters, while running one needs the document
 * manager and, through it, the whole viewer and three.js. Importing it from
 * there dragged that entire stack into anything that only wanted the defaults
 * — the thumbnail renderer, for one, which has no business loading a renderer.
 */
export function defaultValues(template: AcTpTemplate): AcTpParamValues {
  const values: AcTpParamValues = {}
  for (const spec of template.params) {
    if (spec.default !== undefined) values[spec.key] = spec.default
  }
  return values
}
