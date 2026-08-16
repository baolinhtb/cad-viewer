import { readSemanticTag } from '@mlightcad/cad-template-sdk'
import type { AcTpTemplate } from '@mlightcad/cad-template-sdk'
import { createDrawContext } from '@mlightcad/cad-template-sdk'
import { AcDbDatabase } from '@mlightcad/data-model'

import {
  type AcApFetch,
  evaluateTemplateModule,
  markTemplateVerified,
  refreshTemplateLibrary
} from './remoteTemplates'
import { roleLayers } from './templateRegistry'
import { defaultValues } from './templateValues'

/**
 * Uploading a template from the editor.
 *
 * The upload happens here rather than on the standards page because this is
 * the only place the module can be evaluated: reading `meta` and `params` out
 * of it means running it, and running it needs the SDK and a database. Asking
 * an author to retype what the module already declares would guarantee the
 * two disagree eventually.
 *
 * The trial run is not a formality. Story 2.5 requires a template to have
 * produced a drawing before anyone else sees it, and doing that here — before
 * the upload rather than after — means a template that throws never reaches
 * the library at all.
 */

export interface AcApTemplateUploadResult {
  templateId: string
  version: string
  /** Entities the trial run produced. */
  entityCount: number
  /** Role → layer pairs the run actually used. */
  roleLayers: Record<string, string>
  /** Roles the standardisation layer does not know. */
  missingRoles: string[]
  /** Layers the catalogue does not have. */
  missingLayers: { role: string; layer: string }[]
  /** Whether the template was published off the back of its trial run. */
  published: boolean
}

export class AcApTemplateUploadError extends Error {
  constructor(
    message: string,
    readonly code?: string
  ) {
    super(message)
  }
}

/**
 * Runs the template once and reports what it drew.
 *
 * The role → layer pairs are read back off the entities rather than taken
 * from a declaration. A declaration is a promise about the code; this is what
 * the code did.
 */
function trialRun(template: AcTpTemplate): {
  entityCount: number
  roleLayers: Record<string, string>
} {
  const db = new AcDbDatabase()
  db.createDefaultData()
  const ctx = createDrawContext(db, template.meta.id, roleLayers())

  const result = template.generate(ctx, defaultValues(template))
  if (result && typeof (result as Promise<void>).then === 'function') {
    throw new AcApTemplateUploadError(
      'Template vẽ bất đồng bộ, chưa hỗ trợ nạp lên.'
    )
  }

  const pairs: Record<string, string> = {}
  for (const entity of ctx.drawn) {
    const tag = readSemanticTag(entity)
    if (tag?.role && entity.layer) pairs[tag.role] = entity.layer
  }
  return { entityCount: ctx.drawn.length, roleLayers: pairs }
}

/**
 * Evaluates, trials and uploads a built template module.
 *
 * @param code - The built JavaScript module, as text.
 * @param fetchImpl - Injected for tests.
 */
export async function uploadTemplateModule(
  code: string,
  fetchImpl: AcApFetch = fetch as unknown as AcApFetch,
  baseUrl = '/api/templates'
): Promise<AcApTemplateUploadResult> {
  const template = await evaluateTemplateModule(code)

  const { entityCount, roleLayers: used } = trialRun(template)
  if (entityCount === 0) {
    // A template that draws nothing with its own defaults is broken in a way
    // the library should never inherit, and the author is the only person who
    // can tell why.
    throw new AcApTemplateUploadError(
      'Template không vẽ ra hình nào với giá trị mặc định.'
    )
  }

  const response = await (
    fetchImpl as unknown as (
      url: string,
      init: Record<string, unknown>
    ) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>
  )(baseUrl, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      meta: template.meta,
      params: template.params,
      roleLayers: used,
      code
    })
  })

  const body = (await response.json().catch(() => ({}))) as {
    error?: string
    code?: string
    detail?: { reason?: string }
    warnings?: {
      missingRoles?: string[]
      missingLayers?: { role: string; layer: string }[]
    }
  }

  if (!response.ok) {
    throw new AcApTemplateUploadError(
      body.detail?.reason ?? body.error ?? `Lỗi ${response.status}`,
      body.code
    )
  }

  // It has just drawn, so it has earned publication. Reported separately
  // rather than assumed: a refused publish still leaves a usable draft.
  const published = await markTemplateVerified(
    template.meta.id,
    template.meta.version,
    fetchImpl,
    baseUrl
  )

  await refreshTemplateLibrary()

  return {
    templateId: template.meta.id,
    version: template.meta.version,
    entityCount,
    roleLayers: used,
    missingRoles: body.warnings?.missingRoles ?? [],
    missingLayers: body.warnings?.missingLayers ?? [],
    published
  }
}
