import { acTpBtklMo } from '../src/btkl/mo'
import { DOSSIER_DIM_SYMBOLS } from '../src/dossier/dimSymbols'
import {
  buildDossierModel,
  DOSSIER_A3_VERSION,
  dossierDefaults
} from '../src/dossier/model'
import { buildDossierScene, type DossierPrimitive } from '../src/dossier/scene'

/**
 * Phase 1 (b): 72 of the 89 dimensions of SUB-010 write a symbol ("B Mố",
 * "HB"…) over their measurement, so a change of bBe from 7700 to 8000 left
 * "B Mố" on a dimension that now measured 8000. These tests pin what each
 * symbol measures, and that in the numeric modes no dimension changes length
 * while keeping its old text.
 */
type Values = Record<string, number | string>
const scene = (values: Values) =>
  buildDossierScene(buildDossierModel(values), DOSSIER_A3_VERSION)
type Dim = Extract<DossierPrimitive, { kind: 'dimension' }>
const GENERAL = ['SUB-010', 'SUB-020']
const dims = (values: Values) =>
  scene(values)
    .sheets.filter(s => GENERAL.includes(s.id))
    .flatMap(s => s.primitives)
    .filter((p): p is Dim => p.kind === 'dimension' && !!p.sourceHandle)
const measured = (d: Dim) => {
  const dx = d.end[0] - d.start[0],
    dy = d.end[1] - d.start[1]
  if (d.direction === 'ngang') return Math.abs(dx)
  if (d.direction === 'dung') return Math.abs(dy)
  return Math.hypot(dx, dy)
}

/** Changes the stretch grid follows (as dossierParams030's VARIANTS). */
const VARIANTS: Values[] = [
  { hBe: 2500 },
  { bBe: 8500, bThan: 8500, aCocNgang: 6100 },
  { D: 1500, aCocNgang: 4700, aCocDoc: 3000 },
  { lBe: 6500, aCocDoc: 4100 },
  { tThan: 1800 },
  { hThan: 5200 },
  { lCanh: 7000 },
  { muiBe: 2300 },
  {
    hBe: 2500,
    bBe: 8500,
    bThan: 8500,
    aCocNgang: 6100,
    caoDoDayBe: 230,
    lCanh: 7000
  }
]

/** Symbols whose measurement is off what their parameters say. */
function mismatches(change: Values) {
  const values = { ...dossierDefaults(), ...change }
  const wrong: { symbol: string; text: string }[] = []
  const checked = new Set<string>()
  for (const d of dims(change)) {
    const symbol =
      d.text !== undefined ? DOSSIER_DIM_SYMBOLS[d.text] : undefined
    if (!symbol) continue
    checked.add(d.text!)
    // Exact symbols to the source's drawing accuracy (HB is drawn 1997);
    // those off the axis by the cross fall within it.
    const tolerance = symbol.xapXi ? 160 : 5
    if (Math.abs(measured(d) - symbol.giaTri(values)) > tolerance)
      wrong.push({
        symbol: d.text!,
        text: `${d.text} ${Math.round(measured(d))}≠${symbol.giaTri(values)}`
      })
  }
  return { wrong, checked }
}

describe('dimension symbols measure their parameters', () => {
  test.each([{}, ...VARIANTS])('%j', change => {
    const { wrong, checked } = mismatches(change)
    // Every symbol, every variant: the grid follows the parameters — road
    // width, wings and the seat N fixed (standard assumption 9).
    expect(wrong.map(w => w.text)).toEqual([])
    // Every symbol of the table occurs on the general sheets.
    expect([...checked].sort()).toEqual(Object.keys(DOSSIER_DIM_SYMBOLS).sort())
  })

  // The three gaps the first version of this file pinned with test.failing.
  test('road width, wings and the seat follow their own parameters', () => {
    const at = (change: Values, symbol: string) =>
      dims(change)
        .filter(d => d.text === symbol)
        .map(d => measured(d))
    // Within the source's drawing accuracy (it draws T 501 in one place).
    const near = (values: number[], want: number) =>
      values.length > 0 && values.every(v => Math.abs(v - want) <= 5)
    expect(
      near(at({ bBe: 8500, bThan: 8500, aCocNgang: 6100 }, 'B Mặt đường'), 7000)
    ).toBe(true)
    expect(
      near(at({ D: 1500, aCocNgang: 4700, aCocDoc: 3000 }, 'W(t)'), 500)
    ).toBe(true)
    expect(near(at({ tThan: 1800 }, 'T'), 500)).toBe(true)
    expect(near(at({ tThan: 1800 }, 'N'), 1300)).toBe(true)
    expect(near(at({ tThan: 1800 }, 'B4'), 3800)).toBe(true)
    // The take-off measures the same wing: its 1:1 slope run is the drawn B4,
    // and its ear walls use the drawn seat N.
    const btkl = acTpBtklMo({ tThan: 1800 })
    expect(btkl.items.find(i => i.key === 'canh')!.dienGiai).toContain(
      'phần vát 1:1 dài 3,8'
    )
    expect(btkl.items.find(i => i.key === 'tai')!.dienGiai).toContain(
      'N = tThan − 0,5 = 1,3'
    )
  })
})

