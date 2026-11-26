/**
 * FIX-NOTE L1 defaults: «Tạo hồ sơ L1, lập BTKL mặc định» must give the
 * accepted P2 L1 numbers, not the M1 template renamed. UI re-run: the agent
 * passed only tenMo "L1" and got C30 187,016 / 1.4 27,661 / 1.7 5,223 and
 * «Cọc chưa tính được» — the M1 values. The tool now applies the L1 set
 * (8 m road, stem 1,2 m, wings 4 m, D1000 piles 25 m) on tenMo "L1" or
 * mau: "L1"; without L1 it is still M1 (dossierDefaults unchanged).
 */
jest.mock('../../cad-simple-viewer/src/editor/global/eventBus', () => ({
  eventBus: { emit: jest.fn() }
}))
jest.mock('@mlightcad/cad-simple-viewer', () => ({
  AcApDocManager: { instance: { regen: jest.fn() } },
  ...jest.requireActual('../../cad-simple-viewer/src/util/AcApDatabaseEdit')
}))

import { readSemanticTag } from '@mlightcad/cad-template-sdk'
import { AcDbDatabase, AcDbText } from '@mlightcad/data-model'

import { acTpBtklOfObject, btklObjectsFromValues } from '../src/btkl/template'
import { runBtklTool } from '../src/btkl/tools'
import { dossierDefaults } from '../src/dossier/model'
import {
  acapDossierGivenValues,
  DOSSIER_PRESET_L1,
  DOSSIER_TOOLS,
  runDossierTool
} from '../src/dossier/tools'
import { entitiesOfRun, listRuns } from '../src/runIdentity'

jest.setTimeout(900000)

const database = () => {
  const db = new AcDbDatabase()
  db.createDefaultData()
  return db
}
const runOf = (db: AcDbDatabase) =>
  listRuns(db).find(r => r.templateId === 'ho_so_mo_m1')!

/** The take-off sheet's figures, rounded as the sheet prints them. */
function take(db: AcDbDatabase) {
  const run = listRuns(db).find(r => r.templateId === 'btkl_ket_cau')!
  const r = acTpBtklOfObject(btklObjectsFromValues(run.values).objects[0])
  const kl = (stt: string) => {
    const v = r.items.find(i => i.stt === stt)?.khoiLuong
    return v === undefined || v === null || !Number.isFinite(v)
      ? null
      : Math.round(v * 1000) / 1000
  }
  return {
    id: run.id,
    c30: kl('1'),
    be: kl('1.1'),
    canh: kl('1.4'),
    lanCan: kl('1.7'),
    coc: kl('3')
  }
}

async function taoVaBtkl(input: Record<string, unknown>) {
  const db = database()
  const r = await runDossierTool('tao_ho_so_mo', input, db)
  expect(r.ok).toBe(true)
  expect((await runBtklTool('tao_btkl', {}, db)).ok).toBe(true)
  return { db, r }
}

describe('which inputs mean the L1 set', () => {
  test.each(['L1', 'l1', ' L1 ', 'Mố L1'])('tenMo %j: the L1 set', tenMo => {
    const { given, mau } = acapDossierGivenValues({ tenMo }, undefined)
    expect(mau).toBe('L1')
    expect(given).toEqual({ ...DOSSIER_PRESET_L1, tenMo })
  })

  test.each(['QA-P2-M5', 'QA-FIX-NOTE', 'L10', 'L1A', 'M1', 'Mố A1'])(
    'tenMo %j: not the L1 set',
    tenMo => {
      const { given, mau } = acapDossierGivenValues(
        { tenMo, bMatDuong: 8000 },
        undefined
      )
      expect(mau).toBeUndefined()
      expect(given).toEqual({ tenMo, bMatDuong: 8000 })
    }
  )

  test('mau "L1" outside thong_so: the set, the user values on top', () => {
    expect(acapDossierGivenValues({}, 'L1').given).toEqual(DOSSIER_PRESET_L1)
    expect(
      acapDossierGivenValues({ tenMo: 'Mố A', lCoc: 30000 }, 'L1').given
    ).toEqual({ ...DOSSIER_PRESET_L1, tenMo: 'Mố A', lCoc: 30000 })
    expect(() => acapDossierGivenValues({}, 'M2')).toThrow(/mau chỉ nhận/)
  })

  test('the M1 defaults are not changed by the preset', () => {
    expect(dossierDefaults()).toMatchObject({
      bMatDuong: 7000,
      tThan: 1500,
      lCanh: 6500,
      D: 1200,
      lCoc: 0
    })
  })

  test('the tool description says what «hồ sơ L1» is', () => {
    const tao = DOSSIER_TOOLS.find(t => t.name === 'tao_ho_so_mo')!
    expect(tao.description).toContain(
      'tenMo = L1, bMatDuong = 8000, tThan = 1200, lCanh = 4000, D = 1000, lCoc = 25000 (gồm chiều dài cọc 25 m)'
    )
    expect(tao.description).toContain(
      'không hỏi lại chiều dài cọc khi đã áp bộ L1'
    )
    expect(tao.description).toContain(
      'Mẫu M1 (không nói L1): chưa có chiều dài cọc thì không tự đặt'
    )
    const schema = tao.input_schema as {
      properties: Record<string, { enum?: string[] }>
    }
    expect(schema.properties.mau.enum).toEqual(['L1'])
  })
})

