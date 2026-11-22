/**
 * Generator 0.3.1 (plan P0–P1, decision 4): new dossiers are 0.3.1; a 0.3.0
 * dossier is edited like a current one while its drawing is what today's
 * generator draws from its values, and is otherwise unlocked by the user —
 * rebuilt as 0.3.1 from its stored values with the change, in one call
 * (`mo_khoa_031`), never silently and never mistaken for a hand-edited
 * number. Set QA_EVIDENCE_DIR to write the numbers and the UI fixtures.
 */
jest.mock('../../cad-simple-viewer/src/editor/global/eventBus', () => ({
  eventBus: { emit: jest.fn() }
}))
jest.mock('@mlightcad/cad-simple-viewer', () => ({
  AcApDocManager: { instance: { regen: jest.fn() } },
  ...jest.requireActual('../../cad-simple-viewer/src/util/AcApDatabaseEdit')
}))

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  acTpWithWorkingDatabaseSync,
  createDrawContext,
  readSemanticTag,
  writeSemanticTag
} from '@mlightcad/cad-template-sdk'
import {
  AcDbDatabase,
  AcDbEntity,
  AcDbFileType,
  AcDbMText,
  AcDbText
} from '@mlightcad/data-model'

import {
  acapIsA3Version,
  buildDossierModel,
  DOSSIER_ID,
  DOSSIER_VERSION,
  DOSSIER_VERSIONS
} from '../src/dossier/model'
import type { DossierScene } from '../src/dossier/scene'
import { buildDossierScene, drawDossierScene } from '../src/dossier/scene'
import { runDossierTool } from '../src/dossier/tools'
import { entitiesOfRun, listRuns } from '../src/runIdentity'
import { layerStyles, legacyLayers, roleLayers } from '../src/templateRegistry'

const OUT = process.env.QA_EVIDENCE_DIR
const numbers: Record<string, unknown> = {}
afterAll(() => {
  if (!OUT) return
  mkdirSync(OUT, { recursive: true })
  writeFileSync(
    join(OUT, 'p1-v031-numbers.json'),
    JSON.stringify(numbers, null, 1)
  )
})

type Values = Record<string, number | string>
const sheetOf = (e: AcDbEntity) =>
  String(readSemanticTag(e)?.params?.sheet ?? '?')
const ids = (db: AcDbDatabase) =>
  entitiesOfRun(db, 'r1')
    .map(e => e.objectId)
    .sort()
const texts = (db: AcDbDatabase) =>
  entitiesOfRun(db, 'r1').filter((e): e is AcDbText => e instanceof AcDbText)
const run = (db: AcDbDatabase) => listRuns(db)[0]
const edit = (
  db: AcDbDatabase,
  thong_so: Values,
  flags: Record<string, boolean> = {}
) =>
  runDossierTool('sua_ho_so_mo', { ma_lan_chay: 'r1', thong_so, ...flags }, db)

/** The L1 dossier of the live acceptance (8 m road). */
const L1: Values = {
  tenMo: 'QA-030-CU',
  bMatDuong: 8000,
  tThan: 1200,
  lCanh: 4000,
  D: 1000,
  lCoc: 25000,
  bBe: 8700,
  bThan: 8700,
  aCocNgang: 6700,
  aCocDoc: 4000,
  nhanKichThuoc: 'ca_hai'
}

/**
 * A dossier recorded as `version`, drawn from `drawnValues` (its stored
 * values by default) through today's A3 scene, then made old by `age`.
 */
function dossierAs(
  version: string,
  values: Values,
  age: (scene: DossierScene) => void = () => {},
  drawnValues: Values = values
): AcDbDatabase {
  const db = new AcDbDatabase()
  db.createDefaultData()
  const stored = buildDossierModel(values).values
  const scene = buildDossierScene(buildDossierModel(drawnValues), '0.3.0')
  age(scene)
  acTpWithWorkingDatabaseSync(db, () =>
    drawDossierScene(
      createDrawContext(
        db,
        DOSSIER_ID,
        roleLayers(),
        {
          id: 'r1',
          version,
          values: stored as Record<string, number | string | boolean>
        },
        layerStyles(),
        { legacyLayers: legacyLayers() }
      ),
      scene
    )
  )
  return db
}

/** What the generator drew before M5/M5b on SUB-020 and the front view. */
const SOURCE_GREY = ['237.491', '228.837', '4.0']
const beforeM5 = (scene: DossierScene) => {
  for (const sheet of scene.sheets) {
    sheet.primitives = sheet.primitives.filter(
      p => !p.sourceHandle?.includes('#F')
    )
    if (sheet.id !== 'SUB-020') continue
    for (const p of sheet.primitives)
      if (p.kind === 'text') {
        if (SOURCE_GREY.includes(p.text)) p.color = 8
        if (p.text.startsWith('%%UBẢNG'))
          p.text = p.text.replace(/QA-030-CU$/, 'M1')
      }
  }
}
/** Locked before M2: the general sheets showed the "cannot draw" notice. */
const LOCKED = { ...L1, tCanh: 600 }

