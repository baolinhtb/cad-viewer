/**
 * P2-M5: parameter edits after hand edits, compared by the region a change
 * redraws, not the whole dossier — plus the P2-M4 QA items: (a) the front
 * elevation's cross-fall notes follow docNgang, (b) an existing take-off
 * (BTKL) follows sua_ho_so_mo, and the UI fixtures written with acTpDxfOut.
 * "L1" is the QA dossier (8 m road, stem 1,2 m, wings 4 m, D1000 piles 25 m
 * long). Set QA_EVIDENCE_DIR to write the numbers and the fixtures there;
 * set P2M5_WRITE_FIXTURES=1 to rewrite the committed fixtures.
 */
jest.mock('../../cad-simple-viewer/src/editor/global/eventBus', () => ({
  eventBus: { emit: jest.fn() }
}))
jest.mock('@mlightcad/cad-simple-viewer', () => ({
  AcApDocManager: { instance: { regen: jest.fn() } },
  ...jest.requireActual('../../cad-simple-viewer/src/util/AcApDatabaseEdit')
}))

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  acTpDxfOut,
  readSemanticTag,
  writeSemanticTag
} from '@mlightcad/cad-template-sdk'
import {
  AcDbBlockReference,
  AcDbDatabase,
  AcDbEntity,
  AcDbFileType,
  AcDbLine,
  AcDbText,
  AcGeMatrix3d,
  AcGePoint3d
} from '@mlightcad/data-model'

import { btklObjectsFromValues } from '../src/btkl/template'
import { acTpBtklOfObject } from '../src/btkl/template'
import { runBtklTool } from '../src/btkl/tools'
import { acapDeriveDossierValues } from '../src/dossier/derive'
import { buildDossierModel, dossierDefaults } from '../src/dossier/model'
import { buildDossierScene } from '../src/dossier/scene'
import { acapSlopeLabel } from '../src/dossier/scene030'
import { runDossierTool } from '../src/dossier/tools'
import { entitiesOfRun, listRuns } from '../src/runIdentity'

const OUT = process.env.QA_EVIDENCE_DIR
const FIXTURES = join(__dirname, 'fixtures', 'p2m5')
const numbers: Record<string, unknown> = {}
afterAll(() => {
  if (!OUT) return
  mkdirSync(OUT, { recursive: true })
  writeFileSync(
    join(OUT, 'p2-m5-numbers.json'),
    JSON.stringify(numbers, null, 1)
  )
})

jest.setTimeout(900000)

type Values = Record<string, number | string>

/** The QA dossier, as the user gives it. */
const L1: Values = {
  tenMo: 'QA-P2-M5',
  bMatDuong: 8000,
  tThan: 1200,
  lCanh: 4000,
  D: 1000,
  lCoc: 25000
}
const NOTE = 'Ghi chú QA P2-M5: nét người dùng thêm'

const database = () => {
  const db = new AcDbDatabase()
  db.createDefaultData()
  return db
}
const all = (db: AcDbDatabase): AcDbEntity[] => [
  ...db.tables.blockTable.modelSpace.newIterator()
]
const runOf = (db: AcDbDatabase) =>
  listRuns(db).find(r => r.templateId === 'ho_so_mo_m1')!
const sheetOf = (e: AcDbEntity) =>
  String(readSemanticTag(e)?.params?.sheet ?? '?')
const sourceOf = (e: AcDbEntity) =>
  String(readSemanticTag(e)?.params?.sourceHandle ?? '')
function box(e: AcDbEntity) {
  try {
    const b = e.geometricExtents
    return Number.isFinite(b.min.x)
      ? [b.min.x, b.min.y, b.max.x, b.max.y].map(Math.round)
      : []
  } catch {
    return []
  }
}
/** What an entity looks like, without its id. */
const look = (e: AcDbEntity) =>
  [
    sheetOf(e),
    e.dxfTypeName,
    e.layer,
    e.color.colorIndex ?? '',
    box(e).join(','),
    e instanceof AcDbText ? e.textString : ''
  ].join('|')
const looks = (db: AcDbDatabase) =>
  entitiesOfRun(db, runOf(db).id).map(look).sort()
const ids = (db: AcDbDatabase) =>
  entitiesOfRun(db, runOf(db).id)
    .map(e => e.objectId)
    .sort()

