/**
 * Mốc toạ độ, cả ba mức, trong trình duyệt thật.
 *
 * Bản vẽ theo lý trình đặt kết cấu ở toạ độ như x = 311088, còn mọi kích thước
 * kỹ sư nghĩ trong đầu đều so với một mốc công trình. Bài này kiểm: đọc toạ độ
 * theo mốc (mức 1), lệnh đặt/lưu/gọi mốc (mức 2), và template đặt theo mốc
 * (mức 3).
 */
import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { uploadFixture } from '../helpers/fileUpload'

const here = path.dirname(fileURLToPath(import.meta.url))
const fixturePath = path.resolve(here, '..', 'fixtures', 'minimal-line.dxf')
const lib = path.resolve(here, '..', '..', '..', 'cad-template-plugin', 'library')
const ID = 'mo_be_mong'
const VERSION = '1.2.0'

const sse = (t: string, p: object) => `event: ${t}\ndata: ${JSON.stringify(p)}\n\n`
const head = (id: string) =>
  sse('message_start', {
    type: 'message_start',
    message: {
      id, type: 'message', role: 'assistant', model: 'claude-opus-5',
      content: [], stop_reason: null, stop_sequence: null,
      usage: { input_tokens: 1, output_tokens: 0 }
    }
  })
function tools(calls: { id: string; name: string; input: object }[]) {
  const e = [head('m1')]
  calls.forEach((c, i) => {
    e.push(sse('content_block_start', { type: 'content_block_start', index: i, content_block: { type: 'tool_use', id: c.id, name: c.name, input: {} } }))
    e.push(sse('content_block_delta', { type: 'content_block_delta', index: i, delta: { type: 'input_json_delta', partial_json: JSON.stringify(c.input) } }))
    e.push(sse('content_block_stop', { type: 'content_block_stop', index: i }))
  })
  e.push(sse('message_delta', { type: 'message_delta', delta: { stop_reason: 'tool_use', stop_sequence: null }, usage: { output_tokens: 1 } }))
  e.push(sse('message_stop', { type: 'message_stop' }))
  return e.join('')
}
const text = (t: string) => [
  head('m2'),
  sse('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }),
  sse('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: t } }),
  sse('content_block_stop', { type: 'content_block_stop', index: 0 }),
  sse('message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 1 } }),
  sse('message_stop', { type: 'message_stop' })
].join('')

test('mốc toạ độ: đọc, đặt, lưu, và template đặt theo mốc', async ({ page }) => {
  const code = fs.readFileSync(path.join(lib, 'mo_be_mong.js'), 'utf8')
  await page.addInitScript(() => {
    localStorage.setItem('cad-agent-plugin.agent-mode', 'simple')
  })
  await page.route('**/api/templates', r =>
    r.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ templates: [{ templateId: ID, version: VERSION, status: 'published', name: 'Bệ móng' }] })
    })
  )
  await page.route(`**/api/templates/${ID}/${VERSION}`, r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ template: { code } }) })
  )
  let round = 0
  await page.route('**/api/ai/messages', async r => {
    round += 1
    await r.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' },
      body: round === 1
        ? tools([
            { id: 't1', name: 'moc_toa_do', input: { hanh_dong: 'dat', x: 311087.7, y: 4495.1 } },
            { id: 't2', name: 'moc_toa_do', input: { hanh_dong: 'luu', ten: 'MOC_M1' } },
            { id: 't3', name: 'chay_template', input: { ma_template: ID, thong_so: { x: 0, y: 0 } } }
          ])
        : text('Đã đặt mốc và dựng bệ.')
    })
  })

  await page.setViewportSize({ width: 2200, height: 1200 })
  await page.goto('/')
  await uploadFixture(page, fixturePath)
  await expect(page.locator('.ml-cad-container')).toBeVisible()

  // MỨC 2 — lệnh UCS có mặt và chạy được từ dòng lệnh.
  const coLenh = await page.evaluate(() => {
    const w = window as unknown as Record<string, any>
    const doc = w.AcApDocManager.instance.curDocument
    return {
      coService: !!doc.ucsService,
      theGioiLucDau: doc.ucsService.isWorld
    }
  })
  expect(coLenh.coService).toBe(true)
  expect(coLenh.theGioiLucDau).toBe(true)

  // MỨC 3 — agent đặt mốc rồi dựng template với x = 0.
  await page.getByRole('button', { name: /CAD\s*Agent/i }).click()
  await page.locator('.cad-agent-panel-root textarea').fill('đặt mốc rồi dựng bệ')
  await page.locator('.cad-agent-send-btn').click()
  await expect(page.locator('.cad-agent-panel-root')).toContainText('Đã đặt mốc và dựng bệ', {
    timeout: 60_000
  })
  await page.waitForTimeout(1500)

  const ketQua = await page.evaluate(() => {
    const w = window as unknown as Record<string, any>
    const doc = w.AcApDocManager.instance.curDocument
    const db = doc.database
    let box: number[] | null = null
    for (const e of db.tables.blockTable.modelSpace.newIterator()) {
      if (e.layer !== 'KC-MO-BE') continue
      const b = e.geometricExtents
      box = [b.min.x, b.min.y, b.max.x, b.max.y]
    }
    const mocDaLuu: string[] = []
    for (const r of db.tables.ucsTable.newIterator()) mocDaLuu.push(r.name)
    return {
      box,
      dangDung: doc.ucsService.current.name,
      laTheGioi: doc.ucsService.isWorld,
      mocDaLuu,
      // MỨC 1 — một điểm trong bản vẽ đọc ra theo mốc.
      docTheoMoc: doc.ucsService.toUcs({ x: 314937.7, y: 6595.1 })
    }
  })

  // Bệ rộng 7700, tim đúng ngay mốc — dù lệnh chỉ truyền x = 0.
  expect(ketQua.box).not.toBeNull()
  expect((ketQua.box![0] + ketQua.box![2]) / 2).toBeCloseTo(311087.7, 1)
  expect(ketQua.box![2] - ketQua.box![0]).toBeCloseTo(7700, 1)

  // Mốc đã lưu nằm trong bản vẽ, gọi lại được sau này.
  expect(ketQua.mocDaLuu).toContain('MOC_M1')
  expect(ketQua.dangDung).toBe('MOC_M1')
  expect(ketQua.laTheGioi).toBe(false)

  // Đọc ngược: mép phải đỉnh bệ hiện ra là (3850, 2100) theo mốc.
  expect(ketQua.docTheoMoc.x).toBeCloseTo(3850, 1)
  expect(ketQua.docTheoMoc.y).toBeCloseTo(2100, 1)
})
