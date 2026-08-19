/**
 * The three abutment components, run one after another the way the assistant
 * will run them.
 *
 * The unit suite proves the components reproduce the retired whole-abutment
 * template's geometry exactly. What it cannot prove is that three separate
 * template runs in one drawing stack up on screen — each run appends to the
 * same database, and a datum that is right in isolation is still wrong if the
 * next run does not land on it. This draws all three with their declared
 * defaults and checks the parts touch where they should.
 */
import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { uploadFixture } from '../helpers/fileUpload'

const here = path.dirname(fileURLToPath(import.meta.url))
const fixturePath = path.resolve(here, '..', 'fixtures', 'minimal-line.dxf')
const libDir = path.resolve(here, '..', '..', '..', 'cad-template-plugin', 'library')

const PARTS = [
  { id: 'mo_be_mong', file: 'mo_be_mong.js', name: 'Bệ móng' },
  { id: 'mo_tuong_than', file: 'mo_tuong_than.js', name: 'Tường thân' },
  { id: 'mo_tuong_dau', file: 'mo_tuong_dau.js', name: 'Tường đầu' }
]
const VERSION = '1.0.0'

const sse = (type: string, payload: object) =>
  `event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`

const head = (id: string) =>
  sse('message_start', {
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

const textStream = (text: string) =>
  [
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

test('ba mẫu cấu kiện dựng liên tiếp thì xếp chồng thành một mố', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('cad-agent-plugin.agent-mode', 'simple')
  })

  await page.route('**/api/templates', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        templates: PARTS.map(part => ({
          templateId: part.id,
          version: VERSION,
          status: 'published',
          name: part.name
        }))
      })
    })
  )
  for (const part of PARTS) {
    const code = fs.readFileSync(path.join(libDir, part.file), 'utf8')
    await page.route(`**/api/templates/${part.id}/${VERSION}`, route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ template: { code } })
      })
    )
  }

  let round = 0
  await page.route('**/api/ai/messages', async route => {
    round += 1
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' },
      body:
        round === 1
          ? toolCallStream([
              // No positions passed: the declared defaults are pre-stacked, so
              // three plain calls have to produce one abutment. If a default
              // datum ever drifts this is where it shows.
              ...PARTS.map((part, index) => ({
                id: `toolu_${index}`,
                name: 'chay_template',
                input: { ma_template: part.id, thong_so: {} }
              })),
              { id: 'toolu_zoom', name: 'zoom_extents', input: {} }
            ])
          : textStream('Đã dựng ba cấu kiện.')
    })
  })

  await page.setViewportSize({ width: 2200, height: 1200 })
  await page.goto('/')
  await uploadFixture(page, fixturePath)
  await expect(page.locator('.ml-cad-container')).toBeVisible()
  await page.getByRole('button', { name: /CAD\s*Agent/i }).click()
  await page.locator('.cad-agent-panel-root textarea').fill('dựng mố cầu từ ba cấu kiện')
  await page.locator('.cad-agent-send-btn').click()
  await expect(page.locator('.cad-agent-panel-root')).toContainText(
    'Đã dựng ba cấu kiện',
    { timeout: 60_000 }
  )

  // The assistant's zoom fires before the entities reach the scene, so frame
  // again once it has settled — see the note in template-hatch.spec.ts.
  await page.waitForTimeout(3000)
  await page.evaluate(async () => {
    const w = window as unknown as Record<string, any>
    const view = w.AcApDocManager.instance.context.view
    while (view.isProcessingEntities) await new Promise(r => setTimeout(r, 100))
    view.zoomToFitDrawing()
    await new Promise(r => setTimeout(r, 1500))
  })

  const parts = await page.evaluate(() => {
    const w = window as unknown as Record<string, any>
    const db = (w.AcApDocManager?.instance ?? w.acApDocManager).curDocument.database
    const out: Record<string, number[]> = {}
    for (const e of db.tables.blockTable.modelSpace.newIterator()) {
      // Grouped by layer rather than by reading the semantic tag back out of
      // XData: the role → layer map is what the drawing is organised by, and
      // the layer is on the entity without a decode step.
      const role = String(e.layer ?? '')
      if (!role || role === '0') continue
      const b = e.geometricExtents
      const box = out[role]
      out[role] = box
        ? [
            Math.min(box[0], b.min.x),
            Math.min(box[1], b.min.y),
            Math.max(box[2], b.max.x),
            Math.max(box[3], b.max.y)
          ]
        : [b.min.x, b.min.y, b.max.x, b.max.y]
    }
    return out
  })

  // All six parts present after three separate runs.
  // All six parts of the abutment, after three separate template runs.
  const LOP = {
    lot: 'KC-MO-BTLOT',
    be: 'KC-MO-BE',
    than: 'KC-MO-TUONGTHAN',
    dau: 'KC-MO-TUONGDAU',
    tai: 'KC-MO-TUONGTAI',
    phu: 'KC-LOPPHU'
  }
  for (const layer of Object.values(LOP)) {
    expect(parts[layer], `thiếu bộ phận trên layer ${layer}`).toBeDefined()
  }

  const bottom = (layer: string) => parts[layer][1]
  const top = (layer: string) => parts[layer][3]

  // Stacked, not floating: each part starts exactly where the one below ends.
  expect(bottom(LOP.be)).toBeCloseTo(top(LOP.lot), 3)
  expect(bottom(LOP.than)).toBeCloseTo(top(LOP.be), 3)

  // The stem's top is sloped, so it has no single elevation: across 7700 mm at
  // 2,00% it falls 154 mm. The backwall sits on that slope, so its lowest
  // point meets the stem's lowest top corner — this is the assertion that
  // would catch a component that stacked on the centreline elevation instead,
  // which looks right at the middle and gapes open at both edges.
  expect(top(LOP.than) - bottom(LOP.than)).toBeGreaterThan(0)
  expect(bottom(LOP.dau)).toBeCloseTo(top(LOP.than) - 154, 1)

  // Wearing course rests on the shoulder, inside the backwall's width.
  expect(parts[LOP.phu][0]).toBeGreaterThan(parts[LOP.dau][0])
  expect(parts[LOP.phu][2]).toBeLessThan(parts[LOP.dau][2])

  // Wing walls hang from the backwall top, within its height.
  expect(top(LOP.tai)).toBeLessThan(top(LOP.dau))
  expect(bottom(LOP.tai)).toBeGreaterThan(bottom(LOP.dau))

  // Stacked, not floating: each part starts where the one below ends.

  await page.locator('.ml-cad-container canvas').first().screenshot({
    path: '/tmp/claude-0/-srv-cad-viewer/0f952686-ec74-47b8-b919-c5c081824fa6/scratchpad/shots/mo-ghep.png'
  })
})
