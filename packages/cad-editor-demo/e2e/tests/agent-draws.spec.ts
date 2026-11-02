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

/**
 * A tool call from the model has to end up as geometry on the canvas.
 *
 * Every test around the agent so far stopped at "the panel accepts input".
 * The half that matters to an engineer — the model says draw, and a line
 * appears — was never exercised anywhere, because it needs a model. So the
 * model is faked at the network boundary instead: the panel, the AI SDK, the
 * tool executor, the undo group, the database and the renderer are all the
 * real ones.
 */

/** One Anthropic SSE event. */
function sse(type: string, payload: object) {
  return `event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`
}

/** A streamed response whose only content is one `draw_line` tool call. */
function toolCallStream(name: string, input: object) {
  return [
    sse('message_start', {
      type: 'message_start',
      message: {
        id: 'msg_1',
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
      content_block: { type: 'tool_use', id: 'toolu_1', name, input: {} }
    }),
    sse('content_block_delta', {
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'input_json_delta', partial_json: JSON.stringify(input) }
    }),
    sse('content_block_stop', { type: 'content_block_stop', index: 0 }),
    sse('message_delta', {
      type: 'message_delta',
      delta: { stop_reason: 'tool_use', stop_sequence: null },
      usage: { output_tokens: 20 }
    }),
    sse('message_stop', { type: 'message_stop' })
  ].join('')
}

/** A streamed response that just says something and stops. */
function textStream(text: string, stopReason = 'end_turn') {
  return [
    sse('message_start', {
      type: 'message_start',
      message: {
        id: 'msg_2',
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
      delta: { stop_reason: stopReason, stop_sequence: null },
      usage: { output_tokens: 5 }
    }),
    sse('message_stop', { type: 'message_stop' })
  ].join('')
}

test('a tool call from the model puts geometry in the drawing', async ({
  page
}) => {
  // Simple mode: the verification loop needs a vision round-trip that this
  // fake has no business imitating, and it is not what is under test.
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
          ? toolCallStream('draw_line', {
              start: { x: 0, y: 0 },
              end: { x: 1000, y: 500 }
            })
          : textStream('Đã vẽ xong.')
    })
  })

  await page.setViewportSize({ width: 2200, height: 1200 })
  await page.goto('/')
  await uploadFixture(page, fixturePath)
  await expect(page.locator('.ml-cad-container')).toBeVisible()

  await page.getByRole('button', { name: /CAD\s*Agent/i }).click()
  await page.locator('.cad-agent-panel-root textarea').fill('vẽ một đường')

  // Taken after the palette is open and the canvas has been resized by it.
  // Screenshotting before that made the comparison pass on the relayout
  // alone — green whether or not anything was ever drawn.
  await expect(page.locator('.cad-agent-send-btn')).toBeEnabled()
  await page.waitForTimeout(1500)
  const before = await page
    .locator('.ml-cad-container canvas')
    .first()
    .screenshot()

  await page.locator('.cad-agent-send-btn').click()

  // The model answered; the drawing has to have changed.
  await expect(page.locator('.cad-agent-panel-root')).toContainText(
    'Đã vẽ xong.',
    { timeout: 30_000 }
  )
  expect(round).toBeGreaterThanOrEqual(2)

  await page.waitForTimeout(1500)
  const after = await page
    .locator('.ml-cad-container canvas')
    .first()
    .screenshot()
  expect(Buffer.compare(before, after)).not.toBe(0)
})

test('the request carries enough room to emit a whole drawing step', async ({
  page
}) => {
  await page.addInitScript(() => {
    localStorage.setItem('cad-agent-plugin.agent-mode', 'simple')
  })

  const budgets: number[] = []
  await page.route('**/api/ai/messages', async route => {
    const body = route.request().postDataJSON() as { max_tokens?: number }
    budgets.push(body.max_tokens ?? 0)
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
      body: textStream('Xong.')
    })
  })

  await page.setViewportSize({ width: 2200, height: 1200 })
  await page.goto('/')
  await uploadFixture(page, fixturePath)
  await expect(page.locator('.ml-cad-container')).toBeVisible()
  await page.getByRole('button', { name: /CAD\s*Agent/i }).click()
  await page.locator('.cad-agent-panel-root textarea').fill('vẽ cây cầu')
  await page.locator('.cad-agent-send-btn').click()
  await expect(page.locator('.cad-agent-panel-root')).toContainText('Xong.', {
    timeout: 30_000
  })

  // Measured against the real request the app sends. At the SDK default the
  // model is cut off partway through emitting its tool calls, and a truncated
  // tool call never runs — the drawing stays empty with no error shown.
  expect(budgets[0]).toBeGreaterThanOrEqual(16_000)
})

test('a step cut off by the limit says so instead of going quiet', async ({
  page
}) => {
  await page.addInitScript(() => {
    localStorage.setItem('cad-agent-plugin.agent-mode', 'simple')
  })

  await page.route('**/api/ai/messages', async route => {
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
      // Ends on max_tokens, which is what the model does when it runs out of
      // room in the middle of emitting tool calls.
      body: textStream('Bắt đầu vẽ…', 'max_tokens')
    })
  })

  await page.setViewportSize({ width: 2200, height: 1200 })
  await page.goto('/')
  await uploadFixture(page, fixturePath)
  await expect(page.locator('.ml-cad-container')).toBeVisible()
  await page.getByRole('button', { name: /CAD\s*Agent/i }).click()
  await page.locator('.cad-agent-panel-root textarea').fill('vẽ cây cầu')
  await page.locator('.cad-agent-send-btn').click()

  await expect(page.locator('.cad-agent-panel-root')).toContainText(
    /cut off by the output limit/i,
    { timeout: 30_000 }
  )
})
