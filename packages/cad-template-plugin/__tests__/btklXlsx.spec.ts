import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { crc32 } from 'node:zlib'

import {
  acTpBtklExplain,
  acTpBtklMo,
  acTpBtklWorkbook,
  acTpCrc32,
  acTpXlsx,
  acTpXlsxColumn,
  acTpZipStore
} from '../src/btkl'
import { btklCompareMarkdown } from './helpers/btklReport'

/** Reads a stored ZIP through its central directory, checking every CRC. */
function unzip(bytes: Uint8Array): Map<string, string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const end = bytes.length - 22
  expect(view.getUint32(end, true)).toBe(0x06054b50)
  const count = view.getUint16(end + 10, true)
  let at = view.getUint32(end + 16, true)
  const dec = new TextDecoder()
  const out = new Map<string, string>()
  for (let k = 0; k < count; k++) {
    expect(view.getUint32(at, true)).toBe(0x02014b50)
    const method = view.getUint16(at + 10, true)
    const crc = view.getUint32(at + 16, true)
    const size = view.getUint32(at + 20, true)
    const nameLength = view.getUint16(at + 28, true)
    const local = view.getUint32(at + 42, true)
    const name = dec.decode(bytes.subarray(at + 46, at + 46 + nameLength))
    expect(method).toBe(0)
    expect(view.getUint32(local, true)).toBe(0x04034b50)
    const start = local + 30 + view.getUint16(local + 26, true)
    const data = bytes.subarray(start, start + size)
    expect(crc32(data)).toBe(crc)
    out.set(name, dec.decode(data))
    at += 46 + nameLength
  }
  return out
}

/** Cells of a worksheet: ref → { v, f, s }. */
function cells(xml: string) {
  const out = new Map<string, { v: string; f?: string; s: number }>()
  for (const m of xml.matchAll(
    /<c r="([A-Z]+\d+)" s="(\d+)"([^>]*?)(\/>|>(.*?)<\/c>)/g
  )) {
    const body = m[5] ?? ''
    const text = body.match(/<t xml:space="preserve">(.*?)<\/t>/)
    const v = text ? text[1] : (body.match(/<v>(.*?)<\/v>/)?.[1] ?? '')
    const f = body.match(/<f>(.*?)<\/f>/)?.[1]
    out.set(m[1], {
      v: v
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&'),
      ...(f ? { f } : {}),
      s: Number(m[2])
    })
  }
  return out
}

describe('xlsx writer', () => {
  test('CRC-32 agrees with zlib', () => {
    const data = new TextEncoder().encode('Bê tông C30 — 14 058,319 kg')
    expect(acTpCrc32(data)).toBe(crc32(data))
    expect(acTpCrc32(new Uint8Array())).toBe(0)
  })

  test('stored ZIP round-trips, and the same input gives the same bytes', () => {
    const files = [
      { name: 'a.txt', data: new TextEncoder().encode('một') },
      { name: 'b/c.xml', data: new TextEncoder().encode('<x/>') }
    ]
    const zip = acTpZipStore(files)
    expect([...unzip(zip)]).toEqual([
      ['a.txt', 'một'],
      ['b/c.xml', '<x/>']
    ])
    expect(acTpZipStore(files)).toEqual(zip)
  })

  test('column letters', () => {
    expect([0, 4, 25, 26, 27, 701, 702].map(acTpXlsxColumn)).toEqual([
      'A',
      'E',
      'Z',
      'AA',
      'AB',
      'ZZ',
      'AAA'
    ])
  })

  test('parts, escaping, numbers, formulas and merges', () => {
    const zip = acTpXlsx([
      {
        name: 'S1',
        columns: [10, 20],
        rows: [
          [{ v: 'a & b <c> "d"' }, { v: 1.5, s: 'number' }],
          [{ v: null }, { v: 3, s: 'number', f: 'B1*2' }],
          [{ v: 'bỏ\u0001ký tự điều khiển' }]
        ],
        merges: ['A3:B3'],
        freezeRows: 1
      }
    ])
    const parts = unzip(zip)
    expect([...parts.keys()]).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'docProps/core.xml',
      'xl/workbook.xml',
      'xl/_rels/workbook.xml.rels',
      'xl/styles.xml',
      'xl/worksheets/sheet1.xml'
    ])
    const c = cells(parts.get('xl/worksheets/sheet1.xml')!)
    expect(c.get('A1')!.v).toBe('a & b <c> "d"')
    expect(c.get('B1')!.v).toBe('1.5')
    expect(c.get('B2')).toMatchObject({ v: '3', f: 'B1*2' })
    expect(c.get('A3')!.v).toBe('bỏký tự điều khiển')
    expect(parts.get('xl/worksheets/sheet1.xml')).toContain(
      '<mergeCell ref="A3:B3"/>'
    )
    expect(parts.get('xl/worksheets/sheet1.xml')).toContain('ySplit="1"')
    expect(parts.get('xl/workbook.xml')).toContain('fullCalcOnLoad="1"')
  })

  test('bad sheet names and non-finite numbers are refused', () => {
    expect(() => acTpXlsx([])).toThrow('ít nhất một sheet')
    expect(() => acTpXlsx([{ name: 'a/b', columns: [], rows: [] }])).toThrow(
      'Tên sheet không hợp lệ'
    )
    expect(() =>
      acTpXlsx([
        { name: 'A', columns: [], rows: [] },
        { name: 'a', columns: [], rows: [] }
      ])
    ).toThrow('Trùng tên sheet')
    expect(() =>
      acTpXlsx([{ name: 'A', columns: [], rows: [[{ v: NaN }]] }])
    ).toThrow('số không hữu hạn')
  })
})

