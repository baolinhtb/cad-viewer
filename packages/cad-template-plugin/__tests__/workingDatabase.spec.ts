/**
 * Drawing into a database that is not the data model's working one must not
 * borrow another drawing's id counter: ids would collide and undo would lose
 * the colliding entities (found with 0.3.0 dossiers: four dimensions stayed
 * after undo once another drawing had been generated first).
 */
jest.mock('../../cad-simple-viewer/src/editor/global/eventBus', () => ({
  eventBus: { emit: jest.fn() }
}))
jest.mock('@mlightcad/cad-simple-viewer', () => ({
  AcApDocManager: { instance: { regen: jest.fn() } },
  ...jest.requireActual('../../cad-simple-viewer/src/util/AcApDatabaseEdit')
}))

import { AcDbDatabase } from '@mlightcad/data-model'

import { dossierDefaults } from '../src/dossier/model'
import { abutmentDossierTemplate } from '../src/dossier/template'
import { runTemplate } from '../src/runTemplate'

jest.setTimeout(240_000)

const database = () => {
  const db = new AcDbDatabase()
  db.createDefaultData()
  return db
}
const count = (db: AcDbDatabase) =>
  [...db.tables.blockTable.modelSpace.newIterator()].length

test('hồ sơ dựng sau một bản vẽ khác: undo xoá hết, không sót đối tượng', async () => {
  const first = database()
  await runTemplate(abutmentDossierTemplate, dossierDefaults(), first)
  const second = database()
  const made = await runTemplate(
    abutmentDossierTemplate,
    dossierDefaults(),
    second
  )
  expect(made.errors).toEqual([])
  expect(count(second)).toBeGreaterThan(1000)
  expect(second.transactionManager.undo()).toBe(true)
  expect(count(second)).toBe(0)
  // The other drawing is untouched.
  expect(count(first)).toBeGreaterThan(1000)
})
