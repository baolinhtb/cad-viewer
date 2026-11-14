/**
 * Danh mục chuẩn hoá mặc định: vai trò → nhãn, layer `_33_` xuất bản vẽ, màu
 * layer, và các tên layer cũ chỉ dùng để nhận dạng bản vẽ cũ.
 *
 * Đây là **nơi duy nhất** khai báo những thứ ấy phía trình duyệt. Máy chủ
 * (`server/auth/schema.mjs`, `SEED_STANDARDS`) giữ một bản sao vì nó chạy Node
 * thuần, không bundler; `__tests__/AcTpSeedMatchesServer.spec.ts` giữ hai bản
 * khớp nhau. Văn phòng đổi tên layer thì đổi ở đây và ở bản sao, test sẽ chỉ
 * ra chỗ lệch.
 *
 * Quy ước tên, rút từ bản vẽ chuẩn của văn phòng
 * (`assets/cad-sample/Phantachcaukienmo_va_dat_ten_layer.dwg`):
 * `_33_CAU_<NHÓM>_<Tên>` cho bộ phận kết cấu (`MO` mố, `TRU` trụ, `NHIP` kết
 * cấu nhịp, `MIS` phụ trợ), `_33_<Tên>` cho hạng mục dùng chung mọi bộ phận;
 * `<Tên>` không dấu, chỉ viết hoa chữ cái đầu.
 *
 * `legacy` là tên cũ (bộ KC-* mặc định trước đây, và lỗi đặt tên có thật như
 * `_Matduong_BTN` trong `33_MO_TUONGDAU.dwg`). Chúng chỉ để `gan_nhan_tu_layer`
 * nhận ra bản vẽ cũ — không bao giờ là layer để vẽ mới lên.
 *
 * `color` là màu mặc định khi **máy chủ tạo mới** dòng layer (ACI 8 như mọi
 * layer `_33_` trong bản vẽ chuẩn, 7 cho nhóm `MIS` như lan can, 7 cho khung).
 * Phía trình duyệt không dùng nó làm màu dự phòng: màu là việc của danh mục
 * máy chủ, và đổi màu dự phòng sẽ đổi bản vẽ của mọi template đang chạy.
 */

import type { AcTpTerm } from './AcTpSemanticQuery'

/** Một mục của danh mục mặc định. */
export interface AcTpSeedEntry {
  /** Tên tiếng Việt của vai trò. */
  label: string
  /** Layer `_33_` mà vai trò được vẽ lên. */
  layer: string
  /** Màu ACI mặc định của layer khi máy chủ tạo mới; `null` là chưa quy định. */
  color: number | null
  /** Tên layer cũ, chỉ để nhận dạng bản vẽ cũ. */
  legacy: readonly string[]
}

