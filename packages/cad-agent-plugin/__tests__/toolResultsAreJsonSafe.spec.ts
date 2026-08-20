/**
 * Whatever a tool returns has to be something JSON can carry.
 *
 * A tool result is kept twice: serialised into the request, and live in the
 * chat history. `JSON.stringify` drops `undefined` and writes `NaN` and
 * `Infinity` as `null`, so the request on the wire is always well-formed while
 * the object retained in memory is not. On the next message that history is
 * validated as a prompt and the turn dies with "Invalid prompt: The messages
 * must be a ModelMessage[]" — naming the message type, never the field.
 *
 * It has happened twice from unrelated fields: `NaN` extents on a drawing with
 * none, then `undefined` for a part with no side or ordinal. The first message
 * worked both times and every correction after it was refused, which is why
 * this is checked at the boundary and not at each site.
 */
const returned: Record<string, unknown> = {}

jest.mock('@mlightcad/cad-template-plugin', () => ({
  __esModule: true,
  SEMANTIC_TOOLS: [
    { name: 'mo_ta_ban_ve', description: 'd', input_schema: {} },
    { name: 'tim_bo_phan', description: 'd', input_schema: {} },
    { name: 'to_sang_bo_phan', description: 'd', input_schema: {} }
  ],
  TAG_TOOL: {
    name: 'gan_nhan_tu_layer',
    description: 'Gán nhãn ngữ nghĩa cho bản vẽ chưa có nhãn, dựa trên tên layer.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false }
  },
  TEMPLATE_TOOLS: [
    { name: 'chay_template', description: 'd', input_schema: {} },
    { name: 'ghep_bo_phan', description: 'd', input_schema: {} },
    { name: 'sua_lan_chay', description: 'd', input_schema: {} }
  ],
  ensureDeploymentDataLoaded: () => Promise.resolve(true),
  dictionary: () => [],
  assemblyToolDescription: () => 'd',
  assemblyToolDescription: () => 'd',
  templateToolDescription: () => 'd',
  runSemanticTool: () => returned.semantic,
  runTemplateTool: () => Promise.resolve(returned.template)
}))

jest.mock('../src/tools/CadActionExecutor', () => ({
  __esModule: true,
  cadActionExecutor: new Proxy({}, { get: () => () => returned.geometry })
}))

import { createCadTools } from '../src/tools/cadTools'

/** Every path holding something JSON cannot represent. */
function unJsonable(value: unknown, path = '$'): string[] {
  if (value === undefined) return [`${path} = undefined`]
  if (typeof value === 'number' && !Number.isFinite(value)) {
    return [`${path} = ${value}`]
  }
  if (Array.isArray(value)) {
    return value.flatMap((v, i) => unJsonable(v, `${path}[${i}]`))
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) => unJsonable(v, `${path}.${k}`))
  }
  return []
}

const tools = createCadTools() as unknown as Record<
  string,
  { execute: (input: unknown, options?: unknown) => Promise<unknown> }
>

describe('results handed back to the model', () => {
  test('a semantic tool cannot leak undefined into the history', async () => {
    // The exact shape that killed a session: a part with no side and no
    // ordinal, described with `undefined` rather than by omission.
    returned.semantic = {
      ok: true,
      status: 'ready',
      data: {
        parts: [
          { partId: 'ban_mat_cau', ben: undefined, so_thu_tu: undefined }
        ]
      }
    }

    const result = await tools.mo_ta_ban_ve.execute({})
    expect(unJsonable(result)).toEqual([])
    // Omitted, not nulled: the model should not be told the part has a side.
    const part = (result as { data: { parts: Record<string, unknown>[] } }).data
      .parts[0]
    expect('ben' in part).toBe(false)
    expect(part.partId).toBe('ban_mat_cau')
  })

  test('a geometry tool cannot leak NaN or Infinity', async () => {
    // An empty drawing reports its extents this way.
    returned.geometry = {
      success: true,
      extents: { min: { x: NaN, y: -Infinity }, max: { x: Infinity, y: 0 } }
    }

    const result = await tools.zoom_extents.execute({})
    expect(unJsonable(result)).toEqual([])
    // `null` is what the request already carried, so nothing the model sees
    // changes — only what the history keeps.
    expect(result).toEqual({
      success: true,
      extents: { min: { x: null, y: null }, max: { x: null, y: 0 } }
    })
  })

  test('a template tool result survives the same way', async () => {
    returned.template = { ok: true, data: { soDoiTuong: 10, tyLe: NaN } }
    const result = await tools.chay_template.execute({ ma_template: 'x' })
    expect(unJsonable(result)).toEqual([])
  })

  test('an ordinary result is passed through unchanged', async () => {
    returned.semantic = { ok: true, status: 'ready', data: { parts: [] } }
    await expect(tools.mo_ta_ban_ve.execute({})).resolves.toEqual({
      ok: true,
      status: 'ready',
      data: { parts: [] }
    })
  })
})
