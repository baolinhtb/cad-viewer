import {
  AcDbDatabase,
  AcDbBlockTableRecord,
  AcDbLine
} from '@mlightcad/data-model'

import { acapIsLayoutEntity } from '../src/app/AcApLayoutEntityOwner'

function database() {
  const db = new AcDbDatabase()
  db.createDefaultData()
  return db
}

test('model entities remain drawable when the model record ID is missing from the handle index', () => {
  const db = database()
  const model = db.tables.blockTable.modelSpace
  const line = new AcDbLine()
  model.appendEntity(line)
  const original = db.tables.blockTable.getIdAt.bind(db.tables.blockTable)
  jest
    .spyOn(db.tables.blockTable, 'getIdAt')
    .mockImplementation(id =>
      id === model.objectId ? undefined : original(id)
    )
  expect(acapIsLayoutEntity(db, line)).toBe(true)
})

test('anonymous dimension and other block-definition geometry is excluded', () => {
  const db = database()
  const block = new AcDbBlockTableRecord()
  block.name = '*UDIM_TEST'
  db.tables.blockTable.add(block)
  const line = new AcDbLine()
  block.appendEntity(line)
  expect(acapIsLayoutEntity(db, line)).toBe(false)
})
