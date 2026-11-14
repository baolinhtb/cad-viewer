const { formatPartId } = globalThis.__CAD_TEMPLATE_SDK__

/**
 * Trụ cầu — mặt chính (nhìn dọc tuyến, phương ngang cầu nằm ngang).
 *
 * BỐ CỤC SƠ BỘ, CHƯA ĐỐI CHIẾU BẢN VẼ VĂN PHÒNG. Khác các template mố, hình
 * này không chép từ bản vẽ của kỹ sư — repo chưa có bản vẽ trụ nào. Nó là cấu
 * tạo thông dụng của trụ cầu dầm ở Việt Nam: bệ trên cọc khoan nhồi, thân
 * tường đặc hoặc thân cột (trụ nạng chống), xà mũ có đầu hẫng vát, đá kê gối.
 * Mọi kích thước mặc định là "thông dụng, do tính toán quyết định" và được
 * nói đúng như vậy; chỉ các ràng buộc có thật trong TCVN 11823 mới mang số
 * điều khoản. Khi có bản vẽ trụ của văn phòng, template phải được đo lại
 * theo bản vẽ và nâng phiên bản.
 *
 * Cao độ xếp chồng từ dưới lên, cùng một chuỗi với `tru_mat_ben`: đáy lót y →
 * đáy bệ y + hLot → đỉnh bệ + hBe → đáy xà mũ + hThan → đỉnh xà mũ + hXaMu →
 * đỉnh đá kê + hDaKe. Hai hình chiếu dùng chung tham số, nên `tru_cau_hoan_chinh`
 * dựng cả hai bằng một lệnh.
 */

// ---- DÙNG CHUNG: giống hệt nhau trong tru_mat_chinh.js và tru_mat_ben.js ----
// Hợp đồng thư viện không cho `import`, nên phần này được chép nguyên văn vào
// cả hai tệp. `truComponents.spec.ts` so hai bản chép từng ký tự: sửa một bên
// mà quên bên kia là test đỏ.

const TU_DO =
  'Giá trị thông dụng, do tính toán quyết định; dải chỉ chặn sai số nhập liệu.'

