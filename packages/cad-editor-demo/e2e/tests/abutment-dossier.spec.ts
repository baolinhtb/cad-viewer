import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { expect, test } from '@playwright/test'

import { uploadFixture } from '../helpers/fileUpload'

const fixture = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../fixtures/minimal-line.dxf'
)
const event = (type: string, payload: unknown) =>
  `event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`
function response(
  tool?: { name: string; input: object },
  text = 'Đã xử lý hồ sơ bản nháp.'
) {
  return [
    event('message_start', {
      type: 'message_start',
      message: {
        id: 'msg_dossier',
        type: 'message',
        role: 'assistant',
        model: 'claude-opus-5',
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 0 }
      }
    }),
    event('content_block_start', {
      type: 'content_block_start',
      index: 0,
      content_block: tool
        ? {
            type: 'tool_use',
            id: `toolu_${tool.name}`,
            name: tool.name,
            input: {}
          }
        : { type: 'text', text: '' }
    }),
    event('content_block_delta', {
      type: 'content_block_delta',
      index: 0,
      delta: tool
        ? { type: 'input_json_delta', partial_json: JSON.stringify(tool.input) }
        : { type: 'text_delta', text }
    }),
    event('content_block_stop', { type: 'content_block_stop', index: 0 }),
    event('message_delta', {
      type: 'message_delta',
      delta: {
        stop_reason: tool ? 'tool_use' : 'end_turn',
        stop_sequence: null
      },
      usage: { output_tokens: 20 }
    }),
    event('message_stop', { type: 'message_stop' })
  ].join('')
}

test('prompt creates a dossier, patches labels without replacing detail, and downloads six PDF pages', async ({
  page
}) => {
  test.setTimeout(180000)
  await page.addInitScript(() =>
    localStorage.setItem('cad-agent-plugin.agent-mode', 'simple')
  )
  await page.route('**/api/templates', r =>
    r.fulfill({ json: { templates: [] } })
  )
  await page.route('**/api/standards/role-layers', r =>
    r.fulfill({
      json: {
        roleLayers: Object.fromEntries(
          [
            'mo_be',
            'mo_be_tong_lot',
            'mo_tuong_than',
            'mo_tuong_dau',
            'mo_cau',
            'lan_can',
            'coc_khoan_nhoi',
            'goi_cau',
            'duong_tim',
            'kich_thuoc',
            'ghi_chu',
            'cot_thep'
          ].map(role => [role, 'TEST_' + role])
        )
      }
    })
  )
  let round = 0
  const offered = new Set<string>()
  await page.route('**/api/ai/messages', async route => {
    const body = route.request().postDataJSON()
    for (const t of body.tools ?? []) offered.add(t.name)
    round++
    const tool =
      round === 1
        ? { name: 'tao_ho_so_mo', input: { thong_so: { tenMo: 'M1' } } }
        : round === 3
          ? {
              name: 'sua_ho_so_mo',
              input: {
                ma_lan_chay: 'r1',
                thong_so: { congTrinh: 'Cầu đổi tên, giữ chi tiết' }
              }
            }
          : round === 5
            ? {
                name: 'xuat_ho_so_mo',
                input: { ma_lan_chay: 'r1', dinh_dang: 'pdf' }
              }
            : undefined
    await route.fulfill({
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache'
      },
      body: response(tool, `Xong lượt ${round / 2}.`)
    })
  })
  await page.setViewportSize({ width: 1800, height: 1100 })
  await page.goto('/')
  await uploadFixture(page, fixture)
  await expect(page.locator('.ml-cad-container')).toBeVisible()
  await page.getByRole('button', { name: /CAD\s*Agent/i }).click()
  async function prompt(text: string, turn: number) {
    await page.locator('.cad-agent-panel-root textarea').fill(text)
    await page.locator('.cad-agent-send-btn').click()
    await expect(page.locator('.cad-agent-panel-root')).toContainText(
      `Xong lượt ${turn}.`,
      { timeout: 90000 }
    )
  }
  await prompt('Dựng bộ hồ sơ mố M1 theo mẫu BTC mo_2.', 1)
  const before = await page.evaluate(() => {
    const manager = (
      window as unknown as {
        AcApDocManager: {
          instance: {
            curDocument: {
              database: {
                tables: {
                  blockTable: {
                    modelSpace: {
                      newIterator: () => Iterable<{
                        dxfTypeName: string
                        textString?: string
                      }>
                    }
                  }
                }
              }
            }
          }
        }
      }
    ).AcApDocManager.instance
    const entities = [
      ...manager.curDocument.database.tables.blockTable.modelSpace.newIterator()
    ]
    return {
      count: entities.length,
      texts: entities
        .filter(e => e.dxfTypeName === 'TEXT')
        .map(e => e.textString ?? '')
    }
  })
  expect(before.count).toBeGreaterThan(2000)
  expect(
    before.texts.filter(t => t === 'BẢN NHÁP — CHƯA PHÁT HÀNH THI CÔNG')
  ).toHaveLength(6)
  await prompt('Đổi tên công trình thành Cầu đổi tên, giữ chi tiết.', 2)
  const after = await page.evaluate(() => {
    const manager = (
      window as unknown as {
        AcApDocManager: {
          instance: {
            curDocument: {
              database: {
                tables: {
                  blockTable: {
                    modelSpace: {
                      newIterator: () => Iterable<{
                        dxfTypeName: string
                        textString?: string
                      }>
                    }
                  }
                }
              }
            }
          }
        }
      }
    ).AcApDocManager.instance
    const entities = [
      ...manager.curDocument.database.tables.blockTable.modelSpace.newIterator()
    ]
    return {
      count: entities.length,
      texts: entities
        .filter(e => e.dxfTypeName === 'TEXT')
        .map(e => e.textString ?? '')
    }
  })
  expect(after.count).toBe(before.count)
  expect(
    after.texts.filter(t => t === 'BẢN NHÁP — CHƯA PHÁT HÀNH THI CÔNG')
  ).toHaveLength(6)
  expect(after.texts).toContain('Cầu đổi tên, giữ chi tiết')
  expect(after.texts).toContain('bBe: 7700')
  expect(after.texts).toContain('bThan: 7700')
  expect(
    after.texts.filter(t => t === 'CHƯA CÓ PHƯƠNG ÁN THÉP CHO HÌNH HỌC NÀY')
  ).toHaveLength(0)
  const downloadPromise = page.waitForEvent('download', { timeout: 90000 })
  await prompt('Xuất PDF hồ sơ M1 bản nháp.', 3)
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('M1-ban-nhap.pdf')
  const stream = await download.createReadStream()
  const chunks: Buffer[] = []
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk))
  const pdf = Buffer.concat(chunks).toString('latin1')
  expect(pdf.startsWith('%PDF')).toBe(true)
  expect(pdf.match(/\/Type \/Page\b/g)).toHaveLength(6)
  expect([...offered]).toEqual(
    expect.arrayContaining([
      'tao_ho_so_mo',
      'sua_ho_so_mo',
      'kiem_tra_ho_so',
      'xuat_ho_so_mo'
    ])
  )
})
