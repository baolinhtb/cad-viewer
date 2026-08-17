import {
  type AcTpDrawContext,
  type AcTpParamValues,
  type AcTpTemplate,
  formatPartId
} from '@mlightcad/cad-template-sdk'

import { num, PLACEMENT, pt, side, SIDE_PARAM } from './params'

/**
 * Gờ chắn bánh / bó vỉa trên cầu.
 *
 * The height band comes from TCVN 11823-13:2017 điều 11.2, which is unusual in
 * giving both ends: a kerb carrying a barrier should not be under 150 mm, and a
 * raised pedestrian kerb on a bridge should not exceed 200 mm. Both bounds
 * matter, so both are declared and both are enforced before anything is drawn.
 */
const template: AcTpTemplate = {
  meta: {
    id: 'go_chan_banh_tcvn',
    version: '1.0.0',
    name: 'Gờ chắn bánh / bó vỉa trên cầu',
    category: 'Bộ phận cầu',
    description:
      'Gờ chắn bánh trên mép bản mặt cầu, mặt cắt ngang. Chiều cao 150–200 mm ' +
      'theo TCVN 11823-13:2017 điều 11.2 (không thấp dưới 150 mm khi có rào chắn, ' +
      'không cao quá 200 mm với bó vỉa lề người đi nâng cao). ' +
      'Mặt trong vát để bánh xe không kẹt.'
  },
  params: [
    {
      key: 'h',
      label: 'Chiều cao gờ',
      type: 'number',
      unit: 'mm',
      min: 150,
      max: 200,
      default: 200,
      group: 'Kích thước',
      hint: 'TCVN 11823-13:2017, điều 11.2.'
    },
    {
      key: 'b',
      label: 'Bề rộng chân gờ',
      type: 'number',
      unit: 'mm',
      min: 150,
      max: 600,
      default: 250,
      group: 'Kích thước'
    },
    {
      key: 'vat',
      label: 'Bề rộng vát mặt trong',
      type: 'number',
      unit: 'mm',
      min: 0,
      max: 200,
      default: 50,
      group: 'Kích thước',
      hint: 'Đo theo phương ngang, từ mặt trong lên đỉnh gờ.'
    },
    SIDE_PARAM,
    ...PLACEMENT
  ],

  generate(ctx: AcTpDrawContext, values: AcTpParamValues) {
    const ben = side(values)
    const x0 = num(values, 'x', 0)
    const y0 = num(values, 'y', 0)
    const h = num(values, 'h', 200)
    const b = num(values, 'b', 250)
    const vat = Math.min(num(values, 'vat', 50), b)

    // Mirrored so the chamfer always faces the carriageway, whichever edge the
    // kerb sits on. A kerb drawn the same way on both sides has its slope
    // backwards on one of them, and nothing on screen says so.
    const dir = ben === 'phai' ? 1 : -1

    ctx.polyline({
      role: 'go_chan_banh',
      partId: formatPartId({ role: 'go_chan_banh', side: ben }),
      params: { h, b, vat },
      closed: true,
      points: [
        pt(x0, y0),
        pt(x0 + dir * b, y0),
        pt(x0 + dir * b, y0 + h),
        pt(x0 + dir * vat, y0 + h),
        pt(x0, y0 + h - vat)
      ]
    })
  }
}

export default template
