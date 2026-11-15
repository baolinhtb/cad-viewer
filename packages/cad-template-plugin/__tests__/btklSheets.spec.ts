/** BTKL B6 — the take-off drawn as A3 sheets. */
jest.mock('../../cad-simple-viewer/src/editor/global/eventBus', () => ({
  eventBus: { emit: jest.fn() }
}))
jest.mock('@mlightcad/cad-simple-viewer', () => ({
  AcApDocManager: { instance: { regen: jest.fn() } },
  ...jest.requireActual('../../cad-simple-viewer/src/util/AcApDatabaseEdit')
}))

import {
  acTpEstimateTextWidth,
  readSemanticTag
} from '@mlightcad/cad-template-sdk'
import { AcDbDatabase, AcDbLine, AcDbText } from '@mlightcad/data-model'

import {
  acTpBtklMo,
  type AcTpBtklSheet,
  acTpBtklSheets,
  acTpBtklWrap,
  btklTemplate
} from '../src/btkl'
import { entitiesOfRun } from '../src/runIdentity'
import { runTemplate } from '../src/runTemplate'

jest.setTimeout(120_000)

const texts = (s: AcTpBtklSheet) =>
  s.primitives.filter(
    (p): p is Extract<typeof p, { kind: 'text' }> => p.kind === 'text'
  )
const tableTexts = (s: AcTpBtklSheet) =>
  texts(s).filter(t => t.role === 'ghi_chu')

describe('BTKL sheets — M1', () => {
  const result = acTpBtklMo()
  const sheets = acTpBtklSheets([result], {
    congTrinh: 'Cầu Km0+400 — Tuyến số 2',
    x: 1000,
    y: 2000
  })

  test('one A3 sheet at (x, y), numbered in the title block', () => {
    expect(sheets.map(s => s.id)).toEqual(['BTKL-01'])
    expect(sheets[0].origin).toEqual([1000, 2000])
    expect([sheets[0].width, sheets[0].height]).toEqual([42000, 29700])
    const block = texts(sheets[0]).filter(t => t.role === 'khung_ten')
    expect(block.map(t => t.text)).toEqual(
      expect.arrayContaining([
        '1/1',
        'BTKL-01',
        'BẢNG KHỐI LƯỢNG KẾT CẤU',
        'BẢN NHÁP — CHƯA PHÁT HÀNH THI CÔNG'
      ])
    )
  })

  test('the five-column header and the heading', () => {
    for (const h of [
      'STT',
      'Hạng mục',
      'Đơn vị',
      'Khối lượng',
      'Diễn giải công thức'
    ])
      expect(tableTexts(sheets[0]).filter(t => t.text === h)).toHaveLength(1)
    expect(texts(sheets[0]).map(t => t.text)).toEqual(
      expect.arrayContaining([
        '%%UBẢNG TỔNG HỢP KHỐI LƯỢNG KẾT CẤU',
        'Công trình: Cầu Km0+400 — Tuyến số 2 · Đối tượng: Mố M1'
      ])
    )
  })

  test('every line once, in order, with its value in white like SUB-100', () => {
    const all = sheets.flatMap(tableTexts)
    const stt = all.filter(t => t.align === 1 && /^\d+(\.\d+)?$/.test(t.text))
    expect(stt.map(t => t.text)).toEqual(result.items.map(i => i.stt))
    const value = (text: string) =>
      all.filter(t => t.text === text && t.align === 2)
    expect(value('54,481')).toHaveLength(1)
    expect(value('54,481')[0].color).toBe(7)
    expect(value('14 058,319')).toHaveLength(1)
    expect(all.filter(t => t.text === '—')).toHaveLength(1)
  })

  test('flags and refusals in red under the explanation', () => {
    const red = sheets
      .flatMap(tableTexts)
      .filter(t => t.color === 1)
      .map(t => t.text)
      .join(' ')
    expect(red).toContain('[!] Bảng gốc ghi 53,667 m³')
    expect(red).toContain('Không tính: Chưa có chiều dài cọc')
    expect(red).toContain('[!] Hình ghi cả D22 lẫn D25')
  })

  test('the notes close the sheet', () => {
    expect(tableTexts(sheets[0]).map(t => t.text)).toContain('Ghi chú:')
  })

  test('nothing leaves its sheet or its column, nothing falls into the title strip', () => {
    for (const s of sheets) {
      const lines = s.primitives.filter(
        (p): p is Extract<typeof p, { kind: 'line' }> => p.kind === 'line'
      )
      const xs = [
        ...new Set(lines.filter(l => l.a[0] === l.b[0]).map(l => l.a[0]))
      ].sort((a, b) => a - b)
      expect(xs).toHaveLength(6)
      const bottom = Math.min(...lines.flatMap(l => [l.a[1], l.b[1]]))
      // Above the title strip and its status line (frame layout).
      expect(bottom).toBeGreaterThan(40 * 100)
      for (const t of tableTexts(s)) {
        if (t.text === 'Ghi chú:' || t.text.startsWith('- ')) continue
        const w = acTpEstimateTextWidth(t.text, t.height)
        const left =
          t.align === 0
            ? t.at[0]
            : t.align === 1
              ? t.at[0] - w / 2
              : t.at[0] - w
        const col = xs.findIndex((x, k) => x <= left + 1 && left < xs[k + 1])
        expect(col).toBeGreaterThanOrEqual(0)
        expect(left + w).toBeLessThanOrEqual(xs[col + 1] + 1)
      }
      for (const p of s.primitives) {
        const pts =
          p.kind === 'text' ? [p.at] : p.kind === 'line' ? [p.a, p.b] : p.points
        for (const [x, y] of pts) {
          expect(x).toBeGreaterThanOrEqual(0)
          expect(x).toBeLessThanOrEqual(s.width)
          expect(y).toBeGreaterThanOrEqual(0)
          expect(y).toBeLessThanOrEqual(s.height)
        }
      }
    }
  })
})

