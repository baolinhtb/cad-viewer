import type { AcTpParamValues } from '@mlightcad/cad-template-sdk'
import type { AcDbDatabase } from '@mlightcad/data-model'

import { runTemplate } from './runTemplate'
import { findTemplate } from './templateRegistry'

/** One placement in an assembly: which template, and where it goes. */
export interface AcApAssemblyStep {
  templateId: string
  /** What this step puts in the drawing, in the engineer's words. */
  nhan: string
  /** Where the numbers come from — the rule, not just the result. */
  quyTac: string
  /** Values for this step, derived from the assembly's shared values. */
  thongSo: (chung: Record<string, number>) => AcTpParamValues
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

const ASSEMBLIES: readonly AcApAssembly[] = [MO_CAU]

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
      .map((step, i) => `    ${i + 1}. ${step.nhan} (${step.templateId}): ${step.quyTac}`)
      .join('\n')
    return `- ${assembly.id}: ${assembly.ten}\n  ${assembly.moTa}\n  Thông số chung:\n${params}\n  Thứ tự ghép:\n${steps}`
  }).join('\n\n')
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

  const result: AcApAssemblyResult = { buoc: [], entityCount: 0, errors: [] }
  for (const step of assembly.buoc) {
    const template = findTemplate(step.templateId)!
    const outcome = await runTemplate(template, step.thongSo(chung), database)
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
  return result
}
