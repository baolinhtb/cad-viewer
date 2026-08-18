/**
 * Seed data for the first template (cầu bản BTCT).
 *
 * Epic 1 runs on this hard-coded set so a real drawing can be produced before
 * the managed dictionary and layer registry exist. Epic 2 replaces it with
 * data served from `/api/standards`; the shape stays the same, so nothing in
 * the SDK changes when that happens.
 */

import type { AcTpTerm } from './AcTpSemanticQuery'

/** Semantic roles the first template draws, with their Vietnamese names. */
export const SEED_ROLES: Readonly<Record<string, string>> = {
  ban_mat_cau: 'Bản mặt cầu',
  lop_phu: 'Lớp phủ mặt cầu',
  lan_can: 'Lan can',
  go_chan_banh: 'Gờ chắn bánh',
  ban_qua_do: 'Bản quá độ',
  mo_cau: 'Mố cầu',
  // The abutment, taken apart the way an office actually draws it. `mo_cau`
  // stays for the whole thing — a cross-section that shows the abutment as one
  // shape is still a legitimate drawing — but a sheet that separates the parts
  // needs a term per part, or "sửa tường thân" has nothing to resolve to.
  // The split follows a real drawing: back wall, stem, wing wall, footing, and
  // the blinding under it.
  mo_tuong_dau: 'Tường đầu mố',
  mo_tuong_than: 'Tường thân mố',
  mo_tuong_tai: 'Tường tai mố',
  mo_be: 'Bệ móng mố',
  mo_be_tong_lot: 'Bê tông lót',
  goi_cau: 'Gối cầu',
  khe_co_gian: 'Khe co giãn',
  ong_thoat_nuoc: 'Ống thoát nước',
  cot_thep: 'Cốt thép',
  duong_tim: 'Đường tim',
  ghi_chu_cao_do: 'Ghi chú cao độ',
  tieu_de_ban_ve: 'Tiêu đề bản vẽ',
  kich_thuoc: 'Đường kích thước',
  ghi_chu: 'Ghi chú'
}

/**
 * Layer each role is drawn on.
 *
 * Layer is presentation, not identity — the semantic tag is what identifies an
 * entity. Two roles may share a layer without becoming indistinguishable.
 */
export const SEED_ROLE_LAYERS: Readonly<Record<string, string>> = {
  ban_mat_cau: 'KC-BAN',
  lop_phu: 'KC-LOPPHU',
  lan_can: 'KC-LANCAN',
  go_chan_banh: 'KC-GOCHAN',
  ban_qua_do: 'KC-BANQUADO',
  mo_cau: 'KC-MO',
  // Default names only. An office that names these `_33_CAU_MO_Tuongdau` maps
  // them through the standardisation layer, which overrides this whole map —
  // baking one office's prefix in here would impose it on every other.
  mo_tuong_dau: 'KC-MO-TUONGDAU',
  mo_tuong_than: 'KC-MO-TUONGTHAN',
  mo_tuong_tai: 'KC-MO-TUONGTAI',
  mo_be: 'KC-MO-BE',
  mo_be_tong_lot: 'KC-MO-BTLOT',
  goi_cau: 'KC-GOI',
  khe_co_gian: 'KC-KHE',
  ong_thoat_nuoc: 'KT-THOATNUOC',
  cot_thep: 'KC-COTTHEP',
  duong_tim: 'TRUC-TIM',
  ghi_chu_cao_do: 'GC-CAODO',
  tieu_de_ban_ve: 'GC-TIEUDE',
  kich_thuoc: 'GC-KICHTHUOC',
  ghi_chu: 'GC-GHICHU'
}

/**
 * Every role must have a layer; a role without one cannot be drawn.
 *
 * Checked by a test rather than by review, because the failure it prevents
 * (template throws mid-generation on a role nobody mapped) shows up only at
 * run time.
 */
export function findRolesWithoutLayer(
  roles: Readonly<Record<string, string>> = SEED_ROLES,
  layers: Readonly<Record<string, string>> = SEED_ROLE_LAYERS
): string[] {
  return Object.keys(roles).filter(role => !layers[role])
}

/**
 * The seed dictionary, in the shape the standardisation layer serves.
 *
 * Derived from the two maps above rather than written out a third time: a
 * third copy is a third thing to forget when a role is added, and the failure
 * would be a term the assistant silently cannot resolve.
 *
 * Carries no aliases. `resolveTerm` matches the label directly, so "lan can"
 * resolves without one; the company's own alternative names are exactly what
 * the managed dictionary exists to add, and inventing a few here would make a
 * deployment that never loaded its own terms look like it had.
 */
export const SEED_DICTIONARY: readonly AcTpTerm[] = Object.entries(SEED_ROLES)
  .map(([role, label]) => ({
    role,
    label,
    aliases: [] as string[],
    layer: SEED_ROLE_LAYERS[role] ?? null
  }))
  // Sorted so the fallback dictionary is stable whatever the object literal's
  // order becomes.
  .sort((a, b) => a.role.localeCompare(b.role))