describe('BTKL sheets — pagination and wrapping', () => {
  test('more objects, more sheets; each row whole on one sheet', () => {
    const results = ['M1', 'M2', 'M3'].map(tenMo => acTpBtklMo({ tenMo }))
    const sheets = acTpBtklSheets(results)
    expect(sheets.length).toBeGreaterThan(2)
    sheets.forEach((s, k) => {
      const all = texts(s).map(t => t.text)
      expect(all).toContain(`${k + 1}/${sheets.length}`)
      expect(all).toContain(`BTKL-${String(k + 1).padStart(2, '0')}`)
      expect(
        tableTexts(s).filter(t => t.text === 'Diễn giải công thức')
      ).toHaveLength(1)
      expect(all).toContain(
        k
          ? '%%UBẢNG TỔNG HỢP KHỐI LƯỢNG KẾT CẤU (TIẾP THEO)'
          : '%%UBẢNG TỔNG HỢP KHỐI LƯỢNG KẾT CẤU'
      )
      expect(all.includes('Ghi chú:')).toBe(k === sheets.length - 1)
    })
    expect(sheets[1].origin).toEqual([42000 + 5000, 0])
    const heads = sheets
      .flatMap(tableTexts)
      .filter(t => /^MỐ M\d$/.test(t.text))
      .map(t => t.text)
    expect(heads).toEqual(['MỐ M1', 'MỐ M2', 'MỐ M3'])
    const stt = sheets
      .flatMap(tableTexts)
      .filter(t => t.align === 1 && /^\d+(\.\d+)?$/.test(t.text))
    expect(stt).toHaveLength(3 * results[0].items.length)
  })

  test('a refused take-off is a row with the reason', () => {
    const sheets = acTpBtklSheets([acTpBtklMo({ hBe: 'abc' })])
    expect(sheets).toHaveLength(1)
    const red = tableTexts(sheets[0]).filter(t => t.color === 1)
    expect(red.length).toBeGreaterThan(0)
    expect(red[0].text.startsWith('[!] ')).toBe(true)
  })

  test('wrap keeps words, cuts only words wider than the column', () => {
    expect(acTpBtklWrap('một hai ba', 1000)).toEqual(['một hai ba'])
    const lines = acTpBtklWrap(
      'aaaa bbbb cccc',
      acTpEstimateTextWidth('aaaa bbbb', 1.8)
    )
    expect(lines).toEqual(['aaaa bbbb', 'cccc'])
    const cut = acTpBtklWrap(
      'x'.repeat(40),
      acTpEstimateTextWidth('x'.repeat(10), 1.8)
    )
    expect(cut.join('')).toBe('x'.repeat(40))
    expect(cut.length).toBeGreaterThan(3)
    expect(acTpBtklWrap('', 10)).toEqual([''])
  })

  test('no objects is refused', () => {
    expect(() => acTpBtklSheets([])).toThrow('Chưa có đối tượng')
  })
})