describe('nhanKichThuoc', () => {
  const base = dims({})

  test('ky_hieu (default) is the source as delivered', () => {
    expect(dossierDefaults().nhanKichThuoc).toBe('ky_hieu')
    expect(base.filter(d => d.text !== undefined).length).toBeGreaterThan(80)
    expect(dims({ nhanKichThuoc: 'ky_hieu' })).toEqual(base)
  })

  test.each(VARIANTS)(
    'no dimension changes length and keeps its old text: %j',
    change => {
      const before = new Map(base.map(d => [d.sourceHandle, d]))
      for (const mode of ['so_do', 'ca_hai']) {
        let moved = 0
        for (const d of dims({ ...change, nhanKichThuoc: mode })) {
          const was = before.get(d.sourceHandle)!
          if (Math.abs(measured(d) - measured(was)) < 1) continue
          moved += 1
          // Measured by the CAD: no override, or the override embeds <>.
          // Spacing notes ("@500") are not lengths and stay.
          const measures =
            d.text === undefined ||
            d.text.includes('<>') ||
            d.text.startsWith('@')
          expect([d.sourceHandle, d.text, measures]).toEqual([
            d.sourceHandle,
            d.text,
            true
          ])
        }
        expect(moved).toBeGreaterThan(0)
      }
    }
  )

  test('so_do drops the symbols, ca_hai writes symbol = <>', () => {
    const so = dims({ nhanKichThuoc: 'so_do' })
    const ca = dims({ nhanKichThuoc: 'ca_hai' })
    const bMo = (list: Dim[]) =>
      list.filter(
        d => base.find(b => b.sourceHandle === d.sourceHandle)?.text === 'B Mố'
      )
    expect(bMo(so).map(d => d.text)).toEqual([
      undefined,
      undefined,
      undefined,
      undefined
    ])
    expect(bMo(ca).map(d => d.text)).toEqual(Array(4).fill('B Mố = <>'))
    // Texts that already measure, and spacing notes, are left alone.
    for (const keep of ['\\X<>', '@500', '@B(G)'])
      expect(so.some(d => d.text === keep)).toBe(true)
  })

  test('not a geometry change: the steel and the source detail stay', () => {
    const s = scene({ nhanKichThuoc: 'so_do' })
    expect(s.detailMode).toBe('source')
    expect(s.model.referenceSteelApplicable).toBe(true)
  })
})

describe('elevation tags and the abutment name', () => {
  const elev = (values: Values) =>
    scene(values)
      .sheets.filter(s => GENERAL.includes(s.id))
      .flatMap(s => s.primitives)
      .flatMap(p => {
        if (p.kind !== 'insert' || !p.attributes?.ELEV) return []
        const a = p.attributes.ELEV
        return [typeof a === 'string' ? a : a.value]
      })

  test('numeric modes show the SUB-020 elevations, following caoDoDayBe', () => {
    expect(elev({}).every(t => /^(EL|F)[\w.]*$/.test(t))).toBe(true)
    const so = elev({ nhanKichThuoc: 'so_do' })
    expect(so.every(t => /^\d+\.\d{3}$/.test(t))).toBe(true)
    // The datum moves every elevation by the same amount.
    const raised = elev({ nhanKichThuoc: 'so_do', caoDoDayBe: 230 })
    raised.forEach((t, i) =>
      expect(Number(t) - Number(so[i])).toBeCloseTo(230 - 228.837, 3)
    )
    const both = elev({ nhanKichThuoc: 'ca_hai' })
    expect(both.every(t => /^(EL|F)[\w.]* = \d+\.\d{3}$/.test(t))).toBe(true)
  })

  test('the general sheets name the abutment from tenMo', () => {
    const texts = (values: Values) =>
      scene(values)
        .sheets.filter(s => s.id === 'SUB-010')
        .flatMap(s => s.primitives)
        .flatMap(p => (p.kind === 'text' ? [p.text] : []))
    expect(texts({})).toContain('%%UMẶT CHÍNH MỐ M1')
    const m2 = texts({ tenMo: 'M2' })
    expect(m2).toContain('%%UMẶT CHÍNH MỐ M2')
    expect(m2.some(t => /\bM1\b/.test(t))).toBe(false)
  })
})
