import { buildDossierModel } from '../src/dossier/model'
import { buildDossierScene } from '../src/dossier/scene'
import { dossierHtml, dossierSheetSvg } from '../src/dossier/export'
import bars from '../src/dossier/reference/bars.json'

describe('M1 dossier model', () => {
  test('a 2 by 2 pile grid is not mistaken for the two piles in elevation', () => {
    const m = buildDossierModel()
    expect(m.issues.filter(i => i.level === 'error')).toEqual([])
    expect(m.piles).toEqual([
      { x: -2650, y: -1800 },
      { x: 2650, y: -1800 },
      { x: -2650, y: 1800 },
      { x: 2650, y: 1800 }
    ])
    expect(m.bearings).toEqual([-3000, -1000, 1000, 3000])
    expect(m.elevations.footing).toBeCloseTo(230.837, 6)
    expect(m.elevations.seat).toBeCloseTo(235.554, 6)
    expect(m.elevations.seatLeft - m.elevations.seatRight).toBeCloseTo(0.154, 6)
    expect(m.referenceSteelApplicable).toBe(true)
  })
  test('footing width does not change the independently specified stem or piles', () => {
    const m = buildDossierModel({ bBe: 8500 })
    expect(m.values.bThan).toBe(7700)
    expect(m.piles[0].x).toBe(-2650)
    expect(m.quantities.footing).toBe(102)
    expect(m.referenceSteelApplicable).toBe(false)
    const scene = buildDossierScene(m)
    for (const s of scene.sheets.filter(s => s.id.startsWith('CT')))
      expect(
        s.primitives.some(
          p => p.kind === 'text' && p.text.includes('CHƯA CÓ PHƯƠNG ÁN THÉP')
        )
      ).toBe(true)
    expect(
      scene.sheets
        .find(s => s.id === 'KL01')!
        .primitives.some(p => p.kind === 'text' && p.text.startsWith('f1 /'))
    ).toBe(false)
  })
  test.each([
    { bBe: 6000 },
    { lBe: 4000 },
    { D: 2500 },
    { tThan: 3000, muiBe: 4000 },
    { aGoi: 4000 },
    { soCotCoc: 2.5 },
    { bBe: true },
    { bBe: '' },
    { bBe: 'NaN' },
    { soCoc: 6 },
    { docNgang: Infinity },
    { lCanh: 2000 },
    { hThan: 1000, hDau: 600 }
  ])('rejects cross-field errors or unknown keys before drawing: %j', input => {
    const m = buildDossierModel(input as never)
    expect(m.issues.some(i => i.level === 'error')).toBe(true)
    expect(() => buildDossierScene(m)).toThrow()
  })
  test('elevation changes propagate equally without altering lengths or source steel', () => {
    const a = buildDossierModel(),
      b = buildDossierModel({ caoDoDayBe: 250 })
    expect(b.elevations.seat - a.elevations.seat).toBeCloseTo(250 - 228.837, 6)
    expect(b.referenceSteelApplicable).toBe(true)
    expect(b.quantities).toEqual(a.quantities)
  })
  test('missing pile length is not inferred from Lc', () => {
    const m = buildDossierModel({ lCanh: 8000 })
    expect(m.values.lCoc).toBe(0)
    expect(m.quantities.pileConcrete).toBeNull()
    const withLength = buildDossierModel({ lCoc: 20000 })
    expect(withLength.quantities.pileConcrete).toBeCloseTo(
      4 * Math.PI * 0.6 ** 2 * 20,
      8
    )
  })
  test('an oversized wing is refused when its views would overlap', () => {
    expect(() =>
      buildDossierScene(buildDossierModel({ lCanh: 12000 }))
    ).toThrow(/chồng vùng/)
  })
  test('source conflicts remain visible and never imply structural approval', () => {
    const m = buildDossierModel()
    expect(m.issues.map(i => i.code)).toEqual(
      expect.arrayContaining([
        'unresolved_beTongLot',
        'unresolved_thepF3',
        'unresolved_thepW16',
        'source_height_conflict',
        'detail_coverage'
      ])
    )
    expect(buildDossierScene(m).status).toBe('draft')
    expect(buildDossierModel({ thepF3: 'D25' }).referenceSteelApplicable).toBe(
      false
    )
    expect(buildDossierModel({ thepW16: 'D14' }).referenceSteelApplicable).toBe(
      false
    )
  })
  test('all 69 bar rows reproduce the extracted source total and keep sides separate', () => {
    expect(bars).toHaveLength(69)
    expect(bars.reduce((sum, b) => sum + b.sourceKg, 0)).toBeCloseTo(
      14058.319,
      3
    )
    expect(
      bars.reduce((sum, b) => sum + ((b.count * b.length) / 1000) * b.kgPerM, 0)
    ).toBeCloseTo(14058.319, 2)
    expect(bars.find(b => b.mark === 'w2')!.length).toBe(3150)
    expect(bars.find(b => b.mark === "w2'")!.length).toBe(6650)
  })
  test('six bounded pages carry draft labels, and HTML cannot inject source text', () => {
    const scene = buildDossierScene(
      buildDossierModel({ tenMo: '<img src=x onerror=alert(1)>' })
    )
    expect(scene.sheets.map(s => s.id)).toEqual([
      'BC01',
      'BC02',
      'CT01',
      'CT02',
      'CT03',
      'KL01'
    ])
    for (const s of scene.sheets) {
      expect(
        s.primitives.some(
          p => p.kind === 'text' && p.text.includes('CHƯA PHÁT HÀNH')
        )
      ).toBe(true)
      for (const p of s.primitives) {
        const points =
          p.kind === 'path'
            ? p.points
            : p.kind === 'dimension'
              ? [p.start, p.end]
              : [p.at]
        for (const [x, y] of points) {
          expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true)
          expect(x).toBeGreaterThanOrEqual(0)
          expect(x).toBeLessThanOrEqual(s.width)
          expect(y).toBeGreaterThanOrEqual(0)
          expect(y).toBeLessThanOrEqual(s.height)
        }
      }
      expect(dossierSheetSvg(s)).toContain('viewBox="0 0 84100 59400"')
    }
    const html = dossierHtml(scene)
    expect(html).not.toContain('<img src=x')
    expect(html).toContain('&lt;img src=x')
    expect(html.match(/<article /g)).toHaveLength(6)
    expect(html).toContain('@page{size:841mm 594mm')
  })
})
