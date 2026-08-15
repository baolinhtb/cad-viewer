import {
  createDrawContext,
  readSemanticTag,
  SEED_ROLE_LAYERS,
  validateParamValues
} from '@mlightcad/cad-template-sdk'
import { AcDbDatabase, AcDbFileType } from '@mlightcad/data-model'

import template from '../src/index'

function defaults() {
  const values: Record<string, number | string | boolean> = {}
  for (const spec of template.params) {
    if (spec.default !== undefined) values[spec.key] = spec.default
  }
  return values
}

async function generate(overrides: Record<string, number> = {}) {
  const db = new AcDbDatabase()
  db.createDefaultData()
  const ctx = createDrawContext(db, template.meta.id, SEED_ROLE_LAYERS)
  await template.generate(ctx, { ...defaults(), ...overrides })
  return { db, ctx }
}

function tagsByRole(ctx: { drawn: readonly unknown[] }) {
  const byRole: Record<string, string[]> = {}
  for (const entity of ctx.drawn) {
    const tag = readSemanticTag(entity as never)
    if (!tag) continue
    ;(byRole[tag.role] ??= []).push(tag.partId)
  }
  return byRole
}

describe('template cầu bản BTCT', () => {
  test('declares an id, a version and parameters the form can be built from', () => {
    expect(template.meta.id).toBe('cau_ban_btct')
    expect(template.meta.version).toMatch(/^\d+\.\d+\.\d+$/)
    expect(template.params.length).toBeGreaterThan(0)

    for (const spec of template.params) {
      expect(spec.key).toMatch(/^[A-Za-z][A-Za-z0-9_]*$/)
      expect(spec.label.length).toBeGreaterThan(0)
      if (spec.type === 'number' || spec.type === 'integer') {
        // A number without a unit is how a drawing ends up out by a factor of
        // ten, so every numeric input has to declare one.
        if (spec.key !== 'soOngThoatNuoc') expect(spec.unit).toBeTruthy()
        expect(spec.min).toBeDefined()
        expect(spec.max).toBeDefined()
      }
    }
  })

  test('its own defaults pass its own validation', () => {
    expect(validateParamValues(template.params, defaults())).toEqual([])
  })

  test('draws every part of the cross-section', async () => {
    const { ctx } = await generate()
    const byRole = tagsByRole(ctx)

    expect(byRole['ban_mat_cau']).toHaveLength(1)
    expect(byRole['lop_phu']).toHaveLength(1)
    expect(byRole['go_chan_banh']).toHaveLength(2) // hai bên
    expect(byRole['lan_can']).toHaveLength(2) // hai bên
    expect(byRole['ong_thoat_nuoc']).toHaveLength(2) // mặc định 2 ống
    expect(byRole['duong_tim']).toHaveLength(1)
    expect(byRole['ghi_chu']).toHaveLength(1)
  })

  test('every entity carries a tag and lands on the layer of its role', async () => {
    const { ctx } = await generate()

    for (const entity of ctx.drawn) {
      const tag = readSemanticTag(entity)
      expect(tag).toBeDefined()
      expect(entity.layer).toBe(SEED_ROLE_LAYERS[tag!.role])
    }
  })

  test('part ids are unique, so a later edit can address one part', async () => {
    const { ctx } = await generate()
    const ids = ctx.drawn.map(e => readSemanticTag(e)!.partId)

    expect(new Set(ids).size).toBe(ids.length)
  })

  test('the template id is stamped on every part', async () => {
    const { ctx } = await generate()

    for (const entity of ctx.drawn) {
      expect(readSemanticTag(entity)!.templateId).toBe(template.meta.id)
    }
  })

  test('parameters actually change the geometry', async () => {
    const narrow = await generate({ B: 6 })
    const wide = await generate({ B: 14 })

    const width = (result: Awaited<ReturnType<typeof generate>>) => {
      const slab = result.ctx.drawn.find(
        e => readSemanticTag(e)?.role === 'ban_mat_cau'
      )!
      const box = slab.geometricExtents
      return box.max.x - box.min.x
    }

    expect(width(narrow)).toBeCloseTo(6000, 0)
    expect(width(wide)).toBeCloseTo(14000, 0)
  })

  test('the drainage pipe count follows its parameter', async () => {
    const none = await generate({ soOngThoatNuoc: 0 })
    const four = await generate({ soOngThoatNuoc: 4 })

    expect(tagsByRole(none.ctx)['ong_thoat_nuoc']).toBeUndefined()
    expect(tagsByRole(four.ctx)['ong_thoat_nuoc']).toHaveLength(4)
  })

  test('railing height is measured from the wearing surface, not the slab', async () => {
    // Thicker pavement must lift the rail with it — otherwise "nâng lan can
    // lên 1.27m" means two different things before and after a pavement edit.
    const thin = await generate({ tLopPhu: 5 })
    const thick = await generate({ tLopPhu: 15 })

    const railTop = (result: Awaited<ReturnType<typeof generate>>) => {
      const rail = result.ctx.drawn.find(
        e => readSemanticTag(e)?.role === 'lan_can'
      )!
      return rail.geometricExtents.max.y
    }

    expect(railTop(thick) - railTop(thin)).toBeCloseTo(100, 0) // 10cm
  })

  test('a generated drawing survives save and reload with its tags', async () => {
    const { db } = await generate()

    const dxf = db.dxfOut() as string
    const reloaded = new AcDbDatabase()
    await reloaded.read(
      new TextEncoder().encode(dxf).buffer as ArrayBuffer,
      { readOnly: false },
      AcDbFileType.DXF
    )

    const roles = new Set<string>()
    for (const entity of reloaded.tables.blockTable.modelSpace.newIterator()) {
      const tag = readSemanticTag(entity)
      if (tag) roles.add(tag.role)
    }

    expect(roles).toContain('ban_mat_cau')
    expect(roles).toContain('lan_can')
    expect(roles).toContain('ong_thoat_nuoc')
  })
})
