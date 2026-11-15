import type {
  AcTpParamSpec,
  AcTpParamValues,
  AcTpTemplate
} from '@mlightcad/cad-template-sdk'

import { acTpBtklMo } from './mo'
import {
  type AcTpBtklSheetMeta,
  acTpBtklSheets,
  drawBtklSheets
} from './sheets'
import { acTpBtklTru } from './tru'
import type { AcTpBtklResult } from './types'

export const BTKL_TEMPLATE_ID = 'btkl_ket_cau'

/**
 * One object of a take-off: an abutment dossier or a pier, with the
 * parameters that differ from its template's defaults (only those, so the
 * semantic tag every drawn entity carries stays small).
 */
export interface AcTpBtklObject {
  loai: 'mo' | 'tru'
  /** "M1" for an abutment (its `tenMo`), "Trụ T1" for a pier. */
  ten: string
  /** Run the values were read from, when there is one. */
  ma?: string
  thay: Record<string, number | string | boolean>
}

const META_KEYS: (keyof AcTpBtklSheetMeta)[] = [
  'duAn',
  'congTrinh',
  'ngay',
  'donVi',
  'chuTri',
  'thietKe',
  'kiemTra',
  'duyet'
]
const META_LABELS: Record<string, string> = {
  duAn: 'Dự án',
  congTrinh: 'Công trình',
  ngay: 'Ngày',
  donVi: 'Đơn vị thiết kế',
  chuTri: 'Chủ trì',
  thietKe: 'Thiết kế',
  kiemTra: 'Kiểm tra',
  duyet: 'Duyệt'
}

const PARAMS: readonly AcTpParamSpec[] = [
  {
    key: 'doiTuong',
    label: 'Đối tượng (JSON)',
    type: 'text',
    default: JSON.stringify([{ loai: 'mo', ten: 'M1', thay: {} }]),
    group: 'Đối tượng',
    hint:
      'Danh sách mố/trụ: [{"loai":"mo"|"tru","ten":…,"ma":mã lần chạy,"thay":{thông số khác mặc định}}]. ' +
      'Công cụ tao_btkl/cap_nhat_btkl tự đọc từ bản vẽ; không cần gõ tay.'
  },
  ...META_KEYS.map(
    (key): AcTpParamSpec => ({
      key,
      label: META_LABELS[key],
      type: 'text',
      default: '',
      group: 'Khung tên'
    })
  ),
  {
    key: 'x',
    label: 'Góc dưới trái tờ đầu — X',
    type: 'number',
    unit: 'mm',
    min: -1e9,
    max: 1e9,
    default: 0,
    group: 'Vị trí'
  },
  {
    key: 'y',
    label: 'Góc dưới trái tờ đầu — Y',
    type: 'number',
    unit: 'mm',
    min: -1e9,
    max: 1e9,
    default: 0,
    group: 'Vị trí'
  }
]

/** The objects recorded in `values.doiTuong`, or why they cannot be read. */
export function btklObjectsFromValues(values: AcTpParamValues): {
  objects: AcTpBtklObject[]
  errors: string[]
} {
  const raw = values.doiTuong ?? PARAMS[0].default
  let parsed: unknown
  try {
    parsed = JSON.parse(String(raw))
  } catch {
    return { objects: [], errors: ['Đối tượng: không đọc được JSON.'] }
  }
  if (!Array.isArray(parsed) || !parsed.length)
    return {
      objects: [],
      errors: ['Đối tượng: cần một danh sách mố/trụ, ít nhất một phần tử.']
    }
  const objects: AcTpBtklObject[] = []
  const errors: string[] = []
  parsed.forEach((o, k) => {
    const ok =
      o &&
      typeof o === 'object' &&
      (o.loai === 'mo' || o.loai === 'tru') &&
      typeof o.ten === 'string' &&
      o.ten.trim() &&
      (o.ma === undefined || typeof o.ma === 'string') &&
      o.thay &&
      typeof o.thay === 'object' &&
      !Array.isArray(o.thay) &&
      Object.values(o.thay).every(v =>
        ['number', 'string', 'boolean'].includes(typeof v)
      )
    if (ok) objects.push(o as AcTpBtklObject)
    else
      errors.push(
        `Đối tượng ${k + 1}: cần {"loai":"mo"|"tru","ten":chuỗi,"thay":{tên → số/chuỗi}}.`
      )
  })
  return { objects, errors }
}

/** The take-off of one recorded object. */
export function acTpBtklOfObject(o: AcTpBtklObject): AcTpBtklResult {
  return o.loai === 'mo'
    ? acTpBtklMo({ ...o.thay, tenMo: o.ten })
    : acTpBtklTru(o.thay, o.ten)
}

/** Title-block data and placement out of the template values. */
export function btklMetaFromValues(values: AcTpParamValues): AcTpBtklSheetMeta {
  const meta: AcTpBtklSheetMeta = {
    x: Number(values.x) || 0,
    y: Number(values.y) || 0
  }
  for (const key of META_KEYS) {
    const v = values[key]
    if (v !== undefined && String(v).trim()) meta[key] = String(v) as never
  }
  return meta
}

/**
 * The structural quantity take-off of the abutments and piers listed in
 * `doiTuong`, as A3 sheets. The list is a snapshot of their parameters, so
 * the sheets regenerate exactly; `cap_nhat_btkl` refreshes it from the
 * drawing.
 */
export const btklTemplate: AcTpTemplate = {
  meta: {
    id: BTKL_TEMPLATE_ID,
    version: '1.0.0',
    name: 'Bảng tổng hợp khối lượng kết cấu (BTKL) — mố, trụ',
    category: 'Hồ sơ mố',
    description:
      'Các tờ A3 bảng khối lượng 5 cột (STT, hạng mục, đơn vị, khối lượng, diễn giải công thức) của các mố/trụ trong bản vẽ, tính từ thông số, vẽ bằng nét và chữ kiểu bảng SUB-100, có khung tên; dài thì sang tờ tiếp. Dòng không tính được ghi lý do; cờ (lệch bản gốc, giả định, chờ định mức) ghi đỏ. Dùng tao_btkl/cap_nhat_btkl thay vì gõ danh sách tay.'
  },
  params: PARAMS,
  placement: 'world',
  validate(values) {
    const { objects, errors } = btklObjectsFromValues(values)
    for (const o of objects)
      for (const e of acTpBtklOfObject(o).errors) errors.push(`${o.ten}: ${e}`)
    return errors
  },
  generate(ctx, values) {
    const { objects } = btklObjectsFromValues(values)
    drawBtklSheets(
      ctx,
      acTpBtklSheets(objects.map(acTpBtklOfObject), btklMetaFromValues(values))
    )
  }
}
