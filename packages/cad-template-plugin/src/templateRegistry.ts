import type {
  AcTpLayerStyleMap,
  AcTpLegacyLayerMap,
  AcTpTemplate,
  AcTpTerm
} from '@mlightcad/cad-template-sdk'
import {
  SEED_DICTIONARY,
  SEED_LEGACY_LAYERS,
  SEED_ROLE_LAYERS
} from '@mlightcad/cad-template-sdk'

import {
  abutmentDossierLegacyTemplates,
  abutmentDossierTemplate
} from './dossier/template'
import { drawingFrameTemplate } from './frame/template'
import type { AcApRemoteTemplate } from './remoteTemplates'

/**
 * The measured M1 dossier is bundled as an explicitly draft template.
 *
 * Four used to ship here — `cau_ban_btct`, `ban_mat_cau_btct`,
 * `go_chan_banh_tcvn`, `lan_can_tcvn` — so that the generate flow had
 * something to run before anything had been uploaded. Every one of them was a
 * shape this system derived from the *text* of TCVN: the clauses give ranges
 * and minimums, never an outline, so the outlines were guessed. The office
 * using this deployment has real component drawings for the same parts, and a
 * guessed outline sitting next to a measured one is worse than no outline at
 * all — nothing on screen says which is which.
 *
 * The M1 dossier differs: it is derived from the supplied DWG and carries
 * provenance, unresolved source conflicts and draft labels on every sheet.
 * It is available offline, alongside the office's uploaded templates.
 *
 * The source of all four is still in `@mlightcad/cad-template-cau-ban-btct`;
 * putting any back is one line in this list.
 */
const BUILT_IN: readonly AcTpTemplate[] = [
  abutmentDossierTemplate,
  drawingFrameTemplate
]

/**
 * Built-in generators kept for regeneration only: a run pins the version that
 * made it, and these are those versions. Not listed, not found by id alone.
 */
const BUILT_IN_PINNED: readonly AcTpTemplate[] = abutmentDossierLegacyTemplates

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

/**
 * Every template that can be run right now, built-ins first — one per id.
 *
 * The library keeps every uploaded version, and this list used to hand back
 * all of them. The template dialog then showed two identical cards for a
 * corrected template and, resolving a card by id, ran the **first** match:
 * the old version. Measured on the deployment on 2026-09-07 — `mo_mat_chinh`
 * 1.1.0 was published, the dialog drew 1.0.0 five times in a row, and the
 * `tuong_phong_ho_btct` card would have drawn 3.0.0, the one with the
 * railing facing the wrong way. Only the newest version of each id is
 * offered, which is what {@link findTemplate} already resolves to.
 * {@link listRegisteredTemplates} keeps every version for the library view.
 */
