import { AcDbDatabase, AcDbFileType, AcDbLine } from '@mlightcad/data-model'

import { createDrawContext } from '../src/AcTpDrawContext'
import { SEED_ROLE_LAYERS } from '../src/AcTpSeed'
import { readSemanticTag, SEMANTIC_TAG_APP_ID } from '../src/AcTpSemanticTag'

const TEMPLATE_ID = 'cau_ban_btct'

/**
 * Draws a small tagged cross-section, writes the database out as DXF and reads
 * it back into a fresh database.
 *
 * This is the load-bearing proof of the whole approach: semantic tags are what
 * lets natural-language editing find "lan can" in a drawing, and a tag that
 * does not survive a save is worth nothing — the drawing would come back from
 * storage semantically blank.
 */
async function drawSaveAndReload(): Promise<{
  saved: AcDbDatabase
  reloaded: AcDbDatabase
}> {
  const saved = new AcDbDatabase()
  saved.createDefaultData()

  const ctx = createDrawContext(saved, TEMPLATE_ID, SEED_ROLE_LAYERS)

  ctx.line({
    role: 'ban_mat_cau',
    partId: 'bmc_01',
    start: { x: 0, y: 0, z: 0 },
    end: { x: 9000, y: 0, z: 0 }
  })
  ctx.polyline({
    role: 'lan_can',
    partId: 'lc_trai_01',
    points: [
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 1270, z: 0 },
      { x: 200, y: 1270, z: 0 }
    ]
  })
  ctx.circle({
    role: 'ong_thoat_nuoc',
    partId: 'otn_01',
    center: { x: 4500, y: -300, z: 0 },
    radius: 50
  })

  const dxf = saved.dxfOut() as string

  const reloaded = new AcDbDatabase()
  await reloaded.read(
    new TextEncoder().encode(dxf).buffer as ArrayBuffer,
    { readOnly: false },
    AcDbFileType.DXF
  )

  return { saved, reloaded }
}

function collectTags(db: AcDbDatabase) {
  const tags: Record<string, ReturnType<typeof readSemanticTag>> = {}
  for (const entity of db.tables.blockTable.modelSpace.newIterator()) {
    const tag = readSemanticTag(entity)
    if (tag) tags[tag.partId] = tag
  }
  return tags
}

describe('semantic tags survive a DXF round trip', () => {
  test('every tag comes back field for field after save and reload', async () => {
    const { reloaded } = await drawSaveAndReload()

    const tags = collectTags(reloaded)

    expect(tags['bmc_01']).toEqual({
      role: 'ban_mat_cau',
      partId: 'bmc_01',
      templateId: TEMPLATE_ID
    })
    expect(tags['lc_trai_01']).toEqual({
      role: 'lan_can',
      partId: 'lc_trai_01',
      templateId: TEMPLATE_ID
    })
    expect(tags['otn_01']).toEqual({
      role: 'ong_thoat_nuoc',
      partId: 'otn_01',
      templateId: TEMPLATE_ID
    })
  })

  test('nothing is lost: the reloaded drawing has as many tagged parts as the saved one', async () => {
    const { saved, reloaded } = await drawSaveAndReload()

    expect(Object.keys(collectTags(reloaded)).sort()).toEqual(
      Object.keys(collectTags(saved)).sort()
    )
  })

  test('the RegApp name is written into the DXF text itself', async () => {
    const db = new AcDbDatabase()
    db.createDefaultData()
    const ctx = createDrawContext(db, TEMPLATE_ID, SEED_ROLE_LAYERS)
    ctx.line({
      role: 'duong_tim',
      partId: 'tim_01',
      start: { x: 0, y: 0, z: 0 },
      end: { x: 1, y: 0, z: 0 }
    })

    const dxf = db.dxfOut() as string

    expect(dxf).toContain(SEMANTIC_TAG_APP_ID)
    expect(dxf).toContain('duong_tim')
    expect(dxf).toContain('tim_01')
  })

  test('the tag holds after the entity is moved and re-layered', async () => {
    // A user editing by hand must not silently strip an entity's identity.
    const db = new AcDbDatabase()
    db.createDefaultData()
    const ctx = createDrawContext(db, TEMPLATE_ID, SEED_ROLE_LAYERS)

    const entity = ctx.line({
      role: 'lan_can',
      partId: 'lc_phai_01',
      start: { x: 0, y: 0, z: 0 },
      end: { x: 0, y: 1100, z: 0 }
    }) as AcDbLine

    // Two edits a user would really make by hand: move the railing top up to
    // 1.27m and put the entity on a different layer.
    entity.endPoint = { x: 0, y: 1270, z: 0 }
    entity.layer = 'LAYER-KHAC'

    const dxf = db.dxfOut() as string
    const reloaded = new AcDbDatabase()
    await reloaded.read(
      new TextEncoder().encode(dxf).buffer as ArrayBuffer,
      { readOnly: false },
      AcDbFileType.DXF
    )

    expect(collectTags(reloaded)['lc_phai_01']).toEqual({
      role: 'lan_can',
      partId: 'lc_phai_01',
      templateId: TEMPLATE_ID
    })
  })

  test('the draw context registers the RegApp itself', () => {
    const db = new AcDbDatabase()
    db.createDefaultData()

    expect(db.tables.appIdTable.has(SEMANTIC_TAG_APP_ID)).toBe(false)
    createDrawContext(db, TEMPLATE_ID, SEED_ROLE_LAYERS)
    expect(db.tables.appIdTable.has(SEMANTIC_TAG_APP_ID)).toBe(true)
  })
})
