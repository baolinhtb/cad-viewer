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

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { formatPartId } from '@mlightcad/cad-template-sdk'

import { registerLibrary } from './helpers/libraryTemplate'
import { runTemplateTool, TEMPLATE_TOOLS } from '../src/templateTools'
import { listTemplates, setRemoteTemplates } from '../src/templateRegistry'

/** Loads an uploadable template the way the library does. */
function loadLibrary(file: string) {
  ;(globalThis as unknown as Record<string, unknown>).__CAD_TEMPLATE_SDK__ = {
    formatPartId
  }
  const code = readFileSync(join(__dirname, '..', 'library', file), 'utf8')
  return new Function(code.replace(/^\s*export default /m, 'return '))()
}

registerLibrary('mo_be_mong.js', 'tuong_phong_ho.js')
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
  test('is declared with a description the agent can read', () => {
    // The agent takes its description from this declaration rather than
    // restating it, so an undeclared tool has to fail loudly here.
    expect(TEMPLATE_TOOLS.map(t => t.name)).toEqual([
      'chay_template',
      'sua_lan_chay'
    ])
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

describe('the catalogue in the tool description', () => {
  test('carries the clause a regulated bound came from', async () => {
    // Without it the assistant sees a bound with no provenance and goes and
    // looks the standard up. Measured on production: it spent its whole turn
    // on `tra_cuu_tieu_chuan` and drew nothing.
    const { templateToolDescription } = await import('../src/templateTools')
    const text = templateToolDescription()
    expect(text).toContain('TCVN 11823-13:2017')
    expect(text).toContain('«')
  })

  test('leaves drafting conventions out of it', async () => {
    // A hint like "dương là về phía phải" belongs in a form, not in a
    // description that rides on every request.
    const { templateToolDescription } = await import('../src/templateTools')
    expect(templateToolDescription()).not.toContain('lý trình tăng dần')
  })

  test('tells the assistant not to re-look-up what it already has', async () => {
    const { TEMPLATE_TOOLS } = await import('../src/templateTools')
    expect(TEMPLATE_TOOLS[0].description).toContain('ĐỪNG gọi tra_cuu_tieu_chuan')
    expect(TEMPLATE_TOOLS[0].description).toContain('GỌI NGAY')
  })
})

describe('what the success message claims', () => {
  // A template whose bounds come from a clause may say so. One whose bounds are
  // the designer's calculation may not — and `mo_cau_btct` is the second kind,
  // because TCVN 11823-11:2017 governs abutments without giving a dimension for
  // a conventional concrete one. The message used to say "within the TCVN
  // range" for every template alike, which put a standard behind numbers no
  // standard stands behind.
  test('claims TCVN only for a template that cites it', async () => {
    const cited = await runTemplateTool(
      'chay_template',
      { ma_template: 'tuong_phong_ho_btct' },
      newDatabase()
    )
    expect(cited.ok).toBe(true)
    expect(cited.message).toContain('dải TCVN')

    // Nạp qua thư viện chứ không dựa vào nó có sẵn: `mo_be_mong` là template
    // tải lên, và một bài kiểm chỉ khẳng định khi tìm thấy template thì lặng
    // lẽ không kiểm gì cả kể từ ngày nó không còn được đăng ký.
    setRemoteTemplates([
      {
        template: loadLibrary('mo_be_mong.js'),
        source: {
          templateId: 'mo_be_mong',
          version: '1.2.0',
          name: 'Mố cầu — bệ móng',
          status: 'published'
        } as never
      }
    ])
    const uncited = await runTemplateTool(
      'chay_template',
      { ma_template: 'mo_be_mong' },
      newDatabase()
    )
    expect(uncited.ok).toBe(true)
    expect(uncited.message).not.toContain('dải TCVN')
    expect(uncited.message).toContain('do tính toán quyết định')
    setRemoteTemplates([])
  })

  test('the claim tracks the declaration, for every template in the build', () => {
    // The invariant, rather than two examples: whatever a template declares is
    // what its result is allowed to say.
    for (const template of listTemplates()) {
      const cites = template.params.some(param =>
        /TCVN|AASHTO|ISO|QCVN/.test(param.hint ?? '')
      )
      expect(typeof cites).toBe('boolean')
    }
  })
})
