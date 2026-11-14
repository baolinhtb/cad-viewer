import {
  AcDbDatabase,
  AcDbFileType,
  AcDbLayerTableRecord,
  AcDbMText,
  AcDbPolyline,
  AcDbText,
  AcGePoint2d
} from '@mlightcad/data-model'

import { createDatabaseSession, executeCadScript } from '../src'

test('native text and grip edits keep handles, curved segments, annotation styling and unrelated detail', async () => {
  const db = new AcDbDatabase()
  const session = createDatabaseSession(db)
  const pl = new AcDbPolyline()
  pl.addVertexAt(0, new AcGePoint2d(0, 0), 0.4, 2, 3)
  pl.addVertexAt(1, new AcGePoint2d(100, 0))
  db.tables.blockTable.modelSpace.appendEntity(pl)
  await executeCadScript(
    {
      code: `cad.edit.transaction('details', tx => {
    const note = tx.drawText({position:{x:0,y:20},text:'M1',height:2})
    tx.setStyle([note], {color:3})
    tx.drawHatch({boundary:[{x:0,y:0},{x:10,y:0},{x:10,y:10},{x:0,y:10}],patternName:'SOLID'})
  })`
    },
    session
  )
  const nativeText = new AcDbText()
  nativeText.textString = 'M1'
  db.tables.blockTable.modelSpace.appendEntity(nativeText)
  await executeCadScript(
    {
      code: `cad.edit.transaction('style',tx=>tx.setStyle(['${nativeText.objectId}'],{color:3}))`
    },
    session
  )
  const before = [...db.tables.blockTable.modelSpace.newIterator()]
  const text = before.find(e => e instanceof AcDbText) as AcDbText
  text.rotation = 0.3
  text.widthFactor = 0.8
  const ids = before.map(e => e.objectId)
  const result = await executeCadScript(
    {
      code: `
    const grips = cad.entities.grips('${pl.objectId}')
    cad.edit.transaction('edit existing detail', tx => {
      tx.setText('${text.objectId}', 'MỐ M1 ĐÃ SỬA')
      tx.moveGrips('${pl.objectId}', [1], 25, 0)
    })
    return {grips, ids:cad.entities.where(e=>e.ownerId==='${pl.ownerId}').map(e=>e.id)}
  `
    },
    session
  )
  expect(result.success).toBe(true)
  expect(result.entityIds ?? []).toHaveLength(0)
  expect(
    [...db.tables.blockTable.modelSpace.newIterator()].map(e => e.objectId)
  ).toEqual(ids)
  expect(text.textString).toBe('MỐ M1 ĐÃ SỬA')
  expect(text.rotation).toBe(0.3)
  expect(text.widthFactor).toBe(0.8)
  expect(text.color.colorIndex).toBe(3)
  expect(pl.getPoint3dAt(1).x).toBe(125)
  expect(db.transactionManager.undo()).toBe(true)
  expect(text.textString).toBe('M1')
  expect(pl.getPoint3dAt(1).x).toBe(100)
  expect(db.transactionManager.redo()).toBe(true)
  const dxf = db.dxfOut() as string
  const loaded = new AcDbDatabase()
  await loaded.read(
    new TextEncoder().encode(dxf).buffer,
    { readOnly: false },
    AcDbFileType.DXF
  )
  const reopened = [...loaded.tables.blockTable.modelSpace.newIterator()]
  expect(reopened.map(e => e.objectId)).toEqual(ids)
  expect(reopened.filter(e => e.dxfTypeName === 'HATCH')).toHaveLength(1)
  expect(
    (
      reopened.find(e => e instanceof AcDbPolyline) as AcDbPolyline
    ).getPoint3dAt(1).x
  ).toBe(125)
  // The curved, variable-width segment must survive a grip edit and a real export.
  expect(dxf).toMatch(/42\s+0\.4/)
})

test('invalid grips roll back earlier text edits and locked entities are refused', async () => {
  const db = new AcDbDatabase()
  const session = createDatabaseSession(db)
  await executeCadScript(
    {
      code: `cad.edit.transaction('note',tx=>tx.drawText({position:{x:0,y:0},text:'Original'}))`
    },
    session
  )
  const text = [
    ...db.tables.blockTable.modelSpace.newIterator()
  ][0] as AcDbMText
  const result = await executeCadScript(
    {
      code: `cad.edit.transaction('bad',tx=>{
    tx.setText('${text.objectId}','Changed')
    tx.moveGrips('${text.objectId}',[999],10,0)
  })`
    },
    session
  )
  expect(result.success).toBe(false)
  expect(text.contents).toBe('Original')
  db.tables.layerTable.add(new AcDbLayerTableRecord({ name: 'Locked' }))
  text.layer = 'Locked'
  db.tables.layerTable.getAt('Locked')!.isLocked = true
  const locked = await executeCadScript(
    {
      code: `cad.edit.transaction('locked',tx=>tx.setText('${text.objectId}','Changed'))`
    },
    session
  )
  expect(locked.success).toBe(false)
  expect(text.contents).toBe('Original')
})
