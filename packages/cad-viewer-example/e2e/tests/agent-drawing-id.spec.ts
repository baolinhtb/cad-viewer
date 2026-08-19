/**
 * The server has to know which drawing an AI call was for.
 *
 * `ai_calls.drawing_id` existed from the first migration and the server always
 * read it from the request — but nothing ever sent one. On the deployment that
 * was 338 calls with it null, so neither "what did this drawing cost" nor "what
 * did the assistant do to it" could be answered.
 *
 * Checked at the network boundary, because the wiring runs through three
 * packages — storage owns the id, the host composes, the agent sends — and each
 * of them can be right on its own while the request still goes out unlabelled.
 *
 * The model is stubbed, so this costs no tokens.
 */
import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
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

const REPLY =
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
  }) +
  sse('content_block_start', {
    type: 'content_block_start',
    index: 0,
    content_block: { type: 'text', text: '' }
  }) +
  sse('content_block_delta', {
    type: 'content_block_delta',
    index: 0,
    delta: { type: 'text_delta', text: 'Đã xong.' }
  }) +
  sse('content_block_stop', { type: 'content_block_stop', index: 0 }) +
  sse('message_delta', {
    type: 'message_delta',
    delta: { stop_reason: 'end_turn', stop_sequence: null },
    usage: { output_tokens: 5 }
  }) +
  sse('message_stop', { type: 'message_stop' })

test('an unsaved drawing sends no id, and that is not an error', async ({
  page
}) => {
  // A file opened and never saved has no server id. The turn must still work.
  await page.addInitScript(() => {
    localStorage.setItem('cad-agent-plugin.agent-mode', 'simple')
  })

  const bodies: Record<string, unknown>[] = []
  await page.route('**/api/ai/messages', async route => {
    bodies.push(route.request().postDataJSON())
    await route.fulfill({
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache'
      },
      body: REPLY
    })
  })
  // No storage backend in the example app, so nothing can assign an id.
  await page.route('**/api/drawings**', route =>
    route.fulfill({ status: 404, body: '{}' })
  )

  await page.setViewportSize({ width: 2200, height: 1200 })
  await page.goto('/')
  await uploadFixture(page, fixturePath)
  await expect(page.locator('.ml-cad-container')).toBeVisible()
  await page.getByRole('button', { name: /CAD\s*Agent/i }).click()
  await page.locator('.cad-agent-panel-root textarea').fill('chào')
  await page.locator('.cad-agent-send-btn').click()
  await expect(page.locator('.cad-agent-panel-root')).toContainText('Đã xong.', {
    timeout: 30_000
  })

  expect(bodies).toHaveLength(1)
  expect(bodies[0]).not.toHaveProperty('drawingId')
})

test('a drawing reopened from the server labels every call with its id', async ({
  page
}) => {
  // The case that actually has an id. A file merely uploaded never gets one —
  // it is not saved anywhere — so its conversation stays in the browser, which
  // is the behaviour that was chosen.
  await page.addInitScript(() => {
    localStorage.setItem('cad-agent-plugin.agent-mode', 'simple')
  })

  const dxf = readFileSync(fixturePath, 'utf8')
  const bodies: Record<string, unknown>[] = []
  await page.route('**/api/ai/messages', async route => {
    bodies.push(route.request().postDataJSON())
    await route.fulfill({
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache'
      },
      body: REPLY
    })
  })

  await page.route('**/api/drawings', route =>
    route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        drawings: [
          {
            id: 'dwg_e2e',
            name: 'Bản vẽ thử',
            revision: 3,
            updatedAt: '2026-08-19 10:00:00'
          }
        ]
      })
    })
  )
  await page.route('**/api/drawings/dwg_e2e', route =>
    route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: 'dwg_e2e',
        name: 'Bản vẽ thử',
        revision: 3,
        dxf
      })
    })
  )

  await page.setViewportSize({ width: 2200, height: 1200 })
  await page.goto('/')
  await page.locator('.recent-item').first().click()
  await expect(page.locator('.ml-cad-container canvas').first()).toBeVisible({
    timeout: 60_000
  })

  await page.getByRole('button', { name: /CAD\s*Agent/i }).click()
  await page.locator('.cad-agent-panel-root textarea').fill('chào')
  await page.locator('.cad-agent-send-btn').click()
  await expect(page.locator('.cad-agent-panel-root')).toContainText('Đã xong.', {
    timeout: 30_000
  })

  expect(bodies).toHaveLength(1)
  expect(bodies[0].drawingId).toBe('dwg_e2e')
})
