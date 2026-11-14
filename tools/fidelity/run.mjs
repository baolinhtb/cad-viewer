#!/usr/bin/env node
/* global process */
/**
 * Runs the whole fidelity harness for the abutment dossier against
 * `assets/02. BTC- mo_2.dwg`, and times each step.
 *
 *   node tools/fidelity/run.mjs [--extract] [--label "ghi chú vòng này"]
 *                               [--out /workspace/cadview-shots/mo2]
 *
 * 1. extract-orig.mjs (only with --extract or when its outputs are missing)
 * 2. jest fidelity spec with FIDELITY_OUT → generated DXF + inventory scores
 * 3. ACI palette from @mlightcad/common (what the renderer uses)
 * 4. render.mjs — original paper + viewport windows, generated sheets
 * 5. score.py — pixel components, final score, images, diem.json, history
 *
 * Writes only outside the repository (default /workspace/cadview-shots/mo2).
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const arg = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i > 0 ? process.argv[i + 1] : fallback
}
const OUT = arg('--out', '/workspace/cadview-shots/mo2')
const WORK = join(OUT, 'work')
const LABEL = arg('--label', '')
mkdirSync(join(WORK, 'render'), { recursive: true })

const timings = {}
function step(name, fn) {
  const t0 = Date.now()
  fn()
  timings[name] = Math.round((Date.now() - t0) / 100) / 10
  console.log(`[fidelity] ${name}: ${timings[name]} s`)
}
function sh(cmd, args, env = {}) {
  const r = spawnSync(cmd, args, {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, ...env }
  })
  if (r.status !== 0)
    throw new Error(`${cmd} ${args.join(' ')} → mã ${r.status}`)
}

const t0 = Date.now()
if (
  process.argv.includes('--extract') ||
  !existsSync(join(WORK, 'orig-manifest.json'))
)
  step('1 trích bản gốc', () =>
    sh('node', ['tools/fidelity/extract-orig.mjs', '--work', WORK])
  )

step('2 sinh hồ sơ (jest)', () =>
  sh(
    join(ROOT, 'node_modules/.bin/jest'),
    [
      'packages/cad-template-plugin/__tests__/fidelity',
      '--runInBand',
      '-t',
      'writes the pixel'
    ],
    { FIDELITY_OUT: join(WORK, 'gen') }
  )
)

step('3 bảng màu ACI', () => {
  const code = `
    const { AcCmColorUtil } = await import(${JSON.stringify(
      join(
        ROOT,
        'node_modules/.pnpm/@mlightcad+common@1.15.21/node_modules/@mlightcad/common/lib/AcCmColorUtil.js'
      )
    )})
    const rows = [[0, 0, 0]]
    for (let i = 1; i < 256; i++) {
      const c = AcCmColorUtil.getColorByIndex(i)
      rows.push([(c >> 16) & 255, (c >> 8) & 255, c & 255])
    }
    process.stdout.write(JSON.stringify(rows))`
  const r = spawnSync('node', ['--input-type=module', '-e', code], {
    cwd: ROOT,
    encoding: 'utf8'
  })
  if (r.status !== 0) throw new Error(r.stderr)
  writeFileSync(join(WORK, 'aci.json'), r.stdout)
})

step('4 render', () => {
  const orig = JSON.parse(
    readFileSync(join(WORK, 'orig-manifest.json'), 'utf8')
  )
  const gen = JSON.parse(
    readFileSync(join(WORK, 'gen', 'gen-manifest.json'), 'utf8')
  )
  const jobs = []
  for (const s of orig.sheets) {
    jobs.push({
      name: `${s.id}-orig-paper`,
      input: orig.normalizedDxf,
      window: s.paperWindow,
      px: 4200,
      out: join(WORK, 'render', `${s.id}-orig-paper.png`)
    })
    if (s.viewport)
      jobs.push({
        name: `${s.id}-orig-vp`,
        input: orig.normalizedDxf,
        window: s.model,
        px: Math.round(Math.max(s.viewport.w, s.viewport.h) * 10),
        out: join(WORK, 'render', `${s.id}-orig-vp.png`)
      })
  }
  for (const s of gen.sheets)
    jobs.push({
      name: `${s.id}-gen`,
      input: join(WORK, 'gen', 'gen.dxf'),
      window: s.window,
      px: 4200,
      out: join(WORK, 'render', `${s.id}-gen.png`)
    })
  writeFileSync(join(WORK, 'render-jobs.json'), JSON.stringify(jobs, null, 1))
  sh('node', ['tools/fidelity/render.mjs', join(WORK, 'render-jobs.json')])
})

step('5 chấm điểm', () =>
  sh('python3', ['-I', 'tools/fidelity/score.py', WORK, OUT, '--label', LABEL])
)

timings.tong = Math.round((Date.now() - t0) / 100) / 10
writeFileSync(join(WORK, 'timings.json'), JSON.stringify(timings, null, 1))
console.log(`[fidelity] tổng: ${timings.tong} s`, timings)