jest.setTimeout(900000)

describe('versions', () => {
  test('new dossiers are 0.3.1; 0.3.0 and 0.3.1 are both A3', async () => {
    expect(DOSSIER_VERSION).toBe('0.3.1')
    expect(DOSSIER_VERSIONS).toEqual(['0.1.0', '0.2.0', '0.3.0', '0.3.1'])
    expect(acapIsA3Version('0.3.0')).toBe(true)
    expect(acapIsA3Version('0.3.1')).toBe(true)
    expect(acapIsA3Version('0.2.0')).toBe(false)
    expect(buildDossierScene(buildDossierModel({}), '0.3.0').sheets).toEqual(
      buildDossierScene(buildDossierModel({}), '0.3.1').sheets
    )
    const db = new AcDbDatabase()
    db.createDefaultData()
    const made = await runDossierTool('tao_ho_so_mo', { thong_so: L1 }, db)
    expect(made.ok).toBe(true)
    expect(run(db).version).toBe('0.3.1')
  })
})

describe('a 0.3.0 dossier that matches today’s generator edits as usual', () => {
  test('a dimension change: rebuilt, now 0.3.1, said so', async () => {
    const db = dossierAs('0.3.0', L1)
    const v0 = run(db).values
    const res = await edit(db, { hThan: Number(v0.hThan) + 300 })
    expect(res.ok).toBe(true)
    expect(run(db).version).toBe('0.3.1')
    expect(run(db).values.hThan).toBe(Number(v0.hThan) + 300)
    expect((res.data as { canhBao?: string[] }).canhBao?.join(' ')).toContain(
      'đã chuyển lên bộ sinh 0.3.1'
    )
  })

  test('an elevation change: patched in place, same handles, now 0.3.1', async () => {
    const db = dossierAs('0.3.0', L1)
    const before = ids(db)
    const v0 = run(db).values
    const res = await edit(db, {
      caoDoDayBe: Math.round((Number(v0.caoDoDayBe) + 0.3) * 1000) / 1000
    })
    expect(res.ok).toBe(true)
    expect(ids(db)).toEqual(before)
    expect(run(db).version).toBe('0.3.1')
    expect(texts(db).map(t => t.textString)).toContain('229.137')
  })

  test('a real hand edit on it is a hand edit, not an unlock', async () => {
    const db = dossierAs('0.3.0', L1)
    texts(db).find(
      t => sheetOf(t) === 'SUB-020' && t.textString === '228.837'
    )!.textString = '228.900'
    const res = await edit(db, {
      caoDoDayBe: Number(run(db).values.caoDoDayBe) + 0.3
    })
    expect(res.ok).toBe(false)
    expect(res.message).toContain('ô EL6 trên SUB-020 đang là «228.900»')
    expect(res.message).not.toContain('mở khóa')
  })
})

