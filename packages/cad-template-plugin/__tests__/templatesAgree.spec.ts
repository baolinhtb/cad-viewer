/**
 * Two templates in one build must not state the same clause differently.
 *
 * `cau_ban_btct` drew its own kerb with a 10–40 cm range and a 25 cm default,
 * while `go_chan_banh_tcvn` — the standalone component for the same role —
 * cited TCVN 11823-13:2017 điều 11.2 and refused anything outside 15–20 cm. The
 * parent's *default* was already outside the component's range, so the same
 * office got a legal kerb or an illegal one depending on which tool the
 * assistant happened to reach for, with both claiming the same standard.
 */
import { listTemplates } from '../src/templateRegistry'

/** Just the fields these checks read; the SDK's own type is readonly. */
interface Spec {
  key: string
  unit?: string
  min?: number
  max?: number
  hint?: string
  default?: unknown
}

const specs = (template: { params: readonly unknown[] }): readonly Spec[] =>
  template.params as readonly Spec[]

/** Where a part is put, as opposed to how big it is. */
const PLACEMENT = new Set(['x', 'y', 'z', 'ben', 'veTim'])

/** A parameter's bounds in millimetres, whatever unit it declares. */
function boundsOf(templateId: string, key: string) {
  const template = listTemplates().find(t => t.meta.id === templateId)
  if (!template) throw new Error(`không có template ${templateId}`)
  const param = specs(template).find(p => p.key === key)
  if (!param) throw new Error(`${templateId} không có tham số ${key}`)
  const scale = param.unit === 'cm' ? 10 : param.unit === 'm' ? 1000 : 1
  return {
    min: param.min === undefined ? undefined : param.min * scale,
    max: param.max === undefined ? undefined : param.max * scale
  }
}

describe('templates that draw the same part', () => {
  test('agree on the kerb height, and on the clause behind it', () => {
    // The two spell the dimension differently — `hGoChan` in the bridge, `h` in
    // the standalone kerb — which is exactly why the disagreement survived: no
    // name lined them up. They draw the same role and cite the same clause, so
    // the numbers have to match.
    const inBridge = boundsOf('cau_ban_btct', 'hGoChan')
    const standalone = boundsOf('go_chan_banh_tcvn', 'h')

    expect(inBridge).toEqual(standalone)
    // And both are the clause: TCVN 11823-13:2017 điều 11.2.
    expect(inBridge).toEqual({ min: 150, max: 200 })
  })

  test('every default sits inside its own declared range', () => {
    // The parent's 25 cm default was outside the range its own component
    // enforced — a template can contradict itself as easily as another.
    for (const template of listTemplates()) {
      for (const param of specs(template)) {
        const value = param.default
        if (typeof value !== 'number') continue
        if (param.min !== undefined) {
          expect({ t: template.meta.id, k: param.key, value }).toEqual(
            expect.objectContaining({ value: expect.any(Number) })
          )
          expect(value).toBeGreaterThanOrEqual(param.min)
        }
        if (param.max !== undefined) expect(value).toBeLessThanOrEqual(param.max)
      }
    }
  })

  test('every bounded parameter says where its bounds come from', () => {
    // Either a clause, or an explicit statement that no clause governs. Silence
    // is what sends the assistant off to look a standard up that does not exist.
    //
    // Only parameters that declare a bound. Placement — `x`, `y`, `ben` — has
    // nothing to justify, and demanding provenance for it would turn this into
    // a rule people satisfy with noise.
    const silent: string[] = []
    for (const template of listTemplates()) {
      for (const param of specs(template)) {
        if (param.min === undefined && param.max === undefined) continue
        // Placement declares bounds too, but they guard a typo rather than a
        // design decision — nobody checks where a part sits against a standard.
        if (PLACEMENT.has(param.key)) continue
        const hint = param.hint ?? ''
        const cites = /TCVN|AASHTO|ISO|QCVN/.test(hint)
        const disclaims = /do (tính toán|thiết kế|cấu tạo)|chặn sai số|không quy định/i.test(hint)
        if (!cites && !disclaims) silent.push(`${template.meta.id}.${param.key}`)
      }
    }
    expect(silent).toEqual([])
  })
})
