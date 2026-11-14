#!/usr/bin/env node
/* global process */
/**
 * Renders model-space windows to PNG through the application's own renderer
 * (cad-simple-viewer-cli → headless Chrome → three-renderer, command `pngout`).
 *
 *   node tools/fidelity/render.mjs <jobs.json>
 *
 * jobs.json: [{ "name", "input", "window": {x0,y0,x1,y1}, "px", "out" }]
 * `px` is the long side in pixels; the image has the window's aspect. Both
 * the original and the generated drawing go through this same path, so a
 * difference in the images is a difference in the drawings.
 *
 * Needs the CLI built (`nx run @mlightcad/cad-simple-viewer-cli:build`) and
 * Chrome (`PLAYWRIGHT_BROWSER_CHANNEL=chrome`, set here by default).
 */
import {
  copyFileSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
process.env.PLAYWRIGHT_BROWSER_CHANNEL ??= 'chrome'

const { HeadlessCadSession } = await import(
  join(ROOT, 'packages/cad-simple-viewer-cli/dist/runHeadless.js')
)

const jobs = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const session = await HeadlessCadSession.create({ useGpu: false })
const timings = []
try {
  for (const job of jobs) {
    const t0 = Date.now()
    const tmp = join(dirname(job.out), `.render-${job.name}`)
    rmSync(tmp, { recursive: true, force: true })
    mkdirSync(tmp, { recursive: true })
    const script = join(tmp, 'job.scr')
    const w = job.window
    writeFileSync(
      script,
      `pngout\n${w.x0},${w.y0}\n${w.x1},${w.y1}\n${job.px}\nquit\n`
    )
    await session.run({
      inputPath: job.input,
      scriptPath: script,
      outputDir: tmp,
      mode: 'read',
      // Draw everything exactly as stored; no extents framing involved
      // since pngout takes an explicit window.
      openViewMode: 'extents'
    })
    const png = readdirSync(tmp).find(f => f.endsWith('.png'))
    if (!png) throw new Error(`render ${job.name}: không có ảnh ra`)
    mkdirSync(dirname(job.out), { recursive: true })
    copyFileSync(join(tmp, png), job.out)
    rmSync(tmp, { recursive: true, force: true })
    timings.push({ name: job.name, s: (Date.now() - t0) / 1000 })
    console.log(
      `[fidelity] render ${job.name} ${((Date.now() - t0) / 1000).toFixed(1)} s`
    )
  }
} finally {
  await session.close()
}
writeFileSync(
  process.argv[2].replace(/\.json$/, '.timings.json'),
  JSON.stringify(timings, null, 1)
)