const tao = async (db: AcDbDatabase, v: Values = L1) => {
  const r = await runDossierTool('tao_ho_so_mo', { thong_so: v }, db)
  expect(r.ok).toBe(true)
  return db
}
const sua = (
  db: AcDbDatabase,
  thong_so: Values,
  flags: Record<string, boolean> = {}
) =>
  runDossierTool(
    'sua_ho_so_mo',
    { ma_lan_chay: runOf(db).id, thong_so, ...flags },
    db
  )
/** The dossier drawn from scratch with these values: what an edit must give. */
const fresh = async (v: Values) => looks(await tao(database(), v))

/** A Vietnamese note the user writes on SUB-010, clear of the drawing. */
function addNote(db: AcDbDatabase): AcDbText {
  const s = buildDossierScene(buildDossierModel({ ...runOf(db).values }))
    .sheets[0]
  const note = new AcDbText()
  // Bottom-left of the sheet, inside the border, below the plans.
  note.position = new AcGePoint3d(s.origin[0] + 2500, s.origin[1] + 2200, 0)
  note.height = 250
  note.textString = NOTE
  db.tables.blockTable.modelSpace.appendEntity(note)
  return note
}
/** A pile of the pile plan (SUB-010), as drawn by the run. */
const planPile = (db: AcDbDatabase) =>
  entitiesOfRun(db, runOf(db).id).find(
    (e): e is AcDbBlockReference =>
      e instanceof AcDbBlockReference &&
      e.blockName === 'D1200-1' &&
      sheetOf(e) === 'SUB-010'
  )!
const move = (e: AcDbEntity, dx: number, dy = 0) =>
  e.transformBy(new AcGeMatrix3d().makeTranslation(dx, dy, 0))
/** The front elevation's cross-fall note IN2%%% (211B630). */
const slopeNote = (db: AcDbDatabase, handle = '211B630') =>
  entitiesOfRun(db, runOf(db).id).find(
    (e): e is AcDbText => e instanceof AcDbText && sourceOf(e) === handle
  )!

describe('(a) the cross-fall notes follow docNgang', () => {
  test('format: the source text at 2 %, IN<n>%%% otherwise; other texts untouched', () => {
    expect(acapSlopeLabel('211B630', 'IN2%%%', 2)).toBe('IN2%%%')
    expect(acapSlopeLabel('20EF3B3', 'IN1%%%', 2)).toBe('IN1%%%')
    expect(acapSlopeLabel('211B630', 'IN2%%%', 3)).toBe('IN3%%%')
    expect(acapSlopeLabel('20EF3B3', 'IN1%%%', 3)).toBe('IN3%%%')
    expect(acapSlopeLabel('211B630', 'IN2%%%', 0)).toBe('IN0%%%')
    expect(acapSlopeLabel('211B630', 'IN2%%%', -2)).toBe('IN-2%%%')
    expect(acapSlopeLabel('211B630', 'IN2%%%', 2.8)).toBe('IN2.8%%%')
    expect(acapSlopeLabel('211B630', 'IN2%%%', 4)).toBe('IN4%%%')
    expect(acapSlopeLabel('211B630', 'IN2%%%', -0.0001)).toBe('IN0%%%')
    // The wing notes carry no number: a symbol, kept.
    expect(acapSlopeLabel('20F050D', 'ID%%%', 3)).toBeUndefined()
    expect(acapSlopeLabel(undefined, 'IN2%%%', 3)).toBeUndefined()
  })

  const notes = (given: Values) => {
    const v = acapDeriveDossierValues(dossierDefaults(), given).values
    const front = buildDossierScene(buildDossierModel(v)).sheets.find(
      s => s.id === 'SUB-010'
    )!
    const text = (h: string) =>
      front.primitives
        .filter(p => p.kind === 'text' && p.sourceHandle === h)
        .map(p => (p as { text: string }).text)
    return {
      in1: text('20EF3B3'),
      in2: text('211B630'),
      id: [
        ...text('20F050D'),
        ...buildDossierScene(buildDossierModel(v))
          .sheets.find(s => s.id === 'SUB-020')!
          .primitives.filter(
            p => p.kind === 'text' && p.sourceHandle === '2111646'
          )
          .map(p => (p as { text: string }).text)
      ]
    }
  }
  test.each([
    [undefined, 'IN1%%%', 'IN2%%%'],
    [2, 'IN1%%%', 'IN2%%%'],
    [3, 'IN3%%%', 'IN3%%%'],
    [0, 'IN0%%%', 'IN0%%%'],
    [-2, 'IN-2%%%', 'IN-2%%%'],
    [2.8, 'IN2.8%%%', 'IN2.8%%%'],
    [4, 'IN4%%%', 'IN4%%%']
  ] as [number | undefined, string, string][])(
    'L1 docNgang %s: %s / %s on the front elevation, ID%%%% kept',
    (docNgang, in1, in2) => {
      const v = docNgang === undefined ? L1 : { ...L1, docNgang }
      const got = notes(v)
      expect(got.in1).toEqual([in1])
      expect(got.in2).toEqual([in2])
      expect(got.id).toEqual(['ID%%%', 'ID%%%'])
    }
  )

  test('sua_ho_so_mo docNgang 3: the drawing says IN3%%%, back to 2 says IN2%%%', async () => {
    const db = await tao(database())
    const res = await sua(db, { docNgang: 3 })
    expect(res.ok).toBe(true)
    expect(slopeNote(db).textString).toBe('IN3%%%')
    expect(slopeNote(db, '20EF3B3').textString).toBe('IN3%%%')
    expect(
      entitiesOfRun(db, runOf(db).id).filter(
        e => e instanceof AcDbText && /^IN2%%%$/.test(e.textString)
      )
    ).toEqual([])
    const elevations = (res.data as { caoDo?: Record<string, unknown> }).caoDo
    numbers.docNgang3 = { message: res.message, caoDo: elevations }
    expect((await sua(db, { docNgang: 2 })).ok).toBe(true)
    expect(slopeNote(db).textString).toBe('IN2%%%')
    expect(slopeNote(db, '20EF3B3').textString).toBe('IN1%%%')
    expect(looks(db)).toEqual(await fresh(L1))
  })
})

