/**
 * Loads a library template the way the browser does, for specs that need one.
 *
 * Nothing is compiled into the build any more: `BUILT_IN` is deliberately
 * empty, because every template that used to ship was an outline this system
 * inferred from the text of a standard rather than measured from a drawing.
 * So a spec that needs "some template to run" has to bring one, and the honest
 * one to bring is a real uploadable file out of `library/` — the same bytes the
 * server stores.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { formatPartId } from '@mlightcad/cad-template-sdk'

import { setRemoteTemplates } from '../../src/templateRegistry'

const DIR = join(__dirname, '..', '..', 'library')

/** Evaluates one uploadable template file. */
export function loadLibraryTemplate(file: string) {
  ;(globalThis as unknown as Record<string, unknown>).__CAD_TEMPLATE_SDK__ = {
    formatPartId
  }
  const code = readFileSync(join(DIR, file), 'utf8')
  if (!/^\s*export default /m.test(code)) {
    throw new Error(`${file}: thiếu "export default" mà hợp đồng upload yêu cầu`)
  }
  return new Function(code.replace(/^\s*export default /m, 'return '))()
}

/** Registers library files as if they had been fetched from the server. */
export function registerLibrary(...files: string[]) {
  const templates = files.map(file => {
    const template = loadLibraryTemplate(file)
    return {
      template,
      source: {
        templateId: template.meta.id,
        version: template.meta.version,
        name: template.meta.name,
        status: 'published' as const
      }
    }
  })
  setRemoteTemplates(templates as never)
  return templates.map(entry => entry.template)
}
