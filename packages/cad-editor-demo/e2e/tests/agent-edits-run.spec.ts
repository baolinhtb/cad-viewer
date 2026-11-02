/**
 * Sửa một bộ phận đã dựng phải thay nó, không để lại bản cũ.
 *
 * Người dùng báo: *"tôi yêu cầu sửa thì vẽ thêm, các thành phần cũ vẫn để
 * lại, dẫn đến càng sửa hình càng rối rắm"*. Nguyên nhân là trợ lý chỉ có
 * `chay_template`, vốn luôn nối thêm một lần chạy nữa. Bài này chạy đúng luồng
 * ấy trong trình duyệt: dựng, rồi bảo sửa, rồi đếm xem bản vẽ còn mấy cái.
 *
 * Mô hình được stub bằng SSE dựng sẵn nên không tốn token nào.
 */
import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { uploadFixture } from '../helpers/fileUpload'

const here = path.dirname(fileURLToPath(import.meta.url))
const fixturePath = path.resolve(here, '..', 'fixtures', 'minimal-line.dxf')
const templatePath = path.resolve(
  here, '..', '..', '..', 'cad-template-plugin', 'library', 'mo_be_mong.js'
)
const ID = 'mo_be_mong'
const VERSION = '1.2.0'

const sse = (type: string, payload: object) =>
  `event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`

const head = (id: string) =>
  sse('message_start', {
    type: 'message_start',
    message: {
      id, type: 'message', role: 'assistant', model: 'claude-opus-5',
      content: [], stop_reason: null, stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 0 }
    }
  })

function toolCallStream(id: string, calls: { id: string; name: string; input: object }[]) {
  const events = [head(id)]
  calls.forEach((call, index) => {
    events.push(sse('content_block_start', {
      type: 'content_block_start', index,
      content_block: { type: 'tool_use', id: call.id, name: call.name, input: {} }
    }))
    events.push(sse('content_block_delta', {
      type: 'content_block_delta', index,
      delta: { type: 'input_json_delta', partial_json: JSON.stringify(call.input) }
    }))
    events.push(sse('content_block_stop', { type: 'content_block_stop', index }))
  })
  events.push(sse('message_delta', {
    type: 'message_delta',
    delta: { stop_reason: 'tool_use', stop_sequence: null },
    usage: { output_tokens: 20 }
  }))
  events.push(sse('message_stop', { type: 'message_stop' }))
  return events.join('')
}

const textStream = (id: string, text: string) => [
  head(id),
  sse('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }),
  sse('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } }),
  sse('content_block_stop', { type: 'content_block_stop', index: 0 }),
  sse('message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 5 } }),
  sse('message_stop', { type: 'message_stop' })
].join('')

/** Every footing outline currently in the drawing. */
async function footings(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const w = window as unknown as Record<string, any>
    const db = (w.AcApDocManager?.instance ?? w.acApDocManager).curDocument.database
    const out: { width: number; run: string | null }[] = []
    for (const e of db.tables.blockTable.modelSpace.newIterator()) {
      if (e.layer !== 'KC-MO-BE') continue
      const b = e.geometricExtents
      out.push({ width: Math.round(b.max.x - b.min.x), run: null })
    }
    return out
  })
}

test('bảo sửa thì bộ phận cũ biến mất, không nằm lại chồng lên', async ({ page }) => {
  const code = fs.readFileSync(templatePath, 'utf8')

  await page.addInitScript(() => {
    localStorage.setItem('cad-agent-plugin.agent-mode', 'simple')
  })
  await page.route('**/api/templates', route =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        templates: [{ templateId: ID, version: VERSION, status: 'published', name: 'Bệ móng' }]
      })
    })
  )
  await page.route(`**/api/templates/${ID}/${VERSION}`, route =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ template: { code } })
    })
  )

  let round = 0
  await page.route('**/api/ai/messages', async route => {
    round += 1
    const body =
      round === 1
        ? toolCallStream('m1', [
            { id: 't1', name: 'chay_template', input: { ma_template: ID, thong_so: { B: 7700 } } }
          ])
        : round === 2
          ? textStream('m2', 'Đã dựng bệ móng.')
          : round === 3
            ? toolCallStream('m3', [
                // Đúng cách: nhìn bản vẽ trước, rồi sửa lần chạy đã có.
                { id: 't2', name: 'mo_ta_ban_ve', input: {} },
                { id: 't3', name: 'sua_lan_chay', input: { ma_lan_chay: 'r1', thong_so: { B: 11000 } } }
              ])
            : textStream('m4', 'Đã sửa bề rộng.')
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' },
      body
    })
  })

  await page.setViewportSize({ width: 2200, height: 1200 })
  await page.goto('/')
  await uploadFixture(page, fixturePath)
  await expect(page.locator('.ml-cad-container')).toBeVisible()
  await page.getByRole('button', { name: /CAD\s*Agent/i }).click()

  await page.locator('.cad-agent-panel-root textarea').fill('dựng bệ móng mố')
  await page.locator('.cad-agent-send-btn').click()
  await expect(page.locator('.cad-agent-panel-root')).toContainText('Đã dựng bệ móng', {
    timeout: 60_000
  })

  const sau1 = await footings(page)
  expect(sau1).toHaveLength(1)
  expect(sau1[0].width).toBe(7700)

  // Ghi lại id của những đối tượng **do lần chạy dựng**, để lát nữa hỏi cảnh vẽ
  // xem chúng có thật sự bị gỡ khỏi màn hình hay chỉ bị xoá trong database.
  // Chỉ lấy các layer của mố: đường trong file fixture không thuộc lần chạy nào
  // và phải ở nguyên — bắt cả nó vào thì bài kiểm đòi xoá thứ không được xoá.
  const idCu = await page.evaluate(() => {
    const w = window as unknown as Record<string, any>
    const db = (w.AcApDocManager?.instance ?? w.acApDocManager).curDocument.database
    const ids: string[] = []
    for (const e of db.tables.blockTable.modelSpace.newIterator()) {
      if (String(e.layer ?? '').startsWith('KC-MO')) ids.push(e.objectId)
    }
    return ids
  })
  expect(idCu.length).toBeGreaterThan(0)

  await page.locator('.cad-agent-panel-root textarea').fill('sửa bề rộng thành 11 m')
  await page.locator('.cad-agent-send-btn').click()
  await expect(page.locator('.cad-agent-panel-root')).toContainText('Đã sửa bề rộng', {
    timeout: 60_000
  })
  await page.waitForTimeout(2000)

  // Đây là khẳng định của cả bài: MỘT cái bệ, rộng 11000. Trước khi có
  // `sua_lan_chay` thì chỗ này ra hai cái — 7700 nằm nguyên và 11000 chồng lên.
  const sau2 = await footings(page)
  expect(sau2).toHaveLength(1)
  expect(sau2[0].width).toBe(11000)

  // Và hình cũ rời khỏi **cảnh vẽ**, không chỉ rời khỏi database: một đối tượng
  // bị xoá mà cảnh vẽ vẫn giữ thì màn hình vẫn thấy bản cũ đè lên bản mới, đúng
  // cái người dùng nhìn thấy.
  const conTrongCanh = await page.evaluate(ids => {
    const w = window as unknown as Record<string, any>
    const view = w.AcApDocManager.instance.context.view
    return ids.filter((id: string) => view.hasEntity(id))
  }, idCu)
  expect(conTrongCanh).toEqual([])
})
