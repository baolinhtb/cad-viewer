import {
  type AcTpDrawContext,
  type AcTpParamValues,
  type AcTpSide,
  type AcTpTemplate,
  formatPartId
} from '@mlightcad/cad-template-sdk'

/**
 * Mặt cắt ngang cầu bản bê tông cốt thép.
 *
 * Drawn in millimetres with the origin at the centre of the top of the slab,
 * which is how the cross-section is dimensioned on paper: everything is
 * measured from the centreline and from the slab surface.
 */

/** Reads a numeric parameter, falling back to the declared default. */
function num(values: AcTpParamValues, key: string, fallback: number): number {
  const raw = values[key]
  const value = typeof raw === 'string' ? Number(raw) : raw
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

const M = 1000
const CM = 10

const template: AcTpTemplate = {
  meta: {
    id: 'cau_ban_btct',
    version: '1.0.0',
    name: 'Cầu bản BTCT',
    category: 'Cầu bản',
    description:
      'Mặt cắt ngang cầu bản bê tông cốt thép: bản mặt cầu, lớp phủ có độ dốc ngang, ' +
      'gờ chắn bánh, lan can hai bên và ống thoát nước.'
  },

  params: [
    {
      key: 'B',
      label: 'Bề rộng bản mặt cầu',
      type: 'number',
      unit: 'm',
      min: 4,
      max: 20,
      default: 9,
      group: 'Kích thước chính',
      hint:
        'Bề rộng của bản, không phải bề rộng phần xe chạy. TCVN 11823-2:2017 ' +
        'chỉ ràng buộc định tính: bề rộng cầu không nhỏ hơn bề rộng đoạn đường ' +
        'đầu cầu kể cả lề, bó vỉa, rãnh nước và đường người đi.'
    },
    {
      key: 'h',
      label: 'Chiều dày bản',
      type: 'number',
      unit: 'cm',
      min: 25,
      max: 120,
      default: 60,
      group: 'Kích thước chính',
      hint:
        'TCVN 11823-9:2017 điều 7 — bản mặt cầu bê tông không được mỏng hơn ' +
        '175 mm, chưa kể dự phòng mài mòn. Sàn dưới đây chặt hơn điều khoản: ' +
        'bản của cầu bản là kết cấu chịu lực chính, chiều dày do tính toán ' +
        'quyết định chứ không lấy theo mức tối thiểu của bản mặt cầu.'
    },
    {
      key: 'tLopPhu',
      label: 'Chiều dày lớp phủ',
      type: 'number',
      unit: 'cm',
      min: 0,
      max: 20,
      default: 7,
      group: 'Mặt cầu',
      hint:
        'Do thiết kế áo đường quyết định; dải này chỉ chặn sai số nhập liệu. ' +
        'Không tiêu chuẩn nào trong bộ TCVN cầu quy định chiều dày lớp phủ mặt cầu.'
    },
    {
      key: 'doDocNgang',
      label: 'Độ dốc ngang',
      type: 'number',
      unit: '%',
      min: 0,
      max: 4,
      default: 2,
      group: 'Mặt cầu',
      hint:
        'Dốc hai mái, tính từ tim ra hai bên. Trị số do thiết kế tuyến và yêu ' +
        'cầu thoát nước quyết định; dải này chỉ chặn sai số nhập liệu.'
    },
    {
      key: 'hLanCan',
      label: 'Chiều cao lan can',
      type: 'number',
      unit: 'm',
      min: 0.8,
      max: 1.5,
      default: 1.27,
      group: 'Lan can và gờ chắn',
      hint:
        'Tính từ mặt lớp phủ. TCVN 11823-13:2017 điều 7 — chiều cao nhỏ nhất ' +
        'theo cấp thử nghiệm: 685 mm (TL-3), 810 mm (TL-4), 1070 mm (TL-5). ' +
        'Dải ở đây phủ cả ba cấp, nên phải chọn theo cấp đã thiết kế.'
    },
    {
      key: 'bGoChan',
      label: 'Bề rộng gờ chắn bánh',
      type: 'number',
      unit: 'cm',
      min: 20,
      max: 80,
      default: 50,
      group: 'Lan can và gờ chắn',
      hint: 'Do cấu tạo quyết định; dải này chỉ chặn sai số nhập liệu.'
    },
    {
      key: 'hGoChan',
      label: 'Chiều cao gờ chắn bánh',
      type: 'number',
      unit: 'cm',
      min: 15,
      max: 20,
      default: 20,
      group: 'Lan can và gờ chắn',
      hint:
        'TCVN 11823-13:2017 điều 11.2 — không thấp dưới 150 mm khi có rào ' +
        'chắn, không cao quá 200 mm với bó vỉa lề người đi nâng cao.'
    },
    {
      key: 'soOngThoatNuoc',
      label: 'Số ống thoát nước trên mặt cắt',
      type: 'integer',
      min: 0,
      max: 6,
      default: 2,
      group: 'Thoát nước',
      hint:
        'TCVN 11823-2:2017 ràng buộc định tính: số ống giữ ở mức tối thiểu phù ' +
        'hợp với yêu cầu thuỷ lực. Số lượng do tính toán thoát nước quyết định.'
    },
    {
      key: 'dOngThoatNuoc',
      label: 'Đường kính ống thoát nước',
      type: 'number',
      unit: 'cm',
      min: 5,
      max: 30,
      default: 10,
      group: 'Thoát nước',
      hint:
        'Do tính toán thuỷ lực quyết định; dải này chỉ chặn sai số nhập liệu. ' +
        'Trị số 15–20 cm trong TCVN 4054:2005 là ống rãnh ngầm nền đường, ' +
        'không áp cho ống thoát nước mặt cầu.'
    }
  ],

  generate(ctx: AcTpDrawContext, values: AcTpParamValues) {
    const B = num(values, 'B', 9) * M
    const h = num(values, 'h', 60) * CM
    const tLopPhu = num(values, 'tLopPhu', 7) * CM
    const slope = num(values, 'doDocNgang', 2) / 100
    const hLanCan = num(values, 'hLanCan', 1.27) * M
    const bGoChan = num(values, 'bGoChan', 50) * CM
    const hGoChan = num(values, 'hGoChan', 25) * CM
    const soOng = Math.round(num(values, 'soOngThoatNuoc', 2))
    const rOng = (num(values, 'dOngThoatNuoc', 10) * CM) / 2

    const half = B / 2
    // Cross slope drops from the crown to each edge, so the pavement is
    // thickest at the centreline.
    const tEdge = tLopPhu
    const tCrown = tLopPhu + half * slope

    // --- Bản mặt cầu -------------------------------------------------------
    ctx.polyline({
      role: 'ban_mat_cau',
      partId: formatPartId({ role: 'ban_mat_cau' }),
      params: { B, h },
      closed: true,
      points: [
        { x: -half, y: 0, z: 0 },
        { x: half, y: 0, z: 0 },
        { x: half, y: -h, z: 0 },
        { x: -half, y: -h, z: 0 }
      ]
    })

    // --- Lớp phủ mặt cầu ---------------------------------------------------
    ctx.polyline({
      role: 'lop_phu',
      partId: formatPartId({ role: 'lop_phu' }),
      params: { tLopPhu, doDocNgang: slope },
      closed: true,
      points: [
        { x: -half, y: 0, z: 0 },
        { x: -half, y: tEdge, z: 0 },
        { x: 0, y: tCrown, z: 0 },
        { x: half, y: tEdge, z: 0 },
        { x: half, y: 0, z: 0 }
      ]
    })

    // --- Gờ chắn bánh và lan can hai bên -----------------------------------
    for (const side of [-1, 1] as const) {
      const ben: AcTpSide = side < 0 ? 'trai' : 'phai'
      const edge = side * half
      const inner = edge - side * bGoChan

      ctx.polyline({
        role: 'go_chan_banh',
        partId: formatPartId({ role: 'go_chan_banh', side: ben }),
        params: { bGoChan, hGoChan },
        closed: true,
        points: [
          { x: edge, y: tEdge, z: 0 },
          { x: edge, y: tEdge + hGoChan, z: 0 },
          { x: inner, y: tEdge + hGoChan, z: 0 },
          { x: inner, y: tEdge, z: 0 }
        ]
      })

      // Railing height is measured from the wearing surface, which is why the
      // rail top moves when the pavement thickness changes.
      const railBase = tEdge + hGoChan
      const railTop = tEdge + hLanCan
      const railX = edge - side * bGoChan * 0.5

      ctx.polyline({
        role: 'lan_can',
        // Height is recorded from the wearing surface, matching how it is
        // drawn. Reading it back must not require knowing that.
        params: { hLanCan, mocDo: 'mat_lop_phu' },
        partId: formatPartId({ role: 'lan_can', side: ben }),
        points: [
          { x: railX, y: railBase, z: 0 },
          { x: railX, y: railTop, z: 0 },
          { x: railX - side * bGoChan * 0.5, y: railTop, z: 0 }
        ]
      })
    }

    // --- Ống thoát nước ----------------------------------------------------
    // Spread the pipes evenly across the slab rather than bunching them at
    // the centre: 2 pipes land at ±B/4, 4 pipes at ±B/8 and ±3B/8.
    const step = B / (soOng + 1)
    for (let i = 0; i < soOng; i++) {
      const x = -half + step * (i + 1)
      ctx.circle({
        role: 'ong_thoat_nuoc',
        partId: formatPartId({ role: 'ong_thoat_nuoc', ordinal: i + 1 }),
        params: { dOngThoatNuoc: rOng * 2, khoangCach: step },
        center: { x, y: -h - rOng, z: 0 },
        radius: rOng
      })
    }

    // --- Đường tim và ghi chú ---------------------------------------------
    ctx.line({
      role: 'duong_tim',
      partId: formatPartId({ role: 'duong_tim' }),
      start: { x: 0, y: -h - 400, z: 0 },
      end: { x: 0, y: tEdge + hLanCan + 400, z: 0 }
    })

    ctx.text({
      role: 'ghi_chu',
      partId: formatPartId({ role: 'ghi_chu' }),
      position: { x: 0, y: -h - 900, z: 0 },
      text: 'MẶT CẮT NGANG',
      height: 200
    })
  }
}

export default template

// Components of the same section, published separately so a drawing can be
// assembled part by part rather than regenerated whole. The monolithic template
// above stays: it is one call for the ordinary case, and these are for when the
// engineer wants a deck at one width and a railing at another test level.
export { default as banMatCauBtct } from './components/banMatCau'
export { default as goChanBanhTcvn } from './components/goChanBanh'
export { default as lanCanTcvn } from './components/lanCan'
