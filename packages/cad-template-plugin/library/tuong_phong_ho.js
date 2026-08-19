const { formatPartId } = globalThis.__CAD_TEMPLATE_SDK__

/**
 * Tường phòng hộ bê tông (dạng New Jersey), mặt cắt ngang.
 *
 * TCVN 11823-13:2017 điều 7.3.2.1 cho hai ràng buộc khác nhau trong cùng một
 * đoạn, và chúng dễ bị lẫn:
 *   - Theo cấp thử nghiệm va xe: TL-3 ≥ 685 mm, TL-4 ≥ 810 mm, TL-5 ≥ 1070 mm.
 *   - Riêng thành bê tông có mặt phẳng thẳng đứng: "Chiều cao nhỏ nhất của
 *     thành bê tông của gờ chắn bê tông có mặt phẳng thẳng đứng phải là 685mm."
 *
 * Cùng điều khoản còn nói rõ một điều dễ vẽ thừa: "Không cần tăng chiều cao dự
 * phòng 75mm của gờ dạng an toàn chân lan can vì xét đến lớp phủ mặt cầu trong
 * tương lai." Nên template không cộng thêm khoảng dự phòng nào, và nói ra để
 * người đọc bản vẽ biết đó là cố ý.
 */
export default {
  meta: {
    id: 'tuong_phong_ho_btct',
    version: '2.0.0',
    name: 'Tường phòng hộ bê tông (New Jersey)',
    category: 'Bộ phận cầu',
    description:
      'Tường phòng hộ bê tông trên cầu, mặt cắt ngang, dựng theo profile do kỹ ' +
      'sư vẽ (`lancan-left.dwg` / `lancan-right.dwg`) chứ không phải hình New ' +
      'Jersey suy đoán. Chiều cao tối thiểu theo cấp thử nghiệm va xe: TL-3 ≥ ' +
      '685, TL-4 ≥ 810, TL-5 ≥ 1070 mm theo TCVN 11823-13:2017 điều 7.3.2.1. ' +
      'Chân tường có khấc để ôm mép bản mặt cầu; khấc giữ nguyên như bản vẽ, ' +
      'chỉ chiều cao là tham số.'
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
      default: 'TL-5',
      group: 'Tiêu chuẩn',
      hint: 'TCVN 11823-13:2017, điều 7.3.2.1.'
    },
    {
      key: 'h',
      label: 'Chiều cao tường',
      type: 'number',
      unit: 'mm',
      min: 685,
      max: 1500,
      default: 1090,
      group: 'Kích thước',
      hint: 'Phải đạt tối thiểu của cấp thử nghiệm đã chọn.'
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
      label: 'Vị trí Y so với mặt đường',
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

    const MIN_BY_LEVEL = { 'TL-3': 685, 'TL-4': 810, 'TL-5': 1070 }
    const level = String(values.capThuNghiem ?? 'TL-5')
    const required = MIN_BY_LEVEL[level] ?? 685
    const h = num('h', 1090)

    // Ràng buộc phụ thuộc một tham số khác nên phải kiểm ở đây; dải min/max
    // tĩnh chỉ chặn được sàn tuyệt đối 685 mm.
    if (h < required) {
      throw new Error(
        `Chiều cao tường ${h} mm không đạt cấp thử nghiệm ${level}: ` +
          `TCVN 11823-13:2017 điều 7.3.2.1 yêu cầu tối thiểu ${required} mm. ` +
          `Hãy đặt h ≥ ${required} hoặc chọn cấp thử nghiệm thấp hơn.`
      )
    }

    const side = values.ben === 'trai' ? 'trai' : 'phai'
    const x0 = num('x', 0)
    const y0 = num('y', 0)

    // Mặt vát luôn quay về phía xe chạy. Vẽ giống nhau ở hai mép thì một bên
    // có mặt vát ngược, và trên màn hình không có gì nói ra điều đó.
    const dir = side === 'phai' ? 1 : -1

    /**
     * Profile lấy nguyên từ bản vẽ, gốc dời về mép sau và đáy.
     *
     * Bản trước tự đặt điểm gãy ở "khoảng 55% chiều cao, theo hình dạng thông
     * dụng" — tức là đoán. Đây là hình thật: chân rộng 100, phình ra 500 ở
     * khoảng giữa, rồi thu về 300 ở đỉnh, và có **khấc** ở chân (x 150→500,
     * y 0→543) để ôm mép bản mặt cầu.
     *
     * Chỉ chiều cao là tham số, vì đó là thứ TCVN quy định. Phần khấc và các
     * đoạn dưới giữ nguyên: một bản vẽ không nói được chúng biến thiên thế
     * nào, và co giãn chúng theo chiều cao là bịa ra một quan hệ không có.
     */
    const HINH = [
      [500, 690],
      [300, null], // null = bám đỉnh, cao độ do `h` quyết định
      [0, null],
      [50, 0],
      [150, 0],
      [150, 543],
      [500, 550]
    ]

    ctx.polyline({
      role: 'lan_can',
      partId: formatPartId({ role: 'lan_can', side }),
      params: {
        capThuNghiem: level,
        h,
        dieuKhoan: 'TCVN 11823-13:2017 §7.3.2.1'
      },
      layer: 'KC-LANCAN',
      closed: true,
      points: HINH.map(([dx, dy]) => ({
        x: x0 + dir * dx,
        y: y0 + (dy === null ? h : dy),
        z: 0
      }))
    })

    // Ống ⌀100 chôn trong thân tường, đúng vị trí bản vẽ.
    ctx.circle({
      role: 'ong_thoat_nuoc',
      partId: formatPartId({ role: 'ong_thoat_nuoc', side }),
      params: { D: 100 },
      layer: 'KT-THOATNUOC',
      center: { x: x0 + dir * 203, y: y0 + 727, z: 0 },
      radius: 50
    })
  }
}