describe('BTKL workbook — M1', () => {
  const result = acTpBtklMo()
  const parts = unzip(
    acTpBtklWorkbook([result], {
      congTrinh: 'Cầu Km0+400 — Tuyến số 2',
      ngay: '15/11/2026'
    })
  )
  const btkl = cells(parts.get('xl/worksheets/sheet1.xml')!)
  const steel = cells(parts.get('xl/worksheets/sheet2.xml')!)

  test('two sheets: BTKL and the detailed steel', () => {
    expect(parts.get('xl/workbook.xml')).toContain(
      '<sheet name="BTKL" sheetId="1" r:id="rId1"/><sheet name="Thép chi tiết" sheetId="2" r:id="rId2"/>'
    )
  })

  test('BTKL: five columns, one row per take-off line', () => {
    expect(['A5', 'B5', 'C5', 'D5', 'E5'].map(r => btkl.get(r)!.v)).toEqual([
      'STT',
      'Hạng mục',
      'Đơn vị',
      'Khối lượng',
      'Diễn giải công thức'
    ])
    expect(btkl.has('F5')).toBe(false)
    expect(btkl.get('B6')!.v).toBe('MỐ M1')
    result.items.forEach((item, k) => {
      const row = 7 + k
      expect(btkl.get(`A${row}`)!.v).toBe(item.stt)
      expect(btkl.get(`B${row}`)!.v).toBe(item.hangMuc)
      expect(btkl.get(`D${row}`)!.v).toBe(
        item.khoiLuong === null
          ? '—'
          : String(Math.round(item.khoiLuong * 1000) / 1000)
      )
      expect(btkl.get(`E${row}`)!.v).toBe(acTpBtklExplain(item))
    })
    expect(btkl.get('C7')!.v).toBe('m³')
  })

  test('the explanation carries the source comparison, flags and refusals', () => {
    const by = (key: string) =>
      acTpBtklExplain(result.items.find(i => i.key === key)!)
    expect(by('be')).toBe(
      '7,7 × 6 × 2 − 4 × π × 1,2²/4 × 0,15 (trừ đầu cọc ngàm vào bệ) · Bảng gốc 91,721: khớp'
    )
    expect(by('than')).toBe(
      '7,7 × 1,5 × 4,717 (chiều cao tại tim = trung bình theo dốc ngang) · Bảng gốc 53,667, chênh +0,814 · ⚑ Bảng gốc ghi 53,667 m³, nhỏ hơn hình học 0,814 m³ (1,5 %); chưa giải thích được — đang chờ kỹ sư xác nhận.'
    )
    expect(by('coc')).toBe(
      'Không tính: Chưa có chiều dài cọc (lCoc = 0); bản gốc M1 cũng không thống kê cọc. Nhập lCoc (mm, chiều dài một cọc theo hồ sơ địa chất) qua sua_ho_so_mo hoặc cap_nhat_btkl rồi chạy lại — không làm đổi hình vẽ; sẽ tính 4 × π × 1,2²/4 × lCoc.'
    )
    expect(by('thep_le18')).toBe(
      'Theo nhóm đường kính (định mức gia công) · Không cộng vào tổng (đã có trong các dòng theo đường kính)'
    )
  })

  test('steel: 69 rows with formulas, the total is the table total', () => {
    expect(steel.get('A1')!.v).toBe('BẢNG THỐNG KÊ CỐT THÉP — MỐ M1')
    expect(steel.get('K3')!.v).toBe('Ghi chú')
    for (let k = 0; k < 69; k++) {
      const r = 4 + k
      const b = result.bars[k]
      expect(steel.get(`B${r}`)!.v).toBe(b.mark)
      expect(Number(steel.get(`E${r}`)!.v)).toBe(b.count)
      expect(steel.get(`G${r}`)!.f).toBe(`E${r}*F${r}/1000`)
      expect(steel.get(`I${r}`)!.f).toBe(`G${r}*H${r}`)
      // Cached values agree with what the formulas give.
      const g = Number(steel.get(`G${r}`)!.v)
      expect(g).toBeCloseTo((b.count * b.length) / 1000, 3)
      expect(Number(steel.get(`I${r}`)!.v)).toBeCloseTo(b.kg, 3)
    }
    expect(steel.get('B73')!.v).toBe('Tổng cộng')
    expect(steel.get('I73')).toMatchObject({ v: '14058.319', f: 'SUM(I4:I72)' })
    expect(steel.has('A74')).toBe(false)
    expect(steel.get('K6')!.v).toBe(
      '⚑ Hình ghi cả D22 lẫn D25, bảng D22; chưa chốt — đang theo bảng.'
    )
  })

  test('refused steel leaves a one-line steel sheet with the reason', () => {
    const p = unzip(acTpBtklWorkbook([acTpBtklMo({ thepF3: 'D25' })]))
    const s = cells(p.get('xl/worksheets/sheet2.xml')!)
    expect(s.get('A4')!.v).toBe(
      'Không có bảng thép: Cấu tạo thép đã khác mẫu M1 (F3 D25 hoặc W16 D14): không dùng bảng thép cũ; cần phương án thép mới.'
    )
    expect(p.get('xl/worksheets/sheet2.xml')).toContain(
      '<mergeCell ref="A4:K4"/>'
    )
  })

  test('estimated steel says there is no bar list, and gives the estimate', () => {
    const p = unzip(acTpBtklWorkbook([acTpBtklMo({ hBe: 2500 })]))
    const s = cells(p.get('xl/worksheets/sheet2.xml')!)
    expect(s.get('A4')!.v).toMatch(
      /^Không có bảng thép: chưa có bố trí từng thanh cho hình học này; Cốt thép \(tạm tính theo hàm lượng mẫu M1\) = [\d ]+,\d+ kg/
    )
  })

  test('several objects get one steel sheet each', () => {
    const p = unzip(
      acTpBtklWorkbook([acTpBtklMo(), acTpBtklMo({ tenMo: 'M2' })])
    )
    expect(p.get('xl/workbook.xml')).toContain(
      '<sheet name="Thép 1 Mố M1" sheetId="2" r:id="rId2"/><sheet name="Thép 2 Mố M2" sheetId="3" r:id="rId3"/>'
    )
  })
})

// `tools/fidelity/btkl-xuat.mjs` sets BTKL_OUT to write the M1 sample outside
// the repository.
const OUT = process.env.BTKL_OUT
;(OUT ? test : test.skip)('write the M1 sample and comparison', () => {
  mkdirSync(OUT!, { recursive: true })
  const result = acTpBtklMo()
  writeFileSync(
    join(OUT!, 'btkl-M1.xlsx'),
    acTpBtklWorkbook([result], {
      congTrinh: 'Cầu Km0+400 — Tuyến số 2',
      ngay: new Date().toLocaleDateString('vi-VN')
    })
  )
  writeFileSync(
    join(OUT!, 'm1-doi-chieu.md'),
    btklCompareMarkdown(result, new Date().toISOString())
  )
  writeFileSync(join(OUT!, 'btkl-M1.json'), JSON.stringify(result, null, 1))
})
