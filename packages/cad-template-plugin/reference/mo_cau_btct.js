const { formatPartId } = globalThis.__CAD_TEMPLATE_SDK__

/**
 * Mố cầu BTCT, mặt chính.
 *
 * Dựng theo hai nguồn, mỗi nguồn cho một thứ mà nguồn kia không có:
 *
 *   - `banve_mo.dwg` — bản vẽ lắp của kỹ sư. Cho **quan hệ giữa các bộ phận**:
 *     cao độ chồng lên nhau, và độ dốc ngang.
 *   - `33_MO_BE`, `33_MO_TUONGTHAN`, `33_MO_TUONGDAU` — từng cấu kiện tách rời.
 *     Cho **hình dạng và kích thước** của mỗi bộ phận.
 *
 * Phải dùng cả hai vì hai bản đã tách ra khác nhau. Đo được: khi tách thành
 * file riêng, mỗi cấu kiện đã bị **san phẳng** về nằm ngang — tường đầu trong
 * file cấu kiện có đáy phẳng và đỉnh lệch 26 mm, còn trong bản lắp thì đáy dốc
 * và đỉnh lệch 140 mm, dù cùng chiều cao 1792. Phiên bản trước của template
 * này dựng từ file cấu kiện nên lấy phải độ dốc 0,37% — bản lắp nói rõ là
 * **2,00%**.
 *
 * Quy tắc thiết kế rút ra từ bản lắp, và là thứ đáng đưa vào template hơn cả
 * mấy con số: **độ dốc ngang áp cho mọi mặt nằm ngang từ đỉnh bệ trở lên.**
 * Đỉnh bệ phẳng; đỉnh tường thân, đỉnh tường đầu và lớp phủ đều nghiêng 2%.
 * Đo trên bản lắp: đỉnh tường thân 7615→7769 và đỉnh tường đầu 9441→9581, cả
 * hai đúng −2,00%. Nhờ vậy đổi độ dốc một chỗ là cả mố đổi theo, thay vì phải
 * sửa từng cao độ.
 *
 * Bề rộng thu dần theo chiều cao, cũng đọc từ bản lắp: bê tông lót 7900, bệ và
 * tường 7700, mặt trên tường đầu giữa hai vai kê 7000.
 *
 * TCVN 11823-11:2017 là tiêu chuẩn về mố nhưng phần định lượng của nó nằm ở
 * tường chắn đất có cốt; với mố bê tông thường điều 6 chỉ nêu yêu cầu định
 * tính. Không có trị số nào để viện dẫn, nên các dải ở đây chỉ chặn sai số
 * nhập liệu — và nói đúng như vậy.
 *
 * Cọc khoan nhồi và lan can cố ý không nằm ở đây; mỗi thứ đã có template
 * riêng. Vẽ lại ở đây là tạo ra đúng loại trùng lặp mà hai template rồi sẽ
 * nói khác nhau về cùng một điều khoản.
 */
