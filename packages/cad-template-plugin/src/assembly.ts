import type { AcTpParamValues } from '@mlightcad/cad-template-sdk'
import {
  acTpBuildDrawingFrame,
  acTpWithWorkingDatabaseSync,
  createDrawContext
} from '@mlightcad/cad-template-sdk'
import { AcDbDatabase } from '@mlightcad/data-model'

import { toDrawingPlacement } from './placement'
import { runTemplate } from './runTemplate'
import { findTemplate, roleLayers } from './templateRegistry'

/** One placement in an assembly: which template, and where it goes. */
export interface AcApAssemblyStep {
  templateId: string
  /** What this step puts in the drawing, in the engineer's words. */
  nhan: string
  /** Where the numbers come from — the rule, not just the result. */
  quyTac: string
  /** Values for this step, derived from the assembly's shared values. */
  thongSo: (chung: Record<string, number>) => AcTpParamValues
  /** Run only when this holds (an optional sheet frame, say). Default: always. */
  khi?: (chung: Record<string, number>) => boolean
  /**
   * `x`, `y` are in the user's system although the template places itself
   * in world coordinates (`khung_ban_ve`): translate them as every other step
   * is translated, so the frame lands around the views it was laid out for.
   */
  theoMoc?: boolean
}

/** Box of what a template draws, relative to the `x`, `y` it was given. */
export interface AcApDrawnBox {
  x0: number
  y0: number
  x1: number
  y1: number
}

/** A named way of composing components into one drawing. */
export interface AcApAssembly {
  id: string
  ten: string
  moTa: string
  /** Shared values every step derives from. */
  thamSo: {
    key: string
    label: string
    unit: string
    default: number
    hint: string
  }[]
  buoc: AcApAssemblyStep[]
  /**
   * Values the steps' templates accept but the assembly does not default:
   * left out, they are not passed at all, so the drawing and its recorded
   * runs stay exactly what they were without them.
   */
  thamSoTuyChon?: {
    key: string
    label: string
    unit: string
    hint: string
  }[]
  /**
   * Checks across steps, run on the shared values before anything is drawn.
   * Each message starts with «Chưa vẽ gì:»; any message refuses the whole
   * assembly. `giaTri` reads a shared value, or else the default the steps'
   * templates declare for it (so keys outside `thamSo` still count).
   */
  kiemTra?: (giaTri: (key: string) => number) => string[]
  /** Notes for the tool message when the assembly is drawn (not refusals). */
  ghiChu?: (giaTri: (key: string) => number) => string[]
  /**
   * Layout that needs the drawn size of the parts (a scale, sheet origins):
   * `doHinh` draws a template into a scratch database and returns its box.
   * May add derived values to `chung`; a message refuses the assembly.
   */
  chuanBi?: (
    chung: Record<string, number>,
    doHinh: (templateId: string, values: AcTpParamValues) => AcApDrawnBox
  ) => string[]
}

/**
 * How the components go together, measured from the engineer's own drawings.
 *
 * A component template knows its own shape and nothing about what it sits on.
 * That is deliberate — a part drawing is a part drawing — but it leaves the
 * hardest half of the job undone: the elevations that stack, the crossfall that
 * runs through every horizontal surface, the barriers whose spacing is set by
 * the wearing course rather than by the abutment. Those live here, so a whole
 * abutment is one call whose numbers were checked against the assembly drawing
 * rather than five calls whose chaining the assistant has to get right from
 * prose.
 *
 * Every rule below is a measurement, and each one names where it came from.
 * Nothing is inferred from what a bridge "usually" looks like: that is how the
 * withdrawn templates got their shapes.
 */