describe('(b) an existing take-off follows sua_ho_so_mo', () => {
  const take = (db: AcDbDatabase) => {
    const run = listRuns(db).find(r => r.templateId === 'btkl_ket_cau')
    if (!run) return undefined
    const { objects } = btklObjectsFromValues(run.values)
    const r = acTpBtklOfObject(objects[0])
    const kl = (k: string) =>
      Math.round((r.items.find(i => i.key === k)?.khoiLuong ?? NaN) * 1000) /
      1000
    return {
      id: run.id,
      x: run.values.x,
      y: run.values.y,
      coc: kl('coc'),
      be: kl('be'),
      c30: kl('be_tong'),
      canh: kl('canh')
    }
  }

  test('L1 with a take-off: 3 piles a row → 117,81 / 103,693 / 184,622 without cap_nhat_btkl', async () => {
    const db = await tao(database())
    expect((await runBtklTool('tao_btkl', {}, db)).ok).toBe(true)
    const was = take(db)!
    expect(was).toMatchObject({ coc: 78.54, be: 103.929, c30: 184.857 })
    const res = await sua(db, { soCotCoc: 3 })
    expect(res.ok).toBe(true)
    const now = take(db)!
    expect(now).toMatchObject({
      id: was.id,
      x: was.x,
      y: was.y,
      coc: 117.81,
      be: 103.693,
      c30: 184.622
    })
    const said = (res.data as { canhBao?: string[] }).canhBao ?? []
    expect(said.join(' ')).toContain(`Đã tự cập nhật tờ BTKL ${was.id}`)
    expect(said.join(' ')).toContain('cọc 117,81 m³')
    expect(said.join(' ')).toContain('bệ 103,693 m³')
    expect(said.join(' ')).toContain('bê tông C30 184,622 m³')
    expect(String(res.message)).toContain('117,81')
    // The sheet is the take-off of the drawing now: nothing left to refresh.
    const again = await runBtklTool(
      'cap_nhat_btkl',
      { ma_lan_chay: was.id },
      db
    )
    expect(again.message).toContain('đã khớp bản vẽ')
    numbers.btkl = { was, now, canhBao: said }
  })

  test('wing thickness / rail height follow too; a label-only change leaves it', async () => {
    const db = await tao(database())
    await runBtklTool('tao_btkl', {}, db)
    const was = take(db)!
    expect((await sua(db, { tCanh: 400 })).ok).toBe(true)
    const wing = take(db)!
    expect(wing.canh).not.toBe(was.canh)
    expect(wing.id).toBe(was.id)
    const rail = await sua(db, { hLanCan: 1300 })
    expect(rail.ok).toBe(true)
    expect(
      ((rail.data as { canhBao?: string[] }).canhBao ?? []).join(' ')
    ).toContain('Đã tự cập nhật tờ BTKL')
    // The elevation datum only: no quantity changes, the take-off is left alone.
    const label = await sua(db, {
      caoDoDayBe: Number(runOf(db).values.caoDoDayBe) + 1
    })
    expect(label.ok).toBe(true)
    expect(
      ((label.data as { canhBao?: string[] }).canhBao ?? []).join(' ')
    ).not.toContain('BTKL')
  })

  test('without a take-off, sua_ho_so_mo never makes one', async () => {
    const db = await tao(database())
    expect((await sua(db, { soCotCoc: 3 })).ok).toBe(true)
    expect(listRuns(db).map(r => r.templateId)).toEqual(['ho_so_mo_m1'])
  })
})

