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
    version: '1.0.0',
    name: 'Tường phòng hộ bê tông (New Jersey)',
    category: 'Bộ phận cầu',
    description:
      'Tường phòng hộ bê tông dạng New Jersey, mặt cắt ngang. Chiều cao tối thiểu ' +
      'theo cấp thử nghiệm va xe: TL-3 ≥ 685, TL-4 ≥ 810, TL-5 ≥ 1070 mm ' +
      '(TCVN 11823-13:2017 điều 7.3.2.1). Không cộng dự phòng 75 mm cho lớp phủ ' +
      'tương lai — cùng điều khoản nói rõ là không cần.'
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
      label: 'Chiều cao tường',
      type: 'number',
      unit: 'mm',
      min: 685,
      max: 1500,
      default: 810,
      group: 'Kích thước',
      hint: 'Phải đạt tối thiểu của cấp thử nghiệm đã chọn.'
    },
    {
      key: 'bChan',
      label: 'Bề rộng chân tường',
      type: 'number',
      unit: 'mm',
      min: 300,
      max: 800,
      default: 480,
      group: 'Kích thước'
    },
    {
      key: 'bDinh',
      label: 'Bề rộng đỉnh tường',
      type: 'number',
      unit: 'mm',
      min: 150,
      max: 400,
      default: 200,
      group: 'Kích thước'
    },
    {
      key: 'hChanDung',
      label: 'Chiều cao đoạn chân thẳng đứng',
      type: 'number',
      unit: 'mm',
      min: 50,
      max: 400,
      default: 75,
      group: 'Kích thước',
      hint: 'Đoạn thẳng đứng sát mặt đường, dưới mặt vát.'
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
    const level = String(values.capThuNghiem ?? 'TL-4')
    const required = MIN_BY_LEVEL[level] ?? 685
    const h = num('h', 810)

    // Ràng buộc phụ thuộc một tham số khác nên phải kiểm ở đây; dải min/max
    // tĩnh chỉ chặn được sàn tuyệt đối 685 mm.
    if (h < required) {
      throw new Error(
        `Chiều cao tường ${h} mm không đạt cấp thử nghiệm ${level}: ` +
          `TCVN 11823-13:2017 điều 7.3.2.1 yêu cầu tối thiểu ${required} mm. ` +
          `Hãy đặt h ≥ ${required} hoặc chọn cấp thử nghiệm thấp hơn.`
      )
    }

    const base = num('bChan', 480)
    const top = num('bDinh', 200)
    const toe = Math.min(num('hChanDung', 75), h)
    const side = values.ben === 'trai' ? 'trai' : 'phai'
    const x0 = num('x', 0)
    const y0 = num('y', 0)

    // Mặt vát luôn quay về phía xe chạy. Vẽ giống nhau ở hai mép thì một bên
    // có mặt vát ngược, và trên màn hình không có gì nói ra điều đó.
    const dir = side === 'phai' ? 1 : -1
    // Điểm gãy của mặt New Jersey: khoảng 55% chiều cao, theo hình dạng thông
    // dụng. Đây là hình học thực hành, không phải trị số do TCVN quy định.
    const kneeY = y0 + Math.min(toe + 0.45 * h, h - 50)
    const kneeX = x0 - dir * (base - top) * 0.55

    ctx.polyline({
      role: 'lan_can',
      partId: formatPartId({ role: 'lan_can', side }),
      params: {
        capThuNghiem: level,
        h,
        bChan: base,
        bDinh: top,
        dieuKhoan: 'TCVN 11823-13:2017 §7.3.2.1'
      },
      layer: 'KC-LANCAN',
      closed: true,
      points: [
        // Mặt sau, thẳng đứng.
        { x: x0 + dir * base, y: y0, z: 0 },
        { x: x0 + dir * base, y: y0 + h, z: 0 },
        // Đỉnh.
        { x: x0 + dir * base - dir * (base - top), y: y0 + h, z: 0 },
        // Mặt trước: dốc trên, điểm gãy, chân thẳng đứng.
        { x: kneeX + dir * base, y: kneeY, z: 0 },
        { x: x0, y: y0 + toe, z: 0 },
        { x: x0, y: y0, z: 0 }
      ]
    })
  }
}
