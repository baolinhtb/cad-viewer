/**
 * The take-off as an `.xlsx` workbook: sheet "BTKL" with the five columns of
 * a Vietnamese quantity sheet (STT, Hạng mục, Đơn vị, Khối lượng, Diễn giải
 * công thức) and, per object with steel, a detailed bar schedule whose
 * lengths and weights are formulas over the counts, lengths and kg/m.
 */
import { acTpBtklNumber } from './mo'
import type { AcTpBtklBar, AcTpBtklItem, AcTpBtklResult } from './types'
import {
  acTpXlsx,
  type AcTpXlsxCell,
  type AcTpXlsxSheet,
  type AcTpXlsxStyle
} from './xlsx'

/** Heading data of the workbook. */
export interface AcTpBtklWorkbookMeta {
  congTrinh?: string
  /** Date written under the title, e.g. "15/11/2026". */
  ngay?: string
}

const UNIT: Record<AcTpBtklItem['donVi'], string> = {
  m3: 'm³',
  m2: 'm²',
  m: 'm',
  kg: 'kg',
  cái: 'cái',
  hộp: 'hộp'
}
const PART: Record<string, string> = {
  be: 'Bệ',
  than: 'Tường thân',
  dau: 'Tường đỉnh',
  canh_trai: 'Tường cánh trái',
  canh_phai: 'Tường cánh phải',
  tai: 'Tường tai',
  lan_can: 'Lan can',
  goi: 'Đá kê gối, ụ chống xô',
  phu: 'Thép phụ'
}

/**
 * Cached results of formula cells: the formula's own value, freed of float
 * noise, so a recalculation (fullCalcOnLoad) shows the same number.
 */
const exact = (v: number) => Math.round(v * 1e9) / 1e9
const fmt = (v: number) => acTpBtklNumber(v)

/** The "Diễn giải công thức" text of a line. */
export function acTpBtklExplain(item: AcTpBtklItem): string {
  const parts: string[] = []
  if (item.nguon === 'tu_choi') parts.push(`Không tính: ${item.lyDo ?? ''}`)
  else if (item.dienGiai) parts.push(item.dienGiai)
  if (
    item.nguon === 'tham_so' &&
    item.banGoc !== undefined &&
    item.khoiLuong !== null
  ) {
    const d = item.khoiLuong - item.banGoc
    parts.push(
      Math.abs(d) < 0.0005
        ? `Bảng gốc ${fmt(item.banGoc)}: khớp`
        : `Bảng gốc ${fmt(item.banGoc)}, chênh ${d > 0 ? '+' : '−'}${fmt(Math.abs(d))}`
    )
  }
  if (!item.trongTong && item.nhom !== 'ghi_chu')
    parts.push('Không cộng vào tổng (đã có trong các dòng theo đường kính)')
  for (const flag of item.flags ?? []) parts.push(`⚑ ${flag.message}`)
  return parts.join(' · ')
}

function btklSheet(
  results: AcTpBtklResult[],
  meta: AcTpBtklWorkbookMeta
): AcTpXlsxSheet {
  const rows: AcTpXlsxCell[][] = []
  const merges: string[] = []
  const banner = (v: string, s: AcTpXlsxStyle) => {
    rows.push([{ v, s }])
    merges.push(`A${rows.length}:E${rows.length}`)
  }
  banner('BẢNG TỔNG HỢP KHỐI LƯỢNG KẾT CẤU', 'title')
  if (meta.congTrinh) banner(`Công trình: ${meta.congTrinh}`, 'subtitle')
  banner(
    `Đối tượng: ${results.map(r => r.doiTuong).join(', ')}` +
      (meta.ngay ? ` · Ngày lập: ${meta.ngay}` : ''),
    'subtitle'
  )
  rows.push([])
  const headerRow = rows.length + 1
  rows.push(
    ['STT', 'Hạng mục', 'Đơn vị', 'Khối lượng', 'Diễn giải công thức'].map(
      v => ({ v, s: 'header' as const })
    )
  )
  for (const r of results) {
    rows.push([
      { v: '', s: 'bold' },
      { v: r.doiTuong.toUpperCase(), s: 'bold' },
      { v: '', s: 'bold' },
      { v: '', s: 'bold' },
      { v: '', s: 'bold' }
    ])
    if (r.errors.length) {
      rows.push([
        { v: '', s: 'cell' },
        { v: 'Không lập được bảng khối lượng', s: 'cellWrap' },
        { v: '', s: 'cell' },
        { v: '', s: 'cell' },
        { v: r.errors.join(' · '), s: 'cellWrap' }
      ])
      continue
    }
    for (const item of r.items) {
      const strong = item.laTong || !item.stt.includes('.')
      const note = item.nhom === 'ghi_chu'
      const text: AcTpXlsxStyle = note ? 'note' : strong ? 'bold' : 'cellWrap'
      const num: AcTpXlsxStyle = note
        ? 'noteNumber'
        : strong
          ? 'boldNumber'
          : 'number'
      rows.push([
        { v: item.stt, s: note ? 'note' : 'cellCenter' },
        { v: item.hangMuc, s: text },
        { v: UNIT[item.donVi], s: note ? 'note' : 'cellCenter' },
        item.khoiLuong === null
          ? { v: '—', s: note ? 'note' : 'cellCenter' }
          : { v: Math.round(item.khoiLuong * 1000) / 1000, s: num },
        { v: acTpBtklExplain(item), s: note ? 'note' : 'cellWrap' }
      ])
    }
  }
  rows.push([])
  for (const line of [
    'Ghi chú:',
    '- Khối lượng làm tròn 3 chữ số thập phân; diễn giải ghi trị số của chính hồ sơ (m).',
    '- "Bảng SUB-100 bản gốc": dòng lấy nguyên số của bản vẽ gốc khi hình học còn là mẫu M1; hình học đổi thì không tính.',
    '- Thép: kg/m theo bảng thống kê của bản gốc; thanh không có trong bảng gốc dùng d² × 0,00617.',
    '- ⚑: cờ cần kỹ sư xem (lệch bảng gốc, mâu thuẫn hình/bảng chưa chốt).'
  ]) {
    rows.push([{ v: line, s: 'text' }])
    merges.push(`A${rows.length}:E${rows.length}`)
  }
  return {
    name: 'BTKL',
    columns: [7, 42, 8, 14, 80],
    rows,
    merges,
    freezeRows: headerRow,
    printTitleRows: [headerRow, headerRow],
    landscape: true
  }
}

