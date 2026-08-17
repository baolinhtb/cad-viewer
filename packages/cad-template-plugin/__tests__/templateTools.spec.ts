// Same stubbing as the other plugin specs: the core ships as a UMD bundle jest
// cannot load, and `acapRunGroupedEdit` runs the body straight through — what
// is under test here is the tool's contract with the assistant, not undo.
jest.mock('@mlightcad/cad-simple-viewer', () => ({
  AcApDocManager: { instance: { regen: jest.fn() } },
  acapRunGroupedEdit: async (
    _db: unknown,
    _label: string,
    fn: () => void | Promise<void>
  ) => {
    await fn()
  }
}))

import { AcDbDatabase } from '@mlightcad/data-model'

import { runTemplateTool, TEMPLATE_TOOLS } from '../src/templateTools'
import { listTemplates } from '../src/templateRegistry'

const template = listTemplates()[0]

function newDatabase() {
  const database = new AcDbDatabase()
  database.createDefaultData()
  return database
}

function countEntities(database: AcDbDatabase) {
  let count = 0
  for (const _entity of database.tables.blockTable.modelSpace.newIterator()) {
    count++
  }
  return count
}

describe('chay_template', () => {
  test('is declared once, with a description the agent can read', () => {
    // The agent takes its description from this declaration rather than
    // restating it, so an undeclared tool has to fail loudly here.
    expect(TEMPLATE_TOOLS).toHaveLength(1)
    expect(TEMPLATE_TOOLS[0].name).toBe('chay_template')
    expect(TEMPLATE_TOOLS[0].description.length).toBeGreaterThan(80)
    expect(TEMPLATE_TOOLS[0].input_schema.required).toEqual(['ma_template'])
  })

  test('draws a whole part from one call', async () => {
    const database = newDatabase()
    const outcome = await runTemplateTool(
      'chay_template',
      { ma_template: template.meta.id, thong_so: {} },
      database
    )

    expect(outcome.ok).toBe(true)
    expect(outcome.status).toBe('ready')
    expect(countEntities(database)).toBeGreaterThan(0)
    expect(outcome.message).toContain(template.meta.name)
    expect(outcome.message).toContain(template.meta.version)
  })

  test('omitted parameters fall back to the template defaults', async () => {
    // A part asked for by name with two numbers should draw, not complain
    // about the six the engineer did not mention.
    const database = newDatabase()
    const outcome = await runTemplateTool(
      'chay_template',
      { ma_template: template.meta.id },
      database
    )
    expect(outcome.ok).toBe(true)
    expect(countEntities(database)).toBeGreaterThan(0)
  })

  test('a value outside the declared range is refused, and nothing is drawn', async () => {
    // This is the standard doing its job. The range came from the template's
    // own declaration, so the refusal already says what is allowed — and the
    // drawing must be untouched, not half-built.
    const spec = template.params.find(
      p => p.type === 'number' && p.max !== undefined
    )
    expect(spec).toBeDefined()

    const database = newDatabase()
    const outcome = await runTemplateTool(
      'chay_template',
      {
        ma_template: template.meta.id,
        thong_so: { [spec!.key]: (spec!.max as number) + 1000 }
      },
      database
    )

    expect(outcome.ok).toBe(false)
    expect(outcome.status).toBe('refused')
    expect(outcome.message).toContain(spec!.label)
    expect(outcome.message).toContain(String(spec!.max))
    expect(countEntities(database)).toBe(0)
  })

  test('an unknown template id is refused with the list of real ones', async () => {
    // A model that invented an id will invent the same one again unless it is
    // shown what actually exists.
    const outcome = await runTemplateTool(
      'chay_template',
      { ma_template: 'khong_ton_tai' },
      newDatabase()
    )
    expect(outcome.ok).toBe(false)
    expect(outcome.message).toContain('khong_ton_tai')
    expect(outcome.message).toContain(template.meta.id)
  })

  test('a missing template id is refused with the list too', async () => {
    const outcome = await runTemplateTool('chay_template', {}, newDatabase())
    expect(outcome.ok).toBe(false)
    expect(outcome.message).toContain(template.meta.id)
  })

  test('an unknown tool name is refused by name', async () => {
    const outcome = await runTemplateTool('ve_cai_gi_do', {}, newDatabase())
    expect(outcome.ok).toBe(false)
    expect(outcome.message).toContain('ve_cai_gi_do')
  })

  test('the result stays small enough to re-send on every later step', async () => {
    // A tool result lives in the conversation for the rest of the turn and is
    // re-sent with every remaining call. Returning the geometry here would
    // undo the saving the template exists to produce.
    const database = newDatabase()
    const outcome = await runTemplateTool(
      'chay_template',
      { ma_template: template.meta.id },
      database
    )
    expect(JSON.stringify(outcome).length).toBeLessThan(600)
  })
})
