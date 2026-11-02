jest.mock('../../cad-simple-viewer/src/editor/global/eventBus', () => ({
  eventBus: { emit: jest.fn() }
}))
jest.mock('@mlightcad/cad-simple-viewer', () => ({
  AcApDocManager: { instance: { regen: jest.fn() } },
  ...jest.requireActual('../../cad-simple-viewer/src/util/AcApDatabaseEdit')
}))

import { AcDbDatabase, AcDbFileType, AcDbLine } from '@mlightcad/data-model'
import { readSemanticTag } from '@mlightcad/cad-template-sdk'
import { acapRunMarkedEdits } from '../../cad-simple-viewer/src/util/AcApDatabaseEdit'
import { runDossierTool } from '../src/dossier/tools'
import { dossierDxf } from '../src/dossier/export'
import { buildDossierScene } from '../src/dossier/scene'
import { buildDossierModel } from '../src/dossier/model'
import { listRuns } from '../src/runIdentity'
import { entitiesOfRun } from '../src/runIdentity'

const database = () => {
  const db = new AcDbDatabase()
  db.createDefaultData()
  return db
}
const entities = (db: AcDbDatabase) => [
  ...db.tables.blockTable.modelSpace.newIterator()
]

describe('dossier tools against a real database', () => {
  test('a live create waits for scene regeneration and frames its result in Simple mode', async () => {
    const db = database()
    const manager = jest.requireMock('@mlightcad/cad-simple-viewer')
      .AcApDocManager.instance
    const box = { min: { x: 0, y: 0 }, max: { x: 250000, y: 150000 } }
    let release!: (value: boolean) => void
    let entered!: () => void
    const idle = new Promise<boolean>(resolve => {
      release = resolve
    })
    const waiting = new Promise<void>(resolve => {
      entered = resolve
    })
    manager.curDocument = { database: db }
    manager.curView = {
      waitUntilIdle: jest.fn(() => {
        entered()
        return idle
      }),
      getDrawingExtents: jest.fn(() => box),
      zoomTo: jest.fn()
    }
    manager.regen.mockResolvedValue(undefined)
    const pending = runDossierTool('tao_ho_so_mo', {
      thong_so: { thep: 'khong' }
    })
    await waiting
    expect(manager.curView.zoomTo).not.toHaveBeenCalled()
    release(true)
    expect((await pending).ok).toBe(true)
    expect(manager.curView.zoomTo).toHaveBeenCalledWith(box)
    delete manager.curDocument
    delete manager.curView
  })

  test('one prompt call draws six tagged sheets, duplicate create is refused, and undo removes it all', async () => {
    const db = database()
    const result = await runDossierTool('tao_ho_so_mo', {}, db)
    expect(result.ok).toBe(true)
    expect(result.message).toContain('BẢN NHÁP')
    expect(listRuns(db)).toHaveLength(1)
    expect(entities(db).length).toBeGreaterThan(2000)
    const sheetIds = new Set(
      entities(db).map(e => readSemanticTag(e)?.params.sheet)
    )
    expect(sheetIds.size).toBe(6)
    const parts = new Set(entities(db).map(e => readSemanticTag(e)?.partId))
    expect(parts.size).toBeLessThan(60)
    const footing = entities(db)
      .map(e => readSemanticTag(e))
      .find(t => t?.role === 'mo_be')
    expect(footing?.params).toMatchObject({ bBe: 7700, lBe: 6000, hBe: 2000 })
    const before = entities(db).length
    expect((await runDossierTool('tao_ho_so_mo', {}, db)).ok).toBe(false)
    expect(entities(db)).toHaveLength(before)
    expect(db.transactionManager.undo()).toBe(true)
    expect(entities(db)).toHaveLength(0)
  })
  test('a width edit updates all sheets, leaves another dossier intact, and is one undo', async () => {
    const db = database()
    await runDossierTool('tao_ho_so_mo', {}, db)
    await runDossierTool(
      'tao_ho_so_mo',
      { thong_so: { tenMo: 'M2', x: 300000 } },
      db
    )
    const m2 = entitiesOfRun(db, 'r2').map(e => e.objectId)
    const oldCount = entitiesOfRun(db, 'r1').length
    const result = await runDossierTool(
      'sua_ho_so_mo',
      { ma_lan_chay: 'r1', thong_so: { bBe: 8500 } },
      db
    )
    expect(result.ok).toBe(true)
    expect(listRuns(db)).toHaveLength(2)
    expect(listRuns(db)[0].values.bBe).toBe(8500)
    expect(listRuns(db)[0].values.bThan).toBe(7700)
    expect(entitiesOfRun(db, 'r1').length).toBeLessThan(oldCount)
    expect(entitiesOfRun(db, 'r2').map(e => e.objectId)).toEqual(m2)
    expect(db.transactionManager.undo()).toBe(true)
    expect(listRuns(db)[0].values.bBe).toBe(7700)
    expect(entitiesOfRun(db, 'r1')).toHaveLength(oldCount)
  })
  test('invalid relations and misspelled keys leave the old dossier untouched', async () => {
    const db = database()
    await runDossierTool('tao_ho_so_mo', {}, db)
    const ids = entities(db).map(e => e.objectId)
    for (const values of [
      { bBe: 4000 },
      { soCoc: 6 },
      { thiep: 'mau' },
      { lCanh: 12000 }
    ]) {
      const r = await runDossierTool(
        'sua_ho_so_mo',
        { ma_lan_chay: 'r1', thong_so: values },
        db
      )
      expect(r.ok).toBe(false)
      expect(entities(db).map(e => e.objectId)).toEqual(ids)
    }
  })
  test('read and export do not change the active database or undo stack', async () => {
    const db = database(),
      download = jest.fn()
    await runDossierTool('tao_ho_so_mo', {}, db)
    const before = entities(db).map(e => e.objectId)
    expect(
      (await runDossierTool('kiem_tra_ho_so', { ma_lan_chay: 'r1' }, db)).ok
    ).toBe(true)
    for (const dinh_dang of ['json', 'html'])
      expect(
        (
          await runDossierTool(
            'xuat_ho_so_mo',
            { ma_lan_chay: 'r1', dinh_dang },
            db,
            download
          )
        ).ok
      ).toBe(true)
    expect(download).toHaveBeenCalledTimes(2)
    expect(JSON.parse(download.mock.calls[0][0].content).status).toBe('draft')
    expect(entities(db).map(e => e.objectId)).toEqual(before)
    expect(db.transactionManager.undo()).toBe(true)
    expect(entities(db)).toHaveLength(0)
  })
  test('DXF preserves dossier identity for continued editing after reopen', async () => {
    const scene = buildDossierScene(buildDossierModel({ thep: 'khong' }))
    const content = dossierDxf(scene)
    const db = database()
    const bytes =
      typeof content === 'string' ? new TextEncoder().encode(content) : content
    await db.read(
      new Uint8Array(bytes).buffer,
      { readOnly: false },
      AcDbFileType.DXF
    )
    expect(listRuns(db)).toHaveLength(1)
    expect(listRuns(db)[0].templateId).toBe('ho_so_mo_m1')
    expect(listRuns(db)[0].values.soHangCoc).toBe(2)
    expect(listRuns(db)[0].values.congTrinh).toBe(scene.model.values.congTrinh)
    expect(
      (
        await runDossierTool(
          'sua_ho_so_mo',
          { ma_lan_chay: 'r1', thong_so: { bBe: 8500 } },
          db
        )
      ).ok
    ).toBe(true)
  })
  test('a generator failure rolls back its erase and partial draw inside an AI turn', async () => {
    const db = database()
    await runDossierTool('tao_ho_so_mo', { thong_so: { thep: 'khong' } }, db)
    const first = entities(db)[0],
      tag = readSemanticTag(first)!
    // Instead of rewriting semantic tags, verify rollback directly with a real
    // grouped edit nested inside the AI group (the same path editRun uses).
    const { acapRunGroupedEdit } =
      await import('../../cad-simple-viewer/src/util/AcApDatabaseEdit')
    const before = entities(db).map(e => e.objectId)
    await acapRunMarkedEdits(db, 'AI turn', async () => {
      await expect(
        acapRunGroupedEdit(db, 'replace', async () => {
          first.erase()
          db.tables.blockTable.modelSpace.appendEntity(
            new AcDbLine({ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 0 })
          )
          throw new Error('injected')
        })
      ).rejects.toThrow('injected')
    })
    expect(readSemanticTag(first)?.run?.id).toBe(tag.run?.id)
    expect(
      entities(db)
        .map(e => e.objectId)
        .sort()
    ).toEqual(before.sort())
  })
})
