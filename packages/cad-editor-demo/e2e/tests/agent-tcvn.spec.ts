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
 * The standards lookup has to complete a full round trip in the real app.
 *
 * Unit tests prove the module builds the right request and the server ranks
 * the right clause, and both can be true while the assistant still draws
 * invented numbers — if the tool is never offered to the model, or its result
 * never travels back into the next request. That middle stretch runs through
 * the AI SDK, the tool executor and the panel, and only the browser exercises
 * it. So the model is faked at the network boundary and everything else is
 * real.
 */

/** One Anthropic SSE event. */
function sse(type: string, payload: object) {
  return `event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`
}

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

function textStream(text: string) {
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
      delta: { stop_reason: 'end_turn', stop_sequence: null },
      usage: { output_tokens: 5 }
    }),
    sse('message_stop', { type: 'message_stop' })
  ].join('')
}

const CLAUSE_TEXT =
  'Chiều cao lan can phải nhỏ nhất 685mm đối với cấp thử nghiệm TL-3, 810mm đối với cấp thử nghiệm TL-4.'

test('a clause the model looked up travels back into the next request', async ({
  page
}) => {
  await page.addInitScript(() => {
    localStorage.setItem('cad-agent-plugin.agent-mode', 'simple')
  })

  const lookups: string[] = []
  await page.route('**/api/tcvn/search*', async route => {
    lookups.push(new URL(route.request().url()).searchParams.get('q') ?? '')
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        results: [
          {
            standard: 'TCVN 11823-13:2017',
            title: 'Thiết kế cầu đường bộ - Phần 13: Lan can',
            clause: '7 LAN CAN ĐƯỜNG Ô TÔ › 7.3.2.1 Chiều cao',
            text: CLAUSE_TEXT,
            truncated: false,
            score: 32.2
          }
        ]
      })
    })
  })

  const requestBodies: string[] = []
  let round = 0
  await page.route('**/api/ai/messages', async route => {
    round += 1
    requestBodies.push(route.request().postData() ?? '')
    await route.fulfill({
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache'
      },
      body:
        round === 1
          ? toolCallStream('tra_cuu_tieu_chuan', {
              cau_hoi: 'chiều cao lan can TL-4'
            })
          : textStream('Lan can cao 810mm theo TCVN 11823-13:2017.')
    })
  })

  await page.setViewportSize({ width: 2200, height: 1200 })
  await page.goto('/')
  await uploadFixture(page, fixturePath)
  await expect(page.locator('.ml-cad-container')).toBeVisible()

  await page.getByRole('button', { name: /CAD\s*Agent/i }).click()
  await page
    .locator('.cad-agent-panel-root textarea')
    .fill('lan can cầu cao bao nhiêu')
  await page.locator('.cad-agent-send-btn').click()

  await expect(page.locator('.cad-agent-panel-root')).toContainText(
    'TCVN 11823-13:2017',
    { timeout: 30_000 }
  )

  // The model asked the corpus the question it was given, verbatim.
  expect(lookups).toEqual(['chiều cao lan can TL-4'])

  // And the clause came back far enough to be used: it is in the very next
  // request, which is the only way the model can quote a number it did not
  // already believe.
  expect(requestBodies.length).toBeGreaterThanOrEqual(2)
  expect(requestBodies[1]).toContain('810mm')
  expect(requestBodies[1]).toContain('TCVN 11823-13:2017')
})

test('the assistant is told when the corpus is not installed', async ({
  page
}) => {
  // A deployment without the standards must not look like a deployment whose
  // standards happen to say nothing: the first is a missing capability the
  // engineer needs to hear about, the second is an answer.
  await page.addInitScript(() => {
    localStorage.setItem('cad-agent-plugin.agent-mode', 'simple')
  })

  await page.route('**/api/tcvn/search*', async route => {
    await route.fulfill({
      status: 503,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        error: 'Bộ tiêu chuẩn chưa được cài đặt trên máy chủ.',
        code: 'tcvn_no_corpus'
      })
    })
  })

  const requestBodies: string[] = []
  let round = 0
  await page.route('**/api/ai/messages', async route => {
    round += 1
    requestBodies.push(route.request().postData() ?? '')
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
      body:
        round === 1
          ? toolCallStream('tra_cuu_tieu_chuan', { cau_hoi: 'bề rộng làn xe' })
          : textStream('Chưa đối chiếu được với TCVN.')
    })
  })

  await page.setViewportSize({ width: 2200, height: 1200 })
  await page.goto('/')
  await uploadFixture(page, fixturePath)
  await expect(page.locator('.ml-cad-container')).toBeVisible()

  await page.getByRole('button', { name: /CAD\s*Agent/i }).click()
  await page.locator('.cad-agent-panel-root textarea').fill('bề rộng làn xe')
  await page.locator('.cad-agent-send-btn').click()

  await expect(page.locator('.cad-agent-panel-root')).toContainText(
    'Chưa đối chiếu được với TCVN.',
    { timeout: 30_000 }
  )

  // The turn continued — a missing corpus is an outcome, not a crash — and the
  // model was told why in the message it received.
  expect(requestBodies.length).toBeGreaterThanOrEqual(2)
  expect(requestBodies[1]).toContain('chưa được cài đặt')
})