describe('BTKL template in a drawing', () => {
  const database = () => {
    const db = new AcDbDatabase()
    db.createDefaultData()
    return db
  }
  const values = (objects: unknown) => ({
    doiTuong: JSON.stringify(objects),
    congTrinh: 'Cầu Km0+400 — Tuyến số 2',
    x: 0,
    y: 0
  })

  test('draws on _33_ layers in _33_Arial, one part per role and sheet', async () => {
    const db = database()
    const made = await runTemplate(
      btklTemplate,
      values([{ loai: 'mo', ten: 'M1', thay: {} }]),
      db
    )
    expect(made.errors).toEqual([])
    const entities = entitiesOfRun(db, made.runId!)
    expect(entities.length).toBeGreaterThan(200)
    for (const e of entities) expect(e.layer.startsWith('_33_')).toBe(true)
    const sheets = new Set(
      entities.map(e => String(readSemanticTag(e)?.params?.sheet))
    )
    expect([...sheets]).toEqual(['BTKL-01'])
    const table = entities.filter(
      (e): e is AcDbText =>
        e instanceof AcDbText && readSemanticTag(e)?.role === 'ghi_chu'
    )
    expect(new Set(table.map(t => t.styleName))).toEqual(new Set(['_33_Arial']))
    expect(entities.some(e => e instanceof AcDbLine)).toBe(true)
    expect(
      entities.some(
        e =>
          e instanceof AcDbText &&
          e.textString ===
            'Công trình: Cầu Km0+400 — Tuyến số 2 · Đối tượng: Mố M1'
      )
    ).toBe(true)
  })

  test('an abutment and a pier on one set of sheets', async () => {
    const db = database()
    const made = await runTemplate(
      btklTemplate,
      values([
        { loai: 'mo', ten: 'M1', thay: {} },
        { loai: 'tru', ten: 'Trụ T1', thay: { loaiThan: 'cot' } }
      ]),
      db
    )
    expect(made.errors).toEqual([])
    const texts = entitiesOfRun(db, made.runId!)
      .filter((e): e is AcDbText => e instanceof AcDbText)
      .map(t => t.textString)
    expect(texts).toEqual(expect.arrayContaining(['MỐ M1', 'TRỤ T1']))
    expect(texts).toContain('Thân trụ — 2 cột tròn D1200')
  })

  test('the object list and every object are checked before drawing', () => {
    const ok = values([{ loai: 'mo', ten: 'M1', thay: {} }])
    expect(btklTemplate.validate!(ok)).toEqual([])
    expect(
      btklTemplate.validate!(
        values([{ loai: 'mo', ten: 'M1', thay: { hBe: 'abc' } }])
      ).length
    ).toBeGreaterThan(0)
    expect(
      btklTemplate.validate!(
        values([{ loai: 'tru', ten: 'Trụ T1', thay: { khong: 1 } }])
      )
    ).toEqual(['Trụ T1: Không có thông số trụ "khong".'])
    expect(btklTemplate.validate!({ ...ok, doiTuong: '[' })).toEqual([
      'Đối tượng: không đọc được JSON.'
    ])
    expect(btklTemplate.validate!({ ...ok, doiTuong: '[]' })).toEqual([
      'Đối tượng: cần một danh sách mố/trụ, ít nhất một phần tử.'
    ])
    expect(
      btklTemplate.validate!({ ...ok, doiTuong: '[{"loai":"cau"}]' })
    ).toEqual([
      'Đối tượng 1: cần {"loai":"mo"|"tru","ten":chuỗi,"thay":{tên → số/chuỗi}}.'
    ])
  })
})
