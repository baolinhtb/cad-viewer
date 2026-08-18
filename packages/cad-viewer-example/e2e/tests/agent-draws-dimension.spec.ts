/**
 * A dimension the agent draws has to reach the screen.
 *
 * The entity can be constructed, tagged and appended and still render as
 * nothing: a dimension carries no geometry of its own — the arrows, extension
 * lines and text are built from a dimension style at draw time — so unit tests
 * that check the object prove very little about what an engineer sees.
 *
 * The model is stubbed with a scripted SSE reply, so this costs no tokens.
 */
import { expect, test } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { uploadFixture } from '../helpers/fileUpload'

const fixturePath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'fixtures',
  'minimal-line.dxf'
)

function sse(type: string, payload: object) {
  return `event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`
}

function toolCallStream(calls: { id: string; name: string; input: object }[]) {
  const events = [
    sse('message_start', {
      type: 'message_start',
      message: {
        id: 'msg_dim',
        type: 'message',
        role: 'assistant',
        model: 'claude-opus-5',
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 0 }
      }
    })
  ]
  calls.forEach((call, index) => {
    events.push(
      sse('content_block_start', {
        type: 'content_block_start',
        index,
        content_block: {
          type: 'tool_use',
          id: call.id,
          name: call.name,
          input: {}
        }
      })
    )
    events.push(
      sse('content_block_delta', {
        type: 'content_block_delta',
        index,
        delta: {
          type: 'input_json_delta',
          partial_json: JSON.stringify(call.input)
        }
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
    sse('message_start', {
      type: 'message_start',
      message: {
        id: 'msg_done',
        type: 'message',
        role: 'assistant',
        model: 'claude-opus-5',
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 0 }
      }
    }),
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

test('the agent can dimension what it draws, and it shows', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('cad-agent-plugin.agent-mode', 'simple')
  })

  let round = 0
  await page.route('**/api/ai/messages', async route => {
    round += 1
    await route.fulfill({
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache'
      },
      body:
        round === 1
          ? toolCallStream([
              {
                id: 'toolu_rect',
                name: 'draw_rectangle',
                input: {
                  corner1: { x: 0, y: 0 },
                  corner2: { x: 7700, y: 1500 }
                }
              },
              {
                id: 'toolu_dim_h',
                name: 'draw_dimension',
                input: {
                  start: { x: 0, y: 0 },
                  end: { x: 7700, y: 0 },
                  offset: 900,
                  huong: 'ngang'
                }
              },
              {
                id: 'toolu_dim_v',
                name: 'draw_dimension',
                input: {
                  start: { x: 7700, y: 0 },
                  end: { x: 7700, y: 1500 },
                  offset: 900,
                  huong: 'dung'
                }
              },
              { id: 'toolu_zoom', name: 'zoom_extents', input: {} }
            ])
          : textStream('Đã vẽ và ghi kích thước.')
    })
  })

  await page.setViewportSize({ width: 2200, height: 1200 })
  await page.goto('/')
  await uploadFixture(page, fixturePath)
  await expect(page.locator('.ml-cad-container')).toBeVisible()
  await page.getByRole('button', { name: /CAD\s*Agent/i }).click()
  await page.locator('.cad-agent-panel-root textarea').fill('vẽ bệ và ghi kích thước')
  await page.locator('.cad-agent-send-btn').click()

  await expect(page.locator('.cad-agent-panel-root')).toContainText(
    'Đã vẽ và ghi kích thước',
    { timeout: 60_000 }
  )

  const facts = await page.evaluate(() => {
    const w = window as unknown as Record<string, any>
    const db = (w.AcApDocManager?.instance ?? w.acApDocManager).curDocument.database
    const dims: { type: string; text: string; extents: number[] }[] = []
    for (const e of db.tables.blockTable.modelSpace.newIterator()) {
      const text = (e as any).dimensionText
      if (typeof text === 'string') {
        const b = e.geometricExtents
        dims.push({
          type: e.constructor?.name ?? '?',
          text,
          extents: [b?.min?.x, b?.min?.y, b?.max?.x, b?.max?.y]
        })
      }
    }
    return dims
  })

  // Two dimensions, each measuring its own axis rather than the diagonal.
  expect(facts).toHaveLength(2)
  expect(facts[0].text).toContain('7700')
  expect(facts[1].text).toContain('1500')
  for (const dim of facts) {
    for (const v of dim.extents) expect(Number.isFinite(v)).toBe(true)
  }

  // Each dimension must own the anonymous block that carries its arrows,
  // extension lines and text — without it the entity is in the drawing and
  // renders as nothing, which is precisely what happened the first time.
  const blocks = await page.evaluate(() => {
    const w = window as unknown as Record<string, any>
    const db = (w.AcApDocManager?.instance ?? w.acApDocManager).curDocument.database
    const ids: (string | null)[] = []
    for (const e of db.tables.blockTable.modelSpace.newIterator()) {
      if (typeof (e as any).dimensionText === 'string') {
        ids.push((e as any).dimBlockId ?? null)
      }
    }
    const defined = new Set<string>()
    for (const b of db.tables.blockTable.newIterator()) defined.add(b.name)
    return { ids, allDefined: ids.every(id => !!id && defined.has(id)) }
  })
  expect(blocks.ids).toHaveLength(2)
  expect(new Set(blocks.ids).size).toBe(2) // distinct blocks, not one reused
  expect(blocks.allDefined).toBe(true)

  // And it reaches the canvas. Counted inside the band the dimension chain
  // occupies and nowhere near the rectangle, so the rectangle alone cannot
  // satisfy it — the looser "any lit pixel" check passed while the dimensions
  // were invisible.
  const canvas = page.locator('.ml-cad-container canvas').first()
  const box = (await canvas.boundingBox())!
  const drawn = await canvas.screenshot()
  const litBelow = await page.evaluate(async b64 => {
    const image = new Image()
    image.src = `data:image/png;base64,${b64}`
    await image.decode()
    const probe = document.createElement('canvas')
    probe.width = image.naturalWidth
    probe.height = image.naturalHeight
    const c = probe.getContext('2d')!
    c.drawImage(image, 0, 0)
    // Bottom fifth of the view: the horizontal chain sits below the rectangle
    // once the view is zoomed to extents.
    const from = Math.floor(probe.height * 0.8)
    const { data } = c.getImageData(0, from, probe.width, probe.height - from)
    let n = 0
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] > 60 || data[i + 1] > 60 || data[i + 2] > 60) n += 1
    }
    return n
  }, drawn.toString('base64'))

  expect(box.width).toBeGreaterThan(0)
  expect(litBelow).toBeGreaterThan(200)
  await page.screenshot({
    path: process.env.DIM_SHOT ?? 'test-results/dimension.png'
  })
})
