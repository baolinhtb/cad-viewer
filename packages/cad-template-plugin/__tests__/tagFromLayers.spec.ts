/**
 * Making an office's existing drawings editable by name.
 *
 * A drawing that came from AutoCAD carries no semantic tags, so every edit tool
 * refuses it — correctly, because an assistant that guesses which polyline is
 * the stem wall will eventually guess wrong. But that refusal also puts an
 * office's whole archive out of reach, which is most of the drawings there are.
 * The layer name is evidence the draughtsman recorded, so it is the one thing
 * safe to read.
 */
import {
  AcDbDatabase,
  AcDbLayerTableRecord,
  AcDbLine,
  AcDbPolyline
} from '@mlightcad/data-model'
import { readSemanticTag, writeSemanticTag } from '@mlightcad/cad-template-sdk'

import { TAG_FROM_LAYERS_SOURCE, tagDrawingFromLayers } from '../src/tagFromLayers'

/** The office convention taken from a real abutment drawing. */
const ROLE_LAYERS = {
  mo_tuong_dau: '_33_CAU_MO_Tuongdau',
  mo_tuong_than: '_33_CAU_MO_Tuongthan',
  mo_be: '_33_CAU_MO_Be',
  kich_thuoc: '_33_Duongghikichthuoc'
}

function drawingWith(layers: string[]) {
  const db = new AcDbDatabase()
  db.createDefaultData()
  for (const name of new Set(layers)) {
    if (!db.tables.layerTable.has(name)) {
      db.tables.layerTable.add(new AcDbLayerTableRecord({ name }))
    }
  }
  const entities = layers.map(layer => {
    const line = new AcDbLine({ x: 0, y: 0, z: 0 }, { x: 100, y: 0, z: 0 })
    line.layer = layer
    db.tables.blockTable.modelSpace.appendEntity(line)
    return line
  })
  return { db, entities }
}

describe('tagDrawingFromLayers', () => {
  test('reads the role off the layer the draughtsman named', () => {
    const { db, entities } = drawingWith([
      '_33_CAU_MO_Tuongthan',
      '_33_CAU_MO_Be'
    ])
    const result = tagDrawingFromLayers(db, ROLE_LAYERS)

    expect(result.tagged).toBe(2)
    expect(readSemanticTag(entities[0])?.role).toBe('mo_tuong_than')
    expect(readSemanticTag(entities[1])?.role).toBe('mo_be')
    // Provenance is recorded rather than a template being claimed.
    expect(readSemanticTag(entities[0])?.templateId).toBe(TAG_FROM_LAYERS_SOURCE)
  })

  test('matches layer names case-insensitively, as AutoCAD does', () => {
    // A drawing saved as `_33_cau_mo_be` is the same layer to AutoCAD, and a
    // case-sensitive rule would silently leave it untagged.
    const { db, entities } = drawingWith(['_33_cau_mo_BE'])
    expect(tagDrawingFromLayers(db, ROLE_LAYERS).tagged).toBe(1)
    expect(readSemanticTag(entities[0])?.role).toBe('mo_be')
  })

  test('never overwrites a tag that is already there', () => {
    // A template's tag knows the side, the ordinal and the parameters. A
    // layer-derived one knows none of that, so replacing it loses information.
    const { db, entities } = drawingWith(['_33_CAU_MO_Tuongthan'])
    writeSemanticTag(entities[0], {
      role: 'mo_tuong_than',
      partId: 'mo_tuong_than_trai_01',
      templateId: 'mo_cau_btct',
      params: { h: 5000 }
    })

    const result = tagDrawingFromLayers(db, ROLE_LAYERS)
    expect(result.tagged).toBe(0)
    expect(result.daCoNhan).toBe(1)
    expect(readSemanticTag(entities[0])?.partId).toBe('mo_tuong_than_trai_01')
    expect(readSemanticTag(entities[0])?.params?.h).toBe(5000)
  })

  test('leaves unknown layers alone and reports them', () => {
    // Closing the gap belongs in the standardisation layer, where a person
    // decides what the layer means — not in a heuristic here.
    const { db, entities } = drawingWith([
      '_33_CAU_MO_Be',
      'HACHT',
      'HACHT',
      'Main_01'
    ])
    const result = tagDrawingFromLayers(db, ROLE_LAYERS)

    expect(result.tagged).toBe(1)
    expect(readSemanticTag(entities[1])).toBeUndefined()
    expect(result.layerChuaNhanDien).toEqual([
      { layer: 'HACHT', soDoiTuong: 2 },
      { layer: 'Main_01', soDoiTuong: 1 }
    ])
  })

  test('groups every entity of a role under one part', () => {
    const { db } = drawingWith([
      '_33_CAU_MO_Tuongthan',
      '_33_CAU_MO_Tuongthan',
      '_33_CAU_MO_Tuongthan'
    ])
    const result = tagDrawingFromLayers(db, ROLE_LAYERS)

    expect(result.theoVaiTro).toEqual([
      { role: 'mo_tuong_than', layer: '_33_CAU_MO_Tuongthan', soDoiTuong: 3 }
    ])
  })

  test('does not invent a side or an ordinal', () => {
    // Two wing walls sit on one layer, one each side of the bridge. The layer
    // says nothing about which is which, and a `_trai` guessed from geometry
    // would be a claim the drawing never made — worse than no tag, because
    // "sửa tường tai bên trái" would then confidently edit the wrong one.
    const db = new AcDbDatabase()
    db.createDefaultData()
    db.tables.layerTable.add(
      new AcDbLayerTableRecord({ name: '_33_CAU_MO_Tuongdau' })
    )
    for (const x of [-5000, 5000]) {
      const wall = new AcDbPolyline()
      wall.layer = '_33_CAU_MO_Tuongdau'
      db.tables.blockTable.modelSpace.appendEntity(wall)
    }

    tagDrawingFromLayers(db, ROLE_LAYERS)
    for (const entity of db.tables.blockTable.modelSpace.newIterator()) {
      expect(readSemanticTag(entity)?.partId).toBe('mo_tuong_dau')
    }
  })

  test('a second pass changes nothing', () => {
    // Running it twice is a normal thing to do, and it must not double-report
    // or re-tag.
    const { db } = drawingWith(['_33_CAU_MO_Be', '_33_CAU_MO_Be'])
    expect(tagDrawingFromLayers(db, ROLE_LAYERS).tagged).toBe(2)
    const again = tagDrawingFromLayers(db, ROLE_LAYERS)
    expect(again.tagged).toBe(0)
    expect(again.daCoNhan).toBe(2)
  })
})
