jest.mock('../../cad-simple-viewer/src/editor/global/eventBus', () => ({
  eventBus: { emit: jest.fn() }
}))
jest.mock('@mlightcad/cad-simple-viewer', () => ({
  AcApDocManager: { instance: { regen: jest.fn() } },
  ...jest.requireActual('../../cad-simple-viewer/src/util/AcApDatabaseEdit')
}))

import { readSemanticTag } from '@mlightcad/cad-template-sdk'
import {
  AcDbDatabase,
  AcDbFileType,
  AcDbLine,
  AcDbText
} from '@mlightcad/data-model'

import { acapRunMarkedEdits } from '../../cad-simple-viewer/src/util/AcApDatabaseEdit'
import { dossierDxf } from '../src/dossier/export'
import { buildDossierModel } from '../src/dossier/model'
import layout from '../src/dossier/reference/layout-mo2.json'
import { buildDossierScene } from '../src/dossier/scene'
import { abutmentDossierTemplate } from '../src/dossier/template'
import { DOSSIER_TOOLS, runDossierTool } from '../src/dossier/tools'
import { listRuns } from '../src/runIdentity'
import { entitiesOfRun } from '../src/runIdentity'
import { runTemplate } from '../src/runTemplate'

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
    expect(result.message).toContain('bề rộng thân = bề rộng bệ')
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

  // Live 21/11/2026, prompt 1: a road width of 8 m was "created" with the
  // general sheets showing only "CHƯA DỰNG ĐƯỢC…", and every later edit of
  // that dossier was refused. A value still outside the grid (phuLot; tCanh
  // until P2/M1, dossierTCanh.spec.ts) now refuses and draws nothing; the road width itself is in the grid since
  // P1/M2 (dossierBMatDuong.spec.ts).
  test('a create the generator cannot draw is refused and draws nothing', async () => {
    const db = database()
    for (const thong_so of [
      { tenMo: 'QA-TEST-MO-X1', phuLot: 200 },
      { tenMo: 'QA-TEST-MO-X2', bMatDuong: 8000, phuLot: 200 }
    ]) {
      const result = await runDossierTool('tao_ho_so_mo', { thong_so }, db)
      expect(result.ok).toBe(false)
      expect(result.status).toBe('refused')
      expect(result.message).toContain('Chưa dựng hồ sơ, không vẽ gì')
      expect(result.message).toContain('SUB-010')
      // Names the parameter and the value that would draw.
      expect(result.message).toContain('phần lót nhô mỗi mép = 100 mm')
      expect(result.message).not.toContain('bMatDuong = 7000')
      // Named as the user reads it, never by key (QA P1/M6).
      expect(result.message).not.toMatch(/phuLot|bMatDuong/)
    }
    expect(entities(db)).toHaveLength(0)
    expect(listRuns(db)).toHaveLength(0)
    // The live prompt itself now creates.
    expect(
      (
        await runDossierTool(
          'tao_ho_so_mo',
          {
            thong_so: {
              tenMo: 'QA-TEST-MO-A1',
              bMatDuong: 8000,
              tThan: 1200,
              lCanh: 4000
            }
          },
          db
        )
      ).ok
    ).toBe(true)
  })

  test('a dossier locked by a value outside the grid says how to unlock, and unlocks', async () => {
    const db = database()
    // Made the way 650452a2 did: the notice sheets drawn and recorded.
    const made = await runTemplate(
      abutmentDossierTemplate,
      buildDossierModel({
        tenMo: 'QA-TEST-MO-K1',
        nhanKichThuoc: 'ca_hai',
        phuLot: 200
      }).values,
      db
    )
    expect(made.errors).toEqual([])
    const locked = entitiesOfRun(db, 'r1').length
    const blocked = await runDossierTool(
      'sua_ho_so_mo',
      { ma_lan_chay: 'r1', thong_so: { tThan: 1800 } },
      db
    )
    expect(blocked.ok).toBe(false)
    expect(blocked.message).toContain(
      'đưa về giá trị mẫu: phần lót nhô mỗi mép = 100 mm'
    )
    expect(entitiesOfRun(db, 'r1')).toHaveLength(locked)
    const unlocked = await runDossierTool(
      'sua_ho_so_mo',
      { ma_lan_chay: 'r1', thong_so: { phuLot: 100, tThan: 1800 } },
      db
    )
    expect(unlocked.ok).toBe(true)
    expect(listRuns(db)[0].values).toMatchObject({ phuLot: 100, tThan: 1800 })
    const sheets = entitiesOfRun(db, 'r1').filter(
      e =>
        e instanceof AcDbText && e.textString.startsWith('CHƯA DỰNG ĐƯỢC HÌNH')
    )
    expect(sheets).toHaveLength(0)
    expect(entitiesOfRun(db, 'r1').length).toBeGreaterThan(locked)
  })

  test('the tool descriptions list what the generator cannot follow, from the grid', () => {
    const create = DOSSIER_TOOLS.find(t => t.name === 'tao_ho_so_mo')!
    const edit = DOSSIER_TOOLS.find(t => t.name === 'sua_ho_so_mo')!
    for (const description of [create.description, edit.description]) {
      const fixed = description.split('CHƯA đổi được')[1] ?? ''
      for (const key of ['soCotCoc', 'soHangCoc', 'phuLot'])
        expect(fixed).toContain(`${key} = `)
      expect(fixed).not.toContain('bMatDuong = ')
      // In the grid since P2/M1.
      expect(fixed).not.toContain('tCanh = ')
      // In the grid since P2-M2.
      expect(fixed).not.toContain('hLanCan = ')
      // In the grid since P2-M3 (tilted, not stretched).
      expect(fixed).not.toContain('docNgang = ')
      expect(fixed).not.toContain('docDoc = ')
      expect(fixed).not.toContain('soGoi = ')
      expect(fixed).not.toContain('aGoi = ')
      expect(description).toContain('Gối đổi được: soGoi, aGoi')
    }
    // UI P1/M5 S7: a refusal for hand edits is a stop, not a detour.
    expect(edit.description).toContain(
      'Khi bị từ chối vì sửa tay: không sửa gì thêm'
    )
    expect(edit.description).not.toContain(
      'Khi bị từ chối dùng execute_cad_script'
    )
    for (const description of [create.description, edit.description]) {
      expect(description).toContain('6 gối trên thân 8700 → aGoi = 1400')
      expect(description).toContain('bThan = bBe')
      expect(description).toContain(
        'Co giãn được: bBe, lBe, hBe, hLot, muiBe, tThan, hThan, hDau, lCanh, D, bMatDuong, tCanh, hLanCan, docNgang, docDoc.'
      )
      expect(description).toContain('bBe = bThan = bMatDuong + 2 × 350')
      expect(description).toContain('data.suyRa')
    }
  })

  test('a geometry change keeps the steel sheets and SUB-100, marked as M1, with the current take-off', async () => {
    // 17/11/2026: hLot +50 mm took the dossier from 2890 to 829 entities —
    // three steel sheets and SUB-100 went blank without a word.
    const db = database()
    await runDossierTool('tao_ho_so_mo', {}, db)
    const before = entitiesOfRun(db, 'r1').length
    const result = await runDossierTool(
      'sua_ho_so_mo',
      { ma_lan_chay: 'r1', thong_so: { hLot: 150 } },
      db
    )
    expect(result.ok).toBe(true)
    const after = entitiesOfRun(db, 'r1')
    expect(after.length).toBeGreaterThan(before * 0.95)
    const textsOn = (sheet: string) =>
      after
        .filter(
          e =>
            e instanceof AcDbText && readSemanticTag(e)?.params?.sheet === sheet
        )
        .map(e => (e as AcDbText).textString)
    for (const sheet of ['SUB-070', 'SUB-080', 'SUB-090']) {
      expect(textsOn(sheet)).toContain(
        'THÉP THEO M1 GỐC, CHƯA CẬP NHẬT CHO THÔNG SỐ NÀY'
      )
      expect(textsOn(sheet)).not.toContain(
        'CHƯA CÓ PHƯƠNG ÁN THÉP CHO HÌNH HỌC NÀY'
      )
    }
    const sub100 = textsOn('SUB-100')
    expect(sub100).toContain('TỔNG KHỐI LƯỢNG BÊ TÔNG MỐ (M3)')
    expect(sub100).toContain(
      'BẢNG THỐNG KÊ THÉP VÀ KHỐI LƯỢNG BÊN PHẢI LÀ CỦA M1 GỐC, CHƯA CẬP NHẬT CHO THÔNG SỐ NÀY'
    )
    expect(sub100).toContain(
      'BẢNG KHỐI LƯỢNG M1 THEO THÔNG SỐ HIỆN TẠI (TẠM TÍNH, xem BTKL)'
    )
    // The blinding line follows hLot: (7,9 × 6,2 − 4 × π × 0,36) × 0,15.
    expect(sub100).toContain('6,668')
    expect(sub100).toContain('Cốt thép (tạm tính theo hàm lượng mẫu M1)')
    const data = result.data as { canhBao?: string[] }
    expect(data.canhBao).toEqual(
      expect.arrayContaining([
        'SUB-070: THÉP THEO M1 GỐC, CHƯA CẬP NHẬT CHO THÔNG SỐ NÀY'
      ])
    )
  })

  test('a regeneration that drops much of the dossier asks first', async () => {
    const db = database()
    await runDossierTool('tao_ho_so_mo', {}, db)
    const ids = entitiesOfRun(db, 'r1').map(e => e.objectId)
    const refused = await runDossierTool(
      'sua_ho_so_mo',
      { ma_lan_chay: 'r1', thong_so: { thep: 'khong' } },
      db
    )
    expect(refused.ok).toBe(false)
    expect(refused.message).toMatch(
      /^Thao tác này sẽ bỏ \d+\/\d+ đối tượng của hồ sơ r1 \(.*SUB-070 \d+ → \d+.*\)\. Chưa sửa gì\./
    )
    expect(refused.message).toContain('xac_nhan_bo_doi_tuong: true')
    expect(entitiesOfRun(db, 'r1').map(e => e.objectId)).toEqual(ids)
    const confirmed = await runDossierTool(
      'sua_ho_so_mo',
      {
        ma_lan_chay: 'r1',
        thong_so: { thep: 'khong' },
        xac_nhan_bo_doi_tuong: true
      },
      db
    )
    expect(confirmed.ok).toBe(true)
    expect(entitiesOfRun(db, 'r1').length).toBeLessThan(ids.length * 0.9)
  })

  test('a pile length is not a geometry change: kept entities, recorded for the take-off', async () => {
    const db = database()
    await runDossierTool('tao_ho_so_mo', {}, db)
    const before = entitiesOfRun(db, 'r1')
    const ids = before.map(e => e.objectId)
    // A hand edit: a regeneration would refuse it, a pile length must not.
    const note = before.find(
      e => e instanceof AcDbText && readSemanticTag(e)?.params?.sourceHandle
    ) as AcDbText
    note.textString = 'GHI_CHU_KY_SU'
    const result = await runDossierTool(
      'sua_ho_so_mo',
      { ma_lan_chay: 'r1', thong_so: { lCoc: 30000 } },
      db
    )
    expect(result.ok).toBe(true)
    expect(listRuns(db)[0].values.lCoc).toBe(30000)
    const after = entitiesOfRun(db, 'r1')
    expect(after.map(e => e.objectId)).toEqual(ids)
    expect(note.textString).toBe('GHI_CHU_KY_SU')
    const piles = after
      .map(e => readSemanticTag(e))
      .filter(t => t?.params && 'lCoc' in t.params)
    expect(piles.length).toBeGreaterThan(0)
    for (const t of piles) expect(t!.params!.lCoc).toBe(30000)
    // Neither generator treats it as a new geometry.
    for (const version of ['0.2.0', '0.3.0'])
      expect(
        buildDossierScene(buildDossierModel({ lCoc: 30000 }), version)
          .detailMode
      ).toBe('source')
  })

  test('a new dossier labels its dimensions with numbers (standard assumption 10)', async () => {
    const db = database()
    await runDossierTool('tao_ho_so_mo', {}, db)
    expect(listRuns(db)[0].values.nhanKichThuoc).toBe('ca_hai')
    const texts = entitiesOfRun(db, 'r1')
      .filter(e => e.dxfTypeName === 'DIMENSION')
      .map(e => (e as unknown as { dimensionText?: string }).dimensionText)
    expect(texts).toContain('B Mố = 7700')
    expect(texts).not.toContain('B Mố')
    // A run stored before the parameter existed reads as the source's symbols.
    expect(buildDossierModel({}).values.nhanKichThuoc).toBe('ky_hieu')
  })

  test('dimension labels switch to measured values without losing anything', async () => {
    const db = database()
    // As a dossier drawn with the source's symbols.
    await runDossierTool(
      'tao_ho_so_mo',
      { thong_so: { nhanKichThuoc: 'ky_hieu' } },
      db
    )
    const before = entitiesOfRun(db, 'r1').length
    const dimTexts = () =>
      entitiesOfRun(db, 'r1')
        .filter(e => e.dxfTypeName === 'DIMENSION')
        .map(e => (e as unknown as { dimensionText?: string }).dimensionText)
    const symbols = dimTexts().filter(t => t === 'B Mố').length
    expect(symbols).toBeGreaterThan(0)
    const result = await runDossierTool(
      'sua_ho_so_mo',
      { ma_lan_chay: 'r1', thong_so: { nhanKichThuoc: 'ca_hai' } },
      db
    )
    expect(result.ok).toBe(true)
    expect(listRuns(db)[0].values.nhanKichThuoc).toBe('ca_hai')
    // Same dossier, steel and tables included; only the labels changed.
    expect(entitiesOfRun(db, 'r1')).toHaveLength(before)
    expect(dimTexts().filter(t => t === 'B Mố')).toHaveLength(0)
    // The draw context substitutes <> with the measurement: the number shows.
    expect(dimTexts().filter(t => t === 'B Mố = 7700')).toHaveLength(symbols)
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