const MO_CAU: AcApAssembly = {
  id: 'mo_cau_hoan_chinh',
  ten: 'Mố cầu hoàn chỉnh (mặt chính)',
  moTa:
    'Ghép bê tông lót, bệ móng, cọc khoan nhồi, tường thân, tường đầu (kèm ' +
    'vai kê, hai tường tai và lớp phủ) và hai lan can thành một mặt chính mố ' +
    'cầu. Cao độ các bộ phận nối nhau, độ dốc ngang chạy suốt từ đỉnh bệ trở ' +
    'lên. Đo từ banve_mo.dwg và bản chuẩn hoá của kỹ sư.',
  thamSo: [
    {
      key: 'B',
      label: 'Bề rộng mố',
      unit: 'mm',
      default: 7700,
      hint: 'Chung cho bệ, tường thân và tường đầu — cả ba cùng một bề rộng.'
    },
    {
      key: 'doDocNgang',
      label: 'Độ dốc ngang',
      unit: '%',
      default: 2,
      hint:
        'Áp cho mọi mặt nằm ngang **từ đỉnh bệ trở lên**. Đáy và đỉnh bệ phẳng; ' +
        'đó là lý do bệ là mốc để xếp phần trên. Dương là bên phải cao hơn.'
    },
    {
      key: 'x',
      label: 'Vị trí tim mố',
      unit: 'mm',
      default: 0,
      hint: 'Trục đối xứng, cũng là trục mà mọi mặt nghiêng xoay quanh.'
    },
    {
      key: 'y',
      label: 'Cao độ đáy bê tông lót',
      unit: 'mm',
      default: 0,
      hint: 'Mặt dưới cùng của cả mố.'
    },
    {
      key: 'hLot',
      label: 'Chiều dày bê tông lót',
      unit: 'mm',
      default: 100,
      hint: 'Bản vẽ mẫu: 100.'
    },
    {
      key: 'hBe',
      label: 'Chiều cao bệ',
      unit: 'mm',
      default: 2000,
      hint: 'Bản vẽ mẫu: 2000.'
    },
    {
      key: 'hThan',
      label: 'Chiều cao tường thân tại tim',
      unit: 'mm',
      default: 4716.3,
      hint: 'Đo từ đỉnh bệ, tức phần nhìn thấy.'
    },
    {
      key: 'hDau',
      label: 'Chiều cao tường đầu tại tim',
      unit: 'mm',
      default: 1805,
      hint: 'Từ đáy đến mặt đỉnh ngoài.'
    },
    {
      key: 'bVaiKe',
      label: 'Bề rộng vai kê mỗi bên',
      unit: 'mm',
      default: 350,
      hint:
        'Quyết định cả bề rộng lớp phủ (B − 2·bVaiKe) lẫn vị trí lan can, vì ' +
        'lan can đứng trên đúng dải lớp phủ ấy.'
    },
    {
      key: 'hVaiKe',
      label: 'Độ hạ của vai kê',
      unit: 'mm',
      default: 7,
      hint: 'Không phải chiều dày lớp phủ — hai trị số rất dễ lẫn.'
    },
    {
      key: 'tLopPhu',
      label: 'Chiều dày lớp phủ',
      unit: 'mm',
      default: 70,
      hint: 'Bản vẽ mẫu: 70.'
    },
    {
      key: 'hLanCan',
      label: 'Chiều cao tường phòng hộ',
      unit: 'mm',
      default: 1090,
      hint: 'Phần bê tông; lan can thép đứng thêm 588 mm trên đó.'
    }
  ],
  buoc: [
    {
      templateId: 'mo_be_mong',
      nhan: 'Bê tông lót và bệ móng',
      quyTac:
        'Đặt trước tiên vì mọi thứ khác đo từ nó. Đáy ở cao độ y; đỉnh bệ ở ' +
        'y + hLot + hBe, phẳng — bộ phận duy nhất của mố không nghiêng.',
      thongSo: c => ({
        B: c.B,
        hLot: c.hLot,
        hBe: c.hBe,
        x: c.x,
        y: c.y,
        ghiKichThuoc: 'co'
      })
    },
    {
      templateId: 'mo_coc_khoan_nhoi',
      nhan: 'Cọc khoan nhồi',
      quyTac:
        'Chui ra từ **đáy bệ**, tức y + hLot, chứ không phải đáy bê tông lót: ' +
        'bản vẽ cho đầu cọc ngàm 150 mm lên trên mặt ấy.',
      thongSo: c => ({ x: c.x, y: c.y + c.hLot })
    },
    {
      templateId: 'mo_tuong_than',
      nhan: 'Tường thân',
      quyTac:
        'Đáy gối lên đỉnh bệ (y + hLot + hBe), phẳng theo bệ. Đỉnh nghiêng, ' +
        'nên cao độ đỉnh chỉ xác định được khi kèm hoành độ.',
      thongSo: c => ({
        B: c.B,
        hThan: c.hThan,
        doDocNgang: c.doDocNgang,
        x: c.x,
        y: c.y + c.hLot + c.hBe,
        ghiKichThuoc: 'khong'
      })
    },
    {
      templateId: 'mo_tuong_dau',
      nhan: 'Tường đầu, vai kê, hai tường tai và lớp phủ',
      quyTac:
        'Đáy đặt bằng cao độ đỉnh tường thân **tại tim** — y + hLot + hBe + ' +
        'hThan. Cả đáy lẫn đỉnh đều nghiêng, khác tường thân vốn đáy phẳng.',
      thongSo: c => ({
        B: c.B,
        hDau: c.hDau,
        doDocNgang: c.doDocNgang,
        bVaiKe: c.bVaiKe,
        hVaiKe: c.hVaiKe,
        tLopPhu: c.tLopPhu,
        x: c.x,
        y: c.y + c.hLot + c.hBe + c.hThan,
        ghiKichThuoc: 'khong'
      })
    },
    {
      templateId: 'tuong_phong_ho_btct',
      nhan: 'Lan can bên trái',
      quyTac:
        'Mặt trong đứng ở mép lớp phủ, tức cách tim B/2 − bVaiKe. Đo trên ' +
        'banve_mo.dwg: hai mặt trong cách nhau đúng 7000 = 7700 − 2×350, và ' +
        'đáy hai bên lệch nhau đúng 140 = 7000 × 2,00%. Chân đặt trên mặt lớp ' +
        'phủ, nên nó đi theo độ dốc chứ không nằm ngang.',
      thongSo: c => ({
        ben: 'trai',
        h: c.hLanCan,
        x: c.x - (c.B / 2 - c.bVaiKe),
        y: mucLopPhu(c, -(c.B / 2 - c.bVaiKe))
      })
    },
    {
      templateId: 'tuong_phong_ho_btct',
      nhan: 'Lan can bên phải',
      quyTac: 'Đối xứng với bên trái qua tim, và cao hơn theo đúng độ dốc.',
      thongSo: c => ({
        ben: 'phai',
        h: c.hLanCan,
        x: c.x + (c.B / 2 - c.bVaiKe),
        y: mucLopPhu(c, c.B / 2 - c.bVaiKe)
      })
    }
  ]
}