export function listTemplates(): readonly AcTpTemplate[] {
  const newest = new Map<string, AcTpTemplate>()
  for (const entry of remote.values()) {
    const current = newest.get(entry.template.meta.id)
    if (
      !current ||
      compareVersions(entry.template.meta.version, current.meta.version) > 0
    ) {
      newest.set(entry.template.meta.id, entry.template)
    }
  }
  // Office templates remain first; the measured, explicitly draft dossier is
  // also available without uploading a module to a remote server.
  return [...newest.values()]
    .filter(t => !BUILT_IN.some(b => b.meta.id === t.meta.id))
    .concat(BUILT_IN)
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
/**
 * Orders two version strings, newest last.
 *
 * Compares numerically segment by segment so `2.0.0` beats `10.0.0` never
 * happens — string order puts "10" before "2", and a library that silently ran
 * an older template than the one just uploaded is very hard to notice: the
 * drawing appears, it is simply the wrong drawing.
 */
function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(n => Number.parseInt(n, 10) || 0)
  const pb = b.split('.').map(n => Number.parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

export function findTemplate(id: string): AcTpTemplate | undefined {
  const builtIn = BUILT_IN.find(t => t.meta.id === id)
  if (builtIn) return builtIn
  return findRemoteSource(id)?.template
}

/** Regeneration uses the recorded generator, never silently upgrades a run. */
export function findTemplateVersion(
  id: string,
  version: string
): AcTpTemplate | undefined {
  return (
    [...BUILT_IN, ...BUILT_IN_PINNED].find(
      t => t.meta.id === id && t.meta.version === version
    ) ?? remote.get(`${id}@${version}`)?.template
  )
}

/** Library entry a template came from, when it came from the library. */
export function findRemoteSource(id: string): AcApRemoteTemplate | undefined {
  // Newest version wins. The library holds every uploaded version — they are
  // keyed `id@version` — so after uploading a correction both are loaded, and
  // taking whichever the map happened to yield first ran the old one. That is a
  // failure nobody spots by looking: a drawing appears, it is just the wrong
  // one. Measured: uploading `mo_cau_btct` v2 and asking for it drew v1.
  let best: AcApRemoteTemplate | undefined
  for (const entry of remote.values()) {
    if (entry.template.meta.id !== id) continue
    if (
      !best ||
      compareVersions(entry.template.meta.version, best.template.meta.version) >
        0
    ) {
      best = entry
    }
  }
  return best
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

/**
 * Old layer name → role, for recognising drawings made before `_33_`.
 *
 * Never used to choose a layer to draw on: `gan_nhan_tu_layer` reads it to tag
 * old drawings, and the draw context uses it to redirect a template that
 * still names an old layer. Seeded from the SDK; the server's list replaces
 * it once loaded.
 */
let legacyLayerOverride: AcTpLegacyLayerMap | undefined

export function setLegacyLayers(mapping: AcTpLegacyLayerMap | undefined) {
  legacyLayerOverride = mapping
}

export function legacyLayers(): AcTpLegacyLayerMap {
  return legacyLayerOverride ?? SEED_LEGACY_LAYERS
}

/** Roles whose text says what a drawing is: titles, notes, callouts. */
const TEXT_ROLES = [
  'tieu_de_ban_ve',
  'khung_ten',
  'khung_ban_ve',
  'ghi_chu',
  'ghi_chu_cao_do'
]

/**
 * Layers that carry a drawing's titles and notes, under their current and
 * their old names — the text worth reading (and decoding from TCVN3) when
 * describing a drawing, old or new.
 */
export function drawingTextLayers(): string[] {
  const current = roleLayers()
  const names = TEXT_ROLES.map(role => current[role]).filter(Boolean)
  for (const [name, role] of Object.entries(legacyLayers())) {
    if (TEXT_ROLES.includes(role)) names.push(name)
  }
  return [...new Set(names)]
}

/**
 * The `_33_` layer to use instead of an old layer name, or `undefined` when
 * `name` is not an old name (or its role still draws on it in this
 * deployment). Compared case-insensitively, as AutoCAD does.
 */
export function currentLayerForLegacy(name: string): string | undefined {
  const wanted = name.toLowerCase()
  const entry = Object.entries(legacyLayers()).find(
    ([legacy]) => legacy.toLowerCase() === wanted
  )
  const current = entry ? roleLayers()[entry[1]] : undefined
  return current && current.toLowerCase() !== wanted ? current : undefined
}

/**
 * Layer presentation from the standardisation layer's catalogue.
 *
 * Nothing is seeded: the SDK's built-in pairing says which layer, not what
 * colour, and a colour the office never chose would be a guess dressed as a
 * convention. Until the catalogue lands, layers the templates create are
 * white, exactly as before.
 */
let layerStyleOverride: AcTpLayerStyleMap | undefined

export function setLayerStyles(styles: AcTpLayerStyleMap | undefined) {
  layerStyleOverride = styles
}

export function layerStyles(): AcTpLayerStyleMap {
  return layerStyleOverride ?? {}
}

/**
 * The company dictionary the assistant maps spoken phrases through.
 *
 * Held here rather than fetched per tool call: a locate happens inside a
 * conversation turn, and a round trip to the server on every phrase would put
 * network latency between an engineer and the answer to "which railing".
 *
 * The fallback is the seed dictionary rather than nothing. An assistant that
 * knows only the built-in terms still resolves "lan can"; one that knows no
 * terms at all cannot answer anything, which is the worse failure when the
 * standards service is briefly unreachable.
 */
let dictionaryOverride: readonly AcTpTerm[] | undefined

export function setDictionary(terms: readonly AcTpTerm[]) {
  dictionaryOverride = terms
}

export function dictionary(): readonly AcTpTerm[] {
  return dictionaryOverride ?? SEED_DICTIONARY
}
