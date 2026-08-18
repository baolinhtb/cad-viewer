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
 * A second message in the same conversation has to work.
 *
 * Every agent test so far sends exactly one message, and an engineer's real
 * session is "draw it" followed by "no, wider" — the correction is the whole
 * point of a drawing assistant. Driving the live app with a real model showed
 * the first turn drawing correctly and the second one dying with
 * `Invalid prompt: The messages must be a ModelMessage[]`, which no test could
 * have caught, because no test had a second turn.
 *
 * Both modes are exercised: high inference adds the screenshot and the
 * verification round to the history that the next turn has to carry.
 */

function sse(type: string, payload: object) {
  return `event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`
}

function messageStream(blocks: object[], stopReason: string) {
  const events = [
    sse('message_start', {
      type: 'message_start',
      message: {
        id: `msg_${Math.floor(Date.now() % 100000)}`,
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
    events.push(
      sse('content_block_start', {
        type: 'content_block_start',
        index,
        content_block: block
      })
    )
    if ('name' in block) {
      events.push(
        sse('content_block_delta', {
          type: 'content_block_delta',
          index,
          delta: {
            type: 'input_json_delta',
            partial_json: JSON.stringify(
              (block as { emit?: object }).emit ?? {}
            )
          }
        })
      )
    } else {
      events.push(
        sse('content_block_delta', {
          type: 'content_block_delta',
          index,
          delta: {
            type: 'text_delta',
            text: (block as { text: string }).text
          }
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
    })
  )
  events.push(sse('message_stop', { type: 'message_stop' }))
  return events.join('')
}

/** The verification round is a non-streaming `generateObject` call. */
function verificationReply(passed: boolean) {
  return JSON.stringify({
    id: 'msg_verify',
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-5',
    content: [
      {
        type: 'tool_use',
        id: 'toolu_verify',
        name: 'json',
        input: { passed, feedback: passed ? '' : 'thiếu lan can' }
      }
    ],
    stop_reason: 'tool_use',
    usage: { input_tokens: 10, output_tokens: 10 }
  })
}

async function openEditor(page: import('@playwright/test').Page) {
  await page.setViewportSize({ width: 2200, height: 1200 })
  await page.goto('/')
  await uploadFixture(page, fixturePath)
  await expect(page.locator('.ml-cad-container')).toBeVisible()
  await page.getByRole('button', { name: /CAD\s*Agent/i }).click()
}

async function sendMessage(
  page: import('@playwright/test').Page,
  text: string
) {
  await page.locator('.cad-agent-panel-root textarea').fill(text)
  await page.locator('.cad-agent-send-btn').click()
}

/**
 * Serves a whole two-turn conversation: draw on the first agent round, speak
 * on every later one, and pass every verification.
 */
async function routeModel(page: import('@playwright/test').Page) {
  let agentRounds = 0
  await page.route('**/api/ai/messages', async route => {
    const body = route.request().postDataJSON() as {
      tools?: { name: string }[]
    }
    const isVerification =
      body.tools?.length === 1 && body.tools[0].name === 'json'

    if (isVerification) {
      await route.fulfill({
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: verificationReply(true)
      })
      return
    }

    agentRounds += 1
    await route.fulfill({
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache'
      },
      body:
        agentRounds === 1
          ? messageStream(
              [
                // `get_drawing_context` first, and it matters that it is this
                // tool: on a drawing with no extents it answers with `NaN`
                // coordinates, which `JSON.stringify` renders as `null` and the
                // prompt schema rejects as "not a number" — but only on the
                // next turn, when the history is validated. A test that only
                // draws never carries such a result forward.
                {
                  type: 'tool_use',
                  id: 'toolu_0',
                  name: 'get_drawing_context',
                  input: {},
                  emit: {}
                },
                {
                  type: 'tool_use',
                  id: 'toolu_1',
                  name: 'draw_line',
                  input: {},
                  emit: { start: { x: 0, y: 0 }, end: { x: 1000, y: 500 } }
                }
              ],
              'tool_use'
            )
          : messageStream(
              [{ type: 'text', text: `Xong lượt ${agentRounds}.` }],
              'end_turn'
            )
    })
  })
  return () => agentRounds
}

for (const mode of ['simple', 'high-inference'] as const) {
  test(`a second message in the same conversation is answered (${mode})`, async ({
    page
  }) => {
    await page.addInitScript(selected => {
      localStorage.setItem('cad-agent-plugin.agent-mode', selected)
    }, mode)

    await routeModel(page)
    await openEditor(page)

    await sendMessage(page, 'vẽ một đường')
    await expect(page.locator('.cad-agent-panel-root')).toContainText(
      'Xong lượt',
      {
        timeout: 30_000
      }
    )

    await sendMessage(page, 'sửa lại cho rộng hơn')

    // The turn has to produce an answer, and must not produce the SDK's
    // "Invalid prompt" — the failure that made corrections impossible.
    await expect(page.locator('.cad-agent-panel-root')).not.toContainText(
      /Invalid prompt|ModelMessage/i,
      { timeout: 30_000 }
    )
    await expect(page.locator('.cad-agent-panel-root')).toContainText(
      'sửa lại cho rộng hơn'
    )
    await expect(page.locator('.cad-agent-panel-root')).toContainText(
      /Xong lượt [2-9]/,
      { timeout: 30_000 }
    )
  })
}

/**
 * The sequence a real bridge session produces.
 *
 * The test above carries a `get_drawing_context` result into the second turn,
 * which is the case that was fixed. A reported session died on a different one:
 * `chay_template` then `mo_ta_ban_ve`, run against a drawing that a template had
 * just filled. Those results describe every part in the drawing, so they carry
 * far more numbers than a drawing context does — and one number that is not
 * finite kills the next turn wherever it sits, with a message that blames the
 * message type rather than the field.
 */
test('a template run and a description survive into the next turn', async ({
  page
}) => {
  await page.addInitScript(() => {
    localStorage.setItem('cad-agent-plugin.agent-mode', 'high-inference')
  })

  let agentRounds = 0
  await page.route('**/api/ai/messages', async route => {
    const body = route.request().postDataJSON() as { tools?: { name: string }[] }
    if (body.tools?.length === 1 && body.tools[0].name === 'json') {
      await route.fulfill({
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: verificationReply(true)
      })
      return
    }

    agentRounds += 1
    await route.fulfill({
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache'
      },
      body:
        agentRounds === 1
          ? messageStream(
              [
                {
                  type: 'tool_use',
                  id: 'toolu_ctx',
                  name: 'get_drawing_context',
                  input: {},
                  emit: {}
                },
                {
                  type: 'tool_use',
                  id: 'toolu_tpl',
                  name: 'chay_template',
                  input: {},
                  emit: { ma_template: 'cau_ban_btct', thong_so: {} }
                },
                {
                  type: 'tool_use',
                  id: 'toolu_zoom',
                  name: 'zoom_extents',
                  input: {},
                  emit: {}
                },
                {
                  type: 'tool_use',
                  id: 'toolu_desc',
                  name: 'mo_ta_ban_ve',
                  input: {},
                  emit: {}
                }
              ],
              'tool_use'
            )
          : messageStream(
              [{ type: 'text', text: `Xong lượt ${agentRounds}.` }],
              'end_turn'
            )
    })
  })

  await openEditor(page)
  await sendMessage(page, 'vẽ cầu bản BTCT')
  await expect(page.locator('.cad-agent-panel-root')).toContainText(
    'Xong lượt',
    { timeout: 60_000 }
  )

  await sendMessage(page, 'Bổ sung thêm chân cầu')

  await expect(page.locator('.cad-agent-panel-root')).not.toContainText(
    /Invalid prompt|ModelMessage/i,
    { timeout: 60_000 }
  )
  await expect(page.locator('.cad-agent-panel-root')).toContainText(
    /Xong lượt [2-9]/,
    { timeout: 60_000 }
  )
})
