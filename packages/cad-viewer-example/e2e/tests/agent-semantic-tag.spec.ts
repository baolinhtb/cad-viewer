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
 * What the assistant draws has to be findable again on the next message.
 *
 * Before this, geometry the assistant produced carried no semantic tag, so the
 * only way it could act on "nâng lan can lên" was to remember the object ids
 * it had used earlier in the conversation. That memory dies on reload, is
 * truncated as the session grows, and never existed for a drawing somebody
 * else made — which is why every correction was a guess against coordinates.
 *
 * This drives the real database and the real digest reader: the model is faked
 * at the network boundary, the tag is written by the actual executor, and the
 * assertion is on what comes *back* to the model on the following turn.
 */

function sse(type: string, payload: object) {
  return `event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`
}

/**
 * Pulls the tool results out of a provider request.
 *
 * Asserting on the raw body would mean matching JSON that has been escaped
 * into a string inside more JSON — a test that fails on a quoting detail while
 * the behaviour is correct, which is exactly what it did the first time.
 */
function toolResults(requestBody: string): unknown[] {
  const parsed = JSON.parse(requestBody) as {
    messages: { content: unknown }[]
  }
  const results: unknown[] = []

  for (const message of parsed.messages) {
    if (!Array.isArray(message.content)) continue
    for (const part of message.content as {
      type: string
      content: unknown
    }[]) {
      if (part.type !== 'tool_result') continue

      // A tool result arrives either as a plain string or as content blocks,
      // depending on how the provider serialises it. Handling one shape only
      // is a test that passes or fails on that choice rather than on the
      // behaviour it is meant to check.
      const texts: string[] =
        typeof part.content === 'string'
          ? [part.content]
          : Array.isArray(part.content)
            ? (part.content as { text?: string }[])
                .map(block => block.text)
                .filter((text): text is string => typeof text === 'string')
            : []

      for (const text of texts) {
        try {
          results.push(JSON.parse(text))
        } catch {
          results.push(text)
        }
      }
    }
  }
  return results
}

/** The drawing context among a request's tool results, if it carries one. */
function drawingContextOf(requestBody: string) {
  return toolResults(requestBody).find(
    (result): result is Record<string, unknown> =>
      typeof result === 'object' &&
      result !== null &&
      'semanticStatus' in result
  )
}

type Block = { type: 'text'; text: string } | { name: string; emit: object }

function messageStream(blocks: Block[], stopReason: string) {
  const events = [
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
    })
  ]

  blocks.forEach((block, index) => {
    if ('name' in block) {
      events.push(
        sse('content_block_start', {
          type: 'content_block_start',
          index,
          content_block: {
            type: 'tool_use',
            id: `toolu_${index}`,
            name: block.name,
            input: {}
          }
        }),
        sse('content_block_delta', {
          type: 'content_block_delta',
          index,
          delta: {
            type: 'input_json_delta',
            partial_json: JSON.stringify(block.emit)
          }
        })
      )
    } else {
      events.push(
        sse('content_block_start', {
          type: 'content_block_start',
          index,
          content_block: { type: 'text', text: '' }
        }),
        sse('content_block_delta', {
          type: 'content_block_delta',
          index,
          delta: { type: 'text_delta', text: block.text }
        })
      )
    }
    events.push(
      sse('content_block_stop', { type: 'content_block_stop', index })
    )
  })

  events.push(
    sse('message_delta', {
      type: 'message_delta',
      delta: { stop_reason: stopReason, stop_sequence: null },
      usage: { output_tokens: 20 }
    }),
    sse('message_stop', { type: 'message_stop' })
  )
  return events.join('')
}

