import { AcDbDatabase, AcDbEntity, AcDbLine } from '@mlightcad/data-model'

import { createDatabaseSession, executeCadScript } from '../src'

/**
 * A run owns the entities a template drew. The runtime does not know what a
 * template is; the host names the owner, here through a plain set of ids.
 */
function drawing() {
  const db = new AcDbDatabase()
  db.createDefaultData()
  const add = (y: number, layer = '0') => {
    const line = new AcDbLine({ x: 0, y, z: 0 }, { x: 100, y, z: 0 })
    line.layer = layer
    db.tables.blockTable.modelSpace.appendEntity(line)
    return line.objectId
  }
  const owned = new Set([add(0), add(10)])
  const free = add(20)
  const entityOwner = (e: AcDbEntity) =>
    owned.has(e.objectId) ? 'ho_so_mo_m1 r1' : undefined
  const count = () => [...db.tables.blockTable.modelSpace.newIterator()].length
  return {
    db,
    session: createDatabaseSession(db),
    owned,
    free,
    entityOwner,
    count
  }
}

describe('execute_cad_script: erase guard and audit', () => {
  test('erasing a template run is refused and nothing is erased', async () => {
    const d = drawing()
    const [a] = [...d.owned]
    const result = await executeCadScript(
      {
        code: `cad.edit.transaction('dọn', tx => tx.erase(['${d.free}', '${a}']))`
      },
      d.session,
      { entityOwner: d.entityOwner }
    )
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/^erase_blocked_template_run: 1 of 2 entities/)
    expect(result.error).toContain('ho_so_mo_m1 r1')
    expect(result.error).toContain('choPhepXoaHoSo: true')
    // The transaction rolled back as a whole: not even the free line went.
    expect(d.count()).toBe(3)
    expect(result.audit).toEqual({
      erased: 0,
      modified: 0,
      created: 0,
      layers: [],
      runs: [],
      blockedErase: 1
    })
  })

  test('with the explicit flag the erase goes through and is audited', async () => {
    const d = drawing()
    const [a] = [...d.owned]
    const result = await executeCadScript(
      {
        code: `cad.edit.transaction('xoá theo yêu cầu', tx => tx.erase(['${a}']))`,
        choPhepXoaHoSo: true
      },
      d.session,
      { entityOwner: d.entityOwner }
    )
    expect(result.success).toBe(true)
    expect(d.count()).toBe(2)
    expect(result.audit).toMatchObject({
      erased: 1,
      runs: ['ho_so_mo_m1 r1'],
      layers: ['0'],
      blockedErase: 0
    })
  })

  test('free content is erased as before; edits and creations are counted', async () => {
    const d = drawing()
    const [a, b] = [...d.owned]
    const result = await executeCadScript(
      {
        code: `
        cad.edit.transaction('một', tx => {
          tx.erase(['${d.free}'])
          tx.move(['${a}', '${b}'], 5, 0)
          tx.move(['${a}'], 5, 0)
          tx.drawLine({ start: {x:0,y:50}, end: {x:10,y:50} })
        })
        try {
          cad.edit.transaction('hai', tx => {
            tx.move(['${a}'], 1, 0)
            throw new Error('dừng giữa chừng')
          })
        } catch (e) {}
        return 1`
      },
      d.session,
      { entityOwner: d.entityOwner }
    )
    expect(result.success).toBe(true)
    // The second transaction rolled back, so its move is not counted twice
    // nor is anything else; ids are distinct entities.
    expect(result.audit).toEqual({
      erased: 1,
      modified: 2,
      created: 1,
      layers: ['0'],
      runs: ['ho_so_mo_m1 r1'],
      blockedErase: 0
    })
  })

  test('a read-only script carries no audit', async () => {
    const d = drawing()
    const result = await executeCadScript(
      { code: 'return cad.entities.where(() => true).length' },
      d.session,
      { entityOwner: d.entityOwner }
    )
    expect(result.data).toBe(3)
    expect(result.audit).toBeUndefined()
  })
})