/**
 * Cao độ mặt lớp phủ tại một hoành độ lệch `dx` so với tim.
 *
 * Đây là mặt hoàn thiện — thứ mà lan can đứng lên. Nó là đỉnh tường đầu, cộng
 * độ hạ vai kê, cộng chiều dày lớp phủ, rồi nghiêng theo hoành độ.
 */
function mucLopPhu(c: Record<string, number>, dx: number): number {
  const dinhTuongDauTaiTim = c.y + c.hLot + c.hBe + c.hThan + c.hDau
  return dinhTuongDauTaiTim + c.hVaiKe + c.tLopPhu + (dx * c.doDocNgang) / 100
}

/**
 * Values for one view of the pier: the shared values, placed at `x`.
 *
 * Shared values are numbers only, so the stem type travels as `soCot`:
 * 0 is a solid wall stem, 1 or more is that many columns.
 */
function truValues(c: Record<string, number>, x: number): AcTpParamValues {
  const { kcHinh: _kcHinh, khungTen: _khungTen, soCot, ...all } = c
  // Sheet layout (`_` keys, set by chuanBi) is the assembly's, not the views'.
  const rest = Object.fromEntries(
    Object.entries(all).filter(([key]) => !key.startsWith('_'))
  )
  return {
    ...rest,
    x,
    ...(soCot > 0 ? { loaiThan: 'cot', soCot } : { loaiThan: 'tuong' }),
    ghiKichThuoc: 'co'
  }
}

