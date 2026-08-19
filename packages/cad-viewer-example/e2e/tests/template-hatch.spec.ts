/**
 * A hatch a template draws has to reach the screen as filled pixels.
 *
 * The entity can be constructed, tagged, appended and round-trip through DXF
 * while rendering as nothing: a hatch carries no strokes of its own — the fill
 * is computed from the boundary loops at draw time — so a boundary that does
 * not close, or a pattern the renderer cannot resolve, produces an object
 * every unit test is happy with and an engineer sees an empty outline. That is
 * exactly how the first dimension shipped.
 *
 * The template library and the model are both stubbed, so this costs nothing.
 */
import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { uploadFixture } from '../helpers/fileUpload'

/** Lit (non-background) pixels on the drawing canvas. */
async function countLitPixels(page: import('@playwright/test').Page) {
  const canvas = page.locator('.ml-cad-container canvas').first()
  const pngBase64 = (await canvas.screenshot()).toString('base64')
  return page.evaluate(async imageBase64 => {
    const image = new Image()
    image.src = `data:image/png;base64,${imageBase64}`
    await image.decode()
    const probe = document.createElement('canvas')
    probe.width = image.naturalWidth
    probe.height = image.naturalHeight
    const ctx = probe.getContext('2d')
    if (!ctx) throw new Error('no 2d context for the screenshot probe')
    ctx.drawImage(image, 0, 0)
    const { data } = ctx.getImageData(0, 0, probe.width, probe.height)
    let count = 0
    for (let i = 0; i < data.length; i += 4) {
      // The viewer's background is near-black; anything appreciably brighter
      // is drawn content.
      if (data[i] + data[i + 1] + data[i + 2] > 90) count++
    }
    return count
  }, pngBase64)
}

const here = path.dirname(fileURLToPath(import.meta.url))
const fixturePath = path.resolve(here, '..', 'fixtures', 'minimal-line.dxf')
const templatePath = path.resolve(
  here,
  '..',
  '..',
  '..',
  'cad-template-plugin',
  'library',
  'mo_cau_btct.js'
)

const TEMPLATE_ID = 'mo_cau_btct'
const VERSION = '3.1.0'

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

/**
 * Runs the abutment template in a fresh page and returns what was drawn.
 *
 * `code` is served as the library template, so the caller can hand in a
 * variant — that is how the fill is isolated below.
 */
async function drawAbutment(page: import('@playwright/test').Page, code: string) {
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
            name: 'Mố cầu BTCT'
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
          : textStream('Đã dựng mố.')
    })
  })

  await page.setViewportSize({ width: 2200, height: 1200 })
  await page.goto('/')
  await uploadFixture(page, fixturePath)
  await expect(page.locator('.ml-cad-container')).toBeVisible()
  await page.getByRole('button', { name: /CAD\s*Agent/i }).click()
  await page.locator('.cad-agent-panel-root textarea').fill('dựng mố cầu')
  await page.locator('.cad-agent-send-btn').click()
  await expect(page.locator('.cad-agent-panel-root')).toContainText('Đã dựng mố', {
    timeout: 60_000
  })
  // The scene converts asynchronously after the tool results land, and the
  // agent's zoom fires before that finishes — so wait for conversion and frame
  // the drawing again. Without this the canvas is whatever the early fit left
  // behind, and two runs of it compare one blank screen against another.
  // The agent's own `zoom_extents` fires before the drawn entities have
  // reached the scene — measured: at that moment the view reports nothing
  // pending and a scene box of [0,0,0,0], so it frames an empty drawing and
  // nothing re-frames it afterwards. That is a separate defect; this test
  // works around it by framing again once the scene has settled, otherwise
  // both runs below compare one misframed canvas against another.
  await page.waitForTimeout(3000)
  await page.evaluate(async () => {
    const w = window as unknown as Record<string, any>
    const view = w.AcApDocManager.instance.context.view
    while (view.isProcessingEntities) await new Promise(r => setTimeout(r, 100))
    view.zoomToFitDrawing()
    await new Promise(r => setTimeout(r, 1500))
  })

  const hatches = await page.evaluate(() => {
    const w = window as unknown as Record<string, any>
    const db = (w.AcApDocManager?.instance ?? w.acApDocManager).curDocument.database
    const out: { layer: string; solid: boolean; box: number[] }[] = []
    for (const e of db.tables.blockTable.modelSpace.newIterator()) {
      if (e.dxfTypeName !== 'HATCH') continue
      const b = e.geometricExtents
      out.push({
        layer: e.layer,
        solid: !!(e as any).isSolidFill,
        box: [b.min.x, b.min.y, b.max.x, b.max.y]
      })
    }
    return out
  })

  return { hatches, lit: await countLitPixels(page) }
}

test('tường tai do template vẽ được tô đặc, và vệt tô lên tới màn hình', async ({
  page
}) => {
  const code = fs.readFileSync(templatePath, 'utf8')
  // Same template with the fill calls short-circuited. Everything else — the
  // outlines, the annotation, the camera the view settles at — is identical,
  // so the difference in lit pixels is the fill and nothing else. Comparing
  // against an erase in the same page proved nothing: erasing an entity does
  // not necessarily take it out of the rendered scene, so the counts matched
  // whether or not the fill had ever been drawn.
  const withoutFill = code.replace(/ctx\.hatch\(\{/g, 'false && ctx.hatch({')
  expect(withoutFill).not.toBe(code)

  const drawn = await drawAbutment(page, code)

  expect(drawn.hatches).toHaveLength(2)
  for (const h of drawn.hatches) {
    expect(h.solid).toBe(true)
    // 150 wide, 1200 tall — the wing wall as measured off the assembly drawing.
    expect(h.box[2] - h.box[0]).toBeCloseTo(150, 0)
    expect(h.box[3] - h.box[1]).toBeCloseTo(1200, 0)
  }

  const plain = await drawAbutment(page, withoutFill)
  expect(plain.hatches).toHaveLength(0)

  // Two fills of 150×1200 drawing units at whatever zoom the view settled at.
  // Measured at 2,244 pixels; the threshold is well under that so a change of
  // zoom does not make this brittle, and well over zero because a hatch that
  // renders as nothing leaves the two counts equal — which is what happened
  // here, and which every assertion above still passes.
  expect(drawn.lit - plain.lit).toBeGreaterThan(1000)
})