describe('a 0.3.0 dossier the generator has moved on from: unlock', () => {
  test.each([
    [
      'drawn before M5 (grey cells, "M1" titles, no front labels)',
      L1,
      beforeM5,
      L1
    ],
    ['locked before M2 (notice sheets)', L1, () => {}, LOCKED]
  ] as [string, Values, (s: DossierScene) => void, Values][])(
    '%s',
    async (name, stored, age, drawn) => {
      const db = dossierAs('0.3.0', stored, age, drawn)
      const before = ids(db)
      const v0 = { ...run(db).values }
      const notices = () =>
        texts(db).filter(t => /CHƯA DỰNG ĐƯỢC HÌNH/.test(t.textString))
      for (const change of [
        { hThan: Number(v0.hThan) + 300 },
        { caoDoDayBe: Number(v0.caoDoDayBe) + 0.3 },
        { tenMo: 'QA-030-MOI', hThan: Number(v0.hThan) + 300 }
      ] as Values[]) {
        const res = await edit(db, change)
        numbers[`refused ${name}`] = res.message
        expect(res.ok).toBe(false)
        expect(res.message).toContain('mở khóa')
        expect(res.message).toContain('bộ sinh 0.3.0')
        expect(res.message).toContain('bộ sinh 0.3.1')
        expect(res.message).toContain('mo_khoa_031: true')
        expect(res.message).toContain('hỏi xác nhận')
        expect(res.message).not.toMatch(/setText|execute_cad_script/)
        // Not taken for a hand-edited number.
        expect(res.message).not.toContain('ô EL6')
        expect(ids(db)).toEqual(before)
        expect(run(db).values).toEqual(v0)
        expect(run(db).version).toBe('0.3.0')
      }
      // Confirmed: one call rebuilds as 0.3.1 and applies the change.
      const res = await edit(
        db,
        { hThan: Number(v0.hThan) + 300 },
        { mo_khoa_031: true }
      )
      numbers[`unlocked ${name}`] = {
        message: res.message,
        canhBao: (res.data as { canhBao?: string[] }).canhBao
      }
      expect(res.ok).toBe(true)
      expect(run(db).version).toBe('0.3.1')
      expect(run(db).values.hThan).toBe(Number(v0.hThan) + 300)
      expect(notices()).toEqual([])
      const sub020 = texts(db).filter(t => sheetOf(t) === 'SUB-020')
      expect(sub020.map(t => t.textString)).toContain(
        '%%UBẢNG CAO ĐỘ MỐ QA-030-CU'
      )
      expect(
        sub020
          .filter(t => /^\d+\.\d+$/.test(t.textString))
          .every(t => t.color.colorIndex === 7)
      ).toBe(true)
      expect(
        texts(db).filter(
          t =>
            /^G\d$/.test(t.textString) &&
            String(readSemanticTag(t)?.params?.sourceHandle).includes('#F')
        )
      ).toHaveLength(4)
      // After it, the dossier edits as a current one.
      const next = await edit(db, {
        caoDoDayBe: Number(v0.caoDoDayBe) + 0.3
      })
      expect(next.ok).toBe(true)
    }
  )

  test('drift and a hand-edited number together: both said, the loss warned', async () => {
    const db = dossierAs('0.3.0', L1, scene => {
      beforeM5(scene)
      for (const p of scene.sheets.find(s => s.id === 'SUB-020')!.primitives)
        if (p.kind === 'text' && p.text === '230.837') p.text = '230.900'
    })
    const res = await edit(db, { hThan: Number(run(db).values.hThan) + 300 })
    expect(res.ok).toBe(false)
    expect(res.message).toContain('mở khóa')
    expect(res.message).toContain('đang là «230.900», bộ sinh ghi «230.837»')
    expect(res.message).toContain('mở khóa sẽ mất các số sửa tay này')
  })

  test('a 0.3.1 dossier with a hand-edited number still names the cell', async () => {
    const db = new AcDbDatabase()
    db.createDefaultData()
    await runDossierTool('tao_ho_so_mo', { thong_so: L1 }, db)
    texts(db).find(
      t => sheetOf(t) === 'SUB-020' && t.textString === '228.837'
    )!.textString = '228.900'
    const res = await edit(db, {
      caoDoDayBe: Number(run(db).values.caoDoDayBe) + 0.3
    })
    expect(res.ok).toBe(false)
    expect(res.message).toContain('ô EL6 trên SUB-020 đang là «228.900»')
    expect(res.message).not.toContain('mở khóa')
  })
})

/**
 * The UI fixtures: an old dossier saved as DXF (the run tag rides in the
 * XData) and read back, as the viewer opens a file, still refuses and then
 * unlocks.
 */
describe('UI fixtures: old dossiers as DXF files', () => {
  test.each([
    ['ho-so-030-cu-lech.dxf', L1, beforeM5, L1],
    ['ho-so-030-cu-khoa.dxf', L1, () => {}, LOCKED]
  ] as [string, Values, (s: DossierScene) => void, Values][])(
    '%s',
    async (file, stored, age, drawn) => {
      const dxf = dossierAs('0.3.0', stored, age, drawn).dxfOut() as string
      if (OUT) writeFileSync(join(OUT, file), dxf)
      const db = new AcDbDatabase()
      await db.read(
        new TextEncoder().encode(dxf).buffer as ArrayBuffer,
        { readOnly: false },
        AcDbFileType.DXF
      )
      expect(run(db)).toMatchObject({ id: 'r1', version: '0.3.0' })
      const v0 = run(db).values
      const refused = await edit(db, { hThan: Number(v0.hThan) + 300 })
      expect(refused.ok).toBe(false)
      expect(refused.message).toContain('mo_khoa_031: true')
      const unlocked = await edit(
        db,
        { hThan: Number(v0.hThan) + 300 },
        { mo_khoa_031: true }
      )
      expect(unlocked.ok).toBe(true)
      expect(run(db).version).toBe('0.3.1')
    }
  )
})

/**
 * QA fixtures for checks V4/V5 (a hand-edited EL6 on SUB-020 without typing
 * in the canvas): a new 0.3.1 dossier QA-031-A1 whose EL6 cell is either the
 * generator's number in MText codes, or another number. Saved as DXF and
 * read back as the viewer opens a file.
 */