/**
 * The pier, both views, from one set of values.
 *
 * Unlike MO_CAU this is **not** measured from an office drawing — there is no
 * pier drawing in the repository yet. It is a preliminary layout, and every
 * description says so. All the rule does is keep the two views on one set of
 * numbers and one elevation chain, so they cannot disagree with each other.
 * Any template parameter not listed in `thamSo` (gối, đá kê, đầu hẫng…) may
 * still be passed: numeric values reach both views unchanged.
 */
/**
 * What the front view puts right of the drawing and the side view does not
 * share: the elevation dimension chain (offset 800 plus its text, 1000), then
 * the GHI CHÚ block — placed 400 right of everything drawn, up to 8000 wide
 * (`khoiGhiChu` in the templates) — and a clear 1600 before the side view.
 */
const KC_HINH_THEM = 1000 + 400 + 8000 + 1600

/**
 * Smallest kcHinh at which the two pier views stay apart: the front view's
 * half-width across the bridge (bệ with its lean-concrete overhang, or xà
 * mũ), the side view's half-width along it, and {@link KC_HINH_THEM} between.
 *
 * The old hint, max(bBe, bXaMu)/2 + max(lBe, lXaMu)/2 + 4000, left out the
 * GHI CHÚ block: at the old default 16 000 its third note ran into the side
 * view's xà mũ.
 */
export function acTpTruKcHinhToiThieu(giaTri: (key: string) => number): number {
  return (
    Math.max(giaTri('bBe') / 2 + giaTri('phuLot'), giaTri('bXaMu') / 2) +
    Math.max(giaTri('lBe') / 2 + giaTri('phuLot'), giaTri('lXaMu') / 2) +
    KC_HINH_THEM
  )
}

/** Scales tried for a pier sheet, largest first (the dossier's series). */
export const TRU_TI_LE = [20, 25, 50, 100, 125, 150, 200, 250, 500] as const
/** Paper mm: margins around a view, room above it for its title. */
const TO_LE = 8
const TO_TIEU_DE = 15
/** Paper mm between the two A3 sheets. */
const TO_KHE = 20

/**
 * Where the views go when each sits on its own A3 sheet with the title
 * block: one scale for both (the first of {@link TRU_TI_LE} at which each
 * view, its dimensions and its GHI CHÚ fit the drawing area, below a strip
 * for the view title), the front sheet centred on the front view, the side
 * sheet TO_KHE to the right of it, both on one baseline. The frame is scaled
 * up to 1:n around the 1:1 drawing, so dimensions keep reading true lengths.
 */
function boTriToTru(
  c: Record<string, number>,
  doHinh: (templateId: string, values: AcTpParamValues) => AcApDrawnBox
): string[] {
  const chinh = doHinh('tru_mat_chinh', truValues(c, c.x))
  const ben = doHinh('tru_mat_ben', truValues(c, c.x))
  const frame = acTpBuildDrawingFrame({ khoGiay: 'A3', truong: {} })
  const da = frame.drawArea
  const vung = {
    x0: da.x + TO_LE,
    x1: da.x + da.w - TO_LE,
    y0: da.y + TO_LE,
    y1: da.y + da.h - TO_TIEU_DE
  }
  const yLo = Math.min(chinh.y0, ben.y0)
  const yHi = Math.max(chinh.y1, ben.y1)
  const rong = Math.max(chinh.x1 - chinh.x0, ben.x1 - ben.x0)
  const n = TRU_TI_LE.find(
    s => rong / s <= vung.x1 - vung.x0 && (yHi - yLo) / s <= vung.y1 - vung.y0
  )
  if (!n)
    return [
      `Chưa vẽ gì: trụ rộng ${Math.ceil(rong)} mm, cao ${Math.ceil(yHi - yLo)} mm ` +
        `(kể cả kích thước và GHI CHÚ) không vừa khung A3 ở tỉ lệ 1:${TRU_TI_LE[TRU_TI_LE.length - 1]}.`
    ]
  const vcx = (vung.x0 + vung.x1) / 2
  const vcy = (vung.y0 + vung.y1) / 2
  c._tiLe = n
  c._fx1 = c.x + (chinh.x0 + chinh.x1) / 2 - vcx * n
  c._fy = c.y + (yLo + yHi) / 2 - vcy * n
  c._fx2 = c._fx1 + (frame.width + TO_KHE) * n
  c._xBen = c._fx2 + vcx * n - (ben.x0 + ben.x1) / 2
  c._tdX = vcx
  c._tdY = da.y + da.h - TO_TIEU_DE / 2
  return []
}

