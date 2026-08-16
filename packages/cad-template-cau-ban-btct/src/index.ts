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
      hint: 'Bề rộng của bản, không phải bề rộng phần xe chạy'
    },
    {
      key: 'h',
      label: 'Chiều dày bản',
      type: 'number',
      unit: 'cm',
      min: 25,
      max: 120,
      default: 60,
      group: 'Kích thước chính'
    },
    {
      key: 'tLopPhu',
      label: 'Chiều dày lớp phủ',
      type: 'number',
      unit: 'cm',
      min: 0,
      max: 20,
      default: 7,
      group: 'Mặt cầu'
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
      hint: 'Dốc hai mái, tính từ tim ra hai bên'
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
      hint: 'Tính từ mặt lớp phủ'
    },
    {
      key: 'bGoChan',
      label: 'Bề rộng gờ chắn bánh',
      type: 'number',
      unit: 'cm',
      min: 20,
      max: 80,
      default: 50,
      group: 'Lan can và gờ chắn'
    },
    {
      key: 'hGoChan',
      label: 'Chiều cao gờ chắn bánh',
      type: 'number',
      unit: 'cm',
      min: 10,
      max: 40,
      default: 25,
      group: 'Lan can và gờ chắn'
    },
    {
      key: 'soOngThoatNuoc',
      label: 'Số ống thoát nước trên mặt cắt',
      type: 'integer',
      min: 0,
      max: 6,
      default: 2,
      group: 'Thoát nước'
    },
    {
      key: 'dOngThoatNuoc',
      label: 'Đường kính ống thoát nước',
      type: 'number',
      unit: 'cm',
      min: 5,
      max: 30,
      default: 10,
      group: 'Thoát nước'
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
