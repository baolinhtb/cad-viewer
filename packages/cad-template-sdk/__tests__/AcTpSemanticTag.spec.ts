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
