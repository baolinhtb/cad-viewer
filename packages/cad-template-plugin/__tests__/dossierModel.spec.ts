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
    const scene = buildDossierScene(m, '0.2.0')
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
    expect(() => buildDossierScene(m, '0.2.0')).toThrow()
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
      buildDossierScene(buildDossierModel({ lCanh: 12000 }), '0.2.0')
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
    expect(buildDossierScene(m, '0.2.0').status).toBe('draft')
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
      buildDossierModel({ tenMo: '<img src=x onerror=alert(1)>' }),
      '0.2.0'
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
          p.kind === 'fill'
            ? p.loops.flat()
            : p.kind === 'path'
              ? p.points
              : p.kind === 'dimension'
                ? [p.start, p.end]
                : p.kind === 'leader'
                  ? p.points
                  : [p.at]
        for (const [x, y] of points) {
          expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true)
          expect(x).toBeGreaterThanOrEqual(0)
          expect(x).toBeLessThanOrEqual(s.width)
          expect(y).toBeGreaterThanOrEqual(0)
          expect(y).toBeLessThanOrEqual(s.height)
        }
      }
      expect(dossierSheetSvg(s)).toContain(
        `viewBox="0 0 ${s.width} ${s.height}"`
      )
    }
    const html = dossierHtml(scene)
    expect(html).not.toContain('<img src=x')
    expect(html).toContain('&lt;img src=x')
    expect(html.match(/<article /g)).toHaveLength(6)
    expect(html).toContain('@page{size:841mm 594mm')
  })
})

test('sheet export retains colored notes and patterned centerlines', () => {
  const scene = buildDossierScene(buildDossierModel(), '0.2.0')
  const svg = scene.sheets.map(s => dossierSheetSvg(s)).join('')
  expect(svg).toContain('color="#166534"')
  expect(svg).toContain('color="#854d0e"')
  expect(svg).toContain('stroke-dasharray="375 75 75 75"')
  expect(svg).toContain('stroke="none" stroke-dasharray="none"')
  const custom = dossierSheetSvg(scene.sheets[0], undefined, {
    'GC-GHICHU': { color: 1 }
  })
  expect(custom).toContain('color="#b91c1c"')
})

test('legacy gray annotation catalogue exports semantic accents', () => {
  const scene = buildDossierScene(buildDossierModel(), '0.2.0')
  const svg = dossierSheetSvg(scene.sheets[0], undefined, {
    'GC-GHICHU': { color: 8 }
  })
  expect(svg).toContain('color="#166534"')
})

describe('0.2.0 schematic: the two rails are mirror images', () => {
  // Both rails used to share one profile [x−250, x+250, x+150, x−100]: the
  // right rail had its 150 mm bevel towards the road, the left one away from
  // it (cf. fix/lan-can-quay-mat-vat-vao-tim for the parapet template).
  test.each<Record<string, number>>([
    {},
    { docNgang: 0 },
    { bMatDuong: 6000, hLanCan: 1000 }
  ])('vertices mirror about the axis for %j', values => {
    // A changed geometry draws the schematic in every view.
    const scene = buildDossierScene(
      buildDossierModel({ hBe: 2100, ...values }),
      '0.2.0'
    )
    const rails = scene.sheets
      .flatMap(s => s.primitives)
      .filter(p => p.role === 'lan_can' && p.kind === 'path')
    expect(rails.length).toBeGreaterThanOrEqual(2)
    const [left, right] = rails.slice(0, 2) as Array<{
      points: [number, number][]
    }>
    const axis = (left.points[0][0] + right.points[0][0]) / 2
    // Same profile, reflected: x mirrored, heights over each base equal.
    const relative = (pts: [number, number][], mirror: boolean) =>
      pts.map(([x, y]) => [
        Math.round(mirror ? axis - x : x - axis),
        Math.round(y - pts[0][1])
      ])
    expect(relative(left.points, true)).toEqual(relative(right.points, false))
    // The wider bevel (150 mm) faces the road on both sides.
    for (const [rail, inward] of [
      [left, 1],
      [right, -1]
    ] as const) {
      const [b0, b1, t0, t1] = rail.points
      const innerBase =
        inward > 0 ? Math.max(b0[0], b1[0]) : Math.min(b0[0], b1[0])
      const innerTop =
        inward > 0 ? Math.max(t0[0], t1[0]) : Math.min(t0[0], t1[0])
      expect(Math.abs(innerTop - innerBase)).toBe(150)
    }
  })
})
