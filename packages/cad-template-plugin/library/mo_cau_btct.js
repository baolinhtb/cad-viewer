const { formatPartId } = globalThis.__CAD_TEMPLATE_SDK__

/**
 * Mố cầu BTCT, mặt chính.
 *
 * Hình dạng và mọi giá trị mặc định lấy từ ba bản vẽ cấu kiện do kỹ sư vẽ —
 * `33_MO_BE`, `33_MO_TUONGTHAN`, `33_MO_TUONGDAU` — chứ không phải do suy đoán.
 * Phiên bản trước của template này dựng bốn hình chữ nhật chồng lên nhau và
 * sai ở những chỗ chỉ bản vẽ thật mới nói được: bệ dày 2000 chứ không phải
 * 1500, và **đỉnh tường đầu không phẳng** — nó mang độ dốc ngang và có bậc
 * xuống ở hai mép, là chỗ lớp phủ mặt cầu gối vào.
 *
 * Điều ba bản vẽ cùng chứng minh: mọi cấu kiện rộng ±3850 quanh tim x=0. Bề
 * rộng là tham số thật, có bằng chứng. Ngược lại, một bản vẽ **không** nói
 * được chiều dày bệ có luôn là 2000 hay không — đó là kết quả tính toán, nên
 * các dải ở đây vẫn chỉ chặn sai số nhập liệu.
 *
 * TCVN 11823-11:2017 là tiêu chuẩn về mố nhưng phần định lượng của nó nằm ở
 * tường chắn đất có cốt; với mố bê tông thường điều 6 chỉ nêu yêu cầu định
 * tính. Không có trị số nào để viện dẫn, và ghi "theo TCVN" lên một con số mà
 * tiêu chuẩn không quy định thì tệ hơn là không ghi gì.
 *
 * Cọc khoan nhồi cố ý không nằm ở đây: đã có `be_coc_khoan_nhoi` dựng chúng
 * kèm kiểm tra theo TCVN 11823-10:2017 §8.1.2. Vẽ lại ở đây là tạo ra đúng
 * loại trùng lặp mà hai template rồi sẽ nói khác nhau về cùng một điều khoản.
 */