const PARAMS = [
  // Xà mũ
  {
    key: 'bXaMu',
    label: 'Chiều dài xà mũ (ngang cầu)',
    type: 'number',
    unit: 'mm',
    min: 3000,
    max: 40000,
    default: 12000,
    group: 'Xà mũ',
    hint: 'Do khổ cầu và bố trí dầm quyết định. ' + TU_DO
  },
  {
    key: 'lXaMu',
    label: 'Bề rộng xà mũ (dọc cầu)',
    type: 'number',
    unit: 'mm',
    min: 1000,
    max: 6000,
    default: 2000,
    group: 'Xà mũ',
    hint:
      'Phải đủ chiều rộng đỡ dầm tối thiểu N theo TCVN 11823-4:2017 đ.7.4.4 (Phương trình 25) — skill tru-cau kiểm khi có L, H, S. Mặc định 2000 là ' +
      TU_DO
  },
  {
    key: 'hXaMu',
    label: 'Chiều cao xà mũ tại thân',
    type: 'number',
    unit: 'mm',
    min: 600,
    max: 4000,
    default: 1500,
    group: 'Xà mũ',
    hint: TU_DO
  },
  {
    key: 'hXaMuDau',
    label: 'Chiều cao đầu hẫng xà mũ',
    type: 'number',
    unit: 'mm',
    min: 300,
    max: 4000,
    default: 800,
    group: 'Xà mũ',
    hint: 'Không lớn hơn chiều cao tại thân. ' + TU_DO
  },
  {
    key: 'lHang',
    label: 'Chiều dài đoạn vát đầu hẫng',
    type: 'number',
    unit: 'mm',
    min: 0,
    max: 15000,
    default: 2000,
    group: 'Xà mũ',
    hint:
      'Đo từ đầu xà mũ vào; 0 là xà mũ chữ nhật. Phải dừng trước mép thân trụ. ' +
      TU_DO
  },
  // Gối
  {
    key: 'soGoi',
    label: 'Số gối trên một hàng',
    type: 'integer',
    min: 1,
    max: 20,
    default: 5,
    group: 'Gối',
    hint: 'Bằng số dầm. ' + TU_DO
  },
  {
    key: 'aGoi',
    label: 'Khoảng cách tim gối',
    type: 'number',
    unit: 'mm',
    min: 500,
    max: 8000,
    default: 2400,
    group: 'Gối',
    hint: TU_DO
  },
  {
    key: 'soHangGoi',
    label: 'Số hàng gối',
    type: 'integer',
    min: 1,
    max: 2,
    default: 2,
    group: 'Gối',
    hint: '2 cho trụ giữa hai nhịp giản đơn, 1 cho nhịp liên tục. ' + TU_DO
  },
  {
    key: 'eGoi',
    label: 'Tim hàng gối đến tim trụ (dọc cầu)',
    type: 'number',
    unit: 'mm',
    min: 0,
    max: 3000,
    default: 500,
    group: 'Gối',
    hint: 'Chỉ dùng khi có 2 hàng gối. ' + TU_DO
  },
  {
    key: 'bDaKe',
    label: 'Đá kê gối — ngang cầu',
    type: 'number',
    unit: 'mm',
    min: 200,
    max: 2000,
    default: 800,
    group: 'Gối',
    hint: TU_DO
  },
  {
    key: 'lDaKe',
    label: 'Đá kê gối — dọc cầu',
    type: 'number',
    unit: 'mm',
    min: 200,
    max: 2000,
    default: 600,
    group: 'Gối',
    hint: TU_DO
  },
  {
    key: 'hDaKe',
    label: 'Đá kê gối — chiều cao',
    type: 'number',
    unit: 'mm',
    min: 50,
    max: 600,
    default: 200,
    group: 'Gối',
    hint: TU_DO
  },
  // Thân trụ
  {
    key: 'loaiThan',
    label: 'Dạng thân trụ',
    type: 'choice',
    choices: [
      { value: 'tuong', label: 'Thân tường đặc' },
      { value: 'cot', label: 'Thân cột (trụ nạng chống)' }
    ],
    default: 'tuong',
    group: 'Thân trụ',
    hint: 'Hai dạng trụ được TCVN 11823-11:2017 đ.3.5 định nghĩa; kích thước do tính toán quyết định.'
  },
  {
    key: 'bThan',
    label: 'Bề rộng thân tường (ngang cầu)',
    type: 'number',
    unit: 'mm',
    min: 1000,
    max: 30000,
    default: 6000,
    group: 'Thân trụ',
    hint: 'Dùng khi thân tường. ' + TU_DO
  },
  {
    key: 'tThan',
    label: 'Chiều dày thân tường (dọc cầu)',
    type: 'number',
    unit: 'mm',
    min: 500,
    max: 5000,
    default: 1400,
    group: 'Thân trụ',
    hint: 'Dùng khi thân tường. ' + TU_DO
  },
  {
    key: 'soCot',
    label: 'Số cột',
    type: 'integer',
    min: 1,
    max: 6,
    default: 2,
    group: 'Thân trụ',
    hint: 'Dùng khi thân cột. ' + TU_DO
  },
  {
    key: 'dCot',
    label: 'Đường kính / cạnh cột',
    type: 'number',
    unit: 'mm',
    min: 500,
    max: 4000,
    default: 1200,
    group: 'Thân trụ',
    hint: 'Dùng khi thân cột. ' + TU_DO
  },
  {
    key: 'aCot',
    label: 'Tim cột – tim cột',
    type: 'number',
    unit: 'mm',
    min: 1000,
    max: 25000,
    default: 6000,
    group: 'Thân trụ',
    hint: 'Dùng khi thân cột. ' + TU_DO
  },
  {
    key: 'hThan',
    label: 'Chiều cao thân (đỉnh bệ → đáy xà mũ)',
    type: 'number',
    unit: 'mm',
    min: 500,
    max: 50000,
    default: 6000,
    group: 'Thân trụ',
    hint: TU_DO
  },
  // Bệ
  {
    key: 'bBe',
    label: 'Bệ — ngang cầu',
    type: 'number',
    unit: 'mm',
    min: 2000,
    max: 40000,
    default: 9500,
    group: 'Bệ',
    hint: 'Mặt bên cọc đến mép bệ không nhỏ hơn 300 mm — TCVN 11823-10:2017 đ.8.1.2; kiểm khi dựng.'
  },
  {
    key: 'lBe',
    label: 'Bệ — dọc cầu',
    type: 'number',
    unit: 'mm',
    min: 2000,
    max: 30000,
    default: 6000,
    group: 'Bệ',
    hint: 'Mặt bên cọc đến mép bệ không nhỏ hơn 300 mm — TCVN 11823-10:2017 đ.8.1.2; kiểm khi dựng.'
  },
  {
    key: 'hBe',
    label: 'Chiều cao bệ',
    type: 'number',
    unit: 'mm',
    min: 500,
    max: 6000,
    default: 2000,
    group: 'Bệ',
    hint: TU_DO
  },
  {
    key: 'hLot',
    label: 'Chiều dày bê tông lót',
    type: 'number',
    unit: 'mm',
    min: 50,
    max: 300,
    default: 100,
    group: 'Bệ',
    hint: 'Lớp tạo phẳng, không chịu lực. ' + TU_DO
  },
  {
    key: 'phuLot',
    label: 'Bê tông lót phủ ra mỗi bên',
    type: 'number',
    unit: 'mm',
    min: 0,
    max: 500,
    default: 100,
    group: 'Bệ',
    hint: TU_DO
  },
  // Cọc
  {
    key: 'D',
    label: 'Đường kính cọc khoan nhồi',
    type: 'number',
    unit: 'mm',
    min: 600,
    max: 3000,
    default: 1200,
    group: 'Cọc',
    hint: 'TCVN 11823-10:2017 đ.8.1.3: nếu hố khoan được kiểm tra bằng thủ công thì đường kính không nhỏ hơn 750 mm. Mặc định 1200 là cỡ thông dụng, không phải trị số của tiêu chuẩn.'
  },
  {
    key: 'soCocNgang',
    label: 'Số cọc theo ngang cầu',
    type: 'integer',
    min: 1,
    max: 12,
    default: 3,
    group: 'Cọc',
    hint: TU_DO
  },
  {
    key: 'soCocDoc',
    label: 'Số cọc theo dọc cầu',
    type: 'integer',
    min: 1,
    max: 8,
    default: 2,
    group: 'Cọc',
    hint: TU_DO
  },
  {
    key: 'aCocNgang',
    label: 'Tim–tim cọc theo ngang cầu',
    type: 'number',
    unit: 'mm',
    min: 1000,
    max: 15000,
    default: 3600,
    group: 'Cọc',
    hint: 'TCVN 11823-10:2017 đ.8.1.2: dưới 4D (khoan không ống vách) phải đánh giá ảnh hưởng tương tác giữa các cọc; dưới 6D phải nêu trình tự khoan trong hồ sơ. Ghi chú in ngay trên bản vẽ.'
  },
  {
    key: 'aCocDoc',
    label: 'Tim–tim cọc theo dọc cầu',
    type: 'number',
    unit: 'mm',
    min: 1000,
    max: 15000,
    default: 3600,
    group: 'Cọc',
    hint: 'TCVN 11823-10:2017 đ.8.1.2: dưới 4D (khoan không ống vách) phải đánh giá ảnh hưởng tương tác giữa các cọc; dưới 6D phải nêu trình tự khoan trong hồ sơ. Ghi chú in ngay trên bản vẽ.'
  },
  {
    key: 'lCoc',
    label: 'Chiều dài cọc thể hiện',
    type: 'number',
    unit: 'mm',
    min: 0,
    max: 80000,
    default: 0,
    group: 'Cọc',
    hint: '0 = chưa biết: vẽ đoạn cọc 2500 mm có nét lượn "còn tiếp", không đoán chiều dài.'
  },
  // Vị trí, thể hiện
  {
    key: 'x',
    label: 'Vị trí tim trụ',
    type: 'number',
    unit: 'mm',
    min: -1e7,
    max: 1e7,
    default: 0,
    group: 'Vị trí',
    hint: 'Hoành độ tim trụ trên hình chiếu này. Chỉ chặn sai số nhập liệu.'
  },
  {
    key: 'y',
    label: 'Cao độ đáy bê tông lót',
    type: 'number',
    unit: 'mm',
    min: -1e7,
    max: 1e7,
    default: 0,
    group: 'Vị trí',
    hint: 'Đỉnh bệ = y + hLot + hBe; đáy xà mũ = đỉnh bệ + hThan. Chỉ chặn sai số nhập liệu.'
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
    hint: 'Tắt khi ghép vào bản vẽ đã có chuỗi kích thước riêng.'
  }
]