/** Danh mục mặc định, theo thứ tự đọc. */
export const SEED_CATALOG: Readonly<Record<string, AcTpSeedEntry>> = {
  // Kết cấu nhịp và mặt cầu.
  ban_mat_cau: {
    label: 'Bản mặt cầu',
    layer: '_33_CAU_NHIP_Banmatcau',
    color: 8,
    legacy: ['KC-BAN']
  },
  lop_phu: {
    label: 'Lớp phủ mặt cầu',
    layer: '_33_Matduong_BTN',
    color: 8,
    legacy: ['KC-LOPPHU', '_Matduong_BTN']
  },
  lan_can: {
    label: 'Lan can',
    layer: '_33_CAU_MIS_Lancan',
    color: 7,
    legacy: ['KC-LANCAN']
  },
  go_chan_banh: {
    label: 'Gờ chắn bánh',
    layer: '_33_CAU_MIS_Gochanbanh',
    color: 7,
    legacy: ['KC-GOCHAN']
  },
  bo_via: {
    label: 'Bó vỉa',
    layer: '_33_CAU_MIS_Bovia',
    color: 7,
    legacy: []
  },
  ban_qua_do: {
    label: 'Bản quá độ',
    layer: '_33_CAU_MO_Banquado',
    color: 8,
    legacy: ['KC-BANQUADO']
  },
  // Mố. `mo_cau` là cả khối, cho mặt cắt vẽ mố thành một hình; các bộ phận
  // tách theo đúng cách văn phòng vẽ.
  mo_cau: {
    label: 'Mố cầu',
    layer: '_33_CAU_MO_Tongthe',
    color: 8,
    legacy: ['KC-MO']
  },
  mo_tuong_dau: {
    label: 'Tường đầu mố',
    layer: '_33_CAU_MO_Tuongdau',
    color: 8,
    legacy: ['KC-MO-TUONGDAU']
  },
  mo_tuong_than: {
    label: 'Tường thân mố',
    layer: '_33_CAU_MO_Tuongthan',
    color: 8,
    legacy: ['KC-MO-TUONGTHAN']
  },
  mo_tuong_tai: {
    label: 'Tường tai mố',
    layer: '_33_CAU_MO_Tuongtai',
    color: 8,
    legacy: ['KC-MO-TUONGTAI']
  },
  mo_be: {
    label: 'Bệ móng mố',
    layer: '_33_CAU_MO_Be',
    color: 8,
    legacy: ['KC-MO-BE']
  },
  mo_be_tong_lot: {
    label: 'Bê tông lót',
    layer: '_33_CAU_MO_Betonglot',
    color: 8,
    legacy: ['KC-MO-BTLOT']
  },
  // Giữ layer của mố để output template mố không đổi; cọc trụ có vai trò riêng
  // `tru_coc_khoan_nhoi`, nếu không cọc trụ sẽ rơi vào layer của mố.
  coc_khoan_nhoi: {
    label: 'Cọc khoan nhồi',
    layer: '_33_CAU_MO_Coc',
    color: 8,
    legacy: ['KC-COC']
  },
  // Trụ.
  tru_xa_mu: {
    label: 'Xà mũ trụ',
    layer: '_33_CAU_TRU_Xamu',
    color: 8,
    legacy: []
  },
  tru_than: {
    label: 'Thân trụ',
    layer: '_33_CAU_TRU_Thantru',
    color: 8,
    legacy: []
  },
  tru_da_ke_goi: {
    label: 'Đá kê gối',
    layer: '_33_CAU_TRU_Dakegoi',
    color: 8,
    legacy: []
  },
  tru_be: {
    label: 'Bệ móng trụ',
    layer: '_33_CAU_TRU_Be',
    color: 8,
    legacy: []
  },
  tru_be_tong_lot: {
    label: 'Bê tông lót bệ trụ',
    layer: '_33_CAU_TRU_Betonglot',
    color: 8,
    legacy: []
  },
  tru_coc_khoan_nhoi: {
    label: 'Cọc khoan nhồi trụ',
    layer: '_33_CAU_TRU_Coc',
    color: 8,
    legacy: []
  },
  // Phụ trợ.
  goi_cau: {
    label: 'Gối cầu',
    layer: '_33_CAU_MIS_Goicau',
    color: 7,
    legacy: ['KC-GOI']
  },
  khe_co_gian: {
    label: 'Khe co giãn',
    layer: '_33_CAU_MIS_Khecogian',
    color: 7,
    legacy: ['KC-KHE']
  },
  ong_thoat_nuoc: {
    label: 'Ống thoát nước',
    layer: '_33_CAU_MIS_Thoatnuoc',
    color: 7,
    legacy: ['KT-THOATNUOC']
  },
  // Dùng chung mọi bộ phận.
  cot_thep: {
    label: 'Cốt thép',
    layer: '_33_Cotthep',
    color: 8,
    legacy: ['KC-COTTHEP']
  },
  duong_tim: {
    label: 'Đường tim',
    layer: '_33_Timtuyen',
    color: 8,
    legacy: ['TRUC-TIM']
  },
  ghi_chu_cao_do: {
    label: 'Ghi chú cao độ',
    layer: '_33_Ghichu_Caodo',
    color: 8,
    legacy: ['GC-CAODO']
  },
  tieu_de_ban_ve: {
    label: 'Tiêu đề bản vẽ',
    layer: '_33_Tieudebanve',
    color: 8,
    legacy: ['GC-TIEUDE']
  },
  kich_thuoc: {
    label: 'Đường kích thước',
    layer: '_33_Duongghikichthuoc',
    color: 8,
    legacy: ['GC-KICHTHUOC']
  },
  ghi_chu: {
    label: 'Ghi chú',
    layer: '_33_Ghichu',
    color: 8,
    legacy: ['GC-GHICHU']
  },
  ky_hieu_mat_cat: {
    label: 'Ký hiệu mặt cắt',
    layer: '_33_Kyhieumatcat',
    color: 8,
    legacy: []
  },
  // Trình bày tờ bản vẽ.
  khung_ban_ve: {
    label: 'Khung bản vẽ',
    layer: '_33_Khungbanve',
    color: 7,
    legacy: []
  },
  khung_ten: {
    label: 'Khung tên',
    layer: '_33_Khungten',
    color: 7,
    legacy: []
  }
}

/** Semantic roles, with their Vietnamese names. Derived from the catalogue. */
export const SEED_ROLES: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(SEED_CATALOG).map(([role, entry]) => [role, entry.label])
)

/**
 * Layer each role is drawn on — always a `_33_` name.
 *
 * Layer is presentation, not identity — the semantic tag is what identifies an
 * entity. The deployment's standardisation layer overrides this whole map.
 */
export const SEED_ROLE_LAYERS: Readonly<Record<string, string>> =
  Object.fromEntries(
    Object.entries(SEED_CATALOG).map(([role, entry]) => [role, entry.layer])
  )

/**
 * Old layer name → role, for recognising drawings made before `_33_`.
 *
 * Recognition only: nothing is ever drawn on these. A template that still
 * names one directly is redirected to the role's current layer, with a
 * warning (see `createDrawContext`).
 */
export const SEED_LEGACY_LAYERS: Readonly<Record<string, string>> =
  Object.fromEntries(
    Object.entries(SEED_CATALOG).flatMap(([role, entry]) =>
      entry.legacy.map(name => [name, role] as const)
    )
  )

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

/** Semantic annotation accents; chromatic office conventions take priority. */
export const acTpAnnotationStyles: Readonly<
  Record<string, { color: number; lineType: string }>
> = {
  ghi_chu: { color: 3, lineType: 'Continuous' },
  ghi_chu_cao_do: { color: 4, lineType: 'Continuous' },
  kich_thuoc: { color: 2, lineType: 'Continuous' },
  tieu_de_ban_ve: { color: 7, lineType: 'Continuous' },
  duong_tim: { color: 1, lineType: 'CENTER' }
}

/** Resolve presentation for newly generated annotations. Legacy monochrome
 * layer catalogues remain intact; semantic accents apply to new entities only. */
export function acTpAnnotationPresentation(
  role: string,
  office: { color?: number | null; lineType?: string | null } = {}
): { color?: number | null; lineType?: string | null } {
  const fallback = acTpAnnotationStyles[role]
  const monochrome =
    office.color != null &&
    ([7, 8, 9].includes(office.color) || office.color >= 250)
  return {
    color:
      fallback && fallback.color !== 7 && monochrome
        ? fallback.color
        : (office.color ?? fallback?.color),
    lineType: office.lineType ?? fallback?.lineType
  }
}
