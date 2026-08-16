import * as sdk from '@mlightcad/cad-template-sdk'
import type { AcTpTemplate } from '@mlightcad/cad-template-sdk'

/**
 * Loading templates the company uploaded, without a deploy.
 *
 * ## How an uploaded module is run
 *
 * The module is turned into a blob URL and imported. That is the only way to
 * evaluate an ES module at runtime that keeps `import`/`export` semantics —
 * `new Function` cannot, and `eval` cannot.
 *
 * A blob module resolves relative imports against the blob URL and cannot
 * resolve bare specifiers at all, so an uploaded template must not `import`
 * anything by package name. Authors build with the SDK marked external and
 * mapped onto {@link SDK_GLOBAL}, which this module publishes before the
 * import runs. That is the same shape the repo's own plugins are built with,
 * so it costs an author a rollup `globals` entry and nothing else.
 *
 * ## What this is not
 *
 * It is not a sandbox. An uploaded template runs with the privileges of the
 * page: it can read the drawing, call the network, touch storage. That is
 * exactly why uploading requires the `author` role and why the server refuses
 * it to an ordinary member. Treat adding an author the way you would treat
 * giving someone commit access.
 */

/** Global an uploaded template reads the SDK from. */
export const SDK_GLOBAL = '__CAD_TEMPLATE_SDK__'

/** Metadata the library returns, without the module body. */
export interface AcApRemoteTemplateSummary {
  templateId: string
  version: string
  name: string
  category: string | null
  description: string | null
  status: 'draft' | 'published'
  uploadedBy: number | null
  verifiedAt: string | null
}

/** A template loaded from the library, with where it came from. */
export interface AcApRemoteTemplate {
  template: AcTpTemplate
  source: AcApRemoteTemplateSummary
}

/** Why one template failed to load, so the rest can still load. */
export interface AcApRemoteTemplateFailure {
  templateId: string
  version: string
  reason: string
}

export interface AcApRemoteTemplateLoad {
  loaded: AcApRemoteTemplate[]
  failed: AcApRemoteTemplateFailure[]
}

function publishSdkGlobal(): void {
  const target = globalThis as Record<string, unknown>
  if (!target[SDK_GLOBAL]) target[SDK_GLOBAL] = sdk
}

/**
 * Checks that an uploaded module actually is a template.
 *
 * A module that loads but is the wrong shape fails later, inside a generate
 * run, where the message reaching the engineer is about geometry rather than
 * about a bad upload.
 */
export function asTemplate(value: unknown): AcTpTemplate | undefined {
  const candidate = (value as { default?: unknown })?.default ?? value
  const template = candidate as Partial<AcTpTemplate>
  if (!template || typeof template !== 'object') return undefined
  if (typeof template.generate !== 'function') return undefined
  if (!template.meta || typeof template.meta.id !== 'string') return undefined
  if (!Array.isArray(template.params)) return undefined
  return template as AcTpTemplate
}

/** Evaluates one uploaded module and returns the template it exports. */
export async function evaluateTemplateModule(
  code: string
): Promise<AcTpTemplate> {
  publishSdkGlobal()

  const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }))
  try {
    const module = await import(/* @vite-ignore */ url)
    const template = asTemplate(module)
    if (!template) {
      throw new Error(
        'Module không xuất ra một template hợp lệ (cần meta, params và generate).'
      )
    }
    return template
  } finally {
    // Revoking keeps a long session from accumulating one blob per template
    // reload; the module stays alive because it is already evaluated.
    URL.revokeObjectURL(url)
  }
}

/** Fetch signature, injected so tests need no network. */
export type AcApFetch = (
  input: string,
  init?: { method?: string; credentials?: 'same-origin' }
) => Promise<{
  ok: boolean
  status: number
  json(): Promise<unknown>
}>

/**
 * Loads every template the library offers this user.
 *
 * One template failing must not take the library down: a single bad upload
 * would otherwise leave every engineer without any templates at all. Failures
 * are collected and returned so the caller can say which ones are broken.
 */
export async function loadRemoteTemplates(
  fetchImpl: AcApFetch = fetch as unknown as AcApFetch,
  baseUrl = '/api/templates',
  // Injected so the fetching and failure-isolation logic can be tested without
  // a browser: blob URLs and dynamic module import exist only there, and a
  // loader whose only testable path is the network is a loader nobody checks.
  evaluate: (code: string) => Promise<AcTpTemplate> = evaluateTemplateModule
): Promise<AcApRemoteTemplateLoad> {
  const loaded: AcApRemoteTemplate[] = []
  const failed: AcApRemoteTemplateFailure[] = []

  const listResponse = await fetchImpl(baseUrl, { credentials: 'same-origin' })
  if (!listResponse.ok) {
    throw new Error(
      `Không tải được thư viện template (HTTP ${listResponse.status}).`
    )
  }
  const body = (await listResponse.json()) as {
    templates?: AcApRemoteTemplateSummary[]
  }

  for (const summary of body.templates ?? []) {
    try {
      const one = await fetchImpl(
        `${baseUrl}/${encodeURIComponent(summary.templateId)}/${encodeURIComponent(summary.version)}`,
        { credentials: 'same-origin' }
      )
      if (!one.ok) throw new Error(`HTTP ${one.status}`)
      const payload = (await one.json()) as { template?: { code?: string } }
      const code = payload.template?.code
      if (!code) throw new Error('Thiếu nội dung template.')

      loaded.push({ template: await evaluate(code), source: summary })
    } catch (error) {
      failed.push({
        templateId: summary.templateId,
        version: summary.version,
        reason: error instanceof Error ? error.message : String(error)
      })
    }
  }

  return { loaded, failed }
}

/**
 * Tells the server a draft has produced a drawing, which publishes it.
 *
 * Called after a successful run rather than at upload time, because the only
 * place a template can be proven to work is the browser that runs it.
 */
export async function markTemplateVerified(
  templateId: string,
  version: string,
  fetchImpl: AcApFetch = fetch as unknown as AcApFetch,
  baseUrl = '/api/templates'
): Promise<boolean> {
  const response = await fetchImpl(
    `${baseUrl}/${encodeURIComponent(templateId)}/${encodeURIComponent(version)}/publish`,
    { method: 'POST', credentials: 'same-origin' }
  )
  return response.ok
}

/**
 * Loads the library into the registry.
 *
 * Exported at module level so the dialog can refresh on open without reaching
 * into the plugin instance: a template uploaded a minute ago has to be usable
 * in this session, which is the entire reason for uploading rather than
 * deploying.
 *
 * Failures are returned rather than thrown. A library that cannot be reached
 * leaves the built-in templates working, and losing every template because
 * the network blinked is a far worse failure than not seeing the uploaded
 * ones.
 */
export async function refreshTemplateLibrary(): Promise<AcApRemoteTemplateLoad> {
  const { setRemoteTemplates } = await import('./templateRegistry')
  try {
    const result = await loadRemoteTemplates()
    setRemoteTemplates(result.loaded)
    for (const failure of result.failed) {
      // eslint-disable-next-line no-console
      console.warn(
        `[TemplatePlugin] Không nạp được template ${failure.templateId}@${failure.version}: ${failure.reason}`
      )
    }
    return result
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('[TemplatePlugin] Không tải được thư viện template:', error)
    return { loaded: [], failed: [] }
  }
}