/** Giá trị đã chuẩn hoá: số thành số, thiếu thì lấy mặc định. */
function doc(values) {
  const v = {}
  for (const p of PARAMS) {
    const raw = values[p.key]
    if (p.type === 'number' || p.type === 'integer') {
      const n = typeof raw === 'string' ? Number(raw) : raw
      v[p.key] = typeof n === 'number' && Number.isFinite(n) ? n : p.default
    } else {
      v[p.key] = raw === undefined || raw === '' ? p.default : String(raw)
    }
  }
  return v
}

/** Cao độ và bề rộng dẫn xuất — một nơi duy nhất cho cả hai hình chiếu. */
function hinh(v) {
  const cot = v.loaiThan === 'cot'
  const yBeDay = v.y + v.hLot
  const yBeDinh = yBeDay + v.hBe
  const yXaDay = yBeDinh + v.hThan
  const yXaDinh = yXaDay + v.hXaMu
  return {
    cot,
    // Thân trụ chiếm bao nhiêu theo ngang cầu và theo dọc cầu.
    thanNgang: cot ? (v.soCot - 1) * v.aCot + v.dCot : v.bThan,
    thanDoc: cot ? v.dCot : v.tThan,
    yBeDay,
    yBeDinh,
    yXaDay,
    yXaDinh,
    yDaKeDinh: yXaDinh + v.hDaKe,
    // Chiều dài cọc vẽ ra: lCoc = 0 là chưa biết, vẽ đoạn ngắn "còn tiếp".
    lVe: v.lCoc > 0 ? v.lCoc : 2500
  }
}

