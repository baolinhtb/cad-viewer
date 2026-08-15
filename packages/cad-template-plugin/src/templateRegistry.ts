import cauBanBtct from '@mlightcad/cad-template-cau-ban-btct'
import type { AcTpTemplate } from '@mlightcad/cad-template-sdk'
import { SEED_ROLE_LAYERS } from '@mlightcad/cad-template-sdk'

/**
 * Templates available in this build.
 *
 * Hard-coded for now: Epic 1 proves the pipeline with one real template
 * before Epic 2 turns this into a list served from the template registry.
 * The shape callers see does not change when that happens.
 */
const BUILT_IN: readonly AcTpTemplate[] = [cauBanBtct]

/** Every template that can be run right now. */
export function listTemplates(): readonly AcTpTemplate[] {
  return BUILT_IN
}

/** Looks a template up by its declared id. */
export function findTemplate(id: string): AcTpTemplate | undefined {
  return BUILT_IN.find(t => t.meta.id === id)
}

/**
 * Role → layer mapping used when running a template.
 *
 * Seeded from the SDK today; Epic 2 replaces it with the mapping managed in
 * the standardisation layer.
 */
export function roleLayers() {
  return SEED_ROLE_LAYERS
}
