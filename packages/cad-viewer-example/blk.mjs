import { chromium } from '@playwright/test'
import { writeFileSync } from 'node:fs'
const [BASE, DWG, OUT] = process.argv.slice(2)
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROME_PATH })
const page = await (await browser.newContext({ viewport: { width: 1600, height: 1000 } })).newPage()
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(9000)
await page.getByRole('radio', { name: /^Write\b/ }).click()
await page.getByRole('radio', { name: /^Extents\b/ }).click()
await page.locator('input[type="file"]').first().setInputFiles(DWG)
await page.locator('.ml-cad-container canvas').first().waitFor({ state: 'visible', timeout: 240_000 })
await page.waitForTimeout(14_000)
const data = await page.evaluate(() => {
  const w = window
  const db = (w.AcApDocManager?.instance ?? w.acApDocManager).curDocument.database
  const dump = rec => {
    const out = []
    for (const e of rec.newIterator()) {
      const type = (e.constructor?.name ?? '?').replace(/^AcDb/, '').replace(/\d+$/, '')
      const r = { type, layer: e.layer || '0' }
      if (type === 'Polyline') {
        r.closed = !!e.closed; r.pts = []
        for (let i = 0; i < e.numberOfVertices; i++) {
          const v = e.getPoint2dAt(i); r.pts.push([Math.round(v.x), Math.round(v.y)])
        }
      } else if (type === 'Line') {
        r.pts = [[Math.round(e.startPoint.x), Math.round(e.startPoint.y)],
                 [Math.round(e.endPoint.x), Math.round(e.endPoint.y)]]
      } else if (type === 'Circle' || type === 'Arc') {
        r.c = [Math.round(e.center.x), Math.round(e.center.y)]; r.r = Math.round(e.radius)
        if (type === 'Arc') { r.a0 = +(e.startAngle).toFixed(3); r.a1 = +(e.endAngle).toFixed(3) }
      } else if (type === 'Point') {
        r.at = [Math.round(e.position?.x ?? 0), Math.round(e.position?.y ?? 0)]
      } else if (type === 'BlockReference') {
        r.block = e.blockName; r.at = [Math.round(e.position?.x ?? 0), Math.round(e.position?.y ?? 0)]
      }
      out.push(r)
    }
    return out
  }
  const blocks = {}
  for (const b of db.tables.blockTable.newIterator()) {
    if (!/^A\$/.test(b.name)) continue
    blocks[b.name] = dump(b)
  }
  return { model: dump(db.tables.blockTable.modelSpace), blocks }
})
writeFileSync(OUT, JSON.stringify(data, null, 1))
console.log('model:', data.model.length, '| block:', Object.entries(data.blocks).map(([k,v])=>k+'='+v.length).join(', '))
await browser.close()