/** Mặt bên cọc ngoài cùng đến mép bệ, theo một phương. */
function caoMepBe(beRong, soCoc, khoang, D) {
  return (beRong - (soCoc - 1) * khoang) / 2 - D / 2
}

/** Ràng buộc liên trường. Lỗi chặn vẽ; lỗi nào là điều khoản thì ghi điều khoản. */
function kiemTra(values) {
  const v = doc(values)
  const g = hinh(v)
  const loi = []
  if (v.hXaMuDau > v.hXaMu)
    loi.push(
      `Đầu hẫng xà mũ cao ${v.hXaMuDau} mm, lớn hơn chiều cao tại thân ${v.hXaMu} mm.`
    )
  if (g.thanNgang > v.bXaMu)
    loi.push(
      `Thân trụ rộng ${g.thanNgang} mm theo ngang cầu, lớn hơn xà mũ ${v.bXaMu} mm.`
    )
  if (v.lHang > (v.bXaMu - g.thanNgang) / 2)
    loi.push(
      `Đoạn vát đầu hẫng ${v.lHang} mm chạy vào tới thân trụ; tối đa ${(v.bXaMu - g.thanNgang) / 2} mm.`
    )
  if (g.thanNgang > v.bBe)
    loi.push(
      `Thân trụ rộng ${g.thanNgang} mm theo ngang cầu, lớn hơn bệ ${v.bBe} mm.`
    )
  if (g.thanDoc > v.lBe)
    loi.push(
      `Thân trụ dày ${g.thanDoc} mm theo dọc cầu, lớn hơn bệ ${v.lBe} mm.`
    )
  if (g.thanDoc > v.lXaMu)
    loi.push(
      `Thân trụ dày ${g.thanDoc} mm theo dọc cầu, lớn hơn bề rộng xà mũ ${v.lXaMu} mm.`
    )
  if (g.cot && v.soCot > 1 && v.aCot <= v.dCot)
    loi.push(
      `Tim–tim cột ${v.aCot} mm không lớn hơn cạnh cột ${v.dCot} mm: các cột chồng lên nhau.`
    )
  if ((v.soGoi - 1) * v.aGoi + v.bDaKe > v.bXaMu)
    loi.push(
      `Hàng ${v.soGoi} đá kê dài ${(v.soGoi - 1) * v.aGoi + v.bDaKe} mm, vượt chiều dài xà mũ ${v.bXaMu} mm.`
    )
  if (v.soGoi > 1 && v.aGoi <= v.bDaKe)
    loi.push(
      `Tim gối ${v.aGoi} mm không lớn hơn đá kê ${v.bDaKe} mm: các đá kê chồng lên nhau.`
    )
  if (v.soHangGoi === 2) {
    if (2 * v.eGoi + v.lDaKe > v.lXaMu)
      loi.push(
        `Hai hàng đá kê chiếm ${2 * v.eGoi + v.lDaKe} mm theo dọc cầu, vượt bề rộng xà mũ ${v.lXaMu} mm.`
      )
    if (2 * v.eGoi < v.lDaKe)
      loi.push(
        `Hai hàng đá kê cách tim ${v.eGoi} mm thì chồng lên nhau (đá kê ${v.lDaKe} mm).`
      )
  } else if (v.lDaKe > v.lXaMu) {
    loi.push(
      `Đá kê ${v.lDaKe} mm theo dọc cầu, vượt bề rộng xà mũ ${v.lXaMu} mm.`
    )
  }
  for (const [ten, so, khoang] of [
    ['ngang cầu', v.soCocNgang, v.aCocNgang],
    ['dọc cầu', v.soCocDoc, v.aCocDoc]
  ]) {
    if (so > 1 && khoang <= v.D)
      loi.push(
        `Tim–tim cọc theo ${ten} ${khoang} mm không lớn hơn đường kính ${v.D} mm: các cọc chồng lên nhau.`
      )
  }
  for (const [ten, beRong, so, khoang] of [
    ['ngang cầu', v.bBe, v.soCocNgang, v.aCocNgang],
    ['dọc cầu', v.lBe, v.soCocDoc, v.aCocDoc]
  ]) {
    const mep = caoMepBe(beRong, so, khoang, v.D)
    if (mep < 300)
      loi.push(
        `Theo ${ten}, mặt bên cọc ngoài cùng cách mép bệ ${Math.round(mep)} mm, dưới 300 mm — ` +
          'TCVN 11823-10:2017 đ.8.1.2. Mở rộng bệ, giảm khoảng cách hoặc đường kính cọc.'
      )
  }
  return loi
}