describe('tao_ho_so_mo + tao_btkl: «hồ sơ L1 mặc định» gives the P2 numbers', () => {
  const L1_NUMBERS = {
    coc: 78.54,
    be: 103.929,
    canh: 19.704,
    lanCan: 3.214,
    c30: 184.857
  }

  test.each([
    ['tenMo "L1" only', { thong_so: { tenMo: 'L1' } }],
    ['mau "L1", no thong_so', { mau: 'L1' }]
  ])('%s', async (_name, input) => {
    const { db, r } = await taoVaBtkl(input)
    expect(runOf(db).values).toMatchObject({
      tenMo: 'L1',
      bMatDuong: 8000,
      tThan: 1200,
      lCanh: 4000,
      D: 1000,
      lCoc: 25000,
      bBe: 8700,
      bThan: 8700,
      aCocNgang: 6700,
      aCocDoc: 4000,
      lBe: 6000
    })
    expect(take(db)).toMatchObject(L1_NUMBERS)
    expect(r.message).toContain('Đã áp bộ L1')
    expect(r.message).toContain('chiều dài cọc 25000 mm')
    expect(r.message).not.toContain('Chưa có chiều dài cọc')
    const data = r.data as { boThongSo?: string; macDinhTuMau?: string[] }
    expect(data.boThongSo).toBe('L1')
    for (const k of Object.keys(DOSSIER_PRESET_L1))
      expect(data.macDinhTuMau).not.toContain(k)
  })

  test('no L1: still the M1 template (187,016, no pile length)', async () => {
    for (const thong_so of [undefined, { tenMo: 'QA-FIX-NOTE' }]) {
      const { db, r } = await taoVaBtkl(thong_so ? { thong_so } : {})
      expect(Number(runOf(db).values.lCoc)).toBe(0)
      expect(runOf(db).values.D).toBe(1200)
      expect(take(db)).toMatchObject({
        c30: 187.016,
        canh: 27.661,
        lanCan: 5.223,
        coc: null
      })
      expect(r.message).toContain('Chưa có chiều dài cọc')
      expect(r.message).not.toContain('Đã áp bộ L1')
    }
  })

  test('tenMo "L1", lCoc 0: lCoc stays 0, the rest is L1', async () => {
    const db = database()
    const r = await runDossierTool(
      'tao_ho_so_mo',
      { thong_so: { tenMo: 'L1', lCoc: 0 } },
      db
    )
    expect(r.ok).toBe(true)
    expect(runOf(db).values).toMatchObject({
      lCoc: 0,
      bMatDuong: 8000,
      tThan: 1200,
      lCanh: 4000,
      D: 1000
    })
  })

  // C: the L1 geometry differs from M1, so the GHI CHÚ blocks are there
  // right after tao_ho_so_mo — no sua needed.
  test('GHI CHÚ on SUB-070…100 right after tao_ho_so_mo', async () => {
    const db = database()
    expect(
      (await runDossierTool('tao_ho_so_mo', { thong_so: { tenMo: 'L1' } }, db))
        .ok
    ).toBe(true)
    const notes = entitiesOfRun(db, runOf(db).id).filter(
      e =>
        e instanceof AcDbText && readSemanticTag(e)?.params?.khoi === 'GHI CHÚ'
    ) as AcDbText[]
    const sheets = [
      ...new Set(
        notes.map(n => String(readSemanticTag(n)?.params?.sheet ?? '?'))
      )
    ].sort()
    expect(sheets).toEqual(['SUB-070', 'SUB-080', 'SUB-090', 'SUB-100'])
    expect(notes.filter(n => n.textString === 'GHI CHÚ')).toHaveLength(4)
  })

  // D: the 3 % cross fall on the default L1 gives the P2 numbers.
  test('sua docNgang 3 on «L1 mặc định»: EL1 238,631 / 238,391, IN3 %, BTKL line', async () => {
    const { db } = await taoVaBtkl({ thong_so: { tenMo: 'L1' } })
    const was = take(db)
    const res = await runDossierTool(
      'sua_ho_so_mo',
      { ma_lan_chay: runOf(db).id, thong_so: { docNgang: 3 } },
      db
    )
    expect(res.ok).toBe(true)
    const bang = (res.data as { caoDo: { bang: Record<string, number> } }).caoDo
      .bang
    expect(bang['EL1.L']).toBe(238.631)
    expect(bang['EL1.R']).toBe(238.391)
    const slope = entitiesOfRun(db, runOf(db).id).find(
      (e): e is AcDbText =>
        e instanceof AcDbText &&
        readSemanticTag(e)?.params?.sourceHandle === '211B630'
    )!
    expect(slope.textString).toBe('IN3%%%')
    const said = ((res.data as { canhBao?: string[] }).canhBao ?? []).join(' ')
    expect(said).toContain(`Đã tự cập nhật tờ BTKL ${was.id}:`)
    expect(said).toContain('1.4 Tường cánh 19,704 → 19,592 m³')
    expect(said).toContain('1.7 Lan can trên tường cánh 3,214 m³')
    expect(said).toContain('tổng C30 184,857 → 184,745 m³')
    expect(String(res.message)).toContain('1.4 Tường cánh 19,704 → 19,592 m³')
  })
})
