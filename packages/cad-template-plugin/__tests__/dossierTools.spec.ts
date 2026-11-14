jest.mock('../../cad-simple-viewer/src/editor/global/eventBus', () => ({
  eventBus: { emit: jest.fn() }
}))
jest.mock('@mlightcad/cad-simple-viewer', () => ({
  AcApDocManager: { instance: { regen: jest.fn() } },
  ...jest.requireActual('../../cad-simple-viewer/src/util/AcApDatabaseEdit')
}))

import {
  AcDbDatabase,
  AcDbFileType,
  AcDbLine,
  AcDbText
} from '@mlightcad/data-model'
import { readSemanticTag } from '@mlightcad/cad-template-sdk'
import { acapRunMarkedEdits } from '../../cad-simple-viewer/src/util/AcApDatabaseEdit'
import { runDossierTool } from '../src/dossier/tools'
import { dossierDxf } from '../src/dossier/export'
import { buildDossierScene } from '../src/dossier/scene'
import { buildDossierModel } from '../src/dossier/model'
import { listRuns } from '../src/runIdentity'
import { entitiesOfRun } from '../src/runIdentity'
import layout from '../src/dossier/reference/layout-mo2.json'

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
      entities(db).map(e => readSemanticTag(e)?.params?.sheet)
    )
    expect(sheetIds.size).toBe(6)
    const parts = new Set(entities(db).map(e => readSemanticTag(e)?.partId))
    expect(parts.size).toBeLessThan(60)
    const source = entities(db)
      .map(e => readSemanticTag(e))
      .filter(t => t?.params?.sourceHandle)
    // 0.3.0: every real entity of the source viewports, sheet by sheet and
    // type by type, exactly as the extracted inventory (layout-mo2.json).
    const bySheet = (list: typeof source) => {
      const out: Record<string, Record<string, number>> = {}
      for (const t of list) {
        const sheet = String(t?.params?.sheet)
        const type = String(t?.params?.sourceType)
        ;(out[sheet] ??= {})[type] = (out[sheet][type] ?? 0) + 1
      }
      return out
    }
    const inventory: Record<string, Record<string, number>> = {}
    for (const sheet of layout.sheets)
      for (const p of sheet.content ?? [])
        (inventory[sheet.id] ??= {})[p.type] =
          (inventory[sheet.id][p.type] ?? 0) + 1
    expect(bySheet(source)).toEqual(inventory)
    expect(source).toHaveLength(306 + 55 + 234 + 215 + 215)
    expect(listRuns(db)[0].values).toMatchObject({
      bBe: 7700,
      lBe: 6000,
      hBe: 2000
    })
    const before = entities(db).length
    expect((await runDossierTool('tao_ho_so_mo', {}, db)).ok).toBe(false)
    expect(entities(db)).toHaveLength(before)
    expect(db.transactionManager.undo()).toBe(true)
    expect(entities(db)).toHaveLength(0)
  })
  test('a width edit cannot replace detailed source CAD with a schematic', async () => {
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
    // 0.3.0: bBe alone cannot be followed (the source draws the stem as wide
    // as the footing): refused, nothing replaced by a notice or a schematic.
    expect(result.ok).toBe(false)
    expect(result.message).toContain('bThan = bBe')
    expect(listRuns(db)).toHaveLength(2)
    expect(listRuns(db)[0].values.bBe).toBe(7700)
    expect(listRuns(db)[0].values.bThan).toBe(7700)
    expect(entitiesOfRun(db, 'r1')).toHaveLength(oldCount)
    expect(entitiesOfRun(db, 'r2').map(e => e.objectId)).toEqual(m2)
    // A refused edit adds no undo entry: undo removes the preceding M2 creation.
    expect(db.transactionManager.undo()).toBe(true)
    expect(listRuns(db)).toHaveLength(1)
    expect(entitiesOfRun(db, 'r1')).toHaveLength(oldCount)
  })

  test('label and placement edits preserve every handle, manual text and native geometry through undo/redo', async () => {
    const db = database()
    await runDossierTool('tao_ho_so_mo', {}, db)
    const before = entitiesOfRun(db, 'r1')
    const ids = before.map(e => e.objectId)
    const sourceNote = before.find(
      e =>
        e instanceof AcDbText &&
        readSemanticTag(e)?.params?.sourceHandle &&
        !(e as AcDbText).textString.includes('M1')
    ) as AcDbText
    sourceNote.textString = 'ENGINEER_DETAIL_KEPT'
    sourceNote.rotation = 0.4
    const source = before.find(
      e => readSemanticTag(e)?.params?.sourceHandle && e.type === 'Polyline'
    )!
    const x = source.geometricExtents.min.x
    const result = await runDossierTool(
      'sua_ho_so_mo',
      {
        ma_lan_chay: 'r1',
        thong_so: { tenMo: 'M2', congTrinh: 'Cầu đã đổi tên', x: 200 }
      },
      db
    )
    expect(result.ok).toBe(true)
    expect(
      (result.data as { soDoiTuongXoa?: number } | undefined)?.soDoiTuongXoa
    ).toBe(0)
    expect(entitiesOfRun(db, 'r1').map(e => e.objectId)).toEqual(ids)
    expect(sourceNote.textString).toBe('ENGINEER_DETAIL_KEPT')
    expect(sourceNote.rotation).toBeCloseTo(0.4, 8)
    expect(source.geometricExtents.min.x).toBeCloseTo(x + 200)
    expect(listRuns(db)[0].values.tenMo).toBe('M2')
    expect(db.transactionManager.undo()).toBe(true)
    expect(listRuns(db)[0].values.tenMo).toBe('M1')
    expect(source.geometricExtents.min.x).toBeCloseTo(x)
    expect(sourceNote.textString).toBe('ENGINEER_DETAIL_KEPT')
    expect(db.transactionManager.redo()).toBe(true)
    expect(source.geometricExtents.min.x).toBeCloseTo(x + 200)
    const run0values = { ...listRuns(db)[0].values }
    const download = jest.fn()
    expect(
      (
        await runDossierTool(
          'xuat_ho_so_mo',
          { ma_lan_chay: 'r1', dinh_dang: 'dxf' },
          db,
          download
        )
      ).ok
    ).toBe(true)
    const dxf = download.mock.calls[0][0].content as string
    expect(dxf).toContain('ENGINEER_DETAIL_KEPT')
    // Real entities kept through export: the ENTITIES section has exactly the
    // dimensions and hatches the 0.3.0 scene draws.
    const entitiesSection = dxf.slice(
      dxf.indexOf('\nENTITIES'),
      dxf.indexOf('\nENDSEC', dxf.indexOf('\nENTITIES'))
    )
    const scene = buildDossierScene(buildDossierModel({ ...run0values }))
    const drawn = (kinds: string[]) =>
      scene.sheets
        .flatMap(sh => sh.primitives)
        .filter(p => kinds.includes(p.kind)).length
    expect(
      (entitiesSection.match(/\n0\r?\nDIMENSION\r?\n/g) ?? []).length
    ).toBe(drawn(['dimension', 'angular']))
    expect((entitiesSection.match(/\n0\r?\nHATCH\r?\n/g) ?? []).length).toBe(
      drawn(['fill'])
    )
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
          {
            ma_lan_chay: 'r1',
            thong_so: { congTrinh: 'Công trình sau khi mở lại' }
          },
          db
        )
      ).ok
    ).toBe(true)
  }, 60000)
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
