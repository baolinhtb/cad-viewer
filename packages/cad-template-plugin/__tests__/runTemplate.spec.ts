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
