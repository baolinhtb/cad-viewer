/**
 * Detailing checks of the M1 bar layout on the dossier's geometry (P3-M2):
 * development length, hooked anchorage and tension lap splices after TCVN
 * 11823-5:2017 (`assets/tcvn/TCVN_11823-5_2017_Phan-5_Ket-cau-be-tong.md`).
 *
 * This is a check of the M1 detailing laid over new dimensions (thepMo), not
 * a design from internal forces: no As required is known, so the factors that
 * would need it stay at their safe value (λrc = λer = 1,0 for straight bars,
 * lap class B). Materials: f'c 30 MPa from the M1 drawing (C30 on SUB-100);
 * fy 400 MPa (CB400-V), the commercial bar length 11 700 mm and the lap class
 * are assumptions (docs/GIA-DINH-TIEU-CHUAN.md, GĐ6), not read from M1.
 *
 * Behaviour when an anchorage is short: every end checked here already runs
 * to the M1 cover (no room to lengthen the straight part) and the hook is the
 * one M1 draws, counted through λdh. A check still short is reported
 * (`neo_khong_du`, mark, required / provided, clause) and the drawing kept —
 * no bar is redesigned. A check the M1 drawing itself does not meet is
 * reported as such (`banGoc`), never «fixed».
 */
import type { AcTpParamValues } from '@mlightcad/cad-template-sdk'

import { dossierDefaults } from '../dossier/model'

/** Materials and stock of the checks. */
export interface AcTpNeoVatLieu {
  /** Specified yield strength of the bars, MPa. */
  fy: number
  /** Specified compressive strength of the concrete, MPa. */
  fc: number
  /** Commercial bar length, mm: a longer bar is lap spliced. */
  chieuDaiCayThep: number
  /** Tension lap class, Đ 11.5.3.1. */
  capNoi: 'A' | 'B'
}

/**
 * Defaults: f'c 30 from the M1 drawing (BÊ TÔNG C30); fy 400 (CB400-V),
 * 11 700 mm bars and class B laps assumed — M1 names none of them.
 */
export const ACTP_NEO_VAT_LIEU: Readonly<AcTpNeoVatLieu> = Object.freeze({
  fy: 400,
  fc: 30,
  chieuDaiCayThep: 11700,
  capNoi: 'B'
})

/** Concrete cover of the M1 bars, mm (F1 5850 = bệ 6000 − 2 × 75). */
export const ACTP_LOP_PHU_M1 = 75

/** Basic tension development length λdb, mm — Đ 11.2.1.1, PT 177. */
export function acTpLambdaDb(db: number, m: AcTpNeoVatLieu): number {
  return (0.91 * db * m.fy) / Math.sqrt(m.fc)
}

/**
 * Tension development length λd, mm — Đ 11.2.1.1, PT 176, ≥ 300 mm. λrl 1,3
 * (Đ 11.2.1.2) for a horizontal bar with more than 300 mm of fresh concrete
 * cast below it; black bars in normal concrete: λcf = λlW = 1; λrc = λer = 1
 * (Đ 11.2.1.3, no As required known).
 */
export function acTpLambdaD(
  db: number,
  m: AcTpNeoVatLieu,
  ngangTren = false
): number {
  return Math.max(300, acTpLambdaDb(db, m) * (ngangTren ? 1.3 : 1))
}

/** Basic development length of a standard hook λhb, mm — Đ 11.2.4.1, PT 182. */
export function acTpLambdaHb(db: number, m: AcTpNeoVatLieu): number {
  return (100 * db * m.fy) / (420 * Math.sqrt(m.fc))
}

/**
 * Development length of a standard hook λdh, mm — Đ 11.2.4.1 with the factor
 * 0,8 of Đ 11.2.4.2 when the side cover is ≥ 64 mm and the cover on the tail
 * ≥ 50 mm (90° hook, db ≤ 36); never less than max(8db, 150) (the translation
 * reads «giá trị nhỏ», AASHTO 5.11.2.4.1 the larger: the larger is kept).
 */
export function acTpLambdaDh(
  db: number,
  m: AcTpNeoVatLieu,
  lopPhu = ACTP_LOP_PHU_M1
): number {
  const factor = lopPhu >= 64 && db <= 36 ? 0.8 : 1
  return Math.max(8 * db, 150, acTpLambdaHb(db, m) * factor)
}

/** Tension lap length, mm — Đ 11.5.3.1: A 1,0 λd, B 1,3 λd, ≥ 300 mm. */
export function acTpNoiChong(
  db: number,
  m: AcTpNeoVatLieu,
  ngangTren = false
): number {
  const k = m.capNoi === 'A' ? 1 : 1.3
  return Math.max(300, k * acTpLambdaD(db, m, ngangTren))
}

/**
 * Lap splices one bar of `length` needs from bars of `stock` with laps of
 * `lap`: the n + 1 pieces, each ≤ stock, cover length + n × lap. 0 when the
 * bar fits a stock bar; NaN when a lap does not fit a stock bar.
 */
