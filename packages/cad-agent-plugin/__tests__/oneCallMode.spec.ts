/**
 * One request, one model call.
 *
 * A turn is not one call — it is one call per step, and every step resends the
 * whole conversation. Capping the budget at one is the largest single lever on
 * what a drawing costs, and it comes with a cost of its own: the model never
 * sees what its tools returned, so it cannot correct a refused value and cannot
 * report what happened. The report has to come from the tools instead, which is
 * what these tests pin down.
 */
// The viewer core ships as a UMD bundle jest cannot load, and the i18n module
// pulls it in transitively. Same stub the other agent specs use.
jest.mock('@mlightcad/cad-simple-viewer', () => ({
  __esModule: true,
  AcApDocManager: { instance: { curDocument: { database: {} } } },
  acapRunGroupedEdit: async (
    _db: unknown,
    _label: string,
    fn: () => void | Promise<void>
  ) => {
    await fn()
  }
}))

// Labels come from a locale the panel installs at runtime; a spec has no
// panel, and what is under test is which outcomes get reported, not how they
// are worded.
jest.mock('../src/i18n', () => ({
  __esModule: true,
  agentT: (key: string) => key
}))

jest.mock('../src/tools/cadTools', () => ({
  __esModule: true,
  createCadTools: () => ({})
}))

import { reportToolOutcomes } from '../src/agent/createCadAgent'
import { stepBudget } from '../src/storage/AgentModeStore'

/** A finished assistant message carrying one tool part. */
function assistantWith(parts: unknown[]) {
  return [
    { id: 'u1', role: 'user' as const, parts: [{ type: 'text', text: 'vẽ' }] },
    { id: 'a1', role: 'assistant' as const, parts }
  ] as never
}

describe('stepBudget', () => {
  test('one call means one call', () => {
    expect(stepBudget('mot-lenh')).toBe(1)
  })

  test('the other modes keep the full budget', () => {
    expect(stepBudget('simple')).toBe(10)
    expect(stepBudget('high-inference')).toBe(10)
  })
})

describe('reportToolOutcomes', () => {
  test('a refusal is surfaced, marked, and readable on its own', () => {
    // Without this the turn is silently wrong: the assistant's text was
    // written before the tool ran, so it claims a section it never drew.
    const text = reportToolOutcomes(
      assistantWith([
        { type: 'text', text: 'Đã dựng mặt cắt.' },
        {
          type: 'tool-chay_template',
          state: 'output-available',
          output: {
            ok: false,
            status: 'refused',
            message:
              'Chiều cao lan can 809 mm không đạt cấp thử nghiệm TL-4: tối thiểu 810 mm.'
          }
        }
      ])
    )
    expect(text).toContain('⚠')
    expect(text).toContain('810')
    expect(text).toContain('TL-4')
  })

  test('a success is relayed too, so the drawing is described', () => {
    const text = reportToolOutcomes(
      assistantWith([
        {
          type: 'tool-chay_template',
          state: 'output-available',
          output: { ok: true, status: 'ready', message: 'Đã dựng "Lan can": 3 đối tượng.' }
        }
      ])
    )
    expect(text).toBe('Đã dựng "Lan can": 3 đối tượng.')
    expect(text).not.toContain('⚠')
  })

  test('several tools are reported in the order they ran', () => {
    const text = reportToolOutcomes(
      assistantWith([
        { type: 'tool-chay_template', state: 'output-available', output: { ok: true, message: 'bản mặt cầu' } },
        { type: 'tool-chay_template', state: 'output-available', output: { ok: true, message: 'lan can' } }
      ])
    )
    expect(text.indexOf('bản mặt cầu')).toBeLessThan(text.indexOf('lan can'))
  })

  test('a tool that errored is named rather than passed over', () => {
    // Silence here is the exact failure this function exists to prevent.
    const text = reportToolOutcomes(
      assistantWith([
        { type: 'tool-chay_template', state: 'output-error', errorText: 'boom' }
      ])
    )
    expect(text).toContain('⚠')
    expect(text).toContain('chay_template')
    expect(text).toContain('toolFailed')
  })

  test('text-only turns report nothing', () => {
    // Asking a question or answering one is a normal way for a turn to end,
    // and appending an empty block to it would be noise.
    expect(
      reportToolOutcomes(assistantWith([{ type: 'text', text: 'Cầu loại nào?' }]))
    ).toBe('')
  })

  test('a turn that never reached the assistant reports nothing', () => {
    expect(reportToolOutcomes([] as never)).toBe('')
    expect(
      reportToolOutcomes([
        { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'vẽ' }] }
      ] as never)
    ).toBe('')
  })
})
