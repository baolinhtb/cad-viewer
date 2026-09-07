/**
 * Mặt chính mố hoàn chỉnh dựng trong trình duyệt thật.
 *
 * Suite đơn vị đã đối chiếu từng đỉnh với bản vẽ. Thứ nó không chứng minh được
 * là 270 đối tượng ấy — kích thước, chữ có dấu, tô đặc, cung tròn lan can —
 * đi qua bộ chuyển đổi cảnh và lên tới màn hình. Đây là điều kiện để một
 * template rời trạng thái nháp, nên phải kiểm ở đúng nơi nó chạy.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { expect, test } from '@playwright/test'

import { uploadFixture } from '../helpers/fileUpload'

const here = path.dirname(fileURLToPath(import.meta.url))
const fixturePath = path.resolve(here, '..', 'fixtures', 'minimal-line.dxf')
const templatePath = path.resolve(
  here,
  '..',
  '..',
  '..',
  'cad-template-plugin',
  'library',
  'mo_mat_chinh.js'
)
const TEMPLATE_ID = 'mo_mat_chinh'
const VERSION = '1.0.0'

function sse(type: string, payload: object) {
  return `event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`
}

function head(id: string) {
  return sse('message_start', {
    type: 'message_start',
    message: {
      id,
      type: 'message',
      role: 'assistant',
      model: 'claude-opus-5',
      content: [],
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 0 }
    }
  })
}

function toolCallStream(calls: { id: string; name: string; input: object }[]) {
  const events = [head('msg_tools')]
  calls.forEach((call, index) => {
    events.push(
      sse('content_block_start', {
        type: 'content_block_start',
        index,
        content_block: { type: 'tool_use', id: call.id, name: call.name, input: {} }
      })
    )
    events.push(
      sse('content_block_delta', {
        type: 'content_block_delta',
        index,
        delta: { type: 'input_json_delta', partial_json: JSON.stringify(call.input) }
      })
    )
    events.push(sse('content_block_stop', { type: 'content_block_stop', index }))
  })
  events.push(
    sse('message_delta', {
      type: 'message_delta',
      delta: { stop_reason: 'tool_use', stop_sequence: null },
      usage: { output_tokens: 20 }
    })
  )
  events.push(sse('message_stop', { type: 'message_stop' }))
  return events.join('')
}

function textStream(text: string) {
  return [
    head('msg_done'),
    sse('content_block_start', {
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'text', text: '' }
    }),
    sse('content_block_delta', {
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'text_delta', text }
    }),
    sse('content_block_stop', { type: 'content_block_stop', index: 0 }),
    sse('message_delta', {
      type: 'message_delta',
      delta: { stop_reason: 'end_turn', stop_sequence: null },
      usage: { output_tokens: 5 }
    }),
    sse('message_stop', { type: 'message_stop' })
  ].join('')
}

test('mặt chính mố M1 dựng đủ bộ phận và hiện lên màn hình', async ({ page }) => {
  const code = fs.readFileSync(templatePath, 'utf8')
  await page.addInitScript(() => {
    localStorage.setItem('cad-agent-plugin.agent-mode', 'simple')
  })
  await page.route('**/api/templates', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        templates: [
          {
            templateId: TEMPLATE_ID,
            version: VERSION,
            status: 'published',
            name: 'Mố cầu — mặt chính hoàn chỉnh (bản vẽ M1)'
          }
        ]
      })
    })
  )
  await page.route(`**/api/templates/${TEMPLATE_ID}/${VERSION}`, route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ template: { code } })
    })
  )
  let round = 0
  await page.route('**/api/ai/messages', async route => {
    round += 1
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' },
      body:
        round === 1
          ? toolCallStream([
              {
                id: 'toolu_mo',
                name: 'chay_template',
                input: { ma_template: TEMPLATE_ID, thong_so: {} }
              },
              { id: 'toolu_zoom', name: 'zoom_extents', input: {} }
            ])
          : textStream('Đã dựng mặt chính mố M1.')
    })
  })

  await page.setViewportSize({ width: 2200, height: 1200 })
  await page.goto('/')
  await uploadFixture(page, fixturePath)
  await expect(page.locator('.ml-cad-container')).toBeVisible()
  await page.getByRole('button', { name: /CAD\s*Agent/i }).click()
  await page.locator('.cad-agent-panel-root textarea').fill('dựng mặt chính mố M1')
  await page.locator('.cad-agent-send-btn').click()
  await expect(page.locator('.cad-agent-panel-root')).toContainText('Đã dựng mặt chính mố M1', {
    timeout: 60_000
  })

  // Khung nhìn: chờ cảnh chuyển xong rồi mới đóng khung, như template-hatch.
  await page.waitForTimeout(3000)
  await page.evaluate(async () => {
    const w = window as unknown as Record<string, any>
    const view = w.AcApDocManager.instance.context.view
    while (view.isProcessingEntities) await new Promise(r => setTimeout(r, 100))
    view.zoomToFitDrawing()
    await new Promise(r => setTimeout(r, 1500))
  })

  const summary = await page.evaluate(() => {
    const w = window as unknown as Record<string, any>
    const db = (w.AcApDocManager?.instance ?? w.acApDocManager).curDocument.database
    const byType: Record<string, number> = {}
    const byLayer: Record<string, number> = {}
    const hatches: number[][] = []
    const texts: string[] = []
    for (const e of db.tables.blockTable.modelSpace.newIterator()) {
      byType[e.dxfTypeName] = (byType[e.dxfTypeName] ?? 0) + 1
      byLayer[e.layer] = (byLayer[e.layer] ?? 0) + 1
      if (e.dxfTypeName === 'HATCH') {
        const b = e.geometricExtents
        hatches.push([b.min.x, b.min.y, b.max.x, b.max.y].map(v => Math.round(v * 10) / 10))
      }
      if (e.dxfTypeName === 'TEXT') texts.push(e.textString)
    }
    return { byType, byLayer, hatches, texts }
  })

  // Tờ bản vẽ đủ: 19 kích thước, 2 tường tai tô đặc, chữ Unicode nguyên vẹn.
  expect(summary.byType.DIMENSION).toBe(19)
  expect(summary.byType.HATCH).toBe(2)
  expect(summary.hatches.sort((a, b) => a[0] - b[0])).toEqual([
    [-3850, 6893.4, -3700, 8093.4],
    [3700, 6893.4, 3850, 8093.4]
  ])
  expect(summary.texts).toContain('MẶT CHÍNH MỐ M1')
  expect(summary.texts).toContain('Tim giai đoạn hoàn thiện')
  expect(summary.byLayer['_33_Kyhieumatcat']).toBe(12)
  expect(summary.byType.ARC).toBeGreaterThanOrEqual(52)
  // Cộng cả nét mẫu của fixture, không dưới 270 đối tượng của template.
  const total = Object.values(summary.byType).reduce((a, b) => a + b, 0)
  expect(total).toBeGreaterThanOrEqual(271)

  // Hình lên màn hình: canvas không trống, chụp lại để kỹ sư xem.
  const canvas = page.locator('.ml-cad-container canvas').first()
  const png = await canvas.screenshot()
  const lit = await page.evaluate(async imageBase64 => {
    const image = new Image()
    image.src = `data:image/png;base64,${imageBase64}`
    await image.decode()
    const probe = document.createElement('canvas')
    probe.width = image.naturalWidth
    probe.height = image.naturalHeight
    const ctx = probe.getContext('2d')!
    ctx.drawImage(image, 0, 0)
    const { data } = ctx.getImageData(0, 0, probe.width, probe.height)
    let count = 0
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] + data[i + 1] + data[i + 2] > 90) count++
    }
    return count
  }, png.toString('base64'))
  expect(lit).toBeGreaterThan(5000)

  const out = process.env.MO_MAT_CHINH_SHOT
  if (out) fs.writeFileSync(out, png)
})
