const { formatPartId } = globalThis.__CAD_TEMPLATE_SDK__

/**
 * Lan can đường người đi bộ, mặt cắt ngang.
 *
 * Hai ràng buộc lấy nguyên văn từ TCVN 11823-13:2017 điều 8.1:
 *   "Chiều cao nhỏ nhất của lan can đường người đi bộ phải là 1070 mm tính từ
 *    mặt đường người đi bộ."
 *   "Khoảng hở tịnh giữa các cấu kiện lan can phải đảm bảo một quả cầu đường
 *    kính 150 mm không thể lọt qua."
 *
 * Quy tắc quả cầu 150 mm là thứ dễ vẽ sai nhất và khó nhìn ra nhất trên bản
 * vẽ: một lan can 5 thanh và một lan can 4 thanh trông giống hệt nhau, chỉ
 * khác nhau ở chỗ cái sau cho lọt quả cầu. Nên template tự tính số thanh từ
 * chiều cao thay vì để người nhập, và từ chối nếu khoảng hở yêu cầu vi phạm.
 */
export default {
  meta: {
    id: 'lan_can_nguoi_di_bo_tcvn',
    version: '1.0.0',
    name: 'Lan can đường người đi bộ',
    category: 'Bộ phận cầu',
    description:
      'Lan can cho đường người đi bộ trên cầu, mặt cắt ngang. Chiều cao tối thiểu ' +
      '1070 mm và khoảng hở tịnh nhỏ hơn 150 mm (quả cầu 150 mm không lọt qua) ' +
      'theo TCVN 11823-13:2017 điều 8.1. Số thanh ngang được tính từ chiều cao ' +
      'để khoảng hở luôn đạt, không phải nhập tay.'
  },
  params: [
    {
      key: 'h',
      label: 'Chiều cao lan can',
      type: 'number',
      unit: 'mm',
      min: 1070,
      max: 1600,
      default: 1100,
      group: 'Kích thước',
      hint: 'TCVN 11823-13:2017, điều 8.1 — tối thiểu 1070 mm.'
    },
    {
      key: 'khoangHo',
      label: 'Khoảng hở tịnh giữa các thanh',
      type: 'number',
      unit: 'mm',
      min: 60,
      max: 149,
      default: 130,
      group: 'Kích thước',
      hint: 'TCVN 11823-13:2017, điều 8.1 — quả cầu 150 mm không được lọt qua.'
    },
    {
      key: 'bTru',
      label: 'Bề rộng trụ lan can',
      type: 'number',
      unit: 'mm',
      min: 80,
      max: 400,
      default: 150,
      group: 'Kích thước'
    },
    {
      key: 'dThanh',
      label: 'Chiều dày thanh ngang',
      type: 'number',
      unit: 'mm',
      min: 20,
      max: 120,
      default: 50,
      group: 'Kích thước'
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
      label: 'Vị trí Y so với mặt lề',
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

    const h = num('h', 1100)
    const gap = num('khoangHo', 130)
    const post = num('bTru', 150)
    const rail = num('dThanh', 50)
    const side = values.ben === 'trai' ? 'trai' : 'phai'
    const x0 = num('x', 0)
    const y0 = num('y', 0)

    // Số thanh nhỏ nhất để không chỗ nào hở quá `gap`. Tính ở đây chứ không
    // để người nhập: khoảng hở là thứ tiêu chuẩn quy định, số thanh chỉ là
    // hệ quả — và một bản vẽ thiếu một thanh trông y hệt bản vẽ đủ.
    //
    // Chia cả `h`, không phải `h - rail`. Trừ đi một thanh trước khi chia làm
    // số thanh thiếu đúng một cái ở vài chiều cao, và khoảng hở chạm 150 mm —
    // ở h = 1200, dThanh = 50 thì ra đúng 150, tức lọt quả cầu. Với cách chia
    // này thì h/rails ≤ gap + rail, nên khoảng hở thực luôn ≤ gap.
    const rails = Math.max(2, Math.ceil(h / (gap + rail)))
    const actualGap = (h - rails * rail) / rails
    if (actualGap >= 150) {
      throw new Error(
        `Khoảng hở tịnh ${Math.round(actualGap)} mm cho lọt quả cầu 150 mm. ` +
          'TCVN 11823-13:2017 điều 8.1 không cho phép. ' +
          'Hãy giảm khoảng hở yêu cầu hoặc tăng chiều dày thanh.'
      )
    }

    const partId = formatPartId({ role: 'lan_can', side })
    const params = { h, khoangHo: Math.round(actualGap), soThanh: rails }

    // Trụ đứng.
    ctx.polyline({
      role: 'lan_can',
      partId,
      params,
      layer: 'KC-LANCAN',
      closed: true,
      points: [
        { x: x0, y: y0, z: 0 },
        { x: x0 + post, y: y0, z: 0 },
        { x: x0 + post, y: y0 + h, z: 0 },
        { x: x0, y: y0 + h, z: 0 }
      ]
    })

    // Thanh ngang, chia đều từ đỉnh xuống.
    const reach = post * 4
    for (let i = 1; i <= rails; i++) {
      const yTop = y0 + h - (i - 1) * (actualGap + rail)
      ctx.polyline({
        role: 'lan_can',
        partId,
        layer: 'KC-LANCAN',
        closed: true,
        points: [
          { x: x0 - reach, y: yTop - rail, z: 0 },
          { x: x0 + reach, y: yTop - rail, z: 0 },
          { x: x0 + reach, y: yTop, z: 0 },
          { x: x0 - reach, y: yTop, z: 0 }
        ]
      })
    }
  }
}