describe('P2-M5: hand edits kept outside the region of the change', () => {
  test('a note added by the user: hLanCan 1300 and docNgang 3 go through, the note stays', async () => {
    const db = await tao(database())
    const note = addNote(db)
    const at = [note.position.x, note.position.y]
    const r1 = await sua(db, { hLanCan: 1300 })
    expect(r1.ok).toBe(true)
    const r2 = await sua(db, { docNgang: 3 })
    expect(r2.ok).toBe(true)
    const kept = all(db).find(
      (e): e is AcDbText => e instanceof AcDbText && e.textString === NOTE
    )!
    expect(kept.objectId).toBe(note.objectId)
    expect([kept.position.x, kept.position.y]).toEqual(at)
    expect(readSemanticTag(kept)).toBeUndefined()
    // The dossier is exactly what the values draw.
    expect(looks(db)).toEqual(
      await fresh({ ...L1, hLanCan: 1300, docNgang: 3 })
    )
    numbers.note = { hLanCan: r1.message, docNgang: r2.message }
  })

  test('a generated line copied by hand (carrying the run tag) is kept', async () => {
    const db = await tao(database())
    const line = entitiesOfRun(db, runOf(db).id).find(
      (e): e is AcDbLine => e instanceof AcDbLine && sheetOf(e) === 'SUB-010'
    )!
    const copy = new AcDbLine(line.startPoint, line.endPoint)
    copy.layer = line.layer
    writeSemanticTag(copy, readSemanticTag(line)!)
    move(copy, 0, -900)
    db.tables.blockTable.modelSpace.appendEntity(copy)
    const res = await sua(db, { hLanCan: 1300 })
    expect(res.ok).toBe(true)
    expect(all(db).some(e => e.objectId === copy.objectId)).toBe(true)
    expect(readSemanticTag(copy)?.run?.values.hLanCan).toBe(1300)
    expect(runOf(db).values.hLanCan).toBe(1300)
  })

  test('a pile of the pile plan moved by hand: docNgang 3 goes through, the pile stays moved', async () => {
    const db = await tao(database())
    const pile = planPile(db)
    move(pile, 400, 0)
    const at = [pile.position.x, pile.position.y]
    const res = await sua(db, { docNgang: 3 })
    expect(res.ok).toBe(true)
    const still = all(db).find(e => e.objectId === pile.objectId) as
      | AcDbBlockReference
      | undefined
    expect(still).toBeDefined()
    expect([still!.position.x, still!.position.y]).toEqual(at)
    expect(slopeNote(db).textString).toBe('IN3%%%')
    expect(
      ((res.data as { canhBao?: string[] }).canhBao ?? []).join(' ')
    ).toContain('Giữ nguyên phần đã sửa tay ngoài vùng đổi')
    // Everything else is what the values draw: the moved pile is the only
    // difference.
    const want = await fresh({ ...L1, docNgang: 3 })
    const got = looks(db)
    const extra = got.filter(k => !want.includes(k))
    const missing = want.filter(k => !got.includes(k))
    expect(extra).toHaveLength(1)
    expect(missing).toHaveLength(1)
    expect(extra[0]).toContain('INSERT')
    numbers.movedOutside = { message: res.message, canhBao: res.data }
  })

  test('the same moved pile, then 3 piles a row (its region): refused, nothing changes', async () => {
    const db = await tao(database())
    move(planPile(db), 400, 0)
    const before = { ids: ids(db), looks: looks(db) }
    const v0 = { ...runOf(db).values }
    const res = await sua(db, { soCotCoc: 3 })
    expect(res.ok).toBe(false)
    expect(res.message).toContain('đã được sửa tay')
    expect(res.message).toContain('trong vùng mà lần sửa này vẽ lại')
    expect(res.message).toContain('dua_ve_so_bo_sinh: true')
    expect(res.message).toContain('MỘT lần')
    expect(ids(db)).toEqual(before.ids)
    expect(looks(db)).toEqual(before.looks)
    expect(runOf(db).values).toEqual(v0)
    // Put back as generated, with the change, when the user says so.
    const back = await sua(db, { soCotCoc: 3 }, { dua_ve_so_bo_sinh: true })
    expect(back.ok).toBe(true)
    expect(looks(db)).toEqual(await fresh({ ...L1, soCotCoc: 3 }))
    numbers.movedInside = res.message
  })

  test('the cross-fall note moved by hand, then docNgang 3: refused', async () => {
    const db = await tao(database())
    move(slopeNote(db), 0, 300)
    const before = ids(db)
    const res = await sua(db, { docNgang: 3 })
    expect(res.ok).toBe(false)
    expect(res.message).toContain('dua_ve_so_bo_sinh: true')
    expect(ids(db)).toEqual(before)
    expect(slopeNote(db).textString).toBe('IN2%%%')
  })

  test('an erased generated line outside the region stays erased; a typed-over label is still refused', async () => {
    const db = await tao(database())
    // A pile plan line: not redrawn by a rail height change.
    planPile(db).erase()
    const res = await sua(db, { hLanCan: 1300 })
    expect(res.ok).toBe(true)
    expect(
      entitiesOfRun(db, runOf(db).id).filter(
        e =>
          e instanceof AcDbBlockReference &&
          e.blockName === 'D1200-1' &&
          sheetOf(e) === 'SUB-010'
      )
    ).toHaveLength(3)
    // A label typed over (the footing bottom on SUB-020, untouched by the
    // stem height) is the label rule: asked, never kept silently.
    const el6 = entitiesOfRun(db, runOf(db).id).find(
      (e): e is AcDbText =>
        e instanceof AcDbText &&
        sheetOf(e) === 'SUB-020' &&
        e.textString === '228.837'
    )!
    el6.textString = '228.900'
    const v0 = { ...runOf(db).values }
    const refused = await sua(db, { hThan: Number(v0.hThan) + 300 })
    expect(refused.ok).toBe(false)
    expect(refused.message).toContain('đã được sửa tay')
    expect(runOf(db).values).toEqual(v0)
  })
})

