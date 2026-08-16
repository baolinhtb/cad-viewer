import { AcDbDatabase, AcDbFileType, AcDbLine } from '@mlightcad/data-model'

import { createDrawContext } from '../src/AcTpDrawContext'
import {
  AcTpDrawingDigest,
  findParts,
  readDrawingDigest
} from '../src/AcTpDrawingDigest'
import { formatPartId } from '../src/AcTpPartId'
import { SEED_ROLE_LAYERS } from '../src/AcTpSeed'

const TEMPLATE_ID = 'cau_ban_btct'

/** A miniature cross-section carrying the shapes the digest has to describe. */
function drawSection(db: AcDbDatabase): void {
  const ctx = createDrawContext(db, TEMPLATE_ID, SEED_ROLE_LAYERS)

  ctx.polyline({
    role: 'ban_mat_cau',
    partId: formatPartId({ role: 'ban_mat_cau' }),
    params: { B: 9000, h: 600 },
    closed: true,
    points: [
      { x: -4500, y: 0, z: 0 },
      { x: 4500, y: 0, z: 0 },
      { x: 4500, y: -600, z: 0 },
      { x: -4500, y: -600, z: 0 }
    ]
  })

  for (const side of ['trai', 'phai'] as const) {
    const x = side === 'trai' ? -4500 : 4500
    ctx.polyline({
      role: 'lan_can',
      partId: formatPartId({ role: 'lan_can', side }),
      params: { hLanCan: 1270, mocDo: 'mat_lop_phu' },
      points: [
        { x, y: 70, z: 0 },
        { x, y: 1340, z: 0 }
      ]
    })
  }

  for (let i = 1; i <= 3; i++) {
    ctx.circle({
      role: 'ong_thoat_nuoc',
      partId: formatPartId({ role: 'ong_thoat_nuoc', ordinal: i }),
      params: { dOngThoatNuoc: 100 },
      center: { x: -4500 + i * 2250, y: -650, z: 0 },
      radius: 50
    })
  }
}

function digestOfSection(): AcTpDrawingDigest {
  const db = new AcDbDatabase()
  db.createDefaultData()
  drawSection(db)
  return readDrawingDigest(db)
}

describe('reading a drawing back into addressable parts', () => {
  test('every part the template drew is listed once', () => {
    const digest = digestOfSection()
    // Six parts from nine entities: the three pipes are separate parts, the
    // two rails are separate parts, the slab is one.
    expect(digest.parts.map(p => p.partId)).toEqual([
      'ban_mat_cau',
      'lan_can_trai',
      'lan_can_phai',
      'ong_thoat_nuoc_01',
      'ong_thoat_nuoc_02',
      'ong_thoat_nuoc_03'
    ])
    expect(digest.status).toBe('tagged')
    expect(digest.templateIds).toEqual([TEMPLATE_ID])
  })

  test('left and right are told apart', () => {
    // The whole reason the convention exists: "lan can bên phải" has to
    // resolve to exactly one part.
    const digest = digestOfSection()
    const right = findParts(digest, { role: 'lan_can', side: 'phai' })
    expect(right).toHaveLength(1)
    expect(right[0].partId).toBe('lan_can_phai')
  })

  test('asking for a role with several instances returns all of them', () => {
    // Returning a list rather than a best guess is what lets the caller ask
    // instead of silently editing one of three pipes.
    const digest = digestOfSection()
    expect(findParts(digest, { role: 'ong_thoat_nuoc' })).toHaveLength(3)
    expect(
      findParts(digest, { role: 'ong_thoat_nuoc', ordinal: 2 })
    ).toHaveLength(1)
  })

  test('parts carry their Vietnamese name and their layer', () => {
    const digest = digestOfSection()
    const slab = findParts(digest, { role: 'ban_mat_cau' })[0]
    expect(slab.roleLabel).toBe('Bản mặt cầu')
    expect(slab.layers).toEqual([SEED_ROLE_LAYERS.ban_mat_cau])
    expect(slab.entityCount).toBe(1)
  })

  test('a part reports the values that define it, not just its shape', () => {
    // "bản dày bao nhiêu" has to be answerable without measuring geometry
    // back — a measured 600 cannot distinguish a slab that is right from one
    // that was meant to be 650 and drawn wrong.
    const digest = digestOfSection()
    expect(findParts(digest, { role: 'ban_mat_cau' })[0].params).toEqual({
      B: 9000,
      h: 600
    })
    // The rail records the datum its height is measured from, which is the
    // known ambiguity in the term list.
    expect(findParts(digest, { role: 'lan_can', side: 'trai' })[0].params).toEqual(
      { hLanCan: 1270, mocDo: 'mat_lop_phu' }
    )
  })

  test('bounds cover every entity of a part', () => {
    const digest = digestOfSection()
    const slab = findParts(digest, { role: 'ban_mat_cau' })[0].bounds
    expect(slab).toBeDefined()
    expect(slab!.minX).toBeCloseTo(-4500)
    expect(slab!.maxX).toBeCloseTo(4500)
  })

  test('the digest is plain data the AI proxy can serialise as-is', () => {
    // No class instances, no cyclic references, nothing from the viewer.
    const digest = digestOfSection()
    expect(JSON.parse(JSON.stringify(digest))).toEqual(digest)
  })
})

describe('drawings that cannot be addressed', () => {
  test('an untagged drawing is untagged, not empty', () => {
    // Conflating the two is how an assistant reports "no rail here" about a
    // DWG that is all rail.
    const db = new AcDbDatabase()
    db.createDefaultData()
    db.tables.blockTable.modelSpace.appendEntity(
      new AcDbLine({ x: 0, y: 0, z: 0 }, { x: 100, y: 0, z: 0 })
    )

    const digest = readDrawingDigest(db)
    expect(digest.status).toBe('untagged')
    expect(digest.parts).toEqual([])
    expect(digest.untaggedEntityCount).toBe(1)
  })

  test('hand-drawn geometry alongside template parts is counted, not hidden', () => {
    const db = new AcDbDatabase()
    db.createDefaultData()
    drawSection(db)
    db.tables.blockTable.modelSpace.appendEntity(
      new AcDbLine({ x: 0, y: 0, z: 0 }, { x: 100, y: 0, z: 0 })
    )

    const digest = readDrawingDigest(db)
    expect(digest.status).toBe('tagged')
    expect(digest.untaggedEntityCount).toBe(1)
  })
})

describe('surviving a save', () => {
  test('the digest reads the same after a DXF round trip', async () => {
    // The digest is only worth anything if it still describes the drawing
    // after it has been through storage.
    const db = new AcDbDatabase()
    db.createDefaultData()
    drawSection(db)
    const before = readDrawingDigest(db)

    const reloaded = new AcDbDatabase()
    await reloaded.read(
      new TextEncoder().encode(db.dxfOut() as string).buffer as ArrayBuffer,
      { readOnly: false },
      AcDbFileType.DXF
    )
    const after = readDrawingDigest(reloaded)

    expect(after.status).toBe('tagged')
    expect(after.parts.map(p => p.partId)).toEqual(
      before.parts.map(p => p.partId)
    )
    expect(after.parts.map(p => p.params)).toEqual(
      before.parts.map(p => p.params)
    )
  })
})
