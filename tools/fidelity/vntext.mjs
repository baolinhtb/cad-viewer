/* global Buffer */
/**
 * Loads the SDK's TCVN3/VNI decoder (`AcTpVnText.ts`) in plain Node by
 * transpiling it on the fly with the repository's own TypeScript, so the
 * harness decodes exactly as the application does — one rule, not two.
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const require = createRequire(import.meta.url)
const ts = require(join(ROOT, 'node_modules', 'typescript'))

const source = readFileSync(
  join(ROOT, 'packages', 'cad-template-sdk', 'src', 'AcTpVnText.ts'),
  'utf8'
)
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022
  }
})

export const { acTpDecodeVnText, acTpLegacyVnFont, acTpMTextPlain } =
  await import(
    `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`
  )
