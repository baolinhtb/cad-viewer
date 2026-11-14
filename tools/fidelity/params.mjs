#!/usr/bin/env node
/* global process */
/**
 * GĐ6 — renders the parameter variants of the 0.3.0 dossier.
 *
 *   node tools/fidelity/params.mjs [--out /workspace/cadview-shots/mo2]
 *
 * 1. jest `dossierParams030.spec.ts` with PARAM_OUT: each variant is made
 *    through the agent tool `sua_ho_so_mo` on a 0.3.0 run, checked (dims,
 *    elevations, tables, steel refusal) and written as DXF, with the sheets
 *    it changed.
 * 2. Renders every changed sheet as `param-<variant>-<sheet>.png`, and the
 *    same sheets of the default dossier as `param-macdinh-<sheet>.png`.
 * 3. Writes `params.json`: what each variant changed and what was checked.
 *
 * Writes only outside the repository.
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const at = process.argv.indexOf('--out')
const OUT = at > 0 ? process.argv[at + 1] : '/workspace/cadview-shots/mo2'
const WORK = join(OUT, 'work', 'params')
mkdirSync(WORK, { recursive: true })

const sh = (cmd, args, env = {}) => {
  const r = spawnSync(cmd, args, {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, ...env }
  })
  if (r.status !== 0) throw new Error(`${cmd} → mã ${r.status}`)
}

sh(
  join(ROOT, 'node_modules/.bin/jest'),
  [
    'packages/cad-template-plugin/__tests__/dossierParams030.spec.ts',
    '--runInBand'
  ],
  { PARAM_OUT: WORK }
)

const manifest = JSON.parse(
  readFileSync(join(WORK, 'params-manifest.json'), 'utf8')
)
const windowOf = id => manifest.sheets.find(s => s.id === id).window
const jobs = []
const defaults = new Set()
for (const [name, r] of Object.entries(manifest.results))
  for (const id of r.changedSheets) {
    defaults.add(id)
    jobs.push({
      name: `${name}-${id}`,
      input: join(WORK, `${name}.dxf`),
      window: windowOf(id),
      px: 2100,
      out: join(OUT, `param-${name}-${id}.png`)
    })
  }
for (const id of defaults)
  jobs.push({
    name: `macdinh-${id}`,
    input: join(WORK, 'macdinh.dxf'),
    window: windowOf(id),
    px: 2100,
    out: join(OUT, `param-macdinh-${id}.png`)
  })
writeFileSync(join(WORK, 'render-jobs.json'), JSON.stringify(jobs, null, 1))
sh('node', ['tools/fidelity/render.mjs', join(WORK, 'render-jobs.json')])

writeFileSync(
  join(OUT, 'params.json'),
  JSON.stringify(
    {
      thoi_diem: new Date().toISOString(),
      anh: jobs.map(j => j.out),
      bien_the: manifest.results
    },
    null,
    1
  )
)
console.log(`[params] ${jobs.length} ảnh, ${join(OUT, 'params.json')}`)
