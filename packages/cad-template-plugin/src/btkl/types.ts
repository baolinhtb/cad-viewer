/** Item groups of a structural quantity take-off (BTKL). */
export type AcTpBtklGroup =
  | 'be_tong'
  | 'van_khuon'
  | 'cot_thep'
  | 'coc'
  | 'vat_tu'
  | 'ghi_chu'

/**
 * Where a quantity comes from:
 * - `tham_so`: computed from the run's parameters (formula in `dienGiai`);
 * - `ban_goc`: copied from the source table (geometry is the source's own,
 *   but the drawing does not show enough to derive it);
 * - `tu_choi`: not given — `lyDo` says why.
 */
export type AcTpBtklSource = 'tham_so' | 'ban_goc' | 'tu_choi'

/** Flags a reader must see next to a line. */
export interface AcTpBtklFlag {
  code: string
  message: string
}

/** One line of a quantity take-off. */
export interface AcTpBtklItem {
  /** Outline number: "1", "1.2", … */
  stt: string
  nhom: AcTpBtklGroup
  hangMuc: string
  donVi: 'm3' | 'm2' | 'm' | 'kg' | 'cái' | 'hộp'
  /** Null when refused, or for a heading line. */
  khoiLuong: number | null
  /** The formula with the run's values, or the source reference. */
  dienGiai: string
  nguon: AcTpBtklSource
  lyDo?: string
  /**
   * False for lines shown for information only and left out of totals
   * (parts drawn in the source that its table does not count).
   */
  trongTong: boolean
  /** A heading that carries the sum of the lines under it. */
  laTong?: boolean
  /** The source table's value for this line, when it has one. */
  banGoc?: number
  flags?: AcTpBtklFlag[]
  /**
   * Parameters this line depends on: it is compared with, or copied from,
   * the source table only while all of them keep the M1 value.
   */
  phuThuoc?: string[]
  /** Stable key for tests and tools. */
  key: string
}

/** One bar mark of the detailed steel schedule. */
export interface AcTpBtklBar {
  mark: string
  diameter: number
  surface: 'plain' | 'ribbed'
  count: number
  /** mm, one bar. */
  length: number
  /** kg/m used, and where it comes from. */
  kgPerM: number
  kgPerMSource: 'bang_goc' | 'cong_thuc'
  kg: number
  group: string
  flags?: AcTpBtklFlag[]
}

/** A take-off of one run. */
export interface AcTpBtklResult {
  /** What was measured: "Mố M1". */
  doiTuong: string
  items: AcTpBtklItem[]
  /** Detailed steel schedule; empty when steel is refused. */
  bars: AcTpBtklBar[]
  /** Errors that stop the take-off as a whole (invalid parameters). */
  errors: string[]
}