const STEEL_HEAD = [
  'STT',
  'Số hiệu',
  'Đường kính (mm)',
  'Loại thép',
  'Số lượng (thanh)',
  'Dài 1 thanh (mm)',
  'Tổng dài (m)',
  'kg/m',
  'Khối lượng (kg)',
  'Cấu kiện',
  'Ghi chú'
]

function steelSheet(result: AcTpBtklResult, name: string): AcTpXlsxSheet {
  const rows: AcTpXlsxCell[][] = []
  const merges: string[] = []
  const width = STEEL_HEAD.length
  const span = `A1:${String.fromCharCode(64 + width)}1`
  rows.push([
    {
      v: `BẢNG THỐNG KÊ CỐT THÉP — ${result.doiTuong.toUpperCase()}`,
      s: 'title'
    }
  ])
  merges.push(span)
  rows.push([])
  const headerRow = rows.length + 1
  rows.push(STEEL_HEAD.map(v => ({ v, s: 'header' as const })))
  if (!result.bars.length) {
    const steel = result.items.find(i => i.key === 'thep')
    const reason =
      steel && steel.khoiLuong !== null
        ? `chưa có bố trí từng thanh cho hình học này; ${steel.hangMuc} = ${acTpBtklNumber(steel.khoiLuong)} kg (xem bảng khối lượng).`
        : (steel?.lyDo ?? result.errors.join(' · '))
    rows.push([{ v: `Không có bảng thép: ${reason}`, s: 'cellWrap' }])
    merges.push(
      `A${rows.length}:${String.fromCharCode(64 + width)}${rows.length}`
    )
  }
  const first = rows.length + 1
  result.bars.forEach((b: AcTpBtklBar, i) => {
    const r = rows.length + 1
    const total = (b.count * b.length) / 1000
    const notes = (b.flags ?? []).map(f => `⚑ ${f.message}`)
    if (b.kgPerMSource === 'cong_thuc') notes.push('kg/m = d² × 0,00617')
    rows.push([
      { v: i + 1, s: 'cellCenter' },
      { v: b.mark, s: 'cellCenter' },
      { v: b.diameter, s: 'cellCenter' },
      { v: b.surface === 'ribbed' ? 'Có gờ' : 'Trơn', s: 'cellCenter' },
      { v: b.count, s: 'integer' },
      { v: b.length, s: 'integer' },
      {
        v: exact(total),
        s: 'number',
        f: `E${r}*F${r}/1000`
      },
      { v: b.kgPerM, s: 'number' },
      { v: exact(b.kg), s: 'number', f: `G${r}*H${r}` },
      { v: PART[b.group] ?? b.group, s: 'cellWrap' },
      { v: notes.join(' · '), s: 'cellWrap' }
    ])
  })
  if (result.bars.length) {
    const last = rows.length
    const sum = result.bars.reduce((s, b) => s + b.kg, 0)
    rows.push([
      { v: '', s: 'bold' },
      { v: 'Tổng cộng', s: 'bold' },
      ...Array.from({ length: 6 }, () => ({ v: '', s: 'bold' as const })),
      {
        v: exact(sum),
        s: 'boldNumber',
        f: `SUM(I${first}:I${last})`
      },
      { v: '', s: 'bold' },
      { v: '', s: 'bold' }
    ])
  }
  return {
    name,
    columns: [6, 9, 10, 9, 10, 11, 12, 8, 14, 22, 60],
    rows,
    merges,
    freezeRows: headerRow,
    printTitleRows: [headerRow, headerRow],
    landscape: true
  }
}

/**
 * The workbook of one or more take-offs: "BTKL", then a steel schedule per
 * object ("Thép chi tiết" when there is one object).
 */
export function acTpBtklWorkbook(
  results: AcTpBtklResult[],
  meta: AcTpBtklWorkbookMeta = {}
): Uint8Array {
  if (!results.length) throw new Error('Chưa có đối tượng nào để lập BTKL.')
  const steel = results.map((r, i) =>
    steelSheet(
      r,
      results.length === 1
        ? 'Thép chi tiết'
        : `Thép ${i + 1} ${r.doiTuong}`
            .slice(0, 31)
            .replace(/[[\]:*?/\\]/g, '-')
    )
  )
  return acTpXlsx([btklSheet(results, meta), ...steel], {
    title: 'Bảng tổng hợp khối lượng kết cấu',
    creator: 'MLightCAD — BTKL'
  })
}