export default {
  meta: {
    id: 'mo_cau_btct',
    version: '3.1.0',
    name: 'Mố cầu BTCT (mặt chính)',
    category: 'Mố trụ',
    description:
      'Mặt chính mố cầu BTCT dựng theo bản vẽ lắp và bản vẽ cấu kiện của kỹ ' +
      'sư: bê tông lót, bệ móng, tường thân, tường đầu, hai tường tai và lớp ' +
      'phủ. Độ dốc ngang áp cho mọi mặt từ đỉnh bệ trở lên, nên đổi một trị số ' +
      'là cả mố đổi theo. Cọc khoan nhồi và lan can dùng template riêng. Các ' +
      'trị số do tính toán quyết định — TCVN 11823-11:2017 không quy định kích ' +
      'thước cho mố bê tông thường.'
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
      hint: 'Do khổ cầu quyết định. Bản vẽ mẫu: 7700 ở bệ và cả hai tường.'
    },
    {
      key: 'doDocNgang',
      label: 'Độ dốc ngang',
      type: 'number',
      unit: '%',
      min: -8,
      max: 8,
      default: 2,
      group: 'Kích thước chính',
      hint:
        'Áp cho mọi mặt nằm ngang từ đỉnh bệ trở lên — đỉnh tường thân, đỉnh ' +
        'tường đầu và lớp phủ. Dương là bên phải cao hơn, như bản vẽ lắp; đo ' +
        'được đúng 2,00%. Nhận giá trị âm để đổi chiều dốc.'
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
      hint: 'Bản vẽ lắp: cao độ 876 đến 976. Lớp tạo phẳng, không chịu lực.'
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
      hint: 'Bản vẽ lắp: lót 7900 so với bệ 7700.'
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
      hint:
        'Bản vẽ lắp: cao độ 976 đến 2976. Do tính toán quyết định; dải này ' +
        'chỉ chặn sai số nhập liệu.'
    },
    {
      key: 'hThan',
      label: 'Chiều cao tường thân tại tim',
      type: 'number',
      unit: 'mm',
      min: 500,
      max: 20000,
      default: 4716,
      group: 'Tường thân',
      hint:
        'Đo tại tim vì đỉnh tường thân nghiêng theo dốc ngang. Bản vẽ lắp: ' +
        'đỉnh bệ 2976 lên đỉnh thân 7615–7769, tức 4716 tại tim.'
    },
    {
      key: 'hDau',
      label: 'Chiều cao tường đầu',
      type: 'number',
      unit: 'mm',
      min: 300,
      max: 5000,
      default: 1819,
      group: 'Tường đầu',
      hint:
        'Đo theo phương đứng giữa hai mặt cùng dốc, nên không phụ thuộc vị ' +
        'trí đo. Bản vẽ lắp: 7615→9441 bên trái, 7769→9581 bên phải.'
    },
    {
      key: 'bVaiKe',
      label: 'Bề rộng vai kê mỗi bên',
      type: 'number',
      unit: 'mm',
      min: 0,
      max: 2000,
      default: 350,
      group: 'Tường đầu',
      hint:
        'Đỉnh tường đầu hạ xuống ở hai mép để lớp phủ gối vào. Bản vẽ lắp: ' +
        'mặt trên rộng 7000 so với tường 7700, tức 350 mỗi bên.'
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
      hint:
        'Chênh cao giữa mặt kê và mép ngoài tường đầu. Cả bản vẽ lắp lẫn bản ' +
        'vẽ cấu kiện đều cho 7 mm — đừng nhầm với chiều dày lớp phủ nằm trên nó.'
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
      hint: 'Bản vẽ cấu kiện: 3850 vào 3700. Đặt 0 nếu không thể hiện.'
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
      hint: 'Bản vẽ cấu kiện: từ -698 xuống -1898.'
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
      min: -10000000,
      max: 10000000,
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
    const doc = num('doDocNgang', 2)
    const hLot = num('hLot', 100)
    const phuLot = num('phuLot', 100)
    const hBe = num('hBe', 2000)
    const hThan = num('hThan', 4716)
    const hDau = num('hDau', 1819)
    const bVaiKe = num('bVaiKe', 350)
    const hVaiKe = num('hVaiKe', 7)
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

    // Cao độ tại tim. Mọi mặt từ đỉnh bệ trở lên đều nghiêng, nên cao độ chỉ
    // xác định được khi kèm hoành độ — `at()` làm việc đó.
    const yLotDinh = y0 + hLot
    const yBeDinh = yLotDinh + hBe
    const yThanDinh = yBeDinh + hThan
    const yDauDinh = yThanDinh + hDau

    /**
     * Cao độ của một mặt nghiêng tại hoành độ x, tính từ cao độ ở tim.
     *
     * Dương nghĩa là bên phải cao hơn — theo đúng bản vẽ lắp, nơi mép phải
     * (x=7424) ở cao độ 7769 còn mép trái (x=-276) ở 7615. Cho phép giá trị âm
     * để đổi chiều dốc; hướng dốc là quyết định thiết kế, không phải hằng số.
     */
    const at = (yTim, x) => yTim + ((x - x0) * doc) / 100

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

    // Bê tông lót và bệ móng: nằm ngang, không dốc.
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

    // Tường thân: đáy phẳng theo đỉnh bệ, đỉnh nghiêng.
    ctx.polyline({
      role: 'mo_tuong_than',
      partId: formatPartId({ role: 'mo_tuong_than' }),
      params: { B, hThan, doDocNgang: doc },
      closed: true,
      points: [
        { x: x0 - half, y: yBeDinh, z: 0 },
        { x: x0 + half, y: yBeDinh, z: 0 },
        { x: x0 + half, y: at(yThanDinh, x0 + half), z: 0 },
        { x: x0 - half, y: at(yThanDinh, x0 - half), z: 0 }
      ]
    })

    // Tường đầu: cả đáy lẫn đỉnh đều nghiêng cùng độ dốc, và đỉnh hạ xuống
    // vai kê ở hai mép.
    ctx.polyline({
      role: 'mo_tuong_dau',
      partId: formatPartId({ role: 'mo_tuong_dau' }),
      params: { B, hDau, doDocNgang: doc, bVaiKe },
      closed: true,
      points: [
        { x: x0 - half, y: at(yThanDinh, x0 - half), z: 0 },
        { x: x0 + half, y: at(yThanDinh, x0 + half), z: 0 },
        { x: x0 + half, y: at(yDauDinh, x0 + half), z: 0 },
        { x: x0 + inner, y: at(yDauDinh, x0 + inner) + hVaiKe, z: 0 },
        { x: x0 - inner, y: at(yDauDinh, x0 - inner) + hVaiKe, z: 0 },
        { x: x0 - half, y: at(yDauDinh, x0 - half), z: 0 }
      ]
    })

    // Lớp phủ: gối lên vai kê, dốc theo.
    if (tLopPhu > 0) {
      ctx.polyline({
        role: 'lop_phu',
        partId: formatPartId({ role: 'lop_phu' }),
        params: { tLopPhu, doDocNgang: doc },
        closed: true,
        points: [
          { x: x0 - inner, y: at(yDauDinh, x0 - inner) + hVaiKe, z: 0 },
          { x: x0 + inner, y: at(yDauDinh, x0 + inner) + hVaiKe, z: 0 },
          {
            x: x0 + inner,
            y: at(yDauDinh, x0 + inner) + hVaiKe + tLopPhu,
            z: 0
          },
          {
            x: x0 - inner,
            y: at(yDauDinh, x0 - inner) + hVaiKe + tLopPhu,
            z: 0
          }
        ]
      })
    }

    // Tường tai: dải hẹp ở mỗi mép, treo dưới đỉnh tường đầu và dốc theo nó.
    if (bTai > 0 && hTai > 0) {
      for (const side of ['trai', 'phai']) {
        const x1 = side === 'trai' ? x0 - half : x0 + half - bTai
        const x2 = x1 + bTai
        const yTren = at(yDauDinh, (x1 + x2) / 2) - 100
        const partId = formatPartId({ role: 'mo_tuong_tai', side })
        rect('mo_tuong_tai', partId, { bTai, hTai }, x1, yTren - hTai, x2, yTren)
        // Tô đặc: đây là mặt cắt, tường tai bị cắt ngang. Bản vẽ lắp tô hai
        // dải này bằng `_SOLID` với 0 đường mẫu — một cấu kiện mỏng cắt qua
        // thì tô đặc, không kẻ ký hiệu vật liệu.
        ctx.hatch({
          role: 'mo_tuong_tai',
          partId,
          boundary: [
            { x: x1, y: yTren - hTai, z: 0 },
            { x: x2, y: yTren - hTai, z: 0 },
            { x: x2, y: yTren, z: 0 },
            { x: x1, y: yTren, z: 0 }
          ]
        })
      }
    }

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

    // Chuỗi cao độ đo tại tim, nơi mọi mặt nghiêng cắt qua trục đối xứng.
    const right = x0 + half + phuLot
    dim({ x: right, y: y0, z: 0 }, { x: right, y: yLotDinh, z: 0 }, 700, 'dung')
    dim({ x: right, y: yLotDinh, z: 0 }, { x: right, y: yBeDinh, z: 0 }, 700, 'dung')
    dim({ x: right, y: yBeDinh, z: 0 }, { x: right, y: yThanDinh, z: 0 }, 700, 'dung')
    dim({ x: right, y: yThanDinh, z: 0 }, { x: right, y: yDauDinh, z: 0 }, 700, 'dung')
    dim({ x: right, y: y0, z: 0 }, { x: right, y: yDauDinh, z: 0 }, 2200, 'dung')
  }
}
