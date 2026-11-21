/**
 * SUB-010 plan: the title "MẶT BẰNG MỐ" and its scale stay clear of the width
 * dimensions written inside the U, and those dimensions of each other,
 * whatever the wing length and width (UI acceptance 22/11/2026, case A0:
 * 8 m road, lCanh 4000 — the title sat on "B Mố = 8700").
 */
import { DOSSIER_DIM_SYMBOLS } from '../src/dossier/dimSymbols'
import {
  buildDossierModel,
  DOSSIER_A3_VERSION,
  dossierDefaults
} from '../src/dossier/model'
import { buildDossierScene, type DossierPrimitive } from '../src/dossier/scene'

type Values = Record<string, number | string>
type Box = { x0: number; x1: number; y0: number; y1: number }
type Dim = Extract<DossierPrimitive, { kind: 'dimension' }>
type Text = Extract<DossierPrimitive, { kind: 'text' }>

const TITLE = '20F0B6B'
const SCALE = '20EF389'
const B_MO = '20F0B54'
const B_MO_2W = '20F0B3A'
const W_T = ['20F0B47', '211BA89']
/** Dimension text height of the source style (_33_D100). */
const DIM_TEXT = 150

const sheet = (v: Values) =>
  buildDossierScene(
    buildDossierModel({ nhanKichThuoc: 'ca_hai', ...v }),
    DOSSIER_A3_VERSION
  ).sheets.find(s => s.id === 'SUB-010')!
const byHandle = (s: ReturnType<typeof sheet>, h: string) =>
  s.primitives.find(p => p.sourceHandle?.split('#')[0] === h)!
/** A generous box for a one-line text: 0,8 × height a character. */
function textBox(at: [number, number], text: string, h: number, align = 0) {
  const w = text.replace(/%%U/g, '').length * 0.8 * h
  const x0 = align === 1 ? at[0] - w / 2 : align === 2 ? at[0] - w : at[0]
  return { x0, x1: x0 + w, y0: at[1], y1: at[1] + h }
}
const dimBox = (d: Dim): Box => {
  const shown = (d.text ?? '<>').replace('<>', '8700')
  const at = d.textAt ?? d.start
  return textBox([at[0], at[1] - DIM_TEXT / 2], shown, DIM_TEXT, 1)
}
const overlaps = (a: Box, b: Box) =>
  a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1
const measured = (d: Dim) => Math.abs(d.end[0] - d.start[0])

const A0: Values = {
  bMatDuong: 8000,
  tThan: 1200,
  lCanh: 4000,
  D: 1000,
  lCoc: 25000,
  bBe: 8700,
  bThan: 8700,
  aCocNgang: 6700,
  aCocDoc: 4000
}

describe('plan title clear of the width dimensions', () => {
  test.each([
    ['source', {}],
    ['A0: 8 m road, lCanh 4000', A0],
    ['A0 with 6 bearings', { ...A0, soGoi: 6, aGoi: 1400 }],
    ['shortest wings', { lCanh: 4000 }],
    ['longer wings', { lCanh: 7000 }],
    [
      '8 m road only',
      { bMatDuong: 8000, bBe: 8700, bThan: 8700, aCocNgang: 6300 }
    ]
  ] as [string, Values][])('%s', (_name, v) => {
    const s = sheet(v)
    const title = byHandle(s, TITLE) as Text
    const scale = byHandle(s, SCALE) as Text
    const heads = [title, scale].map(t =>
      textBox(t.at, t.text, t.height, t.align)
    )
    const dims = [B_MO, B_MO_2W, ...W_T].map(h => byHandle(s, h) as Dim)
    for (const head of heads)
      for (const d of dims) expect(overlaps(head, dimBox(d))).toBe(false)
    expect(overlaps(dimBox(dims[0]), dimBox(dims[1]))).toBe(false)
    // The title above its scale, both above the dimensions.
    expect(title.at[1]).toBeGreaterThan(scale.at[1])
    expect(scale.at[1]).toBeGreaterThan(dimBox(dims[0]).y1)
    // The dimensions still measure the stem and the inside of the U.
    const full = { ...dossierDefaults(), ...v }
    expect(measured(dims[0])).toBeCloseTo(
      DOSSIER_DIM_SYMBOLS['B Mố'].giaTri(full),
      0
    )
    expect(measured(dims[1])).toBeCloseTo(
      DOSSIER_DIM_SYMBOLS['B Mố - 2 W(t)'].giaTri(full),
      0
    )
  })

  test('A0 measures 8700 and 7700; the source keeps its place exactly', () => {
    const s = sheet(A0)
    expect(measured(byHandle(s, B_MO) as Dim)).toBeCloseTo(8700, 0)
    expect(measured(byHandle(s, B_MO_2W) as Dim)).toBeCloseTo(7700, 0)
    // Width alone moves nothing up or down.
    const wide = sheet({
      bMatDuong: 8000,
      bBe: 8700,
      bThan: 8700,
      aCocNgang: 6300
    })
    const source = sheet({})
    for (const h of [TITLE, SCALE, B_MO, B_MO_2W]) {
      const y = (x: ReturnType<typeof sheet>) => {
        const p = byHandle(x, h)
        return p.kind === 'text' ? p.at[1] : (p as Dim).textAt![1]
      }
      expect(y(wide)).toBeCloseTo(y(source), 6)
    }
  })

  test('nothing else on the sheet sits on the title', () => {
    for (const v of [{}, A0, { lCanh: 7000 }] as Values[]) {
      const s = sheet(v)
      const title = byHandle(s, TITLE) as Text
      const head = textBox(title.at, title.text, title.height, title.align)
      const others = s.primitives.flatMap(p =>
        p === title || p.role === 'khung_ten' || p.role === 'khung_ban_ve'
          ? []
          : p.kind === 'text'
            ? [textBox(p.at, p.text, p.height, p.align)]
            : p.kind === 'dimension'
              ? [dimBox(p)]
              : []
      )
      expect(others.filter(b => overlaps(head, b))).toEqual([])
    }
  })
})
