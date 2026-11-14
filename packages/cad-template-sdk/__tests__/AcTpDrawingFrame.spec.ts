import {
  ACTP_FRAME_LAYOUTS,
  acTpBuildDrawingFrame,
  acTpEstimateTextWidth,
  acTpFrameTextBounds,
  type AcTpFrameBox,
  type AcTpFramePrimitive,
  type AcTpPaperSize,
  type AcTpTitleBlockFields
} from '../src/AcTpDrawingFrame'

/** A realistic sheet, in Vietnamese with full diacritics. */
const SAMPLE: AcTpTitleBlockFields = {
  duAn: 'Dự án đầu tư xây dựng tuyến đường nối Quốc lộ 1A — Cao tốc Bắc Nam',
  congTrinh: 'Cầu Km0+400 (Tuyến số 2)',
  tenBanVe: 'Bố trí chung mố M1 — mặt chính, mặt cắt A–A và B–B',
  soHieuTo: 'M1-BC01',
  soTo: '1/6',
  tiLe: '1:100',
  ngay: '14/11/2026',
  giaiDoan: 'TKBVTC',
  donVi: 'Công ty Cổ phần Tư vấn Thiết kế Cầu đường 33',
  chuTri: 'Nguyễn Văn Hưởng',
  thietKe: 'Trần Thị Ngọc Ánh',
  kiemTra: 'Lê Hoàng Quốc Việt',
  duyet: 'Phạm Đức Thắng',
  trangThai: 'BẢN NHÁP — CHƯA PHÁT HÀNH THI CÔNG',
  ghiChu: 'Kích thước mm; cao độ m.'
}

const texts = (primitives: AcTpFramePrimitive[]) =>
  primitives.filter(
    (p): p is Extract<AcTpFramePrimitive, { kind: 'text' }> => p.kind === 'text'
  )

const inside = (inner: AcTpFrameBox, outer: AcTpFrameBox, tol = 1e-6) =>
  inner.x >= outer.x - tol &&
  inner.y >= outer.y - tol &&
  inner.x + inner.w <= outer.x + outer.w + tol &&
  inner.y + inner.h <= outer.y + outer.h + tol

describe.each<AcTpPaperSize>(['A3', 'A1'])('khung %s', size => {
  const frame = acTpBuildDrawingFrame({ khoGiay: size, truong: SAMPLE })
  const layout = ACTP_FRAME_LAYOUTS[size]

  test('sheet, border and strip follow the layout table', () => {
    expect([frame.width, frame.height]).toEqual(
      size === 'A3' ? [420, 297] : [841, 594]
    )
    const outer = frame.primitives.find(p => p.partId === 'khung_ban_ve_ngoai')
    const inner = frame.primitives.find(p => p.partId === 'khung_ban_ve_trong')
    expect(outer && outer.kind === 'path' && outer.points).toEqual([
      [0, 0],
      [frame.width, 0],
      [frame.width, frame.height],
      [0, frame.height]
    ])
    expect(inner && inner.kind === 'path' && inner.points[0]).toEqual([
      layout.margin.left,
      layout.margin.bottom
    ])
    expect(frame.titleStrip.h).toBe(layout.stripHeight)
    expect(frame.titleStrip.w).toBeCloseTo(
      frame.width - layout.margin.left - layout.margin.right
    )
  })

  test('every primitive is on a frame role and inside the sheet', () => {
    for (const p of frame.primitives) {
      expect(['khung_ban_ve', 'khung_ten']).toContain(p.role)
      const pts = p.kind === 'path' ? p.points : [p.at]
      for (const [x, y] of pts) {
        expect(x).toBeGreaterThanOrEqual(0)
        expect(y).toBeGreaterThanOrEqual(0)
        expect(x).toBeLessThanOrEqual(frame.width)
        expect(y).toBeLessThanOrEqual(frame.height)
      }
    }
  })

  test('no field text runs past its cell — with long Vietnamese values', () => {
    for (const t of texts(frame.primitives)) {
      if (!t.field) continue
      const cell = frame.cells[t.field]!
      expect({
        field: t.field,
        ok: inside(acTpFrameTextBounds(t), cell)
      }).toEqual({ field: t.field, ok: true })
    }
  })

  test('captions fit their own cells too', () => {
    for (const t of texts(frame.primitives)) {
      expect({
        text: t.text,
        ok: inside(acTpFrameTextBounds(t), t.cell)
      }).toEqual({
        text: t.text,
        ok: true
      })
    }
  })

  test('every field reaches the sheet, fitted rather than cut', () => {
    const shown = new Set(texts(frame.primitives).map(t => t.field))
    for (const field of Object.keys(SAMPLE))
      expect(shown.has(field as never)).toBe(true)
    expect(frame.fit.filter(f => f.mode === 'cat')).toEqual([])
  })

  test('the drawing area is clear of the strip and its notes', () => {
    const top = Math.max(
      ...texts(frame.primitives)
        .filter(t => t.field === 'trangThai' || t.field === 'ghiChu')
        .map(t => acTpFrameTextBounds(t))
        .map(b => b.y + b.h)
    )
    expect(frame.drawArea.y).toBeGreaterThanOrEqual(top)
    expect(frame.drawArea.y).toBeGreaterThan(
      frame.titleStrip.y + frame.titleStrip.h
    )
  })
})

describe('fitting', () => {
  test('a short value stays one line at full size', () => {
    const f = acTpBuildDrawingFrame({ khoGiay: 'A3', truong: { soTo: '1/6' } })
    const t = texts(f.primitives).find(p => p.field === 'soTo')!
    expect(t).toMatchObject({ height: 2.5, widthFactor: 1, text: '1/6' })
    expect(f.fit).toEqual([])
  })

  test('a long title wraps before it shrinks', () => {
    const f = acTpBuildDrawingFrame({
      khoGiay: 'A3',
      truong: { tenBanVe: SAMPLE.tenBanVe }
    })
    const lines = texts(f.primitives).filter(p => p.field === 'tenBanVe')
    expect(lines.length).toBeGreaterThan(1)
    expect(lines.every(l => l.height === 3.5 && l.widthFactor === 1)).toBe(true)
    expect(f.fit).toEqual([{ field: 'tenBanVe', mode: 'xuong_dong' }])
  })

  test('an absurd value is cut with an ellipsis, never drawn across a line', () => {
    const f = acTpBuildDrawingFrame({
      khoGiay: 'A3',
      truong: { soHieuTo: 'SO-HIEU-RAT-DAI-KHONG-CO-KHOANG-TRANG-0123456789' }
    })
    const t = texts(f.primitives).find(p => p.field === 'soHieuTo')!
    expect(t.text.endsWith('…')).toBe(true)
    expect(inside(acTpFrameTextBounds(t), f.cells.soHieuTo!)).toBe(true)
    expect(f.fit).toEqual([{ field: 'soHieuTo', mode: 'cat' }])
  })

  test('empty fields leave blank cells', () => {
    const f = acTpBuildDrawingFrame({ khoGiay: 'A1', truong: {} })
    expect(texts(f.primitives).filter(t => t.field)).toEqual([])
    // Captions are still printed.
    expect(texts(f.primitives).map(t => t.text)).toContain('TÊN BẢN VẼ')
  })

  test('width estimate grows with text and height', () => {
    expect(acTpEstimateTextWidth('MỐ', 2.5)).toBeGreaterThan(
      acTpEstimateTextWidth('mố', 2.5)
    )
    expect(acTpEstimateTextWidth('M1', 5)).toBeCloseTo(
      2 * acTpEstimateTextWidth('M1', 2.5)
    )
  })
})