/** Hai yêu cầu phát sinh của TCVN 11823-10:2017 đ.8.1.2 — không cấm, nên in thành ghi chú. */
function ghiChuCoc(v) {
  const ghi = []
  for (const [ten, so, khoang] of [
    ['ngang cầu', v.soCocNgang, v.aCocNgang],
    ['dọc cầu', v.soCocDoc, v.aCocDoc]
  ]) {
    if (so < 2) continue
    if (khoang < 4 * v.D)
      ghi.push(
        `Cọc theo ${ten}: tim–tim ${khoang} mm < 4D = ${4 * v.D} mm — nếu khoan không ống vách ` +
          'phải đánh giá ảnh hưởng tương tác giữa các cọc liền kề (TCVN 11823-10:2017 đ.8.1.2).'
      )
    if (khoang < 6 * v.D)
      ghi.push(
        `Cọc theo ${ten}: tim–tim ${khoang} mm < 6D = ${6 * v.D} mm — trình tự khoan cọc phải ` +
          'được nêu rõ trong hồ sơ thiết kế (TCVN 11823-10:2017 đ.8.1.2).'
      )
  }
  return ghi
}

/** Bút vẽ dùng chung: chữ nhật, cọc, kích thước, ghi chú. */
function but(ctx) {
  let soKichThuoc = 0
  let soGhiChu = 0
  const p = (x, y) => ({ x, y, z: 0 })
  return {
    chuNhat(role, partId, params, x1, y1, x2, y2) {
      ctx.polyline({
        role,
        partId,
        ...(params ? { params } : {}),
        closed: true,
        points: [p(x1, y1), p(x2, y1), p(x2, y2), p(x1, y2)]
      })
    },
    duong(role, partId, a, b) {
      ctx.line({ role, partId, start: p(a[0], a[1]), end: p(b[0], b[1]) })
    },
    gapKhuc(role, partId, params, diem, kin) {
      ctx.polyline({
        role,
        partId,
        ...(params ? { params } : {}),
        closed: !!kin,
        points: diem.map(([x, y]) => p(x, y))
      })
    },
    /** Một cọc: hai nét bao, nét tim, nét lượn "còn tiếp" khi chưa biết chiều dài. */
    coc(thuTu, cx, yDinh, D, lVe, conTiep, params) {
      const id = formatPartId({ role: 'tru_coc_khoan_nhoi', ordinal: thuTu })
      for (const huong of [-1, 1]) {
        ctx.line({
          role: 'tru_coc_khoan_nhoi',
          partId: id,
          params,
          start: p(cx + (huong * D) / 2, yDinh),
          end: p(cx + (huong * D) / 2, yDinh - lVe)
        })
      }
      ctx.line({
        role: 'duong_tim',
        partId: formatPartId({ role: 'duong_tim', ordinal: thuTu }),
        start: p(cx, yDinh),
        end: p(cx, yDinh - lVe * 0.94)
      })
      if (conTiep) {
        const diem = []
        for (let k = 0; k <= 6; k++)
          diem.push(
            p(
              cx - D / 2 + (k * D) / 6,
              yDinh - lVe + (k % 2 ? D * 0.05 : -D * 0.05)
            )
          )
        ctx.polyline({
          role: 'tru_coc_khoan_nhoi',
          partId: id,
          closed: false,
          points: diem
        })
      } else {
        ctx.line({
          role: 'tru_coc_khoan_nhoi',
          partId: id,
          start: p(cx - D / 2, yDinh - lVe),
          end: p(cx + D / 2, yDinh - lVe)
        })
      }
    },
    kichThuoc(a, b, offset, huong) {
      ctx.dimension({
        role: 'kich_thuoc',
        partId: formatPartId({ role: 'kich_thuoc', ordinal: ++soKichThuoc }),
        start: p(a[0], a[1]),
        end: p(b[0], b[1]),
        offset,
        huong
      })
    },
    /** Chuỗi kích thước liên tiếp qua các điểm cho trước. */
    chuoi(diem, offset, huong) {
      for (let i = 1; i < diem.length; i++)
        this.kichThuoc(diem[i - 1], diem[i], offset, huong)
    },
    ghiChu(x, y, text, height) {
      ctx.text({
        role: 'ghi_chu',
        partId: formatPartId({ role: 'ghi_chu', ordinal: ++soGhiChu }),
        position: p(x, y),
        text,
        height: height ?? 200
      })
    }
  }
}
// ---- HẾT PHẦN DÙNG CHUNG ----