/** One A3 sheet with title block around one pier view. */
function toTru(
  c: Record<string, number>,
  x: number,
  hinh: string,
  soTo: string
): AcTpParamValues {
  return {
    khoGiay: 'A3',
    tiLe: c._tiLe,
    x,
    y: c._fy,
    tenBanVe: `TRỤ CẦU — ${hinh} (BỐ CỤC SƠ BỘ)`,
    soTo,
    tieuDeHinh: `${hinh} TRỤ`,
    tieuDeX: c._tdX,
    tieuDeY: c._tdY
  }
}

const TRU_CAU: AcApAssembly = {
  id: 'tru_cau_hoan_chinh',
  ten: 'Trụ cầu — mặt chính và mặt bên (bố cục sơ bộ)',
  moTa:
    'Bố cục sơ bộ, chưa đối chiếu bản vẽ văn phòng. Dựng mặt chính ' +
    '(tru_mat_chinh) và mặt bên (tru_mat_ben) bằng cùng một bộ tham số: bệ ' +
    'trên cọc khoan nhồi, thân tường đặc hoặc thân cột, xà mũ có đầu hẫng, đá ' +
    'kê gối. Hai hình cùng cao độ đáy lót y; mặt bên đặt cách mặt chính kcHinh. ' +
    'Kích thước do tính toán quyết định.',
  thamSo: [
    {
      key: 'x',
      label: 'Tim trụ trên mặt chính',
      unit: 'mm',
      default: 0,
      hint: 'Hoành độ tim trụ của hình mặt chính.'
    },
    {
      key: 'y',
      label: 'Cao độ đáy bê tông lót',
      unit: 'mm',
      default: 0,
      hint: 'Chung cho hai hình: cùng chuỗi cao độ.'
    },
    {
      key: 'kcHinh',
      label: 'Tim mặt chính đến tim mặt bên',
      unit: 'mm',
      default: 21000,
      hint:
        'Đủ để hình, kích thước và khối GHI CHÚ của hai hình không chồng ' +
        'nhau: không nhỏ hơn max(bBe/2 + phuLot, bXaMu/2) + ' +
        'max(lBe/2 + phuLot, lXaMu/2) + 11000 (mặc định 20100); nhỏ hơn thì ' +
        'ghép bị từ chối, không tự nâng.'
    },
    {
      key: 'soCot',
      label: 'Số cột thân trụ',
      unit: 'cột',
      default: 0,
      hint: '0 là thân tường đặc; 1–6 là thân cột (trụ nạng chống).'
    },
    {
      key: 'hThan',
      label: 'Chiều cao thân',
      unit: 'mm',
      default: 6000,
      hint: 'Đỉnh bệ đến đáy xà mũ.'
    },
    {
      key: 'bXaMu',
      label: 'Chiều dài xà mũ',
      unit: 'mm',
      default: 12000,
      hint: 'Ngang cầu.'
    },
    {
      key: 'bBe',
      label: 'Bệ — ngang cầu',
      unit: 'mm',
      default: 9500,
      hint: 'Mặt bên cọc đến mép bệ ≥ 300 mm (TCVN 11823-10:2017 đ.8.1.2).'
    },
    {
      key: 'lBe',
      label: 'Bệ — dọc cầu',
      unit: 'mm',
      default: 6000,
      hint: 'Mặt bên cọc đến mép bệ ≥ 300 mm (TCVN 11823-10:2017 đ.8.1.2).'
    },
    {
      key: 'D',
      label: 'Đường kính cọc',
      unit: 'mm',
      default: 1200,
      hint: '≥ 750 nếu hố khoan kiểm tra thủ công (TCVN 11823-10:2017 đ.8.1.3).'
    }
  ],
  buoc: [
    {
      templateId: 'tru_mat_chinh',
      nhan: 'Mặt chính trụ',
      quyTac: 'Tim trụ ở x, đáy lót ở y; nhìn dọc tuyến, phương ngang cầu.',
      thongSo: c => truValues(c, c.x)
    },
    {
      templateId: 'tru_mat_ben',
      nhan: 'Mặt bên trụ',
      quyTac:
        'Cùng tham số và cùng y; tim ở x + kcHinh. Nhìn ngang tuyến, phương ' +
        'dọc cầu — hai hình chỉ khác hướng nhìn, nên cao độ mọi mặt phải bằng nhau.',
      thongSo: c => truValues(c, c.khungTen > 0 ? c._xBen : c.x + c.kcHinh)
    },
    {
      templateId: 'khung_ban_ve',
      nhan: 'Khung A3 mặt chính',
      quyTac:
        'Chỉ khi khungTen = 1. Một tỉ lệ cho cả hai tờ, lấy tỉ lệ lớn nhất ' +
        'trong 1:20 … 1:500 mà mỗi hình (cả kích thước và GHI CHÚ) vừa vùng ' +
        'vẽ A3; khung phóng 1:n quanh hình vẽ 1:1, nên kích thước ghi số thật.',
      khi: c => c.khungTen > 0,
      theoMoc: true,
      thongSo: c => toTru(c, c._fx1, 'MẶT CHÍNH', '1/2')
    },
    {
      templateId: 'khung_ban_ve',
      nhan: 'Khung A3 mặt bên',
      quyTac:
        'Chỉ khi khungTen = 1. Tờ thứ hai đặt sát bên phải tờ mặt chính ' +
        '(cách 20 mm giấy), cùng đường đáy; mặt bên ở giữa vùng vẽ.',
      khi: c => c.khungTen > 0,
      theoMoc: true,
      thongSo: c => toTru(c, c._fx2, 'MẶT BÊN', '2/2')
    }
  ],
  chuanBi: (chung, doHinh) =>
    chung.khungTen > 0 ? boTriToTru(chung, doHinh) : [],
  thamSoTuyChon: [
    {
      key: 'khungTen',
      label: 'Khung A3 và khung tên cho từng hình',
      unit: '0/1',
      hint:
        '1: mỗi hình một tờ A3 có khung tên (tên bản vẽ, tỉ lệ, trạng thái ' +
        'bản nháp), hai tờ cạnh nhau, tỉ lệ tự chọn trong 1:20 … 1:500; ' +
        'kcHinh khi đó không dùng. Không truyền: không có khung, như cũ.'
    },
    {
      key: 'lNhip',
      label: 'L: chiều dài mặt cầu tới khe co giãn kế bên',
      unit: 'mm',
      hint:
        'Cùng phanTramN thì hai template kiểm chiều rộng đỡ dầm N theo ' +
        'TCVN 11823-4:2017 đ.7.4.4 (Phương trình 25) và chặn nếu xà mũ không đủ.'
    },
    {
      key: 'gocXien',
      label: 'S: độ chéo mặt đỡ',
      unit: 'độ',
      hint: 'Phương trình 25; không truyền là 0 (cầu thẳng góc).'
    },
    {
      key: 'phanTramN',
      label: 'Phần trăm của N theo vùng động đất',
      unit: '%',
      hint:
        'TCVN 11823-4:2017 Bảng 16: 50, 100 hoặc 150 theo vùng — người dùng ' +
        'cho, không tự chọn.'
    }
  ],
  ghiChu: giaTri => {
    const ghi: string[] = []
    if (!(giaTri('lNhip') > 0) || !(giaTri('phanTramN') > 0))
      ghi.push(
        'Chưa kiểm chiều rộng đỡ dầm N (TCVN 11823-4 đ.7.4.4): cần lNhip (L) ' +
          'và phanTramN (% theo vùng động đất, Bảng 16) — không tự chọn vùng.'
      )
    else
      ghi.push(
        'Chiều rộng đỡ dầm N (TCVN 11823-4 đ.7.4.4) đạt với bề rộng sẵn có ' +
          'lXaMu/soHangGoi — cận trên, khe đầu dầm chưa trừ.'
      )
    if (giaTri('D') < 750)
      ghi.push(
        `D = ${giaTri('D')} mm < 750 mm: hố khoan không được kiểm tra thủ ` +
          'công (TCVN 11823-10:2017 đ.8.1.3) — nếu kiểm tra thủ công cần ' +
          'D ≥ 750 mm.'
      )
    return ghi
  },
  kiemTra: giaTri => {
    // With sheets, the views sit on separate A3 frames; kcHinh is not used.
    if (giaTri('khungTen') > 0) return []
    const toiThieu = acTpTruKcHinhToiThieu(giaTri)
    // Either side: a negative kcHinh puts the side view on the left.
    if (Math.abs(giaTri('kcHinh')) >= toiThieu) return []
    const [bBe, bXaMu, lBe, lXaMu, phuLot] = [
      'bBe',
      'bXaMu',
      'lBe',
      'lXaMu',
      'phuLot'
    ].map(giaTri)
    return [
      `Chưa vẽ gì: kcHinh = ${giaTri('kcHinh')} mm nhỏ hơn mức tối thiểu ` +
        `${toiThieu} mm = max(bBe/2 + phuLot, bXaMu/2) + ` +
        'max(lBe/2 + phuLot, lXaMu/2) + 11000 = ' +
        `max(${bBe}/2 + ${phuLot}, ${bXaMu}/2) + ` +
        `max(${lBe}/2 + ${phuLot}, ${lXaMu}/2) + 11000 — mặt chính (cả khối ` +
        'GHI CHÚ rộng 8000 bên phải nó) và mặt bên sẽ chồng nhau. ' +
        `Lấy kcHinh ≥ ${toiThieu} mm.`
    ]
  }
}

