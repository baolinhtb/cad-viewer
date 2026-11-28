import type {
  AcTpParamSpec,
  AcTpParamValues,
  AcTpTemplate,
  AcTpTitleBlockFields
} from '@mlightcad/cad-template-sdk'
import { acTpBuildDrawingFrame } from '@mlightcad/cad-template-sdk'

export const FRAME_TEMPLATE_ID = 'khung_ban_ve'

/** Title-block fields offered as parameters, in form order. */
const FIELDS: readonly {
  key: keyof AcTpTitleBlockFields
  label: string
  default?: string
}[] = [
  { key: 'duAn', label: 'Dự án' },
  { key: 'congTrinh', label: 'Công trình' },
  { key: 'tenBanVe', label: 'Tên bản vẽ' },
  { key: 'soHieuTo', label: 'Số hiệu tờ' },
  { key: 'soTo', label: 'Tờ số (vd 1/6)' },
  { key: 'ngay', label: 'Ngày' },
  { key: 'giaiDoan', label: 'Giai đoạn', default: 'TKBVTC' },
  { key: 'donVi', label: 'Đơn vị thiết kế' },
  { key: 'chuTri', label: 'Chủ trì' },
  { key: 'thietKe', label: 'Thiết kế' },
  { key: 'kiemTra', label: 'Kiểm tra' },
  { key: 'duyet', label: 'Duyệt' },
  {
    key: 'trangThai',
    label: 'Trạng thái',
    default: 'BẢN NHÁP — CHƯA PHÁT HÀNH THI CÔNG'
  },
  { key: 'ghiChu', label: 'Ghi chú nhỏ (đơn vị, nguồn)' }
]

const NO_STANDARD =
  'Bố cục theo quy ước văn phòng (đo từ hồ sơ TKBVTC); không viện dẫn tiêu chuẩn.'

const PARAMS: readonly AcTpParamSpec[] = [
  {
    key: 'khoGiay',
    label: 'Khổ giấy',
    type: 'choice',
    choices: [
      { value: 'A3', label: 'A3 (420 × 297)' },
      { value: 'A1', label: 'A1 (841 × 594)' }
    ],
    default: 'A3',
    group: 'Tờ',
    hint: NO_STANDARD
  },
  {
    key: 'tiLe',
    label: 'Tỉ lệ 1:n',
    type: 'integer',
    unit: 'lần',
    min: 1,
    max: 5000,
    default: 100,
    group: 'Tờ',
    hint:
      'Khung được phóng theo tỉ lệ để bao đúng hình vẽ ở đơn vị mm: 1:100 ' +
      'thì tờ A3 rộng 42 000 mm trong bản vẽ. Chỉ chặn sai số nhập liệu.'
  },
  ...FIELDS.map(
    (field): AcTpParamSpec => ({
      key: field.key,
      label: field.label,
      type: 'text',
      default: field.default ?? '',
      group: 'Khung tên'
    })
  ),
  {
    key: 'tieuDeHinh',
    label: 'Tiêu đề hình trên tờ',
    type: 'text',
    default: '',
    group: 'Tiêu đề hình',
    hint:
      'Trống thì không vẽ. Có thì in tiêu đề và dòng "(TL: 1/n)" bên dưới, ' +
      'căn giữa tại (tieuDeX, tieuDeY). ' +
      NO_STANDARD
  },
  {
    key: 'tieuDeX',
    label: 'Tiêu đề hình — X trên tờ',
    type: 'number',
    unit: 'mm giấy',
    min: 0,
    max: 841,
    default: 0,
    group: 'Tiêu đề hình',
    hint: 'Milimét giấy tính từ góc dưới trái khung ngoài. Chỉ chặn sai số nhập liệu.'
  },
  {
    key: 'tieuDeY',
    label: 'Tiêu đề hình — Y trên tờ',
    type: 'number',
    unit: 'mm giấy',
    min: 0,
    max: 594,
    default: 0,
    group: 'Tiêu đề hình',
    hint: 'Milimét giấy tính từ góc dưới trái khung ngoài. Chỉ chặn sai số nhập liệu.'
  },
  {
    key: 'x',
    label: 'Góc dưới trái tờ — X',
    type: 'number',
    unit: 'mm',
    min: -1e9,
    max: 1e9,
    default: 0,
    group: 'Vị trí',
    hint: 'Toạ độ thế giới của góc dưới trái khung ngoài. Chỉ chặn sai số nhập liệu.'
  },
  {
    key: 'y',
    label: 'Góc dưới trái tờ — Y',
    type: 'number',
    unit: 'mm',
    min: -1e9,
    max: 1e9,
    default: 0,
    group: 'Vị trí',
    hint: 'Toạ độ thế giới của góc dưới trái khung ngoài. Chỉ chặn sai số nhập liệu.'
  }
]

