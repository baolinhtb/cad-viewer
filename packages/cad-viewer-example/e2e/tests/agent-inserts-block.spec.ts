/**
 * Standard details are blocks, and the agent has to be able to place them.
 *
 * The reference abutment drawing an engineer sent inserts one block nine times
 * — a level callout carrying its value as an attribute. Redrawing that symbol
 * stroke by stroke would cost a dozen tool calls, lose the office's own symbol,
 * and leave nothing an attribute edit could reach. Neither listing nor
 * inserting existed before this.
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
  'block-with-attribute.dxf'
)

function sse(type: string, payload: object) {
  return `event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`
}

function start(id: string) {
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

function stop(reason: string) {
  return (
    sse('message_delta', {
      type: 'message_delta',
      delta: { stop_reason: reason, stop_sequence: null },
      usage: { output_tokens: 10 }
    }) + sse('message_stop', { type: 'message_stop' })
  )
}

function toolCalls(calls: { id: string; name: string; input: object }[]) {
  let body = start('msg_tools')
  calls.forEach((call, index) => {
    body += sse('content_block_start', {
      type: 'content_block_start',
      index,
      content_block: { type: 'tool_use', id: call.id, name: call.name, input: {} }
    })
    body += sse('content_block_delta', {
      type: 'content_block_delta',
      index,
      delta: {
        type: 'input_json_delta',
        partial_json: JSON.stringify(call.input)
      }
    })
    body += sse('content_block_stop', { type: 'content_block_stop', index })
  })
  return body + stop('tool_use')
}

function say(text: string) {
  return (
    start('msg_text') +
    sse('content_block_start', {
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'text', text: '' }
    }) +
    sse('content_block_delta', {
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'text_delta', text }
    }) +
    sse('content_block_stop', { type: 'content_block_stop', index: 0 }) +
    stop('end_turn')
  )
}

test('the agent lists the drawing’s blocks and inserts one with its attribute', async ({
  page
}) => {
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
          ? toolCalls([
              { id: 'toolu_list', name: 'list_blocks', input: {} },
              {
                id: 'toolu_ins',
                name: 'insert_block',
                input: {
                  blockName: 'MOC_CAO_DO',
                  position: { x: 2500, y: 0 },
                  layer: 'GC-CAODO',
                  attributes: { CAO_DO: '+4.250' }
                }
              },
              {
                id: 'toolu_missing',
                name: 'insert_block',
                input: {
                  blockName: 'KHONG_CO_THAT',
                  position: { x: 0, y: 0 }
                }
              }
            ])
          : say('Đã chèn mốc cao độ.')
    })
  })

  await page.setViewportSize({ width: 2200, height: 1200 })
  await page.goto('/')
  await uploadFixture(page, fixturePath)
  await expect(page.locator('.ml-cad-container')).toBeVisible()
  await page.getByRole('button', { name: /CAD\s*Agent/i }).click()
  await page.locator('.cad-agent-panel-root textarea').fill('chèn mốc cao độ')
  await page.locator('.cad-agent-send-btn').click()
  await expect(page.locator('.cad-agent-panel-root')).toContainText(
    'Đã chèn mốc cao độ',
    { timeout: 60_000 }
  )

  const facts = await page.evaluate(() => {
    const w = window as unknown as Record<string, any>
    const db = (w.AcApDocManager?.instance ?? w.acApDocManager).curDocument.database
    const inserts: {
      name: string
      layer: string
      x: number
      attributes: { tag: string; value: string }[]
    }[] = []
    for (const e of db.tables.blockTable.modelSpace.newIterator()) {
      const name = (e as any).blockName
      if (!name) continue
      const attrs: { tag: string; value: string }[] = []
      // Attributes hang off an iterator, not an array property.
      for (const a of (e as any).attributeIterator?.() ?? []) {
        attrs.push({ tag: a.tag, value: a.textString })
      }
      inserts.push({
        name,
        layer: e.layer,
        x: Math.round((e as any).position?.x ?? 0),
        attributes: attrs
      })
    }
    const defined: string[] = []
    for (const b of db.tables.blockTable.newIterator()) defined.push(b.name)
    return { inserts, defined }
  })

  // Exactly one insert: the invented block name must be refused, not guessed at.
  expect(facts.inserts).toHaveLength(1)
  expect(facts.inserts[0].name).toBe('MOC_CAO_DO')
  expect(facts.inserts[0].layer).toBe('GC-CAODO')
  expect(facts.inserts[0].x).toBe(2500)
  // The value has to ride on the attribute, or the callout is a blank marker.
  expect(facts.inserts[0].attributes).toEqual([
    { tag: 'CAO_DO', value: '+4.250' }
  ])
  expect(facts.defined).not.toContain('KHONG_CO_THAT')

  await page.screenshot({
    path: process.env.BLOCK_SHOT ?? 'test-results/insert-block.png'
  })
})
