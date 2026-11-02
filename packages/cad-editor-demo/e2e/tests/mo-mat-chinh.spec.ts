/**
 * Mặt chính mố hoàn chỉnh dựng trong trình duyệt thật.
 *
 * Suite đơn vị đã đối chiếu từng đỉnh với bản vẽ. Thứ nó không chứng minh được
 * là 270 đối tượng ấy — kích thước, chữ có dấu, tô đặc, cung tròn lan can —
 * đi qua bộ chuyển đổi cảnh và lên tới màn hình. Đây là điều kiện để một
 * template rời trạng thái nháp, nên phải kiểm ở đúng nơi nó chạy.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { expect, test } from '@playwright/test'

import { uploadFixture } from '../helpers/fileUpload'

const here = path.dirname(fileURLToPath(import.meta.url))
const fixturePath = path.resolve(here, '..', 'fixtures', 'minimal-line.dxf')
const templatePath = path.resolve(
  here,
  '..',
  '..',
  '..',
  'cad-template-plugin',
  'library',
  'mo_mat_chinh.js'
)
const TEMPLATE_ID = 'mo_mat_chinh'
const VERSION = '2.0.0'

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

test('mặt chính mố M1 dựng đủ bộ phận và hiện lên màn hình', async ({ page }) => {
  const code = fs.readFileSync(templatePath, 'utf8')
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
            name: 'Mố cầu — mặt chính hoàn chỉnh (bản vẽ M1)'
          }
        ]
      })
    })
  )
  // Nền chuẩn hoá của phòng: layer đặt tên như bản vẽ, màu xám 8, lan can 7.
  await page.route('**/api/standards/role-layers', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        roleLayers: {
          mo_be: '_33_CAU_MO_Be',
          mo_be_tong_lot: '_33_CAU_MO_Betonglot',
          mo_tuong_than: '_33_CAU_MO_Tuongthan',
          mo_tuong_dau: '_33_CAU_MO_Tuongdau',
          mo_tuong_tai: '_33_CAU_MO_Tuongtai',
          lop_phu: '_33_Matduong_BTN',
          coc_khoan_nhoi: 'KC-COC',
          lan_can: 'KC-LANCAN',
          ong_thoat_nuoc: 'KT-THOATNUOC',
          duong_tim: '_33_Timtuyen',
          kich_thuoc: '_33_Duongghikichthuoc',
          ghi_chu: '_33_Ghichu',
          ghi_chu_cao_do: '_33_Ghichu_Caodo',
          tieu_de_ban_ve: '_33_Tieudebanve'
        },
        layerStyles: {
          _33_CAU_MO_Be: { color: 8 },
          _33_CAU_MO_Betonglot: { color: 8 },
          _33_CAU_MO_Tuongthan: { color: 8 },
          _33_CAU_MO_Tuongdau: { color: 8 },
          _33_CAU_MO_Tuongtai: { color: 8 },
          _33_Matduong_BTN: { color: 8 },
          'KC-COC': { color: 8 },
          'KC-LANCAN': { color: 7 },
          _33_Timtuyen: { color: 8 },
          _33_Duongghikichthuoc: { color: 8 },
          _33_Ghichu: { color: 8 },
          _33_Ghichu_Caodo: { color: 8 },
          _33_Tieudebanve: { color: 8 }
        }
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
          : textStream('Đã dựng mặt chính mố M1.')
    })
  })

  await page.setViewportSize({ width: 2200, height: 1200 })
  await page.goto('/')
  await uploadFixture(page, fixturePath)
  await expect(page.locator('.ml-cad-container')).toBeVisible()
  await page.getByRole('button', { name: /CAD\s*Agent/i }).click()
  await page.locator('.cad-agent-panel-root textarea').fill('dựng mặt chính mố M1')
  await page.locator('.cad-agent-send-btn').click()
  await expect(page.locator('.cad-agent-panel-root')).toContainText('Đã dựng mặt chính mố M1', {
    timeout: 60_000
  })

  // Khung nhìn: chờ cảnh chuyển xong rồi mới đóng khung, như template-hatch.
  await page.waitForTimeout(3000)
  await page.evaluate(async () => {
    const w = window as unknown as Record<string, any>
    const view = w.AcApDocManager.instance.context.view
    while (view.isProcessingEntities) await new Promise(r => setTimeout(r, 100))
    view.zoomToFitDrawing()
    await new Promise(r => setTimeout(r, 1500))
  })

  const summary = await page.evaluate(() => {
    const w = window as unknown as Record<string, any>
    const db = (w.AcApDocManager?.instance ?? w.acApDocManager).curDocument.database
    const byType: Record<string, number> = {}
    const byLayer: Record<string, number> = {}
    const hatches: number[][] = []
    const texts: string[] = []
    const byColor: Record<string, number> = {}
    const layerColors: Record<string, number | undefined> = {}
    for (const l of db.tables.layerTable.newIterator()) layerColors[l.name] = l.color.colorIndex
    // Khối kích thước: chữ 150, xanh lá, số nguyên — thứ kỹ sư đọc trên tờ.
    const dimTexts: { height: number; color: number | undefined; text: string }[] = []
    for (const block of db.tables.blockTable.newIterator()) {
      if (!block.name.startsWith('*D')) continue
      for (const e of block.newIterator()) {
        if (e.dxfTypeName === 'MTEXT') dimTexts.push({ height: e.height, color: e.color.colorIndex, text: e.contents })
      }
    }
    const lineTypes: Record<string, string> = {}
    for (const e of db.tables.blockTable.modelSpace.newIterator()) {
      if (e.lineType && e.lineType !== 'ByLayer') lineTypes[e.lineType] = (lineTypes[e.lineType] ?? '') + '.'
    }
    const textStyles: Record<string, string> = {}
    for (const st of db.tables.textStyleTable.newIterator()) textStyles[st.name] = st.fileName
    const textStyleNames = new Set<string>()
    for (const e of db.tables.blockTable.modelSpace.newIterator()) {
      if (e.dxfTypeName === 'TEXT') textStyleNames.add(e.styleName)
    }

    for (const e of db.tables.blockTable.modelSpace.newIterator()) {
      byType[e.dxfTypeName] = (byType[e.dxfTypeName] ?? 0) + 1
      byLayer[e.layer] = (byLayer[e.layer] ?? 0) + 1
      byColor[String(e.color.colorIndex)] = (byColor[String(e.color.colorIndex)] ?? 0) + 1
      if (e.dxfTypeName === 'HATCH' && e.layer === '_33_CAU_MO_Tuongtai') {
        const b = e.geometricExtents
        hatches.push([b.min.x, b.min.y, b.max.x, b.max.y].map(v => Math.round(v * 10) / 10))
      }
      if (e.dxfTypeName === 'TEXT') texts.push(e.textString)
    }
    return { byType, byLayer, hatches, texts, byColor, layerColors, textStyles, textStyleNames: [...textStyleNames], dimTexts, lineTypes }
  })

  // Tờ bản vẽ đủ: 19 kích thước, 2 tường tai tô đặc, chữ Unicode nguyên vẹn.
  expect(summary.byType.DIMENSION).toBe(19)
  expect(summary.byType.HATCH).toBe(2 + 9) // 2 tường tai + 9 mũi tên đường dẫn
  expect(summary.hatches.sort((a, b) => a[0] - b[0])).toEqual([
    [-3850, 6893.4, -3700, 8093.4],
    [3700, 6893.4, 3850, 8093.4]
  ])
  expect(summary.texts).toContain('%%UMẶT CHÍNH MỐ M1')
  // Số kích thước: 19 dòng chữ cao 150, xanh lá, số nguyên.
  expect(summary.dimTexts).toHaveLength(19)
  expect(summary.dimTexts.every(t => t.height === 150 && t.color === 3 && /^\d+$/.test(t.text))).toBe(true)
  expect(summary.dimTexts.map(t => t.text)).toEqual(expect.arrayContaining(['7700', '8000', '4793', '1811']))
  expect(Object.keys(summary.lineTypes).sort()).toEqual(['CENTER', 'DASHDOT', 'DASHED'])
  expect(summary.texts).toContain('Tim giai đoạn hoàn thiện')
  expect(summary.byLayer['_33_Kyhieumatcat']).toBe(12)
  // Màu: layer lấy từ nền chuẩn hoá, nét khác màu đúng như bản vẽ.
  expect(summary.layerColors['_33_CAU_MO_Be']).toBe(8)
  expect(summary.layerColors['KC-LANCAN']).toBe(7)
  expect(summary.layerColors['_33_Kyhieumatcat']).toBe(7)
  expect(summary.byColor['1']).toBe(1 + 2 * 2) // tim tuyến đỏ + 2 nét đỏ mỗi lan can
  expect(summary.byColor['3']).toBe(5)
  expect(summary.byColor['2']).toBeGreaterThanOrEqual(18 + 2 * 82)
  expect(summary.byType.ARC).toBeGreaterThanOrEqual(52)
  // Kiểu chữ AutoCAD: mọi chữ template vẽ dùng style Arial (font arial.ttf,
  // bản ghi bỏ đuôi tệp), là kiểu TrueType có đủ glyph tiếng Việt.
  expect(summary.textStyles['Arial']).toBe('arial')
  expect(summary.textStyleNames).toEqual(['Arial'])
  // Font Arial có trên CDN nên không được có thông báo thiếu phông.
  await expect(page.locator('.el-notification', { hasText: /phông|Font Not Found/i })).toHaveCount(0)
  // Cộng cả nét mẫu của fixture, không dưới 270 đối tượng của template.
  const total = Object.values(summary.byType).reduce((a, b) => a + b, 0)
  expect(total).toBeGreaterThanOrEqual(271)

  // Hình lên màn hình: canvas không trống, chụp lại để kỹ sư xem.
  const canvas = page.locator('.ml-cad-container canvas').first()
  const png = await canvas.screenshot()
  const lit = await page.evaluate(async imageBase64 => {
    const image = new Image()
    image.src = `data:image/png;base64,${imageBase64}`
    await image.decode()
    const probe = document.createElement('canvas')
    probe.width = image.naturalWidth
    probe.height = image.naturalHeight
    const ctx = probe.getContext('2d')!
    ctx.drawImage(image, 0, 0)
    const { data } = ctx.getImageData(0, 0, probe.width, probe.height)
    let count = 0
    let red = 0
    let yellow = 0
    for (let i = 0; i < data.length; i += 4) {
      const [r, g, b] = [data[i], data[i + 1], data[i + 2]]
      if (r + g + b > 90) count++
      // Tim tuyến giờ là nét chấm gạch mảnh nên điểm đỏ ít và bị khử răng cưa
      // làm tối đi: đếm mọi điểm đỏ rõ so với hai kênh kia.
      if (r > 90 && r > 2 * g && r > 2 * b) red++
      if (r > 150 && g > 150 && b < 90) yellow++
    }
    return { count, red, yellow }
  }, png.toString('base64'))
  expect(lit.count).toBeGreaterThan(5000)
  // Tim tuyến đỏ và lan can thép vàng thật sự lên màn hình, không chỉ trong DB.
  expect(lit.red).toBeGreaterThan(20)
  expect(lit.yellow).toBeGreaterThan(50)

  const out = process.env.MO_MAT_CHINH_SHOT
  if (out) fs.writeFileSync(out, png)
})
