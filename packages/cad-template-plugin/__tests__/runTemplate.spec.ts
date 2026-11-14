// The core package ships as a UMD bundle that jest cannot load, so plugin
// specs stub it — same approach as the other plugin packages in this repo.
// `acapRunGroupedEdit` is stubbed to run the body straight through: what this
// spec checks is what the template draws, not how undo marks are grouped
// (that is covered by the core's own spec).
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

import { readSemanticTag } from '@mlightcad/cad-template-sdk'
import { AcDbDatabase } from '@mlightcad/data-model'

import { defaultValues, runTemplate } from '../src/runTemplate'
import { findTemplate, listTemplates } from '../src/templateRegistry'
import { registerLibrary } from './helpers/libraryTemplate'

// Không còn template nào biên dịch sẵn, nên spec phải tự mang một cái vào —
// và mang đúng tệp thư viện mà server lưu, chứ không phải bản sao.
registerLibrary('mo_be_mong.js')
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

describe('runTemplate', () => {
  test('the registry exposes the first bridge template', () => {
    expect(listTemplates().length).toBeGreaterThan(0)
    expect(findTemplate(template.meta.id)).toBe(template)
    expect(findTemplate('khong_ton_tai')).toBeUndefined()
  })

  test('runs the template into the current drawing and reports what it drew', async () => {
    const database = newDatabase()

    const result = await runTemplate(
      template,
      defaultValues(template),
      database
    )

    expect(result.errors).toEqual([])
    expect(result.entityCount).toBeGreaterThan(0)
    expect(result.layers.length).toBeGreaterThan(0)

    let tagged = 0
    for (const entity of database.tables.blockTable.modelSpace.newIterator()) {
      if (readSemanticTag(entity)) tagged++
    }
    expect(tagged).toBe(result.entityCount)
  })

  test('bad values are reported and nothing is drawn', async () => {
    const database = newDatabase()

    const result = await runTemplate(
      template,
      { ...defaultValues(template), B: 999 },
      database
    )

    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.errors[0]).toContain('Bề rộng')
    expect(result.entityCount).toBe(0)
    expect(countEntities(database)).toBe(0)
  })

  test('defaults come from the template declaration', () => {
    const values = defaultValues(template)
    for (const spec of template.params) {
      if (spec.default !== undefined)
        expect(values[spec.key]).toBe(spec.default)
    }
  })
})

describe('a template that still names an old layer', () => {
  // An uploaded template from before `_33_` (the live library may hold some)
  // hard-codes `layer: 'KC-COC'`. It must keep working, on the right layer,
  // and the result must say what happened so the assistant can relay it.
  const old = {
    meta: {
      id: 'coc_cu',
      version: '1.0.0',
      name: 'Cọc kiểu cũ',
      category: 'Mố trụ'
    },
    params: [],
    generate(ctx: import('@mlightcad/cad-template-sdk').AcTpDrawContext) {
      ctx.line({
        role: 'coc_khoan_nhoi',
        partId: 'coc_01',
        layer: 'KC-COC',
        start: { x: 0, y: 0, z: 0 },
        end: { x: 0, y: -1000, z: 0 }
      })
    }
  }

  test('draws on the _33_ layer and returns the warning', async () => {
    const database = newDatabase()
    const result = await runTemplate(old, {}, database)
    expect(result.errors).toEqual([])
    expect(result.layers).toEqual(['_33_CAU_MO_Coc'])
    expect(result.warnings).toEqual([
      "Layer 'KC-COC' là tên cũ (chỉ để nhận dạng bản vẽ cũ); đã vẽ lên '_33_CAU_MO_Coc' thay thế."
    ])
  })

  test('a template on current names reports no warnings at all', async () => {
    const result = await runTemplate(
      template,
      defaultValues(template),
      newDatabase()
    )
    expect(result.warnings).toBeUndefined()
  })
})