const ASSEMBLIES: readonly AcApAssembly[] = [MO_CAU, TRU_CAU]

export function listAssemblies(): readonly AcApAssembly[] {
  return ASSEMBLIES
}

export function findAssembly(id: string): AcApAssembly | undefined {
  return ASSEMBLIES.find(a => a.id === id)
}

/** The rules, written out, so the assistant can read them and not guess. */
export function assemblyCatalogue(): string {
  return ASSEMBLIES.map(assembly => {
    const params = assembly.thamSo
      .map(p => `    ${p.key} = ${p.default} ${p.unit} — ${p.label}. ${p.hint}`)
      .join('\n')
    const steps = assembly.buoc
      .map(
        (step, i) =>
          `    ${i + 1}. ${step.nhan} (${step.templateId}): ${step.quyTac}`
      )
      .join('\n')
    const tuyChon = (assembly.thamSoTuyChon ?? [])
      .map(p => `    ${p.key} (${p.unit}) — ${p.label}. ${p.hint}`)
      .join('\n')
    return (
      `- ${assembly.id}: ${assembly.ten}\n  ${assembly.moTa}\n  Thông số chung:\n${params}\n` +
      (tuyChon
        ? `  Thông số tuỳ chọn (không truyền thì không dùng):\n${tuyChon}\n`
        : '') +
      `  Thứ tự ghép:\n${steps}`
    )
  }).join('\n\n')
}

