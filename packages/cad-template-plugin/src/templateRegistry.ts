import cauBanBtct from '@mlightcad/cad-template-cau-ban-btct'
import type { AcTpTemplate } from '@mlightcad/cad-template-sdk'
import { SEED_ROLE_LAYERS } from '@mlightcad/cad-template-sdk'

import type { AcApRemoteTemplate } from './remoteTemplates'

/**
 * Templates compiled into this build.
 *
 * The first one ships with the application so the generate flow works before
 * anything has been uploaded — a library that starts empty gives a new
 * deployment nothing to do.
 */
const BUILT_IN: readonly AcTpTemplate[] = [cauBanBtct]

/** Templates fetched from the library, keyed by `id@version`. */
const remote = new Map<string, AcApRemoteTemplate>()

/** Where a template in the registry came from. */
export type AcApTemplateOrigin = 'built-in' | 'library'

export interface AcApRegisteredTemplate {
  template: AcTpTemplate
  origin: AcApTemplateOrigin
  /** Present only for library templates. */
  version?: string
  status?: 'draft' | 'published'
}

/**
 * Replaces the set of library templates.
 *
 * Replacing rather than merging is deliberate: a template deleted on the
 * server has to disappear here too, and a merge would keep it alive in every
 * session that had already loaded it.
 */
export function setRemoteTemplates(templates: readonly AcApRemoteTemplate[]) {
  remote.clear()
  for (const entry of templates) {
    remote.set(`${entry.source.templateId}@${entry.source.version}`, entry)
  }
}

/** Every template that can be run right now, built-ins first. */
export function listTemplates(): readonly AcTpTemplate[] {
  return [...BUILT_IN, ...[...remote.values()].map(entry => entry.template)]
}

/** The same list with where each one came from. */
export function listRegisteredTemplates(): readonly AcApRegisteredTemplate[] {
  return [
    ...BUILT_IN.map(template => ({ template, origin: 'built-in' as const })),
    ...[...remote.values()].map(entry => ({
      template: entry.template,
      origin: 'library' as const,
      version: entry.source.version,
      status: entry.source.status
    }))
  ]
}

/**
 * Looks a template up by its declared id.
 *
 * A built-in wins over a library template of the same id. Someone uploading a
 * template that shadows one shipped with the application is far more likely to
 * have reused an id by accident than to be deliberately replacing it, and the
 * quiet version of that mistake is the worse one.
 */
export function findTemplate(id: string): AcTpTemplate | undefined {
  const builtIn = BUILT_IN.find(t => t.meta.id === id)
  if (builtIn) return builtIn
  for (const entry of remote.values()) {
    if (entry.template.meta.id === id) return entry.template
  }
  return undefined
}

/** Library entry a template came from, when it came from the library. */
export function findRemoteSource(id: string): AcApRemoteTemplate | undefined {
  for (const entry of remote.values()) {
    if (entry.template.meta.id === id) return entry
  }
  return undefined
}

/**
 * Role → layer mapping used when running a template.
 *
 * Seeded from the SDK; the standardisation layer overrides it once loaded, so
 * a company that renames a layer does not have to rebuild anything.
 */
let roleLayerOverride: Readonly<Record<string, string>> | undefined

export function setRoleLayers(mapping: Readonly<Record<string, string>>) {
  roleLayerOverride = mapping
}

export function roleLayers() {
  return roleLayerOverride ?? SEED_ROLE_LAYERS
}