export default {
  meta: {
    id: 'mo_cau_btct',
    version: '2.0.0',
    name: 'Mố cầu BTCT (mặt chính)',
    category: 'Mố trụ',
    description:
      'Mặt chính mố cầu BTCT dựng theo bản vẽ cấu kiện thật: bê tông lót, bệ ' +
      'móng, tường thân, tường đầu có dốc ngang ở đỉnh, hai tường tai và lớp ' +
      'phủ mặt cầu, mỗi cấu kiện trên layer riêng, kèm kích thước. Cọc khoan ' +
      'nhồi dùng template riêng. Các trị số là kết quả tính toán của người ' +
      'thiết kế — TCVN 11823-11:2017 không quy định kích thước cho mố bê tông ' +
      'thường, nên dải nhập ở đây chỉ chặn sai số gõ phím.'
  },
  params: [
    {
      key: 'B',
      label: 'Bề rộng mố',
      type: 'number',
      unit: 'mm',
      min: 2000,
      max: 30000,
      default: 7700,
      group: 'Kích thước chính',
      hint: 'Do khổ cầu quyết định. Bản vẽ mẫu dùng 7700 ở cả ba cấu kiện.'
    },
    {
      key: 'hBe',
      label: 'Chiều dày bệ móng',
      type: 'number',
      unit: 'mm',
      min: 500,
      max: 4000,
      default: 2000,
      group: 'Bệ móng',
      hint: 'Do tính toán quyết định; dải này chỉ chặn sai số nhập liệu.'
    },
    {
      key: 'hLot',
      label: 'Chiều dày bê tông lót',
      type: 'number',
      unit: 'mm',
      min: 50,
      max: 300,
      default: 100,
      group: 'Bệ móng',
      hint: 'Lớp tạo phẳng, không tham gia chịu lực.'
    },
    {
      key: 'phuLot',
      label: 'Bê tông lót rộng ra mỗi bên',
      type: 'number',
      unit: 'mm',
      min: 0,
      max: 500,
      default: 100,
      group: 'Bệ móng',
      hint: 'Bản vẽ mẫu: 3950 so với 3850, tức 100 mỗi bên.'
    },
    {
      key: 'hThan',
      label: 'Chiều cao tường thân',
      type: 'number',
      unit: 'mm',
      min: 500,
      max: 20000,
      default: 4843,
      group: 'Tường thân',
      hint: 'Do cao độ thiết kế quyết định; dải này chỉ chặn sai số nhập liệu.'
    },
    {
      key: 'hDau',
      label: 'Chiều cao tường đầu',
      type: 'number',
      unit: 'mm',
      min: 300,
      max: 5000,
      default: 1818,
      group: 'Tường đầu',
      hint: 'Do chiều cao dầm và cấu tạo gối quyết định.'
    },
    {
      key: 'bVaiKe',
      label: 'Bề rộng vai kê lớp phủ mỗi bên',
      type: 'number',
      unit: 'mm',
      min: 0,
      max: 2000,
      default: 350,
      group: 'Tường đầu',
      hint:
        'Phần đỉnh tường đầu hạ xuống ở hai mép để lớp phủ gối vào. Bản vẽ ' +
        'mẫu: 3850 xuống 3500, tức 350 mỗi bên.'
    },
    {
      key: 'hVaiKe',
      label: 'Chiều sâu vai kê',
      type: 'number',
      unit: 'mm',
      min: 0,
      max: 500,
      default: 7,
      group: 'Tường đầu',
      hint: 'Chênh cao giữa mép ngoài và chân vai kê trên bản vẽ mẫu.'
    },
    {
      key: 'doDocNgang',
      label: 'Độ dốc ngang đỉnh tường đầu',
      type: 'number',
      unit: '%',
      min: 0,
      max: 4,
      default: 0.37,
      group: 'Tường đầu',
      hint:
        'Đỉnh tường đầu không phẳng. Bản vẽ mẫu nghiêng 26 mm trên 7000 mm. ' +
        'Trị số do thiết kế tuyến và thoát nước quyết định.'
    },
    {
      key: 'tLopPhu',
      label: 'Chiều dày lớp phủ mặt cầu',
      type: 'number',
      unit: 'mm',
      min: 0,
      max: 200,
      default: 70,
      group: 'Mặt cầu',
      hint: 'Do thiết kế áo đường quyết định; bản vẽ mẫu dùng 70.'
    },
    {
      key: 'bTai',
      label: 'Bề rộng tường tai thấy trên mặt chính',
      type: 'number',
      unit: 'mm',
      min: 0,
      max: 2000,
      default: 150,
      group: 'Tường tai',
      hint: 'Bản vẽ mẫu: 3850 vào 3700, tức 150. Đặt 0 nếu không thể hiện.'
    },
    {
      key: 'hTai',
      label: 'Chiều cao tường tai thấy trên mặt chính',
      type: 'number',
      unit: 'mm',
      min: 0,
      max: 8000,
      default: 1200,
      group: 'Tường tai',
      hint: 'Bản vẽ mẫu: từ -698 xuống -1898.'
    },
    {
      key: 'ghiKichThuoc',
      label: 'Ghi kích thước',
      type: 'choice',
      choices: [
        { value: 'co', label: 'Có' },
        { value: 'khong', label: 'Không' }
      ],
      default: 'co',
      group: 'Thể hiện',
      hint: 'Một bản vẽ không kích thước thì không nộp được.'
    },
    {
      key: 'x',
      label: 'Vị trí tim mố',
      type: 'number',
      unit: 'mm',
      min: -1000000,
      max: 1000000,
      default: 0,
      group: 'Vị trí'
    },
    {
      key: 'y',
      label: 'Cao độ đáy bê tông lót',
      type: 'number',
      unit: 'mm',
      min: -100000,
      max: 100000,
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

    const B = num('B', 7700)
    const hBe = num('hBe', 2000)
    const hLot = num('hLot', 100)
    const phuLot = num('phuLot', 100)
    const hThan = num('hThan', 4843)
    const hDau = num('hDau', 1818)
    const bVaiKe = num('bVaiKe', 350)
    const hVaiKe = num('hVaiKe', 7)
    const doDocNgang = num('doDocNgang', 0.37)
    const tLopPhu = num('tLopPhu', 70)
    const bTai = num('bTai', 150)
    const hTai = num('hTai', 1200)
    const x0 = num('x', 0)
    const y0 = num('y', 0)
    const ghi = values.ghiKichThuoc !== 'khong'

    if (bTai * 2 > B) {
      throw new Error(
        `Hai tường tai rộng ${bTai} mm mỗi bên không nằm lọt trong bề rộng mố ${B} mm.`
      )
    }
    if (bVaiKe * 2 > B) {
      throw new Error(
        `Vai kê rộng ${bVaiKe} mm mỗi bên không nằm lọt trong bề rộng mố ${B} mm.`
      )
    }

    const half = B / 2
    const inner = half - bVaiKe
    const rect = (role, partId, params, x1, y1, x2, y2) =>
      ctx.polyline({
        role,
        partId,
        ...(params ? { params } : {}),
        closed: true,
        points: [
          { x: x1, y: y1, z: 0 },
          { x: x2, y: y1, z: 0 },
          { x: x2, y: y2, z: 0 },
          { x: x1, y: y2, z: 0 }
        ]
      })

    // Xếp từ dưới lên; mỗi cao độ suy ra từ cái nằm dưới nó.
    const yLotDinh = y0 + hLot
    const yBeDinh = yLotDinh + hBe
    const yThanDinh = yBeDinh + hThan
    const yDauDinh = yThanDinh + hDau

    rect(
      'mo_be_tong_lot',
      formatPartId({ role: 'mo_be_tong_lot' }),
      { hLot, phuLot },
      x0 - half - phuLot,
      y0,
      x0 + half + phuLot,
      yLotDinh
    )
    rect(
      'mo_be',
      formatPartId({ role: 'mo_be' }),
      { B, hBe },
      x0 - half,
      yLotDinh,
      x0 + half,
      yBeDinh
    )
    rect(
      'mo_tuong_than',
      formatPartId({ role: 'mo_tuong_than' }),
      { B, hThan },
      x0 - half,
      yBeDinh,
      x0 + half,
      yThanDinh
    )

    // Tường đầu: đỉnh KHÔNG phẳng. Từ mép trái lên vai kê, dốc ngang sang phải,
    // rồi hạ xuống vai kê mép phải — đúng như bản vẽ cấu kiện.
    const doc = (doDocNgang / 100) * (inner * 2)
    const yTraiNgoai = yDauDinh
    const yTraiTrong = yDauDinh + hVaiKe
    const yPhaiTrong = yTraiTrong - doc
    const yPhaiNgoai = yPhaiTrong - hVaiKe
    ctx.polyline({
      role: 'mo_tuong_dau',
      partId: formatPartId({ role: 'mo_tuong_dau' }),
      params: { B, hDau, doDocNgang },
      closed: true,
      points: [
        { x: x0 - half, y: yThanDinh, z: 0 },
        { x: x0 - half, y: yTraiNgoai, z: 0 },
        { x: x0 - inner, y: yTraiTrong, z: 0 },
        { x: x0 + inner, y: yPhaiTrong, z: 0 },
        { x: x0 + half, y: yPhaiNgoai, z: 0 },
        { x: x0 + half, y: yThanDinh, z: 0 }
      ]
    })

    // Lớp phủ mặt cầu, gối lên vai kê và dốc theo đỉnh tường đầu.
    if (tLopPhu > 0) {
      ctx.polyline({
        role: 'lop_phu',
        partId: formatPartId({ role: 'lop_phu' }),
        params: { tLopPhu },
        closed: true,
        points: [
          { x: x0 - inner, y: yTraiTrong, z: 0 },
          { x: x0 + inner, y: yPhaiTrong, z: 0 },
          { x: x0 + inner, y: yPhaiTrong + tLopPhu, z: 0 },
          { x: x0 - inner, y: yTraiTrong + tLopPhu, z: 0 }
        ]
      })
    }

    // Tường tai: một dải hẹp ở mỗi mép, đánh bên riêng để gọi tên được.
    if (bTai > 0 && hTai > 0) {
      const yTaiDinh = yThanDinh + hDau - 100
      for (const side of ['trai', 'phai']) {
        const x1 = side === 'trai' ? x0 - half : x0 + half - bTai
        rect(
          'mo_tuong_tai',
          formatPartId({ role: 'mo_tuong_tai', side }),
          { bTai, hTai },
          x1,
          yTaiDinh - hTai,
          x1 + bTai,
          yTaiDinh
        )
      }
    }

    // Mạch nối tường đầu với tường thân — bản vẽ mẫu vẽ nó thành một nét riêng.
    ctx.line({
      role: 'mo_tuong_dau',
      partId: formatPartId({ role: 'mo_tuong_dau' }),
      start: { x: x0 - half, y: yThanDinh, z: 0 },
      end: { x: x0 + half, y: yThanDinh, z: 0 }
    })

    ctx.line({
      role: 'duong_tim',
      partId: formatPartId({ role: 'duong_tim' }),
      start: { x: x0, y: y0 - 500, z: 0 },
      end: { x: x0, y: yDauDinh + 1500, z: 0 }
    })

    if (!ghi) return

    let n = 0
    const dim = (start, end, offset, huong) =>
      ctx.dimension({
        role: 'kich_thuoc',
        partId: formatPartId({ role: 'kich_thuoc', ordinal: ++n }),
        start,
        end,
        offset,
        huong
      })

    dim(
      { x: x0 - half, y: y0, z: 0 },
      { x: x0 + half, y: y0, z: 0 },
      -900,
      'ngang'
    )

    const right = x0 + half + phuLot
    dim({ x: right, y: y0, z: 0 }, { x: right, y: yLotDinh, z: 0 }, 700, 'dung')
    dim({ x: right, y: yLotDinh, z: 0 }, { x: right, y: yBeDinh, z: 0 }, 700, 'dung')
    dim({ x: right, y: yBeDinh, z: 0 }, { x: right, y: yThanDinh, z: 0 }, 700, 'dung')
    dim({ x: right, y: yThanDinh, z: 0 }, { x: right, y: yDauDinh, z: 0 }, 700, 'dung')
    dim({ x: right, y: y0, z: 0 }, { x: right, y: yDauDinh, z: 0 }, 2200, 'dung')
  }
}