/**
 * Draws a template into a throwaway database and measures it, relative to
 * the `x`, `y` it was given — for layout that depends on the drawn size
 * (dimensions, GHI CHÚ). Nothing reaches the drawing or its undo history.
 */
function doHinh(templateId: string, values: AcTpParamValues): AcApDrawnBox {
  const template = findTemplate(templateId)
  if (!template) throw new Error(`Thiếu template ${templateId}.`)
  const scratch = new AcDbDatabase()
  scratch.createDefaultData()
  let box: AcApDrawnBox = { x0: 0, y0: 0, x1: 0, y1: 0 }
  acTpWithWorkingDatabaseSync(scratch, () => {
    const ctx = createDrawContext(scratch, templateId, roleLayers())
    void template.generate(ctx, values)
    let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity]
    for (const e of ctx.drawn) {
      const b = e.geometricExtents
      x0 = Math.min(x0, b.min.x)
      y0 = Math.min(y0, b.min.y)
      x1 = Math.max(x1, b.max.x)
      y1 = Math.max(y1, b.max.y)
    }
    const ox = Number(values.x) || 0
    const oy = Number(values.y) || 0
    if (x0 <= x1) box = { x0: x0 - ox, y0: y0 - oy, x1: x1 - ox, y1: y1 - oy }
  })
  return box
}

