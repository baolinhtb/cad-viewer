const { formatPartId } = globalThis.__CAD_TEMPLATE_SDK__

/**
 * Lan can cầu: tường phòng hộ bê tông và lan can thép trên nó, mặt cắt ngang.
 *
 * Cả cụm lấy từ một block duy nhất trong `lancan-left.dwg` /
 * `lancan-right.dwg`. Block ấy có 124 đối tượng; bản trước của template này
 * dùng đúng **một** — đường bao tường bê tông trên layer `N2` — rồi bỏ 81 đối
 * tượng còn lại của **lan can thép** đứng trên nó, nên bản vẽ sinh ra cụt mất
 * phần trên. Nay vẽ cả hai.
 *
 * Phần thép nằm từ cao độ +20 đến +588 so với đỉnh tường bê tông: hai bản đế
 * dày 8 mm bắt bu lông xuống đỉnh tường, cột, và hai thanh ống tròn (⌀110 và
 * ⌀90, thấy trên mặt cắt là hai vòng tròn cùng các cung bao). Nó được chép
 * nguyên xi từ bản vẽ — 49 đoạn thẳng, 26 cung, 2 đường tròn — chứ không tham
 * số hoá, vì một bản vẽ mặt cắt không nói được các chi tiết ấy biến thiên thế
 * nào; đặt tham số cho chúng là bịa ra quan hệ không tồn tại.
 *
 * Biên dạng lấy nguyên từ `lancan-left.dwg` / `lancan-right.dwg` — bản vẽ cấu
 * kiện của kỹ sư. Phiên bản đầu của template này vẽ một hình New Jersey suy
 * đoán, với bình luận tự nhận là "theo hình dạng thông dụng"; bản vẽ thật khác
 * hẳn, và điểm khác quan trọng nhất là **khấc ở chân** (x 150→500, y 0→543) để
 * tường ôm lấy mép bản mặt cầu. Không công thức nào sinh ra được khấc đó, nên
 * nó giữ nguyên theo bản vẽ chứ không co giãn theo chiều cao.
 *
 * Vì thế tên "New Jersey" đã bỏ khỏi tiêu đề: nó nói sai về thứ template vẽ.
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
    version: '3.0.0',
    name: 'Lan can cầu (tường phòng hộ bê tông + lan can thép)',
    category: 'Bộ phận cầu',
    description:
      'Cả cụm lan can cầu: tường phòng hộ bê tông và lan can thép đứng trên ' +
      'nó, mặt cắt ngang, chép từ bản vẽ cấu kiện lancan-left.dwg / ' +
      'lancan-right.dwg của kỹ sư. Tổng cao 1678 mm — phần thép cao 588 trên ' +
      'đỉnh tường bê tông. Chiều cao tối thiểu theo cấp thử nghiệm va xe: TL-3 ≥ ' +
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
      key: 'veLanCanThep',
      label: 'Vẽ lan can thép trên tường',
      type: 'choice',
      choices: [
        { value: 'co', label: 'Có' },
        { value: 'khong', label: 'Không' }
      ],
      default: 'co',
      group: 'Tiêu chuẩn',
      hint:
        'Tắt khi chỉ cần dải phòng hộ bê tông trần. Bản vẽ của kỹ sư có phần ' +
        'thép, nên mặc định là có.'
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

    if (values.veLanCanThep === 'khong') return

    // Lan can thép, chép nguyên từ block trong bản vẽ. Toạ độ y tính từ **đỉnh
    // tường bê tông**, nên đổi chiều cao tường là cả lan can đi theo — đúng
    // như thực tế, nó bắt bu lông xuống đỉnh tường ấy.
    const LC_DOAN = [
      [145, 529, 241, 529],
      [148.2, 469.4, 145.1, 485],
      [217, 574.1, 218.8, 577.1],
      [145, 532.5, 241, 532.5],
      [175.9, 467.3, 160.9, 462.3],
      [115, 20, 62.5, 20],
      [62.8, 229.1, 85.3, 229.1],
      [85.3, 235.1, 64.5, 235.1],
      [52.5, 30, 52.5, 126],
      [120.5, 176.3, 117.3, 184.4],
      [135.5, 177.7, 128, 173.6],
      [115, 20, 125, 10],
      [234.3, 20, 185, 20],
      [185, 20, 175, 10],
      [167.9, 200.2, 148, 193],
      [175, 10, 125, 10],
      [204.7, 229.1, 211.2, 229.1],
      [204.7, 235.1, 210.6, 235.1],
      [108.1, 218.7, 181.9, 245.6],
      [230, 28, 230, 24],
      [189.3, 28, 189.3, 24],
      [186.3, 24, 233, 24],
      [186.3, 20, 233, 20],
      [186.3, 24, 186.3, 20],
      [233, 24, 233, 20],
      [227.2, 45.6, 192.2, 45.6],
      [189.3, 28, 230, 28],
      [192.2, 45.6, 192.2, 28],
      [227.2, 45.6, 227.2, 28],
      [215.5, 44.2, 215.5, 28],
      [203.8, 44.2, 203.8, 28],
      [199.7, 55.5, 199.7, 45.6],
      [219.7, 55.5, 219.7, 45.6],
      [199.7, 55.5, 219.7, 55.5],
      [110.4, 28, 110.4, 24],
      [69.7, 28, 69.7, 24],
      [66.7, 24, 113.4, 24],
      [66.7, 20, 113.4, 20],
      [66.7, 24, 66.7, 20],
      [113.4, 24, 113.4, 20],
      [107.5, 45.6, 72.5, 45.6],
      [69.7, 28, 110.4, 28],
      [72.5, 45.6, 72.5, 28],
      [107.5, 45.6, 107.5, 28],
      [95.9, 44.2, 95.9, 28],
      [84.2, 44.2, 84.2, 28],
      [80, 55.5, 80, 45.6],
      [100, 55.5, 100, 45.6],
      [80, 55.5, 100, 55.5]
    ]

    const LC_CUNG = [
      [193, 532.5, 67.5, 202, 303],
      [1852.5, 3466.1, 3447.5, 240, 241],
      [231.4, 472.7, 3.5, 349, 123],
      [1158.7, 116, 1106.2, 174, 179],
      [62.5, 30, 10, 180, 270],
      [62.8, 224.1, 5, 90, 174],
      [64.5, 240.1, 5, 174, 270],
      [145, 232.1, 55.2, 188, 352],
      [1228, 272.9, 1013, 183, 194],
      [752, 1947, 1880, 250, 251],
      [234.3, 30, 10, 270, 14],
      [210.6, 240.1, 5, 270, 2],
      [211.2, 224.1, 5, 3, 90],
      [204.7, 224.1, 5, 90, 172],
      [85.3, 224.1, 5, 8, 90],
      [204.7, 240.1, 5, 188, 270],
      [85.3, 240.1, 5, 270, 352],
      [145, 232.1, 55.2, 8, 172],
      [1158.7, 116, 1106.2, 159, 174],
      [1228, 272.9, 1013, 169, 182],
      [221.1, 31.8, 13.8, 64, 114],
      [209.5, 31.8, 13.8, 64, 114],
      [197.8, 31.8, 13.8, 64, 114],
      [101.5, 31.8, 13.8, 64, 114],
      [89.8, 31.8, 13.8, 64, 114],
      [78.2, 31.8, 13.8, 64, 114]
    ]

    const LC_TRON = [
      [193, 532.5, 55],
      [145, 232.1, 45]
    ]

    const px = dx => x0 + dir * dx
    const py = dy => y0 + h + dy
    let n = 0
    const id = () => formatPartId({ role: 'lan_can', side, ordinal: ++n })

    for (const [x1, y1, x2, y2] of LC_DOAN) {
      ctx.line({
        role: 'lan_can',
        partId: id(),
        layer: 'KC-LANCAN',
        start: { x: px(x1), y: py(y1), z: 0 },
        end: { x: px(x2), y: py(y2), z: 0 }
      })
    }

    for (const [cx, cy, r, a1, a2] of LC_CUNG) {
      // Lật sang mép phải là lật gương qua trục đứng: góc θ thành 180° − θ, và
      // chiều quay đảo nên hai đầu cung đổi chỗ. Vẽ nguyên góc cho cả hai bên
      // thì một bên có cung cong ngược, thứ rất khó thấy trên màn hình.
      const rad = deg => (deg * Math.PI) / 180
      const start = dir === 1 ? rad(a1) : rad(180 - a2)
      const end = dir === 1 ? rad(a2) : rad(180 - a1)
      ctx.arc({
        role: 'lan_can',
        partId: id(),
        layer: 'KC-LANCAN',
        center: { x: px(cx), y: py(cy), z: 0 },
        radius: r,
        startAngle: start,
        endAngle: end
      })
    }

    for (const [cx, cy, r] of LC_TRON) {
      ctx.circle({
        role: 'lan_can',
        partId: id(),
        layer: 'KC-LANCAN',
        center: { x: px(cx), y: py(cy), z: 0 },
        radius: r
      })
    }
  }
}
