import {
  type AcTpDrawContext,
  type AcTpParamValues,
  type AcTpTemplate,
  formatPartId
} from '@mlightcad/cad-template-sdk'

import { num, PLACEMENT, pt, side, SIDE_PARAM } from './params'

/**
 * Chiều cao nhỏ nhất theo cấp thử nghiệm, TCVN 11823-13:2017 điều 7.3.2.1.
 *
 * Quoted rather than paraphrased: "Chiều cao lan can phải nhỏ nhất 685mm đối
 * với cấp thử nghiệm TL-3, 810mm đối với cấp thử nghiệm TL-4, 1070mm đối với
 * cấp thử nghiệm TL-5."
 *
 * This is the whole reason a railing is a template rather than a series of
 * lines. The number depends on the test level, the assistant cannot see the
 * test level in the geometry, and a railing 685 mm high on a TL-4 bridge looks
 * exactly like a correct one on screen.
 */
const MIN_HEIGHT: Record<string, number> = {
  'TL-3': 685,
  'TL-4': 810,
  'TL-5': 1070
}

/** Floor across every level, so a bad value is caught before `generate` runs. */
const ABSOLUTE_MIN = 685

const template: AcTpTemplate = {
  meta: {
    id: 'lan_can_tcvn',
    version: '1.0.0',
    name: 'Lan can cầu theo cấp thử nghiệm',
    category: 'Bộ phận cầu',
    description:
      'Lan can cầu đường ô tô, mặt cắt ngang. Chiều cao nhỏ nhất lấy theo cấp thử ' +
      'nghiệm va xe: TL-3 ≥ 685 mm, TL-4 ≥ 810 mm, TL-5 ≥ 1070 mm ' +
      '(TCVN 11823-13:2017, điều 7.3.2.1). Đặt lên mép bản hoặc lên gờ chắn bánh ' +
      'bằng tham số vị trí.'
  },
  params: [
    {
      key: 'capThuNghiem',
      label: 'Cấp thử nghiệm va xe',
      type: 'choice',
      choices: [
        { value: 'TL-3', label: 'TL-3 (≥ 685 mm)' },
        { value: 'TL-4', label: 'TL-4 (≥ 810 mm)' },
        { value: 'TL-5', label: 'TL-5 (≥ 1070 mm)' }
      ],
      default: 'TL-4',
      group: 'Tiêu chuẩn',
      hint: 'TCVN 11823-13:2017, điều 7.3.2.1.'
    },
    {
      key: 'h',
      label: 'Chiều cao lan can',
      type: 'number',
      unit: 'mm',
      min: ABSOLUTE_MIN,
      max: 1500,
      default: 1100,
      group: 'Kích thước',
      hint: 'Phải đạt tối thiểu của cấp thử nghiệm đã chọn.'
    },
    {
      key: 'bTru',
      label: 'Bề rộng trụ lan can',
      type: 'number',
      unit: 'mm',
      min: 100,
      max: 500,
      default: 200,
      group: 'Kích thước'
    },
    {
      key: 'soThanh',
      label: 'Số thanh ngang',
      type: 'integer',
      min: 0,
      max: 6,
      default: 2,
      group: 'Kích thước'
    },
    SIDE_PARAM,
    ...PLACEMENT
  ],

  generate(ctx: AcTpDrawContext, values: AcTpParamValues) {
    const level = String(values.capThuNghiem ?? 'TL-4')
    const required = MIN_HEIGHT[level] ?? ABSOLUTE_MIN
    const h = num(values, 'h', 1100)

    // Checked here rather than by `min` on the spec, because the bound depends
    // on another field and `validateParamValues` compares against constants.
    // Refusing with the clause number is what makes this useful: the assistant
    // gets told which number to use and where it comes from.
    if (h < required) {
      throw new Error(
        `Chiều cao lan can ${h} mm không đạt cấp thử nghiệm ${level}: ` +
          `TCVN 11823-13:2017 điều 7.3.2.1 yêu cầu tối thiểu ${required} mm. ` +
          `Hãy đặt h ≥ ${required} hoặc chọn cấp thử nghiệm thấp hơn.`
      )
    }

    const ben = side(values)
    const x0 = num(values, 'x', 0)
    const y0 = num(values, 'y', 0)
    const b = num(values, 'bTru', 200)
    const partId = formatPartId({ role: 'lan_can', side: ben })
    const params = { capThuNghiem: level, h, bTru: b }

    // Post: an upright of width `b` standing on the placement point.
    ctx.polyline({
      role: 'lan_can',
      partId,
      params,
      closed: true,
      points: [
        pt(x0, y0),
        pt(x0 + b, y0),
        pt(x0 + b, y0 + h),
        pt(x0, y0 + h)
      ]
    })

    // Rails, spread over the upper part of the post.
    const rails = Math.max(0, Math.trunc(num(values, 'soThanh', 2)))
    for (let i = 1; i <= rails; i++) {
      const y = y0 + h - (h / (rails + 1)) * i
      ctx.line({
        role: 'lan_can',
        partId,
        start: pt(x0 - b * 2, y),
        end: pt(x0 + b * 3, y)
      })
    }
  }
}

export default template
