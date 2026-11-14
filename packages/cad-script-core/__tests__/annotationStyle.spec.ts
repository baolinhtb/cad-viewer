import {
  AcDbDatabase,
  AcDbFileType,
  AcDbLayerTableRecord
} from '@mlightcad/data-model'

import { createDatabaseSession, executeCadScript } from '../src'

describe('annotation presentation in agent scripts', () => {
  test('creates real colored notes and patterned axes in one transaction', async () => {
    const db = new AcDbDatabase()
    const session = createDatabaseSession(db)
    const result = await executeCadScript(
      {
        code: `
      cad.edit.transaction('annotations', tx => {
        const note = tx.drawText({ position: {x: 0, y: 10}, text: 'M1', height: 2 })
        const axis = tx.drawLine({ start: {x: 0, y: 0}, end: {x: 100, y: 0} })
        tx.setStyle([note], {color: 3})
        tx.setStyle([axis], {color: 1, lineType: 'CENTER', linetypeScale: 20})
      })
      return cad.entities.where(e => e.style.color === 3).map(e => e.style)
    `
      },
      session
    )
    expect(result).toMatchObject({ success: true, data: [{ color: 3 }] })
    const entities = [...db.tables.blockTable.modelSpace.newIterator()]
    expect(entities.map(e => e.color.colorIndex)).toEqual([3, 1])
    expect(entities[1].lineType).toBe('CENTER')
    expect(entities[1].linetypeScale).toBe(20)
    expect(db.tables.linetypeTable.has('CENTER')).toBe(true)
  })

  test('styling survives a real DXF save and reopen', async () => {
    const db = new AcDbDatabase()
    const session = createDatabaseSession(db)
    const result = await executeCadScript(
      {
        code: `cad.edit.transaction('hidden', tx => {
      const id = tx.drawLine({start:{x:0,y:0},end:{x:1000,y:0}})
      tx.setStyle([id], {color:8,lineType:'HIDDEN',linetypeScale:100})
    })`
      },
      session
    )
    expect(result.success).toBe(true)
    const loaded = new AcDbDatabase()
    await loaded.read(
      new TextEncoder().encode(db.dxfOut() as string).buffer as ArrayBuffer,
      { readOnly: false },
      AcDbFileType.DXF
    )
    const entity = [...loaded.tables.blockTable.modelSpace.newIterator()][0]
    expect(entity.color.colorIndex).toBe(8)
    expect(entity.lineType).toBe('HIDDEN')
    expect(entity.linetypeScale).toBe(100)
  })

  test('does not style entities on locked layers', async () => {
    const db = new AcDbDatabase()
    const session = createDatabaseSession(db)
    db.tables.layerTable.add(new AcDbLayerTableRecord({ name: 'LOCKED' }))
    const created = await executeCadScript(
      {
        code: `cad.edit.transaction('line', tx => {
      tx.drawLine({start:{x:0,y:0},end:{x:10,y:0},layer:'LOCKED'})
    })`
      },
      session
    )
    expect(created.success).toBe(true)
    const entity = [...db.tables.blockTable.modelSpace.newIterator()][0]
    const original = entity.color.colorIndex
    db.tables.layerTable.getAt('LOCKED')!.isLocked = true
    const result = await executeCadScript(
      {
        code: `cad.edit.transaction('style', tx => {
      tx.setStyle(['${entity.objectId}'], {color:1})
    })`
      },
      session
    )
    expect(result.success).toBe(true)
    expect(entity.color.colorIndex).toBe(original)
  })

  test.each([
    '{color: 0}',
    '{color: 1.5}',
    '{linetypeScale: -1}',
    "{lineType: 'UNKNOWN'}"
  ])('rejects invalid style %s without a partial drawing', async style => {
    const db = new AcDbDatabase()
    const session = createDatabaseSession(db)
    const result = await executeCadScript(
      {
        code: `
        cad.edit.transaction('invalid', tx => {
          const id = tx.drawLine({start: {x:0,y:0},end: {x:10,y:0}})
          tx.setStyle([id], ${style})
        })
      `
      },
      session
    )
    expect(result.success).toBe(false)
    expect([...db.tables.blockTable.modelSpace.newIterator()]).toHaveLength(0)
  })
})
