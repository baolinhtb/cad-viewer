/**
 * Một lời gọi ra cả mố, xếp đúng chỗ.
 *
 * Từng template biết hình của riêng nó; nửa còn lại — cao độ nối nhau, độ dốc
 * chạy suốt, lan can bám mép lớp phủ — nằm trong cách ghép đã đo từ bản vẽ của
 * kỹ sư. Bài này chạy đúng luồng người dùng: bảo "dựng mố cầu", rồi đo xem các
 * bộ phận có chồng khít nhau trên màn hình không.
 */
import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { uploadFixture } from '../helpers/fileUpload'

const here = path.dirname(fileURLToPath(import.meta.url))
const fixturePath = path.resolve(here, '..', 'fixtures', 'minimal-line.dxf')
const lib = path.resolve(here, '..', '..', '..', 'cad-template-plugin', 'library')

const PARTS = [
  ['mo_be_mong', 'mo_be_mong.js', '1.2.0'],
  ['mo_coc_khoan_nhoi', 'mo_coc_khoan_nhoi.js', '1.0.0'],
  ['mo_tuong_than', 'mo_tuong_than.js', '1.1.0'],
  ['mo_tuong_dau', 'mo_tuong_dau.js', '1.1.0'],
  ['tuong_phong_ho_btct', 'tuong_phong_ho.js', '3.0.0']
] as const

const sse = (t: string, p: object) => `event: ${t}\ndata: ${JSON.stringify(p)}\n\n`
const head = (id: string) =>
  sse('message_start', {
    type: 'message_start',
    message: {
      id, type: 'message', role: 'assistant', model: 'claude-opus-5',
      content: [], stop_reason: null, stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 0 }
    }
  })
function tools(calls: { id: string; name: string; input: object }[]) {
  const e = [head('m1')]
  calls.forEach((c, i) => {
    e.push(sse('content_block_start', { type: 'content_block_start', index: i, content_block: { type: 'tool_use', id: c.id, name: c.name, input: {} } }))
    e.push(sse('content_block_delta', { type: 'content_block_delta', index: i, delta: { type: 'input_json_delta', partial_json: JSON.stringify(c.input) } }))
    e.push(sse('content_block_stop', { type: 'content_block_stop', index: i }))
  })
  e.push(sse('message_delta', { type: 'message_delta', delta: { stop_reason: 'tool_use', stop_sequence: null }, usage: { output_tokens: 20 } }))
  e.push(sse('message_stop', { type: 'message_stop' }))
  return e.join('')
}
const text = (t: string) => [
  head('m2'),
  sse('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }),
  sse('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: t } }),
  sse('content_block_stop', { type: 'content_block_stop', index: 0 }),
  sse('message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 5 } }),
  sse('message_stop', { type: 'message_stop' })
].join('')

test('một lời gọi ghép ra cả mố, các bộ phận nối khít nhau', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('cad-agent-plugin.agent-mode', 'simple')
  })
  await page.route('**/api/templates', r =>
    r.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        templates: PARTS.map(([id, , v]) => ({ templateId: id, version: v, status: 'published', name: id }))
      })
    })
  )
  for (const [id, file, v] of PARTS) {
    const code = fs.readFileSync(path.join(lib, file), 'utf8')
    await page.route(`**/api/templates/${id}/${v}`, r =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ template: { code } }) })
    )
  }

  let round = 0
  await page.route('**/api/ai/messages', async r => {
    round += 1
    await r.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' },
      body: round === 1
        ? tools([{ id: 't1', name: 'ghep_bo_phan', input: { ma_ghep: 'mo_cau_hoan_chinh', thong_so: {} } }])
        : text('Đã ghép mố cầu.')
    })
  })

  await page.setViewportSize({ width: 2200, height: 1200 })
  await page.goto('/')
  await uploadFixture(page, fixturePath)
  await expect(page.locator('.ml-cad-container')).toBeVisible()
  await page.getByRole('button', { name: /CAD\s*Agent/i }).click()
  await page.locator('.cad-agent-panel-root textarea').fill('dựng mố cầu')
  await page.locator('.cad-agent-send-btn').click()
  await expect(page.locator('.cad-agent-panel-root')).toContainText('Đã ghép mố cầu', {
    timeout: 60_000
  })

  await page.waitForTimeout(3000)
  await page.evaluate(async () => {
    const w = window as unknown as Record<string, any>
    const view = w.AcApDocManager.instance.context.view
    while (view.isProcessingEntities) await new Promise(r => setTimeout(r, 100))
    view.zoomToFitDrawing()
    await new Promise(r => setTimeout(r, 1500))
  })

  const lop = await page.evaluate(() => {
    const w = window as unknown as Record<string, any>
    const db = w.AcApDocManager.instance.curDocument.database
    const out: Record<string, number[]> = {}
    for (const e of db.tables.blockTable.modelSpace.newIterator()) {
      const l = String(e.layer ?? '')
      if (!l || l === '0') continue
      const b = e.geometricExtents
      const p = out[l]
      out[l] = p
        ? [Math.min(p[0], b.min.x), Math.min(p[1], b.min.y), Math.max(p[2], b.max.x), Math.max(p[3], b.max.y)]
        : [b.min.x, b.min.y, b.max.x, b.max.y]
    }
    return out
  })

  // Cả bảy layer của mố có mặt sau đúng một lời gọi.
  for (const layer of [
    'KC-MO-BTLOT', 'KC-MO-BE', 'KC-COC', 'KC-MO-TUONGTHAN',
    'KC-MO-TUONGDAU', 'KC-MO-TUONGTAI', 'KC-LOPPHU', 'KC-LANCAN'
  ]) {
    expect(lop[layer], `thiếu ${layer}`).toBeDefined()
  }

  // Nối khít: đáy mỗi bộ phận trùng đỉnh bộ phận dưới.
  expect(lop['KC-MO-BE'][1]).toBeCloseTo(lop['KC-MO-BTLOT'][3], 3)
  expect(lop['KC-MO-TUONGTHAN'][1]).toBeCloseTo(lop['KC-MO-BE'][3], 3)
  // Đáy tường đầu gặp góc THẤP của đỉnh tường thân — lệch 154 = 7700 × 2,00%.
  expect(lop['KC-MO-TUONGDAU'][1]).toBeCloseTo(lop['KC-MO-TUONGTHAN'][3] - 154, 0)
  // Lan can đứng trên mặt lớp phủ, không lơ lửng.
  expect(lop['KC-LANCAN'][1]).toBeCloseTo(lop['KC-LOPPHU'][3] - 140, 0)

  await page.locator('.ml-cad-container canvas').first().screenshot({
    path: '/tmp/claude-0/-srv-cad-viewer/0f952686-ec74-47b8-b919-c5c081824fa6/scratchpad/shots/mo-ghep-mot-lenh.png'
  })
})