describe('UI fixtures: QA-031-A1 with a hand-edited EL6', () => {
  const FORMATTED = '{\\A1;\\c16777215;\\farial|b0|i0;\\H161.4;228.837}'
  const QA031: Values = {
    tenMo: 'QA-031-A1',
    bMatDuong: 8000,
    tThan: 1200,
    lCanh: 4000,
    D: 1000,
    lCoc: 25000
  }
  const el6 = (db: AcDbDatabase) =>
    texts(db).find(t => sheetOf(t) === 'SUB-020' && t.textString === '228.837')!
  /** EL6 as an MText carrying the run tag: the right number, in codes. */
  const formatted = (db: AcDbDatabase) => {
    const old = el6(db)
    const m = new AcDbMText()
    m.location = { x: old.position.x, y: old.position.y, z: 0 }
    m.contents = FORMATTED
    m.height = old.height
    writeSemanticTag(m, readSemanticTag(old)!)
    db.tables.blockTable.modelSpace.appendEntity(m)
    old.erase()
  }
  /** EL6 typed over with another number, the Text and its tag kept. */
  const typedOver = (db: AcDbDatabase) => (el6(db).textString = '229.500')

  async function fixture(file: string, handEdit: (db: AcDbDatabase) => void) {
    const made = new AcDbDatabase()
    made.createDefaultData()
    expect(
      (await runDossierTool('tao_ho_so_mo', { thong_so: QA031 }, made)).ok
    ).toBe(true)
    handEdit(made)
    const dxf = made.dxfOut() as string
    if (OUT) {
      mkdirSync(OUT, { recursive: true })
      writeFileSync(join(OUT, file), dxf)
    }
    const db = new AcDbDatabase()
    await db.read(
      new TextEncoder().encode(dxf).buffer as ArrayBuffer,
      { readOnly: false },
      AcDbFileType.DXF
    )
    expect(run(db)).toMatchObject({ id: 'r1', version: '0.3.1' })
    expect(run(db).values.tenMo).toBe('QA-031-A1')
    return db
  }
  const cell = (db: AcDbDatabase, value: string) =>
    texts(db).find(t => sheetOf(t) === 'SUB-020' && t.textString === value)
  const raise = (db: AcDbDatabase) => ({
    caoDoDayBe:
      Math.round((Number(run(db).values.caoDoDayBe) + 0.3) * 1000) / 1000
  })

  test('ho-so-031-a1-el6-format.dxf: the raise goes through, EL6 plain', async () => {
    const db = await fixture('ho-so-031-a1-el6-format.dxf', formatted)
    const shown = [...db.tables.blockTable.modelSpace.newIterator()].filter(
      (e): e is AcDbMText => e instanceof AcDbMText
    )
    expect(shown.map(m => m.contents)).toEqual([FORMATTED])
    const look = cell(db, '230.837')!
    const res = await edit(db, raise(db))
    numbers['fixture el6-format'] = res.message
    expect(res.ok).toBe(true)
    expect(res.message).not.toContain('sửa tay')
    expect(res.message).not.toContain('mở khóa')
    const el = cell(db, '229.137')!
    expect(el).toBeInstanceOf(AcDbText)
    expect([el.color.colorIndex, el.layer, el.styleName]).toEqual([
      look.color.colorIndex,
      look.layer,
      look.styleName
    ])
    expect(
      [...db.tables.blockTable.modelSpace.newIterator()].filter(
        e => e instanceof AcDbMText
      )
    ).toEqual([])
  })

  test('ho-so-031-a1-el6-229500.dxf: refused without the flag, put back and raised with it', async () => {
    const db = await fixture('ho-so-031-a1-el6-229500.dxf', typedOver)
    const before = ids(db)
    const v0 = { ...run(db).values }
    const refused = await edit(db, raise(db))
    expect(refused.ok).toBe(false)
    expect(refused.message).toContain('ô EL6 trên SUB-020 đang là «229.500»')
    expect(refused.message).not.toContain('mở khóa')
    expect(ids(db)).toEqual(before)
    expect(run(db).values).toEqual(v0)
    const look = cell(db, '230.837')!
    const res = await edit(db, raise(db), { dua_ve_so_bo_sinh: true })
    numbers['fixture el6-229500'] = (res.data as { canhBao?: string[] }).canhBao
    expect(res.ok).toBe(true)
    // From the generator's 228.837, not from the hand-edited 229.500.
    expect(cell(db, '229.137')).toBeDefined()
    expect(cell(db, '229.800')).toBeUndefined()
    const el = cell(db, '229.137')!
    expect([el.color.colorIndex, el.layer, el.styleName]).toEqual([
      7,
      look.layer,
      look.styleName
    ])
    expect(cell(db, '231.137')).toBeDefined()
  })
})
