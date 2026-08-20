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
  TAG_TOOL: {
    name: 'gan_nhan_tu_layer',
    description: 'Gán nhãn ngữ nghĩa cho bản vẽ chưa có nhãn, dựa trên tên layer.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false }
  },
  TEMPLATE_TOOLS: [
    {
      name: 'chay_template',
      description:
        'Dựng một bộ phận từ template... ƯU TIÊN... đừng chuyển sang vẽ tay.',
      input_schema: {
        type: 'object',
        properties: {},
        required: ['ma_template'],
        additionalProperties: false
      }
    },
    {
      name: 'sua_lan_chay',
      description:
        'Sửa một bộ phận đã dựng từ template... thay vì gọi lại chay_template.',
      input_schema: {
        type: 'object',
        properties: {},
        required: ['ma_lan_chay', 'thong_so'],
        additionalProperties: false
      }
    }
  ],
  ensureDeploymentDataLoaded: () => Promise.resolve(true),
  dictionary: () => [{ role: 'lan_can', label: 'Lan can', aliases: ['tay vịn'] }],
  runSemanticTool: (name: string, input: unknown, terms: unknown) => {
    calls.push({ name, input, terms })
    return { ok: true, status: 'ready', message: 'xong' }
  },
  templateToolDescription: () =>
    'Dựng một bộ phận từ template... ƯU TIÊN... đừng chuyển sang vẽ tay.\n\n' +
    'Template dùng được ngay:\n- cau_ban_btct: Cầu bản BTCT [B=Bề rộng (4–20 m)]',
  runTemplateTool: (name: string, input: unknown) => {
    calls.push({ name, input })
    return Promise.resolve({ ok: true, status: 'ready', message: 'đã dựng' })
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

  test('the tagging tool is offered, and reaches the one implementation', async () => {
    // Without it an office's existing drawings stay untagged, every edit tool
    // refuses them, and the archive is unusable however good the rest is.
    expect(tools.gan_nhan_tu_layer).toBeDefined()
    expect(tools.gan_nhan_tu_layer.description).toContain('layer')
  })

  test('the template tool is offered, ahead of lookup and geometry', () => {
    // The ladder the assistant should climb: a part named and parameterised,
    // then the standard when no template covers it, and strokes last. A
    // template call is one call whose numbers are range-checked; the same part
    // drawn stroke by stroke was measured at seventy calls.
    const names = Object.keys(tools)
    expect(tools.chay_template).toBeDefined()
    expect(names.indexOf('chay_template')).toBeLessThan(
      names.indexOf('tra_cuu_tieu_chuan')
    )
    expect(names.indexOf('chay_template')).toBeLessThan(names.indexOf('draw_line'))
  })

  test('the template description carries the runnable catalogue', () => {
    // Without it the model is told there are no templates — the system
    // prompt's catalogue is built server-side and does not know about the
    // ones compiled into this build. Measured: it went back to drawing
    // stroke by stroke with the tool sitting right there unused.
    expect(tools.chay_template.description).toContain('ƯU TIÊN')
    expect(tools.chay_template.description).toContain('đừng chuyển sang vẽ tay')
    expect(tools.chay_template.description).toContain('Template dùng được ngay')
    expect(tools.chay_template.description).toContain('cau_ban_btct')
    // Ranges travel with it: a range the model can read is a lookup it can skip.
    expect(tools.chay_template.description).toContain('4–20 m')
  })
})

describe('executing them', () => {
  // Through `unknown` because the SDK's `Tool<Input, Output>` and this loose
  // shape do not overlap enough for a direct cast — `tsc` rejects it outright.
  // It went unseen because jest transpiles this package rather than checking it
  // (see tsconfig.jest.agent.json), so the error only appeared once something
  // else in the run put the file through the checking compiler instead.
  const tools = createCadTools() as unknown as Record<
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

  test('tagging reaches runSemanticTool, not a copy', async () => {
    await tools.gan_nhan_tu_layer.execute({})
    expect(calls[0].name).toBe('gan_nhan_tu_layer')
    expect(calls[0].input).toEqual({})
  })

  test('describing passes no arguments rather than undefined', async () => {
    await tools.mo_ta_ban_ve.execute({})
    expect(calls[0].name).toBe('mo_ta_ban_ve')
    expect(calls[0].input).toEqual({})
  })

  test('a template call reaches the one implementation, arguments intact', async () => {
    // Validation, undo grouping and semantic tagging all live behind
    // runTemplateTool. A second copy here would have none of them.
    await tools.chay_template.execute({
      ma_template: 'cau_ban_btct',
      thong_so: { B: 8, hLanCan: 1.1 }
    })
    expect(calls[0].name).toBe('chay_template')
    expect(calls[0].input).toEqual({
      ma_template: 'cau_ban_btct',
      thong_so: { B: 8, hLanCan: 1.1 }
    })
  })

  test('omitting thong_so sends an empty object, not undefined', async () => {
    // The tool fills in declared defaults; handing it `undefined` would make
    // that path depend on the caller instead.
    await tools.chay_template.execute({ ma_template: 'cau_ban_btct' })
    expect(calls[0].input).toEqual({ ma_template: 'cau_ban_btct', thong_so: {} })
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
