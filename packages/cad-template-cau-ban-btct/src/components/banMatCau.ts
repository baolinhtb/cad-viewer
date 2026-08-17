import {
  type AcTpDrawContext,
  type AcTpParamValues,
  type AcTpTemplate,
  formatPartId
} from '@mlightcad/cad-template-sdk'

import { M, num, PLACEMENT, pt } from './params'

/**
 * Bản mặt cầu BTCT, mặt cắt ngang — the piece everything else is placed on.
 *
 * Unlike the railing and the kerb, the bounds here are **not** quoted from a
 * clause. The corpus has no single provision fixing a slab's thickness: it
 * depends on span, on the girder system and on the analysis, and TCVN 11823-9
 * approaches it through design rather than through a table. The ranges below
 * are therefore ordinary engineering practice for slab bridges, declared wide
 * enough to catch a decimal-point error and no wider, and the description says
 * so plainly.
 *
 * Claiming TCVN backing for a number that has none would be worse than having
 * no template at all — it would put the standard's authority behind a guess,
 * in the one place an engineer would stop checking.
 */
const template: AcTpTemplate = {
  meta: {
    id: 'ban_mat_cau_btct',
    version: '1.0.0',
    name: 'Bản mặt cầu BTCT',
    category: 'Bộ phận cầu',
    description:
      'Bản mặt cầu bê tông cốt thép, mặt cắt ngang, kèm đường tim. ' +
      'Gốc tọa độ đặt tại tim mặt trên của bản, để các bộ phận khác ghép vào theo ' +
      'tham số vị trí. LƯU Ý: dải bề rộng và chiều dày là thực hành thiết kế thông ' +
      'thường, không phải trị số do TCVN quy định — chiều dày bản phải do tính toán ' +
      'quyết định.'
  },
  params: [
    {
      key: 'B',
      label: 'Bề rộng bản mặt cầu',
      type: 'number',
      unit: 'm',
      min: 4,
      max: 20,
      default: 8,
      group: 'Kích thước'
    },
    {
      key: 'h',
      label: 'Chiều dày bản',
      type: 'number',
      unit: 'cm',
      min: 25,
      max: 120,
      default: 50,
      group: 'Kích thước',
      hint: 'Do tính toán quyết định; dải này chỉ chặn sai số nhập liệu.'
    },
    {
      key: 'veTim',
      label: 'Vẽ đường tim',
      type: 'boolean',
      default: true,
      group: 'Kích thước'
    },
    ...PLACEMENT
  ],

  generate(ctx: AcTpDrawContext, values: AcTpParamValues) {
    const x0 = num(values, 'x', 0)
    const y0 = num(values, 'y', 0)
    const halfWidth = (num(values, 'B', 8) * M) / 2
    const thickness = num(values, 'h', 50) * 10

    ctx.polyline({
      role: 'ban_mat_cau',
      partId: formatPartId({ role: 'ban_mat_cau' }),
      params: { B: num(values, 'B', 8), h: num(values, 'h', 50) },
      closed: true,
      points: [
        pt(x0 - halfWidth, y0),
        pt(x0 + halfWidth, y0),
        pt(x0 + halfWidth, y0 - thickness),
        pt(x0 - halfWidth, y0 - thickness)
      ]
    })

    if (values.veTim !== false) {
      // Runs past the slab on both ends, the way a centreline is drawn.
      const over = thickness
      ctx.line({
        role: 'duong_tim',
        partId: formatPartId({ role: 'duong_tim' }),
        start: pt(x0, y0 + over),
        end: pt(x0, y0 - thickness - over)
      })
    }
  }
}

export default template