test('geometry the assistant draws is findable again on the next message', async ({
  page
}) => {
  // Simple mode: the verification round needs a vision model and is not what
  // is under test here.
  await page.addInitScript(() => {
    localStorage.setItem('cad-agent-plugin.agent-mode', 'simple')
  })

  const requestBodies: string[] = []
  let round = 0
  await page.route('**/api/ai/messages', async route => {
    round += 1
    requestBodies.push(route.request().postData() ?? '')

    const body =
      round === 1
        ? // Declare the part, then draw it — the order the prompt asks for.
          messageStream(
            [
              {
                name: 'dat_bo_phan_hien_tai',
                emit: {
                  bo_phan: 'lan_can',
                  ben: 'trai',
                  thong_so: { chieu_cao: 810 }
                }
              },
              {
                name: 'draw_polyline',
                emit: {
                  points: [
                    { x: 0, y: 0 },
                    { x: 0, y: 810 },
                    { x: 250, y: 810 }
                  ]
                }
              }
            ],
            'tool_use'
          )
        : round === 2
          ? messageStream(
              [{ type: 'text', text: 'Đã vẽ lan can trái.' }],
              'end_turn'
            )
          : round === 3
            ? // The second message starts by reading the drawing back.
              messageStream(
                [{ name: 'get_drawing_context', emit: {} }],
                'tool_use'
              )
            : messageStream(
                [{ type: 'text', text: 'Đã đọc xong bản vẽ.' }],
                'end_turn'
              )

    await route.fulfill({
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache'
      },
      body
    })
  })

  await page.setViewportSize({ width: 2200, height: 1200 })
  await page.goto('/')
  await uploadFixture(page, fixturePath)
  await expect(page.locator('.ml-cad-container')).toBeVisible()
  await page.getByRole('button', { name: /CAD\s*Agent/i }).click()

  await page
    .locator('.cad-agent-panel-root textarea')
    .fill('vẽ lan can bên trái')
  await page.locator('.cad-agent-send-btn').click()
  await expect(page.locator('.cad-agent-panel-root')).toContainText(
    'Đã vẽ lan can trái.',
    { timeout: 30_000 }
  )

  await page
    .locator('.cad-agent-panel-root textarea')
    .fill('bản vẽ đang có những gì')
  await page.locator('.cad-agent-send-btn').click()
  await expect(page.locator('.cad-agent-panel-root')).toContainText(
    'Đã đọc xong bản vẽ.',
    { timeout: 30_000 }
  )

  // The request after `get_drawing_context` carries its result. The part has
  // to be in there, addressed by name and carrying the value it was drawn to —
  // read out of the database, not recalled from the transcript.
  const context = drawingContextOf(requestBodies[3])
  expect(context).toBeDefined()
  expect(context!.semanticStatus).toBe('tagged')
  expect(context!.parts).toEqual([
    expect.objectContaining({
      role: 'lan_can',
      partId: 'lan_can_trai',
      entityCount: 1,
      params: { chieu_cao: 810 }
    })
  ])
})

test('geometry drawn without declaring a part is reported as untagged', async ({
  page
}) => {
  // "No parts" and "this drawing cannot be asked about parts" are different
  // answers. Conflating them is how an assistant says "there is no railing
  // here" about a drawing that is entirely railing.
  await page.addInitScript(() => {
    localStorage.setItem('cad-agent-plugin.agent-mode', 'simple')
  })

  const requestBodies: string[] = []
  let round = 0
  await page.route('**/api/ai/messages', async route => {
    round += 1
    requestBodies.push(route.request().postData() ?? '')
    const body =
      round === 1
        ? messageStream(
            [
              {
                name: 'draw_line',
                emit: { start: { x: 0, y: 0 }, end: { x: 1000, y: 0 } }
              },
              { name: 'get_drawing_context', emit: {} }
            ],
            'tool_use'
          )
        : messageStream([{ type: 'text', text: 'Xong.' }], 'end_turn')

    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
      body
    })
  })

  await page.setViewportSize({ width: 2200, height: 1200 })
  await page.goto('/')
  await uploadFixture(page, fixturePath)
  await expect(page.locator('.ml-cad-container')).toBeVisible()
  await page.getByRole('button', { name: /CAD\s*Agent/i }).click()
  await page
    .locator('.cad-agent-panel-root textarea')
    .fill('vẽ một đường gióng')
  await page.locator('.cad-agent-send-btn').click()
  await expect(page.locator('.cad-agent-panel-root')).toContainText('Xong.', {
    timeout: 30_000
  })

  const context = drawingContextOf(requestBodies[1])
  expect(context).toBeDefined()
  expect(context!.semanticStatus).toBe('untagged')
  expect(context!.parts).toEqual([])
  // The line just drawn, plus whatever the fixture holds.
  expect(context!.untaggedEntityCount).toBeGreaterThan(0)
})
