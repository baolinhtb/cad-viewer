const { formatPartId } = globalThis.__CAD_TEMPLATE_SDK__

/**
 * Lề đường đi bộ nâng cao trên cầu, mặt cắt ngang.
 *
 * Dải chiều cao bó vỉa lấy từ TCVN 11823-13:2017 điều 11.2, điều hiếm hoi cho
 * cả hai đầu:
 *   "chiều cao bó vỉa cho đường người đi được nâng cao trên cầu không nên cao
 *    quá 200 mm. Nếu yêu cầu bó vỉa có rào chắn thì chiều cao bó vỉa không nên
 *    thấp dưới 150 mm."
 *
 * Cùng điều khoản còn quy định đoạn chuyển tiếp khi chiều cao bó vỉa trên cầu
 * khác ngoài cầu: "nên làm đoạn chuyển tiếp đều dài hơn hoặc bằng 20 lần chiều
 * cao chênh lệch". Đây là thứ không nhìn thấy trên mặt cắt ngang, nên template
 * tính ra và ghi vào nhãn ngữ nghĩa thay vì vẽ — người làm trắc dọc đọc được.
 */
export default {
  meta: {
    id: 'le_bo_hanh_tcvn',
    version: '1.0.0',
    name: 'Lề đường đi bộ nâng cao trên cầu',
    category: 'Bộ phận cầu',
    description:
      'Lề đi bộ nâng cao và bó vỉa, mặt cắt ngang. Chiều cao bó vỉa 150–200 mm ' +
      'theo TCVN 11823-13:2017 điều 11.2. Khi chiều cao bó vỉa trên cầu khác ' +
      'ngoài cầu, cùng điều khoản yêu cầu đoạn chuyển tiếp ≥ 20 lần chênh lệch — ' +
      'template tính ra và ghi vào thông số của bộ phận.'
  },
  params: [
    {
      key: 'hBoVia',
      label: 'Chiều cao bó vỉa',
      type: 'number',
      unit: 'mm',
      min: 150,
      max: 200,
      default: 200,
      group: 'Kích thước',
      hint: 'TCVN 11823-13:2017, điều 11.2.'
    },
    {
      key: 'bLe',
      label: 'Bề rộng lề đi bộ',
      type: 'number',
      unit: 'm',
      min: 0.75,
      max: 4,
      default: 1.5,
      group: 'Kích thước'
    },
    {
      key: 'dLe',
      label: 'Chiều dày bản lề',
      type: 'number',
      unit: 'mm',
      min: 80,
      max: 400,
      default: 150,
      group: 'Kích thước'
    },
    {
      key: 'hBoViaNgoaiCau',
      label: 'Chiều cao bó vỉa ngoài cầu',
      type: 'number',
      unit: 'mm',
      min: 0,
      max: 400,
      default: 200,
      group: 'Chuyển tiếp',
      hint: 'Để tính đoạn chuyển tiếp ≥ 20 lần chênh lệch. Bằng nhau thì không cần.'
    },
    {
      key: 'ben',
      label: 'Bên',
      type: 'choice',
      choices: [
        { value: 'trai', label: 'Trái' },
        { value: 'phai', label: 'Phải' }
      ],
      default: 'phai',
      group: 'Vị trí',
      hint: 'Theo chiều lý trình tăng dần.'
    },
    {
      key: 'x',
      label: 'Vị trí X so với tim cầu',
      type: 'number',
      unit: 'mm',
      min: -30000,
      max: 30000,
      default: 0,
      group: 'Vị trí'
    },
    {
      key: 'y',
      label: 'Vị trí Y so với mặt bản',
      type: 'number',
      unit: 'mm',
      min: -30000,
      max: 30000,
      default: 0,
      group: 'Vị trí'
    }
  ],

  generate(ctx, values) {
    const num = (key, fallback) => {
      const raw = values[key]
      const value = typeof raw === 'string' ? Number(raw) : raw
      return typeof value === 'number' && Number.isFinite(value) ? value : fallback
    }

    const kerb = num('hBoVia', 200)
    const width = num('bLe', 1.5) * 1000
    const slab = num('dLe', 150)
    const outside = num('hBoViaNgoaiCau', 200)
    const side = values.ben === 'trai' ? 'trai' : 'phai'
    const x0 = num('x', 0)
    const y0 = num('y', 0)

    // Mặt lề luôn quay về phía trong cầu, dù đặt ở mép nào.
    const dir = side === 'phai' ? 1 : -1
    const partId = formatPartId({ role: 'go_chan_banh', side })

    // Đoạn chuyển tiếp: không vẽ được trên mặt cắt ngang, nhưng người làm
    // trắc dọc cần con số. Ghi vào nhãn để lượt sau hỏi là tra ra.
    const step = Math.abs(kerb - outside)
    const transition = step > 0 ? step * 20 : 0

    ctx.polyline({
      role: 'go_chan_banh',
      partId,
      params: {
        hBoVia: kerb,
        bLe: width,
        chuyenTiepToiThieu: transition,
        dieuKhoan: 'TCVN 11823-13:2017 §11.2'
      },
      layer: 'KC-GOCHAN',
      closed: true,
      points: [
        { x: x0, y: y0, z: 0 },
        { x: x0 + dir * width, y: y0, z: 0 },
        { x: x0 + dir * width, y: y0 + kerb, z: 0 },
        { x: x0, y: y0 + kerb, z: 0 }
      ]
    })

    // Bản lề dưới mặt đi bộ.
    ctx.polyline({
      role: 'ban_mat_cau',
      partId: formatPartId({ role: 'ban_mat_cau', side }),
      layer: 'KC-BAN',
      closed: true,
      points: [
        { x: x0, y: y0, z: 0 },
        { x: x0 + dir * width, y: y0, z: 0 },
        { x: x0 + dir * width, y: y0 - slab, z: 0 },
        { x: x0, y: y0 - slab, z: 0 }
      ]
    })

    if (transition > 0) {
      ctx.text({
        role: 'ghi_chu',
        partId: formatPartId({ role: 'ghi_chu', side }),
        layer: 'GC-GHICHU',
        position: { x: x0 + dir * width * 0.1, y: y0 + kerb + 200, z: 0 },
        height: 120,
        text:
          `Chuyen tiep bo via >= ${Math.round(transition)} mm ` +
          '(TCVN 11823-13:2017 §11.2)'
      })
    }
  }
}