export function acTpSoMoiNoi(
  length: number,
  lap: number,
  stock: number
): number {
  if (length <= stock) return 0
  if (lap >= stock) return NaN
  return Math.ceil((length - stock) / (stock - lap))
}

/**
 * Marks laid horizontally with more than 300 mm of concrete cast below most
 * of them (λrl 1,3): the top mats of the footing, the side bars of the
 * footing, the stem and head-wall horizontals, the rail's long bars.
 */
export const ACTP_THANH_NGANG_TREN: readonly string[] = [
  'f3',
  'f4',
  'f5',
  'f7',
  'a4',
  'p3',
  'n1'
]

/** One anchorage check of a mark. */
export interface AcTpNeoKiem {
  mark: string
  /** Where: «mũi bệ», «gót bệ», «chân thân vào bệ»… */
  viTri: string
  /** What is checked. */
  loai: 'moc' | 'thang' | 'noi_chong'
  /** Required length, mm. */
  required: number
  /** Length the drawing provides, mm. */
  provided: number
  ok: boolean
  /** Clause and equation. */
  clause: string
  /** The M1 drawing itself gives the same: reported, not caused by M2. */
  banGoc: boolean
}

interface Check {
  mark: string
  db: number
  viTri: string
  loai: AcTpNeoKiem['loai']
  provided: (n: (k: string) => number) => number
  /** For a lap: the bar the lap is computed for. */
  ngangTren?: boolean
}

const C = ACTP_LOP_PHU_M1
const HOOK = 'Đ 11.2.4.1 (PT 182), Đ 11.2.4.2'
const STRAIGHT = 'Đ 11.2.1.1 (PT 176, 177)'
const LAP = 'Đ 11.5.3.1, Đ 11.2.1.1 (PT 176, 177)'

/**
 * The ends of the M1 layout that cross a critical section, with what the
 * geometry gives them (critical sections: the stem faces for the footing
 * mats, the footing top for the stem verticals, the stem top for the head
 * wall's legs).
 */
const CHECKS: Check[] = [
  // Footing bottom mat F1 D18 / top mat F3 D22, hooked, cantilevers of the
  // toe (front face of the stem) and heel (back face): straight run from the
  // face to the hook at the far cover.
  ...(['f1', 'f3'] as const).flatMap((mark): Check[] => [
    {
      mark,
      db: mark === 'f1' ? 18 : 22,
      viTri: 'mũi bệ (từ mặt trước thân)',
      loai: 'moc',
      provided: n => n('muiBe') - C
    },
    {
      mark,
      db: mark === 'f1' ? 18 : 22,
      viTri: 'gót bệ (từ mặt sau thân)',
      loai: 'moc',
      provided: n => n('lBe') - n('muiBe') - n('tThan') - C
    }
  ]),
  // Stem verticals A1 D22 / A2 D16 hooked on the footing bottom mat.
  ...(['a1', 'a2'] as const).map(
    (mark): Check => ({
      mark,
      db: mark === 'a1' ? 22 : 16,
      viTri: 'chân thân ngàm vào bệ (từ đỉnh bệ)',
      loai: 'moc',
      provided: n => n('hBe') - C
    })
  ),
  // Head-wall U P1 D16: its legs run below the stem top and lap the stem
  // verticals; leg 2460 at hDau 1887, the leg follows hDau (thepMo).
  {
    mark: 'p1',
    db: 16,
    viTri: 'chân P1 nối chồng với A1/A2 dưới đỉnh thân',
    loai: 'noi_chong',
    provided: n => 2460 + (n('hDau') - 1887) - (n('hDau') - C)
  }
]

/** Required length of a check, mm. */
function required(c: Check, m: AcTpNeoVatLieu): number {
  if (c.loai === 'moc') return acTpLambdaDh(c.db, m)
  if (c.loai === 'thang') return acTpLambdaD(c.db, m, c.ngangTren)
  return acTpNoiChong(c.db, m, c.ngangTren)
}
const clauseOf = (c: Check) =>
  c.loai === 'moc' ? HOOK : c.loai === 'thang' ? STRAIGHT : LAP

/**
 * Anchorage and lap checks of the M1 layout on `values` (missing keys take
 * the M1 defaults). Pure; reports only.
 */
export function acTpKiemNeoMo(
  values: AcTpParamValues = {},
  m: AcTpNeoVatLieu = ACTP_NEO_VAT_LIEU
): AcTpNeoKiem[] {
  const defaults = dossierDefaults()
  const of = (src: AcTpParamValues) => (k: string) =>
    Number(src[k] ?? defaults[k])
  const n = of(values)
  const n0 = of(defaults)
  return CHECKS.map(c => {
    const req = required(c, m)
    const provided = c.provided(n)
    const ok = provided >= req
    return {
      mark: c.mark,
      viTri: c.viTri,
      loai: c.loai,
      required: Math.round(req),
      provided: Math.round(provided),
      ok,
      clause: clauseOf(c),
      banGoc: !ok && c.provided(n0) < req && c.provided(n0) <= provided
    }
  })
}
