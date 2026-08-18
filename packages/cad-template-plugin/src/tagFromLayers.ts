import type { AcTpRoleLayerMap } from '@mlightcad/cad-template-sdk'
import {
  ensureSemanticTagRegApp,
  readSemanticTag,
  writeSemanticTag
} from '@mlightcad/cad-template-sdk'
import type { AcDbDatabase } from '@mlightcad/data-model'

/** Recorded as the source of a tag this produced. */
export const TAG_FROM_LAYERS_SOURCE = 'gan-nhan-tu-layer'

export interface AcApTagFromLayersResult {
  /** Entities that received a tag. */
  tagged: number
  /** Entities skipped because they already carried one. */
  daCoNhan: number
  /** Layer → role, for what was matched. */
  theoVaiTro: { role: string; layer: string; soDoiTuong: number }[]
  /** Layers no role claims, with how much sits on each. */
  layerChuaNhanDien: { layer: string; soDoiTuong: number }[]
}

/**
 * Gives an existing drawing the tags that make it editable by name.
 *
 * Drawings that came from AutoCAD carry no semantic tags, so `mo_ta_ban_ve`
 * reports them as untagged and every edit tool refuses to touch them. That is
 * the correct refusal — an assistant that guesses which polyline is the stem
 * wall will eventually guess wrong — but it also means an office's whole
 * archive is off limits, which is most of the drawings that exist.
 *
 * The layer is the evidence used, and it is good evidence precisely because it
 * was recorded by the draughtsman rather than inferred by us: a drawing whose
 * layers are named `_33_CAU_MO_Tuongthan` has already stated what that geometry
 * is. Nothing else is guessed — not the side, not the ordinal — because the
 * layer says nothing about those and a wrong guess there is worse than no tag.
 *
 * Entities on layers no role claims are left alone and reported, so the gap is
 * visible and can be closed by naming the layer in the standardisation layer
 * rather than by widening a heuristic here.
 *
 * @param db - Drawing to tag, in place.
 * @param roleLayers - Role → layer from the standardisation layer.
 * @returns What was tagged and what was not.
 */
export function tagDrawingFromLayers(
  db: AcDbDatabase,
  roleLayers: AcTpRoleLayerMap
): AcApTagFromLayersResult {
  ensureSemanticTagRegApp(db)

  // AutoCAD compares layer names case-insensitively, so this must too, or a
  // drawing saved as `KC-Ban` goes untagged against a rule written `KC-BAN`.
  const roleOf = new Map<string, string>()
  for (const [role, layer] of Object.entries(roleLayers)) {
    roleOf.set(layer.toLowerCase(), role)
  }

  let tagged = 0
  let daCoNhan = 0
  const perRole = new Map<string, { role: string; layer: string; soDoiTuong: number }>()
  const unmatched = new Map<string, number>()

  for (const entity of db.tables.blockTable.modelSpace.newIterator()) {
    const layer = entity.layer || '0'
    const role = roleOf.get(layer.toLowerCase())
    if (!role) {
      unmatched.set(layer, (unmatched.get(layer) ?? 0) + 1)
      continue
    }

    // Never overwrite. A tag already there was written by a template that knew
    // more than a layer name does — the side, the ordinal, the parameters —
    // and replacing it with a layer-derived guess loses all of that.
    if (readSemanticTag(entity)) {
      daCoNhan += 1
      continue
    }

    writeSemanticTag(entity, {
      role,
      // One part per role. The layer does not distinguish the left wing wall
      // from the right, and inventing `_trai`/`_phai` from geometry would put a
      // name on the drawing that the drawing never claimed.
      partId: role,
      templateId: TAG_FROM_LAYERS_SOURCE
    })
    tagged += 1

    const existing = perRole.get(role)
    if (existing) existing.soDoiTuong += 1
    else perRole.set(role, { role, layer, soDoiTuong: 1 })
  }

  return {
    tagged,
    daCoNhan,
    theoVaiTro: [...perRole.values()].sort((a, b) =>
      a.role.localeCompare(b.role)
    ),
    layerChuaNhanDien: [...unmatched.entries()]
      .map(([layer, soDoiTuong]) => ({ layer, soDoiTuong }))
      .sort((a, b) => b.soDoiTuong - a.soDoiTuong)
  }
}