export default {
  meta: {
    id: 'tru_mat_chinh',
    version: '1.0.0',
    name: 'Trụ cầu — mặt chính (bố cục sơ bộ)',
    category: 'Mố trụ',
    description:
      'Bố cục sơ bộ, chưa đối chiếu bản vẽ văn phòng. Mặt chính trụ cầu ' +
      '(nhìn dọc tuyến): bê tông lót, bệ, cọc khoan nhồi theo ngang cầu, thân ' +
      'tường đặc hoặc thân cột, xà mũ có đầu hẫng vát và hàng đá kê gối, kèm ' +
      'kích thước. Dùng chung tham số với tru_mat_ben. Kích thước do tính toán ' +
      'quyết định; chỉ cự ly mặt bên cọc đến mép bệ ≥ 300 mm (TCVN ' +
      '11823-10:2017 đ.8.1.2) là ràng buộc tiêu chuẩn bị chặn.'
  },
  params: PARAMS,
  validate: kiemTra,

  generate(ctx, values) {
    const loi = kiemTra(values)
    if (loi.length) throw new Error(loi.join('\n'))
    const v = doc(values)
    const g = hinh(v)
    const b = but(ctx)
    const x0 = v.x
    const nuaBe = v.bBe / 2

    b.chuNhat(
      'tru_be_tong_lot',
      formatPartId({ role: 'tru_be_tong_lot' }),
      { hLot: v.hLot, phuLot: v.phuLot },
      x0 - nuaBe - v.phuLot,
      v.y,
      x0 + nuaBe + v.phuLot,
      g.yBeDay
    )
    b.chuNhat(
      'tru_be',
      formatPartId({ role: 'tru_be' }),
      { bBe: v.bBe, lBe: v.lBe, hBe: v.hBe },
      x0 - nuaBe,
      g.yBeDay,
      x0 + nuaBe,
      g.yBeDinh
    )

    // Cọc theo ngang cầu.
    const nhipCoc = (v.soCocNgang - 1) * v.aCocNgang
    const timCoc = []
    for (let i = 0; i < v.soCocNgang; i++) {
      const cx = x0 - nhipCoc / 2 + i * v.aCocNgang
      timCoc.push(cx)
      b.coc(i + 1, cx, g.yBeDay, v.D, g.lVe, v.lCoc === 0, {
        D: v.D,
        aCocNgang: v.aCocNgang,
        soCocNgang: v.soCocNgang,
        lCoc: v.lCoc
      })
    }

    // Thân trụ.
    const timCot = []
    if (g.cot) {
      const nhipCot = (v.soCot - 1) * v.aCot
      for (let i = 0; i < v.soCot; i++) {
        const cx = x0 - nhipCot / 2 + i * v.aCot
        timCot.push(cx)
        b.chuNhat(
          'tru_than',
          formatPartId({ role: 'tru_than', ordinal: i + 1 }),
          { loaiThan: 'cot', dCot: v.dCot, aCot: v.aCot, hThan: v.hThan },
          cx - v.dCot / 2,
          g.yBeDinh,
          cx + v.dCot / 2,
          g.yXaDay
        )
      }
    } else {
      b.chuNhat(
        'tru_than',
        formatPartId({ role: 'tru_than' }),
        { loaiThan: 'tuong', bThan: v.bThan, tThan: v.tThan, hThan: v.hThan },
        x0 - v.bThan / 2,
        g.yBeDinh,
        x0 + v.bThan / 2,
        g.yXaDay
      )
    }

    // Xà mũ: đỉnh phẳng; đáy phẳng trên thân, vát lên tới đầu hẫng.
    const nuaXa = v.bXaMu / 2
    const yDau = g.yXaDinh - v.hXaMuDau
    b.gapKhuc(
      'tru_xa_mu',
      formatPartId({ role: 'tru_xa_mu' }),
      {
        bXaMu: v.bXaMu,
        lXaMu: v.lXaMu,
        hXaMu: v.hXaMu,
        hXaMuDau: v.hXaMuDau,
        lHang: v.lHang
      },
      [
        [x0 - nuaXa, yDau],
        [x0 - nuaXa, g.yXaDinh],
        [x0 + nuaXa, g.yXaDinh],
        [x0 + nuaXa, yDau],
        [x0 + nuaXa - v.lHang, g.yXaDay],
        [x0 - nuaXa + v.lHang, g.yXaDay]
      ],
      true
    )

    // Đá kê gối: một hàng thấy được (hàng thứ hai, nếu có, nằm khuất sau).
    const nhipGoi = (v.soGoi - 1) * v.aGoi
    const timGoi = []
    for (let i = 0; i < v.soGoi; i++) {
      const cx = x0 - nhipGoi / 2 + i * v.aGoi
      timGoi.push(cx)
      b.chuNhat(
        'tru_da_ke_goi',
        formatPartId({ role: 'tru_da_ke_goi', ordinal: i + 1 }),
        { bDaKe: v.bDaKe, lDaKe: v.lDaKe, hDaKe: v.hDaKe, aGoi: v.aGoi },
        cx - v.bDaKe / 2,
        g.yXaDinh,
        cx + v.bDaKe / 2,
        g.yDaKeDinh
      )
    }

    // Tim trụ.
    b.duong(
      'duong_tim',
      formatPartId({ role: 'duong_tim' }),
      [x0, g.yBeDay - 300],
      [x0, g.yDaKeDinh + 600]
    )

    if (v.ghiKichThuoc !== 'khong') {
      const yDayCoc = g.yBeDay - g.lVe
      // Dưới: chuỗi cọc theo ngang cầu, rồi bề rộng bệ.
      b.chuoi(
        [
          [x0 - nuaBe, yDayCoc],
          ...timCoc.map(cx => [cx, yDayCoc]),
          [x0 + nuaBe, yDayCoc]
        ],
        -700,
        'ngang'
      )
      b.kichThuoc([x0 - nuaBe, yDayCoc], [x0 + nuaBe, yDayCoc], -1500, 'ngang')
      // Thân: bề rộng tường, hoặc chuỗi cột.
      if (g.cot) {
        const diem = []
        timCot.forEach(cx =>
          diem.push([cx - v.dCot / 2, g.yBeDinh], [cx + v.dCot / 2, g.yBeDinh])
        )
        b.chuoi(diem, 600, 'ngang')
      } else {
        b.kichThuoc(
          [x0 - v.bThan / 2, g.yBeDinh],
          [x0 + v.bThan / 2, g.yBeDinh],
          600,
          'ngang'
        )
      }
      // Trên: chuỗi gối, rồi chiều dài xà mũ.
      b.chuoi(
        [
          [x0 - nuaXa, g.yDaKeDinh],
          ...timGoi.map(cx => [cx, g.yDaKeDinh]),
          [x0 + nuaXa, g.yDaKeDinh]
        ],
        700,
        'ngang'
      )
      b.kichThuoc(
        [x0 - nuaXa, g.yXaDinh],
        [x0 + nuaXa, g.yXaDinh],
        v.hDaKe + 1500,
        'ngang'
      )
      // Trái: đầu hẫng và đoạn vát.
      b.kichThuoc([x0 - nuaXa, yDau], [x0 - nuaXa, g.yXaDinh], -700, 'dung')
      if (v.lHang > 0)
        b.kichThuoc(
          [x0 - nuaXa, g.yXaDay],
          [x0 - nuaXa + v.lHang, g.yXaDay],
          -600,
          'ngang'
        )
      // Phải: chuỗi cao độ từ đáy lót tới đỉnh đá kê.
      const xPhai = x0 + Math.max(nuaBe + v.phuLot, nuaXa)
      b.chuoi(
        [v.y, g.yBeDay, g.yBeDinh, g.yXaDay, g.yXaDinh, g.yDaKeDinh].map(y => [
          xPhai,
          y
        ]),
        800,
        'dung'
      )
    }

    // Ghi chú cọc (TCVN 11823-10:2017 đ.8.1.2) và lời nhắc bố cục sơ bộ, dưới hình.
    const yGhi = g.yBeDay - g.lVe - 2600
    const ghi = [
      'Bố cục sơ bộ, chưa đối chiếu bản vẽ văn phòng. Kích thước do tính toán quyết định.',
      ...(v.lCoc === 0
        ? [
            'Chiều dài cọc chưa xác định: cọc vẽ đoạn ngắn, nét lượn là "còn tiếp".'
          ]
        : []),
      ...ghiChuCoc(v)
    ]
    ghi.forEach((dong, i) =>
      b.ghiChu(x0 - Math.max(nuaBe, nuaXa), yGhi - i * 360, dong, 200)
    )
  }
}