/** Title-block fields out of parameter values; blank ones are omitted. */
export function frameFieldsFromValues(
  values: AcTpParamValues
): AcTpTitleBlockFields {
  const fields: AcTpTitleBlockFields = {}
  for (const { key } of FIELDS) {
    const value = values[key]
    if (value !== undefined && String(value).trim()) {
      fields[key] = String(value)
    }
  }
  return fields
}

/**
 * Drawing border and title block, as a template.
 *
 * A sheet layout rather than a structural outline, so it is bundled: it is
 * the office's own TKBVTC layout (see `acTpBuildDrawingFrame`), not a shape
 * inferred from a standard. Drawn in world coordinates, scaled by `tiLe` so
 * that a 1:100 drawing in millimetres sits inside it at print size.
 */
export const drawingFrameTemplate: AcTpTemplate = {
  meta: {
    id: FRAME_TEMPLATE_ID,
    version: '1.0.0',
    name: 'Khung bản vẽ và khung tên (A3/A1)',
    category: 'Trình bày',
    description:
      'Khung bản vẽ A3 hoặc A1 kèm khung tên kiểu TKBVTC của văn phòng: dự ' +
      'án, công trình, tên bản vẽ, số hiệu tờ, tỉ lệ, ngày, giai đoạn, đơn vị, ' +
      'chủ trì/thiết kế/kiểm tra/duyệt. Phóng theo tỉ lệ 1:n. Chữ dài tự ' +
      'xuống dòng hoặc thu nhỏ, không tràn ô. Bố cục theo quy ước văn phòng, ' +
      'không viện dẫn tiêu chuẩn.'
  },
  params: PARAMS,
  placement: 'world',
  generate(ctx, values) {
    const size = values.khoGiay === 'A1' ? 'A1' : 'A3'
    const scale = Number(values.tiLe) || 100
    const x0 = Number(values.x) || 0
    const y0 = Number(values.y) || 0
    const truong = {
      ...frameFieldsFromValues(values),
      tiLe: `1:${scale}`
    }
    const frame = acTpBuildDrawingFrame({ khoGiay: size, truong })
    const at = ([x, y]: [number, number]) => ({
      x: x0 + x * scale,
      y: y0 + y * scale,
      z: 0
    })
    for (const p of frame.primitives) {
      if (p.kind === 'path') {
        ctx.polyline({
          role: p.role,
          partId: p.partId,
          points: p.points.map(at),
          closed: p.closed,
          params: { khoGiay: size, tiLe: scale }
        })
      } else {
        ctx.text({
          role: p.role,
          partId: p.partId,
          position: at(p.at),
          text: p.text,
          height: p.height * scale,
          align: p.align,
          widthFactor: p.widthFactor,
          params: p.field ? { truong: p.field } : undefined
        })
      }
    }
    // Title of the view on the sheet, with its scale under it — as the road
    // section prints «(TL: 1/n)» (4 mm and 2,5 mm high on paper).
    const tieuDe = String(values.tieuDeHinh ?? '').trim()
    if (tieuDe) {
      const tx = Number(values.tieuDeX) || 0
      const ty = Number(values.tieuDeY) || 0
      ;[
        { text: tieuDe, dy: 0, h: 4 },
        { text: `(TL: 1/${scale})`, dy: -5.5, h: 2.5 }
      ].forEach(({ text, dy, h }) =>
        ctx.text({
          role: 'tieu_de_ban_ve',
          partId: 'tieu_de_hinh',
          position: at([tx, ty + dy]),
          text,
          height: h * scale,
          align: 1
        })
      )
    }
  }
}
