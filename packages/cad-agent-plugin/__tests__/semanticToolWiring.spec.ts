/**
 * The agent's tool set has to expose the semantic group, not just the geometry
 * one.
 *
 * The geometry tools take coordinates and object ids. An assistant that only
 * has those can draw a line anywhere and delete an id it guessed, and neither
 * action knows what part of the bridge it touched — which is the failure the
 * whole semantic layer exists to prevent. Wiring is worth a test of its own
 * because "the tools exist" and "the model is offered them" are different
 * facts, and the second one is the one that changes behaviour.
 */
const calls: { name: string; input: unknown; terms?: unknown }[] = []

jest.mock('@mlightcad/cad-template-plugin', () => ({
  __esModule: true,
  SEMANTIC_TOOLS: [
    {
      name: 'mo_ta_ban_ve',
      description: 'Liệt kê các bộ phận... untagged... không được sửa.',
      input_schema: { type: 'object', properties: {}, additionalProperties: false }
    },
    {
      name: 'tim_bo_phan',
      description: 'Tìm bộ phận... ambiguous... không tự chọn... không đoán.',
      input_schema: { type: 'object', properties: {}, additionalProperties: false }
    },
    {
      name: 'to_sang_bo_phan',
      description: 'Tô sáng các bộ phận đã tìm được.',
      input_schema: { type: 'object', properties: {}, additionalProperties: false }
    }
  ],
  dictionary: () => [{ role: 'lan_can', label: 'Lan can', aliases: ['tay vịn'] }],
  runSemanticTool: (name: string, input: unknown, terms: unknown) => {
    calls.push({ name, input, terms })
    return { ok: true, status: 'ready', message: 'xong' }
  }
}))

jest.mock('../src/tools/CadActionExecutor', () => ({
  __esModule: true,
  cadActionExecutor: new Proxy(
    {},
    { get: () => () => ({ success: true }) }
  )
}))

import { createCadTools } from '../src/tools/cadTools'

beforeEach(() => {
  calls.length = 0
})

describe('the tool set offered to the model', () => {
  const tools = createCadTools() as Record<string, { description: string }>

  test('the semantic group is present', () => {
    for (const name of ['mo_ta_ban_ve', 'tim_bo_phan', 'to_sang_bo_phan']) {
      expect(tools[name]).toBeDefined()
    }
  })

  test('their descriptions come from the tools themselves, unedited', () => {
    // Restating a description here is how the model ends up told one rule
    // while the code enforces another.
    expect(tools.tim_bo_phan.description).toContain('ambiguous')
    expect(tools.tim_bo_phan.description).toContain('không tự chọn')
    expect(tools.mo_ta_ban_ve.description).toContain('không được sửa')
  })

  test('the semantic tools are listed before the geometry ones', () => {
    // Order is the only nudge available in a flat tool list, and locating a
    // part by name has to come before drawing at a coordinate.
    const names = Object.keys(tools)
    expect(names.indexOf('tim_bo_phan')).toBeLessThan(names.indexOf('draw_line'))
  })
})

describe('executing them', () => {
  const tools = createCadTools() as Record<
    string,
    { execute: (input: unknown, options?: unknown) => Promise<unknown> }
  >

  test('a locate reaches the one implementation, arguments intact', async () => {
    // Not a reimplementation in the agent package: the refusal rules live in
    // runSemanticTool, and a second copy here would not have them.
    await tools.tim_bo_phan.execute({ cum_tu: 'lan can', ben: 'phai' })
    expect(calls[0].name).toBe('tim_bo_phan')
    expect(calls[0].input).toEqual({ cum_tu: 'lan can', ben: 'phai' })
  })

  test('describing passes no arguments rather than undefined', async () => {
    await tools.mo_ta_ban_ve.execute({})
    expect(calls[0].name).toBe('mo_ta_ban_ve')
    expect(calls[0].input).toEqual({})
  })

  test('the company dictionary is handed over on every call', async () => {
    // Without it the tool falls back to nothing and every phrase comes back
    // "unknown_term" — a failure that looks like the model not understanding
    // Vietnamese.
    await tools.tim_bo_phan.execute({ cum_tu: 'tay vịn' })
    expect(calls[0].terms).toEqual([
      { role: 'lan_can', label: 'Lan can', aliases: ['tay vịn'] }
    ])
  })
})
