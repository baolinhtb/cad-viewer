/**
 * Switching palette tabs must not throw the conversation away.
 *
 * The agent panel is one tab among Layers, Properties and Count, and the
 * palette renders exactly one of them with `v-else-if` — so leaving the tab
 * unmounts the panel and returning builds a new one. Everything the session
 * holds lives inside that component, so the history goes; and if a turn is in
 * flight its stream is cut mid-way, which can leave the drawing half-edited
 * with nothing on screen to say so.
 *
 * The model is stubbed with a stream held open on purpose, so this costs no
 * tokens and can reproduce the in-flight case deterministically.
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

const START = sse('message_start', {
  type: 'message_start',
  message: {
    id: 'msg_slow',
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-5',
    content: [],
    stop_reason: null,
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 0 }
  }
}) +
  sse('content_block_start', {
    type: 'content_block_start',
    index: 0,
    content_block: { type: 'text', text: '' }
  }) +
  sse('content_block_delta', {
    type: 'content_block_delta',
    index: 0,
    delta: { type: 'text_delta', text: 'Đang dựng phần đầu' }
  })

const END = sse('content_block_delta', {
  type: 'content_block_delta',
  index: 0,
  delta: { type: 'text_delta', text: ' và đã xong.' }
}) +
  sse('content_block_stop', { type: 'content_block_stop', index: 0 }) +
  sse('message_delta', {
    type: 'message_delta',
    delta: { stop_reason: 'end_turn', stop_sequence: null },
    usage: { output_tokens: 20 }
  }) +
  sse('message_stop', { type: 'message_stop' })

async function openAgent(page: import('@playwright/test').Page) {
  await page.setViewportSize({ width: 2200, height: 1200 })
  await page.goto('/')
  await uploadFixture(page, fixturePath)
  await expect(page.locator('.ml-cad-container')).toBeVisible()
  await page.getByRole('button', { name: /CAD\s*Agent/i }).click()
  await expect(page.locator('.cad-agent-panel-root')).toBeVisible()
}

test('a turn in flight survives a trip to another palette tab', async ({
  page
}) => {
  await page.addInitScript(() => {
    localStorage.setItem('cad-agent-plugin.agent-mode', 'simple')
  })

  // Held open until the test releases it, so the turn is genuinely mid-stream
  // while the tab changes.
  let release: (() => void) | undefined
  const held = new Promise<void>(resolve => {
    release = resolve
  })

  await page.route('**/api/ai/messages', async route => {
    await route.fulfill({
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache'
      },
      body: START + (await held.then(() => END))
    })
  })

  await openAgent(page)
  await page.locator('.cad-agent-panel-root textarea').fill('vẽ giúp tôi cái bệ')
  await page.locator('.cad-agent-send-btn').click()

  // The user's own message is on screen before anything else happens.
  await expect(page.locator('.cad-agent-panel-root')).toContainText(
    'vẽ giúp tôi cái bệ'
  )

  // Away to Layers and back, while the answer is still streaming.
  await page.getByRole('tab', { name: /Layer/i }).first().click()
  await expect(page.locator('.cad-agent-panel-root')).toBeHidden()
  // Back via the ribbon button rather than the tab: the palette is narrow, so
  // once another tab is active the assistant folds into the `»` overflow, and
  // the ribbon is the route a user actually takes.
  await page.getByRole('button', { name: /CAD\s*Agent/i }).click()
  await expect(page.locator('.cad-agent-panel-root')).toBeVisible()

  // What was said must still be there.
  await expect(page.locator('.cad-agent-panel-root')).toContainText(
    'vẽ giúp tôi cái bệ'
  )

  release!()

  // And the turn must finish, in the panel the user is looking at.
  await expect(page.locator('.cad-agent-panel-root')).toContainText(
    'và đã xong.',
    { timeout: 30_000 }
  )
})
