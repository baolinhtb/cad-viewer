const { formatPartId } = globalThis.__CAD_TEMPLATE_SDK__

/**
 * Mố cầu BTCT, mặt chính.
 *
 * Không template nào ở đây có dải "theo TCVN" cho mố, và đó là kết luận sau
 * khi tra chứ không phải thiếu sót. TCVN 11823-11:2017 là tiêu chuẩn về mố,
 * trụ và tường chắn, nhưng phần định lượng của nó nằm ở tường chắn đất có cốt
 * (điều 10); với mố bê tông thường thì điều 6 chỉ nêu yêu cầu định tính —
 * tường cánh liền khối hay tách rời (6.1.4), cốt thép giằng tường cánh vào
 * thân mố (6.1.5.2). Bề dày thân mố, bề dày bệ, kích thước tường đầu đều là
 * kết quả tính toán theo trạng thái giới hạn, không phải trị số tra bảng.
 *
 * Nên mọi dải số ở đây là **chặn sai số nhập liệu**, không phải ràng buộc
 * tiêu chuẩn, và mỗi tham số nói đúng như vậy. Ghi "theo TCVN" lên một con số
 * mà tiêu chuẩn không hề quy định thì tệ hơn là không ghi gì: người đọc bản vẽ
 * sẽ tin vào một thẩm quyền không tồn tại.
 *
 * Cái template này thật sự bảo đảm là **hình học và quy ước**: năm cấu kiện
 * nằm đúng layer đã khai, xếp chồng đúng thứ tự, cùng tim, và có kích thước
 * ghi kèm — thay cho khoảng ba mươi lệnh vẽ tay.
 */
export default {
  meta: {
    id: 'mo_cau_btct',
    version: '1.0.0',
    name: 'Mố cầu BTCT (mặt chính)',
    category: 'Mố trụ',
    description:
      'Mặt chính mố cầu BTCT: bê tông lót, bệ móng, tường thân, tường đầu và ' +
      'tường tai, mỗi cấu kiện trên layer riêng, kèm kích thước. Các trị số là ' +
      'kết quả tính toán của người thiết kế — TCVN 11823-11:2017 không quy ' +
      'định kích thước cho mố bê tông thường, nên dải nhập ở đây chỉ để chặn ' +
      'sai số gõ phím, không phải ràng buộc tiêu chuẩn.'
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
      hint: 'Do khổ cầu và tính toán quyết định.'
    },
    {
      key: 'hBe',
      label: 'Chiều dày bệ móng',
      type: 'number',
      unit: 'mm',
      min: 500,
      max: 4000,
      default: 1500,
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
      group: 'Bệ móng'
    },
    {
      key: 'hThan',
      label: 'Chiều cao tường thân',
      type: 'number',
      unit: 'mm',
      min: 500,
      max: 20000,
      default: 9500,
      group: 'Tường thân',
      hint: 'Từ đỉnh bệ tới đáy tường đầu. Do cao độ thiết kế quyết định.'
    },
    {
      key: 'hDau',
      label: 'Chiều cao tường đầu',
      type: 'number',
      unit: 'mm',
      min: 300,
      max: 5000,
      default: 1700,
      group: 'Tường đầu',
      hint: 'Do chiều cao dầm và cấu tạo gối quyết định.'
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
      hint: 'Đặt 0 nếu mặt chính không thể hiện tường tai.'
    },
    {
      key: 'hTai',
      label: 'Chiều cao tường tai thấy trên mặt chính',
      type: 'number',
      unit: 'mm',
      min: 0,
      max: 8000,
      default: 1700,
      group: 'Tường tai'
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
    const hBe = num('hBe', 1500)
    const hLot = num('hLot', 100)
    const phuLot = num('phuLot', 100)
    const hThan = num('hThan', 9500)
    const hDau = num('hDau', 1700)
    const bTai = num('bTai', 150)
    const hTai = num('hTai', 1700)
    const x0 = num('x', 0)
    const y0 = num('y', 0)
    const ghi = values.ghiKichThuoc !== 'khong'

    // Hình học không dựng được thì từ chối, chứ không phải vi phạm điều khoản.
    if (bTai * 2 > B) {
      throw new Error(
        `Hai tường tai rộng ${bTai} mm mỗi bên không nằm lọt trong bề rộng mố ` +
          `${B} mm.`
      )
    }

    const half = B / 2
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

    // Xếp từ dưới lên, mỗi cao độ suy ra từ cái dưới nó — sửa một chiều dày
    // thì cả chồng dịch theo, không có con số nào phải nhập lại.
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
    rect(
      'mo_tuong_dau',
      formatPartId({ role: 'mo_tuong_dau' }),
      { B, hDau },
      x0 - half,
      yThanDinh,
      x0 + half,
      yDauDinh
    )

    // Tường tai: hai bên, đánh số riêng để "tường tai bên trái" tìm ra đúng
    // một cái. Bên tính theo chiều lý trình tăng dần.
    if (bTai > 0 && hTai > 0) {
      const yTaiDay = yDauDinh - hTai
      for (const side of ['trai', 'phai']) {
        const x1 = side === 'trai' ? x0 - half : x0 + half - bTai
        rect(
          'mo_tuong_tai',
          formatPartId({ role: 'mo_tuong_tai', side }),
          { bTai, hTai },
          x1,
          yTaiDay,
          x1 + bTai,
          yDauDinh
        )
      }
    }

    ctx.line({
      role: 'duong_tim',
      partId: formatPartId({ role: 'duong_tim' }),
      start: { x: x0, y: y0 - 500, z: 0 },
      end: { x: x0, y: yDauDinh + 500, z: 0 }
    })

    if (!ghi) return

    // Kích thước: bề rộng ở dưới, rồi từng chiều cao xếp thành chuỗi bên phải,
    // và toàn bộ chiều cao ngoài cùng.
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
    dim(
      { x: right, y: yLotDinh, z: 0 },
      { x: right, y: yBeDinh, z: 0 },
      700,
      'dung'
    )
    dim(
      { x: right, y: yBeDinh, z: 0 },
      { x: right, y: yThanDinh, z: 0 },
      700,
      'dung'
    )
    dim(
      { x: right, y: yThanDinh, z: 0 },
      { x: right, y: yDauDinh, z: 0 },
      700,
      'dung'
    )
    dim({ x: right, y: y0, z: 0 }, { x: right, y: yDauDinh, z: 0 }, 2200, 'dung')
  }
}
