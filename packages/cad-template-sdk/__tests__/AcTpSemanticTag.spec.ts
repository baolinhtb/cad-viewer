import { AcDbDatabase, AcDbLine } from '@mlightcad/data-model'

import {
  ensureSemanticTagRegApp,
  hasRole,
  readSemanticTag,
  SEMANTIC_TAG_APP_ID,
  writeSemanticTag
} from '../src/AcTpSemanticTag'

function createLine() {
  return new AcDbLine({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 })
}

const TAG = {
  role: 'lan_can',
  partId: 'lc_trai_01',
  templateId: 'cau_ban_btct'
}

describe('AcTpSemanticTag', () => {
  test('a written tag reads back field for field', () => {
    const entity = createLine()

    writeSemanticTag(entity, TAG)

    expect(readSemanticTag(entity)).toEqual(TAG)
  })

  test('the tag is stored under its own RegApp, not the core one', () => {
    const entity = createLine()

    writeSemanticTag(entity, TAG)

    expect(entity.getXData(SEMANTIC_TAG_APP_ID)).toBeDefined()
    expect(entity.getXData('mlightcad')).toBeUndefined()
  })

  test('an untagged entity reads as undefined, not as an empty tag', () => {
    // The distinction matters: drawings imported from DWG carry no tags at
    // all, and callers must not mistake that for "no match found".
    expect(readSemanticTag(createLine())).toBeUndefined()
  })

  test('hasRole matches only the exact role', () => {
    const entity = createLine()
    writeSemanticTag(entity, TAG)

    expect(hasRole(entity, 'lan_can')).toBe(true)
    expect(hasRole(entity, 'go_chan_banh')).toBe(false)
  })

  test('an accented or upper-case role is rejected at write time', () => {
    const entity = createLine()

    expect(() => writeSemanticTag(entity, { ...TAG, role: 'lan can' })).toThrow(
      /slug ASCII/
    )
    expect(() => writeSemanticTag(entity, { ...TAG, role: 'Lan_Can' })).toThrow(
      /slug ASCII/
    )
    expect(() => writeSemanticTag(entity, { ...TAG, role: 'lan_căn' })).toThrow(
      /slug ASCII/
    )
  })

  test('empty identity fields are rejected', () => {
    const entity = createLine()

    expect(() => writeSemanticTag(entity, { ...TAG, partId: '' })).toThrow(
      /không được để trống/
    )
    expect(() =>
      writeSemanticTag(entity, { ...TAG, templateId: '  ' })
    ).toThrow(/không được để trống/)
  })

  test('ensureSemanticTagRegApp registers once and is idempotent', () => {
    const db = new AcDbDatabase()

    expect(db.tables.appIdTable.has(SEMANTIC_TAG_APP_ID)).toBe(false)

    ensureSemanticTagRegApp(db)
    expect(db.tables.appIdTable.has(SEMANTIC_TAG_APP_ID)).toBe(true)

    ensureSemanticTagRegApp(db)
    expect(db.tables.appIdTable.has(SEMANTIC_TAG_APP_ID)).toBe(true)
  })
})

describe('v4: records longer than one XData string', () => {
  async function tagged(tag: Parameters<typeof writeSemanticTag>[1]) {
    const { AcDbDatabase, AcDbLine } = await import('@mlightcad/data-model')
    const { ensureSemanticTagRegApp } = await import('../src/AcTpSemanticTag')
    const db = new AcDbDatabase()
    db.createDefaultData()
    ensureSemanticTagRegApp(db)
    const line = new AcDbLine({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 })
    db.tables.blockTable.modelSpace.appendEntity(line)
    writeSemanticTag(line, tag)
    return line
  }

  test('a run record with 26 arguments — well over 255 characters — reads back whole', async () => {
    // The abutment template needs a width per component to be edited part by
    // part; at one 255-byte string that was sixteen arguments and no more.
    const values: Record<string, number | string> = {}
    for (const key of ['bBe', 'hBe', 'hLot', 'phuLot', 'D', 'aCoc', 'soCoc', 'Lcoc', 'nganm', 'bThan', 'hThan', 'bDau', 'hDau', 'bVaiKe', 'hVaiKe', 'tLopPhu', 'bTai', 'hTai', 'hLC', 'iTrai', 'iPhai', 'x', 'y']) {
      values[key] = -314937.691
    }
    values.ghi = 'ten'
    values.tenMo = 'M12'
    values.caoDo = '-12.345'
    const run = { id: 'run_0001', version: '2.0.0', values }
    expect(JSON.stringify(run).length).toBeGreaterThan(255)
    const line = await tagged({ role: 'mo_be', partId: 'mo_be', templateId: 'mo_mat_chinh', run })
    expect(readSemanticTag(line)?.run).toEqual(run)
  })

  test('a parameter record over 255 bytes with Vietnamese text reads back whole', async () => {
    // Split on characters, not bytes: a diacritic cut in half is not JSON.
    const params = { dieuKhoan: 'TCVN 11823-13:2017 §7.3.2.1 — tường phòng hộ bê tông '.repeat(6), h: 1090 }
    const line = await tagged({ role: 'lan_can', partId: 'lan_can_trai', templateId: 't', params })
    expect(readSemanticTag(line)?.params).toEqual(params)
  })

  test('the tag is refused past 16 KB, the XData ceiling per application', async () => {
    const params = { x: 'a'.repeat(17 * 1024) }
    await expect(tagged({ role: 'r', partId: 'p', templateId: 't', params })).rejects.toThrow(/16384/)
  })

  test('a v3 tag written by the previous build still reads', async () => {
    const { AcDbDatabase, AcDbLine, AcDbDxfCode, AcDbResultBuffer } = await import('@mlightcad/data-model')
    const { ensureSemanticTagRegApp, SEMANTIC_TAG_APP_ID } = await import('../src/AcTpSemanticTag')
    const db = new AcDbDatabase()
    db.createDefaultData()
    ensureSemanticTagRegApp(db)
    const line = new AcDbLine({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 })
    db.tables.blockTable.modelSpace.appendEntity(line)
    const str = (value: string) => ({ code: AcDbDxfCode.ExtendedDataAsciiString, value })
    line.setXData(
      new AcDbResultBuffer([
        { code: AcDbDxfCode.ExtendedDataRegAppName, value: SEMANTIC_TAG_APP_ID },
        str('3'),
        str('mo_be'),
        str('mo_be'),
        str('mo_mat_chinh'),
        str('{"B":7700}'),
        str('{"i":"run_1","v":"1.2.0","a":{"B":7700}}')
      ])
    )
    expect(readSemanticTag(line)).toEqual({
      role: 'mo_be',
      partId: 'mo_be',
      templateId: 'mo_mat_chinh',
      params: { B: 7700 },
      run: { id: 'run_1', version: '1.2.0', values: { B: 7700 } }
    })
  })
})