/** Reads a DXF file the way the viewer opens one. */
async function readDxf(dxf: string): Promise<AcDbDatabase> {
  const db = new AcDbDatabase()
  await db.read(
    new TextEncoder().encode(dxf).buffer as ArrayBuffer,
    { readOnly: false },
    AcDbFileType.DXF
  )
  return db
}

/**
 * UI fixtures (L1, QA-P2-M5), written by acTpDxfOut — AutoCAD 2013, UTF-8,
 * TrueType names — never the data model's R14 writer, which garbles
 * Vietnamese. Committed under __tests__/fixtures/p2m5 and copied to the QA
 * evidence; P2M5_WRITE_FIXTURES=1 writes them again.
 */
describe('UI fixtures (acTpDxfOut, UTF-8)', () => {
  const FILES = {
    note: 'qa-p2m5-them-ghi-chu.dxf',
    moved: 'qa-p2m5-doi-net-ngoai-vung.dxf'
  }
  async function make(which: keyof typeof FILES) {
    const db = await tao(database())
    let what = ''
    if (which === 'note') {
      const n = addNote(db)
      what = `TEXT «${NOTE}» (handle ${n.objectId}) tại (${n.position.x}, ${n.position.y}), tờ SUB-010 góc dưới trái`
    } else {
      const p = planPile(db)
      const from = [p.position.x, p.position.y]
      move(p, 400, 0)
      what = `INSERT D1200-1 (cọc mặt bằng cọc, SUB-010, handle ${p.objectId}) dời 400 mm sang phải: (${from.join(', ')}) → (${p.position.x}, ${p.position.y})`
    }
    return { dxf: acTpDxfOut(db) as string, what }
  }
  const path = (which: keyof typeof FILES) => join(FIXTURES, FILES[which])

  test.each(['note', 'moved'] as (keyof typeof FILES)[])(
    'fixture %s: written by acTpDxfOut, UTF-8, Vietnamese kept',
    async which => {
      if (process.env.P2M5_WRITE_FIXTURES || !existsSync(path(which))) {
        const { dxf, what } = await make(which)
        mkdirSync(FIXTURES, { recursive: true })
        writeFileSync(path(which), dxf)
        numbers[`fixture ${FILES[which]}`] = what
      }
      if (OUT) {
        mkdirSync(join(OUT, 'fixtures'), { recursive: true })
        writeFileSync(
          join(OUT, 'fixtures', FILES[which]),
          readFileSync(path(which))
        )
      }
      const dxf = readFileSync(path(which), 'utf8')
      // acTpDxfOut: AutoCAD 2013 with the UTF-8 code page and the TrueType
      // file names; the R14 writer says AC1014 and garbles these titles.
      expect(dxf).toContain('AC1027')
      expect(dxf).toMatch(
        /\$DWGCODEPAGE\r?\n\s*3\r?\n\s*UTF-8/
      )
      expect(dxf).toMatch(/\n\s*3\r?\n\s*arial\.ttf/)
      for (const t of ['CÁC CAO ĐỘ', 'THÔNG SỐ KÍCH THƯỚC', 'QA-P2-M5'])
        expect(dxf).toContain(t)
      if (which === 'note') expect(dxf).toContain(NOTE)
      const db = await readDxf(dxf)
      expect(runOf(db)).toMatchObject({ version: '0.3.1' })
      expect(runOf(db).values.tenMo).toBe('QA-P2-M5')
      const res = await sua(db, { hLanCan: 1300 })
      numbers[`fixture ${FILES[which]} hLanCan 1300`] = res.message
      expect(res.ok).toBe(true)
      const kept = ((res.data as { canhBao?: string[] }).canhBao ?? []).filter(
        w => w.includes('sửa tay')
      )
      // Read back from the file, only the hand edit itself is told apart.
      expect(kept).toEqual(
        which === 'note'
          ? []
          : [
              expect.stringContaining(
                '(1 đối tượng bộ sinh đã dời/xóa, 1 đối tượng ở chỗ mới'
              )
            ]
      )
      if (which === 'note') {
        // Edit after edit on the file read back: each goes through.
        for (const change of [{ docNgang: 3 }, { soCotCoc: 3 }] as Values[])
          expect((await sua(db, change)).ok).toBe(true)
        expect(slopeNote(db).textString).toBe('IN3%%%')
        expect(
          all(db).some(e => e instanceof AcDbText && e.textString === NOTE)
        ).toBe(true)
      } else {
        // The moved pile is still moved (400 right of where the generator
        // draws it); a cross-fall change goes through too.
        const pile = planPile(db)
        const at = [pile.position.x, pile.position.y]
        const fall = await sua(db, { docNgang: 3 })
        expect(fall.ok).toBe(true)
        expect(slopeNote(db).textString).toBe('IN3%%%')
        const still = all(db).find(e => e.objectId === pile.objectId) as
          | AcDbBlockReference
          | undefined
        expect([still?.position.x, still?.position.y]).toEqual(at)
        numbers[`fixture ${FILES[which]} pile`] = { handle: pile.objectId, at }
        // Its own region refuses.
        const refused = await sua(db, { soCotCoc: 3 })
        expect(refused.ok).toBe(false)
        expect(refused.message).toContain('dua_ve_so_bo_sinh: true')
      }
    }
  )
})