/** What one assembly produced. */
export interface AcApAssemblyResult {
  buoc: {
    templateId: string
    nhan: string
    runId?: string
    entityCount: number
    errors: string[]
  }[]
  entityCount: number
  errors: string[]
  /** Notes for the person (see {@link AcApAssembly.ghiChu}); absent when none. */
  ghiChu?: string[]
}

/**
 * Runs every step of an assembly in order.
 *
 * Placement is computed here rather than left to the caller. That is the whole
 * point: the chaining is where an assembly goes wrong, and it goes wrong
 * invisibly — a backwall sitting on the stem's centreline elevation instead of
 * its low corner looks right in the middle and gapes open at both edges.
 *
 * A step that fails stops the run. Continuing would leave a half-built
 * abutment whose remaining parts are stacked on an elevation that was never
 * drawn, which is harder to recover from than nothing at all.
 */
export async function runAssembly(
  assemblyId: string,
  values: Record<string, number>,
  database?: AcDbDatabase
): Promise<AcApAssemblyResult> {
  const assembly = findAssembly(assemblyId)
  if (!assembly) {
    return {
      buoc: [],
      entityCount: 0,
      errors: [
        `Không có cách ghép "${assemblyId}". Đang có: ${ASSEMBLIES.map(a => a.id).join(', ')}.`
      ]
    }
  }

  const chung: Record<string, number> = {}
  for (const param of assembly.thamSo) chung[param.key] = param.default
  for (const [key, value] of Object.entries(values)) {
    if (typeof value === 'number' && Number.isFinite(value)) chung[key] = value
  }

  // Gốc giữ nguyên theo hệ người ta gõ. `runTemplate` dời từng bước sang toạ độ
  // thế giới, và vì mọi bước đều tính từ cùng một gốc ấy nên dời từng bước cho
  // ra đúng một phép tịnh tiến chung — không cần, và không được, dời trước.

  // Every template the steps name has to be there before anything is drawn: a
  // missing one halfway through leaves a partial abutment.
  const missing = [...new Set(assembly.buoc.map(s => s.templateId))].filter(
    id => !findTemplate(id)
  )
  if (missing.length > 0) {
    return {
      buoc: [],
      entityCount: 0,
      errors: [
        `Thiếu template trong thư viện: ${missing.join(', ')}. ` +
          'Tải lên rồi ghép lại; dựng thiếu bộ phận là bản vẽ sai.'
      ]
    }
  }

  // A shared value, else the default of the first step template declaring it.
  const giaTri = (key: string): number => {
    if (key in chung) return chung[key]
    for (const step of assembly.buoc) {
      const p = findTemplate(step.templateId)!.params.find(q => q.key === key)
      if (typeof p?.default === 'number') return p.default
    }
    return NaN
  }
  const tuChoi = assembly.kiemTra?.(giaTri) ?? []
  if (tuChoi.length > 0) return { buoc: [], entityCount: 0, errors: tuChoi }

  if (assembly.chuanBi) {
    const loi = assembly.chuanBi(chung, doHinh)
    if (loi.length > 0) return { buoc: [], entityCount: 0, errors: loi }
  }

  const result: AcApAssemblyResult = { buoc: [], entityCount: 0, errors: [] }
  for (const step of assembly.buoc) {
    if (step.khi && !step.khi(chung)) continue
    const template = findTemplate(step.templateId)!
    const values = step.thongSo(chung)
    const outcome = await runTemplate(
      template,
      step.theoMoc ? toDrawingPlacement(values) : values,
      database
    )
    result.buoc.push({
      templateId: step.templateId,
      nhan: step.nhan,
      runId: outcome.runId,
      entityCount: outcome.entityCount,
      errors: outcome.errors
    })
    result.entityCount += outcome.entityCount
    if (outcome.errors.length > 0) {
      result.errors.push(`${step.nhan}: ${outcome.errors.join('; ')}`)
      break
    }
  }
  const ghiChu = result.errors.length ? [] : (assembly.ghiChu?.(giaTri) ?? [])
  if (ghiChu.length) result.ghiChu = ghiChu
  return result
}
