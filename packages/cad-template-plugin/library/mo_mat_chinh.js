const { formatPartId } = globalThis.__CAD_TEMPLATE_SDK__

/**
 * Mặt chính mố cầu hoàn chỉnh, chuyển từ bản vẽ của kỹ sư.
 *
 * Nguồn: `Phantachcaukienmo_va_dat_ten_layer.dwg` (assets/cad-sample), bản
 * "MẶT CHÍNH MỐ M1, TL 1/100". Khác với năm template cấu kiện đã có — mỗi cái
 * chỉ vẽ một bộ phận — template này dựng **cả tờ bản vẽ**: bê tông lót, bệ,
 * hai cọc khoan nhồi, tường thân, tường đầu với vai kê, hai tường tai tô đặc,
 * lớp phủ, hai lan can, tim tuyến, 19 kích thước, 9 mốc cao độ, ghi chú, ký
 * hiệu mặt cắt A-A/B-B/C-C và tiêu đề. Mỗi thứ nằm trên đúng layer kỹ sư đã
 * đặt tên, thông qua vai trò → layer của nền chuẩn hoá.
 *
 * **Toạ độ template:** x = 0 tại tim mố, y = 0 tại đáy bê tông lót. Trong
 * bản vẽ gốc điểm ấy là (314937,691; 9495,05). Mọi trị số mặc định dưới đây
 * đo trực tiếp từ file bằng libredwg, không lấy từ template nào khác.
 *
 * **Bản vẽ ghi kích thước bằng tên tham số** — HB, H1A, H1B, H3A, H3B,
 * "B mố", "B mố − 2D", "D cọc", "B cầu", "b mặt đường" — nên đây chính là bộ
 * tham số mà kỹ sư định nghĩa cho mố; template lấy đúng bộ ấy làm đầu vào.
 * Hai quy tắc đọc được từ cách đặt tên:
 *   - tim cọc cách mép bệ đúng D, tức tim–tim = B − 2D (nhãn "B mố − 2D");
 *   - bề rộng cầu = bề mặt đường + hai lan can 500, tức B − 2·bVaiKe + 1000.
 *
 * **Dốc ngang 0 %.** Bản này ghi "i=0%" ở cả hai bên tim, và đo được đỉnh
 * tường thân, đỉnh tường đầu, mặt lớp phủ đều nằm ngang (H1A = H3A = 4793,4;
 * H1B = H3B = 1811,2). Vì có hai nhãn, template nhận **hai** độ dốc — nửa
 * trái và nửa phải, mỗi bên tính từ tim ra mép — nên vừa dựng được dốc hai
 * mái của đoạn thẳng, vừa dựng được siêu cao một mái (hai trị số trái dấu).
 * Độ dốc áp cho mọi mặt từ đỉnh tường thân trở lên; đáy và đỉnh bệ phẳng.
 *
 * **Lan can ngồi trên vai kê.** Đo trên bản vẽ: khấc ở chân biên dạng lan can
 * (dx 150→500, dy 542,9→550,0) trùng khít đường vai kê từ góc ngoài
 * (±3850; 8697,5) vào góc trong (±3500; 8704,6). Nên chân lan can đặt ở
 * góc ngoài vai kê trừ 542,937, và khấc được tính lại theo hai góc ấy khi
 * đổi độ dốc — lan can luôn ôm đúng vai kê. Biên dạng và lan can thép chép
 * từ cùng block `A$C6EA20CD3` mà template tường phòng hộ đã dùng.
 *
 * **Màu.** Layer của bản vẽ này gần như toàn xám (ACI 8), lan can trắng (7);
 * màu phân biệt nằm ở từng nét: tim tuyến đỏ (1), năm dòng ghi chú xanh lá
 * (3), tam giác mốc cao độ vàng (2), và lan can thép theo layer trong block —
 * biên dạng lam (4), thanh và bu lông vàng (2), trụ lam (4), ống thoát nước
 * xám nhạt (9). Màu layer do nền chuẩn hoá cấp khi tạo layer; template chỉ
 * đặt màu ở đúng những nét mà bản vẽ gốc cho khác màu layer.
 *
 * **Kích thước, kiểu nét, đường dẫn** (1.2.0) theo đúng bản vẽ: kích thước
 * dùng kiểu D100 của kỹ sư (chữ 150 xanh lá trên đường, mũi tên 130, số
 * nguyên); tim tuyến nét CENTER, đầu cọc ngàm nét DASHED, tim cọc DASHDOT;
 * đường dẫn ghi chú có mũi tên ở điểm đầu như LEADER trong file; nhãn mốc
 * cao độ trắng (ATTRIB trên layer 0); tiêu đề gạch chân (%%U).
 *
 * Những gì bản vẽ có mà template vẽ khác đi, nói rõ ở đây:
 *   - cung tròn ở mặt vát và mặt ngoài lan can (bulge 0,11) vẽ thẳng, như
 *     template tường phòng hộ;
 *   - nét lượn "còn tiếp" của cọc bằng spline vẽ bằng đường gấp khúc, như
 *     template cọc;
 *   - chữ TCVN3 trong file ("Tim cÇu") ghi lại bằng Unicode.
 *
 * TCVN 11823-11:2017 không cho trị số kích thước nào với mố bê tông thường;
 * dải của các kích thước mố chỉ chặn sai số nhập liệu. Cọc theo
 * TCVN 11823-10:2017 điều 8.1.2, lan can theo TCVN 11823-13:2017 điều 7.3.2.1,
 * dốc ngang theo TCVN 4054:2005 Bảng 9 và TCVN 13592:2022 Bảng 12.
 */
export default {
  meta: {
    id: 'mo_mat_chinh',
    version: '1.2.0',
    name: 'Mố cầu — mặt chính hoàn chỉnh (bản vẽ M1)',
    category: 'Mố trụ',
    description:
      'Cả tờ mặt chính mố M1 chuyển từ bản vẽ Phantachcaukienmo_va_dat_ten_layer ' +
      'của kỹ sư: bê tông lót, bệ, hai cọc khoan nhồi, tường thân, tường đầu ' +
      'với vai kê, hai tường tai, lớp phủ, hai lan can, tim tuyến, kích thước, ' +
      'mốc cao độ, ghi chú, ký hiệu mặt cắt và tiêu đề. Tham số là đúng các tên ' +
      'kỹ sư ghi trên kích thước (HB, H1A, H1B, B mố, D cọc); cọc tim–tim = ' +
      'B − 2D. Độ dốc ngang nhận hai trị số trái/phải, bản vẽ mẫu 0 %. Gốc x ' +
      'tại tim, y tại đáy bê tông lót. Kích thước mố do tính toán quyết định — ' +
      'TCVN 11823-11:2017 không quy định.'
  },
  params: [
    {
      key: 'B',
      label: 'Bề rộng mố (B mố)',
      type: 'number',
      unit: 'mm',
      min: 2000,
      max: 30000,
      default: 7700,
      group: 'Kích thước chính',
      hint:
        'Chung cho bệ, tường thân và tường đầu; bê tông lót rộng thêm 100 mỗi ' +
        'bên. Bản vẽ: 7700. Không do tiêu chuẩn quy định; dải chỉ chặn sai số ' +
        'nhập liệu.'
    },
    {
      key: 'hLot',
      label: 'Chiều dày bê tông lót',
      type: 'number',
      unit: 'mm',
      min: 50,
      max: 500,
      default: 100,
      group: 'Kích thước chính',
      hint: 'Bản vẽ: 100, ghi chú "BÊ TÔNG ĐỆM C8". Dải chỉ chặn sai số nhập liệu.'
    },
    {
      key: 'hBe',
      label: 'Chiều cao bệ (HB)',
      type: 'number',
      unit: 'mm',
      min: 500,
      max: 6000,
      default: 2000,
      group: 'Kích thước chính',
      hint: 'Bản vẽ: 2000, nhãn HB. Do tính toán quyết định.'
    },
    {
      key: 'hThan',
      label: 'Chiều cao tường thân tại tim (H1A)',
      type: 'number',
      unit: 'mm',
      min: 500,
      max: 15000,
      default: 4793.4,
      group: 'Kích thước chính',
      hint:
        'Từ đỉnh bệ tới đỉnh tường thân tại tim. Bản vẽ: 4793,4 (nhãn H1A; ' +
        'H3A ở mép phải bằng đúng thế vì dốc ngang 0 %). Do tính toán quyết định.'
    },
    {
      key: 'hDau',
      label: 'Chiều cao tường đầu tại tim (H1B)',
      type: 'number',
      unit: 'mm',
      min: 300,
      max: 6000,
      default: 1811.2,
      group: 'Kích thước chính',
      hint:
        'Từ đỉnh tường thân tới mặt trên tường đầu giữa hai vai kê. Bản vẽ: ' +
        '1811,2 (nhãn H1B). Do tính toán quyết định.'
    },
    {
      key: 'bVaiKe',
      label: 'Bề rộng vai kê mỗi bên',
      type: 'number',
      unit: 'mm',
      min: 0,
      max: 2000,
      default: 350,
      group: 'Kích thước chính',
      hint:
        'Bản vẽ: 350. Quyết định bề rộng mặt đường (B − 2·bVaiKe = 7000, nhãn ' +
        '"b mặt đường") và vị trí lan can, vì lan can ngồi trên vai kê. Vai kê ' +
        'hạ 7,08 ở góc ngoài, bằng đúng khấc ở chân lan can.'
    },
    {
      key: 'tLopPhu',
      label: 'Chiều dày lớp phủ',
      type: 'number',
      unit: 'mm',
      min: 0,
      max: 500,
      default: 70,
      group: 'Kích thước chính',
      hint: 'Bản vẽ: 70, layer mặt đường BTN.'
    },
    {
      key: 'D',
      label: 'Đường kính cọc khoan nhồi (D cọc)',
      type: 'number',
      unit: 'mm',
      min: 600,
      max: 3000,
      default: 1200,
      group: 'Cọc',
      hint:
        'Bản vẽ: 1200. Tim cọc cách mép bệ đúng D (nhãn "B mố − 2D" = 5300), ' +
        'nên mặt bên cọc cách mép bệ D/2 = 600 ≥ 300 mm theo TCVN 11823-10:2017 ' +
        'điều 8.1.2. Đầu cọc ngàm 150 vào bệ, vẽ 1000 dưới đáy bệ tới nét lượn.'
    },
    {
      key: 'hLC',
      label: 'Chiều cao tường phòng hộ',
      type: 'number',
      unit: 'mm',
      min: 685,
      max: 2000,
      default: 1090,
      group: 'Lan can',
      hint:
        'Phần bê tông, đo từ chân biên dạng; lan can thép cao thêm 600. Bản vẽ: ' +
        '1090. Tối thiểu theo cấp thử nghiệm: TL-3 685, TL-4 810, TL-5 1070 mm — ' +
        'TCVN 11823-13:2017 điều 7.3.2.1.'
    },
    {
      key: 'iTrai',
      label: 'Độ dốc ngang nửa trái',
      type: 'number',
      unit: '%',
      min: -8,
      max: 8,
      default: 0,
      group: 'Độ dốc ngang',
      hint:
        'Từ tim ra mép trái; dương là dốc xuống về phía mép. Bản vẽ ghi i=0%. ' +
        'Mặt bê tông nhựa 1,5–2,0 % theo TCVN 4054:2005 Bảng 9, 1,5–2,5 % theo ' +
        'TCVN 13592:2022 Bảng 12; siêu cao tối đa 8 % theo TCVN 4054:2005 điều 5.6.'
    },
    {
      key: 'iPhai',
      label: 'Độ dốc ngang nửa phải',
      type: 'number',
      unit: '%',
      min: -8,
      max: 8,
      default: 0,
      group: 'Độ dốc ngang',
      hint:
        'Từ tim ra mép phải; dương là dốc xuống về phía mép. Dốc hai mái: hai ' +
        'trị số cùng dấu; siêu cao một mái: hai trị số trái dấu. Cùng nguồn với ' +
        'nửa trái — TCVN 4054:2005 Bảng 9, TCVN 13592:2022 Bảng 12.'
    },
    {
      key: 'ghi',
      label: 'Kích thước và ghi chú',
      type: 'choice',
      choices: [
        { value: 'du', label: 'Đủ như bản vẽ, kích thước in trị số' },
        { value: 'ten', label: 'Đủ như bản vẽ, kích thước in tên tham số (HB, H1A…)' },
        { value: 'kt', label: 'Chỉ kích thước' },
        { value: 'khong', label: 'Chỉ hình' }
      ],
      default: 'du',
      group: 'Thể hiện',
      hint:
        '19 kích thước, 9 mốc cao độ, ghi chú, ký hiệu mặt cắt và tiêu đề. Bản ' +
        'vẽ gốc ghi tên tham số thay cho số; mặc định in trị số để dùng được ngay.'
    },
    {
      key: 'tenMo',
      label: 'Tên mố trên tiêu đề',
      type: 'text',
      default: 'M1',
      group: 'Thể hiện',
      hint: 'Tiêu đề in "MẶT CHÍNH MỐ <tên>". Bản vẽ: M1.'
    },
    {
      key: 'caoDo',
      label: 'Cao độ đáy bê tông lót',
      type: 'text',
      default: '',
      group: 'Thể hiện',
      hint:
        'Đơn vị m, ví dụ 12.345. Có thì 9 mốc cao độ in trị số thật (đáy bệ, ' +
        'đỉnh bệ, đỉnh tường thân, mặt đường, đỉnh lan can); để trống thì giữ ' +
        'nhãn EL1…EL6, FE, FG của bản vẽ gốc.'
    },
    {
      key: 'x',
      label: 'Vị trí tim mố',
      type: 'number',
      unit: 'mm',
      min: -1000000,
      max: 1000000,
      default: 0,
      group: 'Vị trí',
      hint: 'Trục đối xứng. Bản vẽ gốc: 314937,691.'
    },
    {
      key: 'y',
      label: 'Cao độ đáy bê tông lót',
      type: 'number',
      unit: 'mm',
      min: -1000000,
      max: 1000000,
      default: 0,
      group: 'Vị trí',
      hint: 'Mặt dưới cùng của cả mố. Bản vẽ gốc: 9495,05.'
    }
  ],

  generate(ctx, values) {
    const num = (key, fallback) => {
      const raw = values[key]
      const value = typeof raw === 'string' ? Number(raw) : raw
      return typeof value === 'number' && Number.isFinite(value) ? value : fallback
    }
    const chon = (key, fallback) =>
      values[key] === undefined || values[key] === '' ? fallback : String(values[key])

    const B = num('B', 7700)
    const hLot = num('hLot', 100)
    const hBe = num('hBe', 2000)
    const hThan = num('hThan', 4793.4)
    const hDau = num('hDau', 1811.2)
    const bVaiKe = num('bVaiKe', 350)
    const tLopPhu = num('tLopPhu', 70)
    const D = num('D', 1200)
    const hLanCan = num('hLC', 1090)
    const docTrai = num('iTrai', 0)
    const docPhai = num('iPhai', 0)
    const x0 = num('x', 0)
    const y0 = num('y', 0)
    const cheDoGhi = chon('ghi', 'du')
    const ghiKT = cheDoGhi !== 'khong'
    const nhanTen = cheDoGhi === 'ten'
    const ghiChu = cheDoGhi === 'du' || cheDoGhi === 'ten'
    const tenMo = chon('tenMo', 'M1')
    const caoDoGoc = (() => {
      const raw = values.caoDo
      if (raw === undefined || raw === null || String(raw).trim() === '') return null
      const v = Number(String(raw).replace(',', '.'))
      return Number.isFinite(v) ? v : null
    })()

    // Trị số thuần thể hiện, lấy nguyên từ bản vẽ. Không làm tham số vì bản
    // ghi lời gọi của một lượt dựng phải gọn trong một chuỗi XData 255 ký
    // tự, và 16 tham số trên đã dùng gần hết chỗ ấy.
    const phuLot = 100 // bê tông lót nhô mỗi bên
    const hVaiKe = 7.081 // góc ngoài vai kê thấp hơn góc trong, = khấc lan can
    const bTai = 150 // tường tai
    const hTai = 1200
    const Lcoc = 1000 // phần cọc vẽ dưới đáy bệ, tới nét lượn
    const nganm = 150 // đầu cọc ngàm vào bệ
    const lech = 2500 // tim giai đoạn hoàn thiện lệch phải so với tim gđ1

    if (2 * bVaiKe >= B) {
      throw new Error(
        `Hai vai kê ${2 * bVaiKe} mm không nhỏ hơn bề rộng mố ${B} mm nên không còn mặt đường.`
      )
    }
    if (B - 2 * D < D) {
      throw new Error(
        `Tim–tim cọc B − 2D = ${B - 2 * D} mm nhỏ hơn đường kính ${D} mm nên hai cọc chồng nhau.`
      )
    }

    // --- Hệ toạ độ và các mặt -------------------------------------------
    //
    // Toạ độ cục bộ: dx từ tim, dy từ đáy bê tông lót. `pt` mới dời sang thế
    // giới, nên mọi số đo trong file đọc được ngay từ mã.
    const pt = (dx, dy) => ({ x: x0 + dx, y: y0 + dy, z: 0 })
    const half = B / 2
    const w = half - bVaiKe // hoành độ chân mặt vát lan can = mép mặt đường
    const yBeDinh = hLot + hBe
    const yThanTim = yBeDinh + hThan
    const yDauTim = yThanTim + hDau
    /** Cao độ một mặt nghiêng tại dx, biết cao độ của nó tại tim. */
    const mat = (yTim, dx) => yTim - (Math.abs(dx) * (dx < 0 ? docTrai : docPhai)) / 100
    const dinhThan = dx => mat(yThanTim, dx)
    const dinhDau = dx => mat(yDauTim, dx)
    const matDuong = dx => dinhDau(dx) + tLopPhu
    /** Góc ngoài vai kê ở mép `dir`, thấp hơn mặt trên tường đầu tại mép. */
    const gocNgoaiVaiKe = dir => dinhDau(dir * half) - hVaiKe
    /** Chân biên dạng lan can: khấc 542,937 dưới góc ngoài vai kê (đo từ block). */
    const KHAC = 542.937
    const chanLanCan = dir => gocNgoaiVaiKe(dir) - KHAC
    const dinhLanCanThep = dir => chanLanCan(dir) + hLanCan + 600
    const bMatDuong = B - 2 * bVaiKe
    const bCau = bMatDuong + 1000
    const khoangCoc = B - 2 * D

    // --- Bê tông lót và bệ ------------------------------------------------
    ctx.polyline({
      role: 'mo_be_tong_lot',
      partId: formatPartId({ role: 'mo_be_tong_lot' }),
      params: { hLot, phuLot, beRong: B + 2 * phuLot },
      closed: true,
      points: [
        pt(-half - phuLot, 0),
        pt(half + phuLot, 0),
        pt(half + phuLot, hLot),
        pt(-half - phuLot, hLot)
      ]
    })
    ctx.polyline({
      role: 'mo_be',
      partId: formatPartId({ role: 'mo_be' }),
      params: { B, hBe },
      closed: true,
      points: [pt(-half, hLot), pt(-half, yBeDinh), pt(half, yBeDinh), pt(half, hLot)]
    })

    // --- Cọc khoan nhồi ---------------------------------------------------
    //
    // Chép từ block `A$C76AA27A5`: hai nét bao ⌀D, sáu nét ký hiệu vật liệu
    // ở 0,22/0,58/0,82 bán kính (132/348/492 trên cọc ⌀1200), đầu cọc ngàm
    // vào bệ, nét tim, nét lượn "còn tiếp".
    const GACH = [0.22, 0.58, 0.82]
    const cocX = [-(half - D), half - D]
    cocX.forEach((cx, i) => {
      const r = D / 2
      const yT = hLot
      const cocId = formatPartId({ role: 'coc_khoan_nhoi', ordinal: i + 1 })
      const params = { D, khoangCach: khoangCoc, tyLeTimD: Math.round((khoangCoc / D) * 100) / 100 }
      for (const dir of [-1, 1]) {
        ctx.line({
          role: 'coc_khoan_nhoi',
          partId: cocId,
          params,
          start: pt(cx + dir * r, yT),
          end: pt(cx + dir * r, yT - Lcoc)
        })
      }
      if (nganm > 0) {
        ctx.polyline({
          role: 'coc_khoan_nhoi',
          partId: cocId,
          params: { nganm },
          lineType: 'DASHED', // block: nét khuất trong bệ
          closed: false,
          points: [pt(cx - r, yT), pt(cx - r, yT + nganm), pt(cx + r, yT + nganm), pt(cx + r, yT)]
        })
      }
      for (const t of GACH) {
        for (const dir of [-1, 1]) {
          ctx.line({
            role: 'coc_khoan_nhoi',
            partId: cocId,
            start: pt(cx + dir * t * r, yT),
            end: pt(cx + dir * t * r, yT - Lcoc * 0.94)
          })
        }
      }
      ctx.line({
        role: 'duong_tim',
        partId: formatPartId({ role: 'duong_tim', ordinal: i + 2 }),
        lineType: 'DASHDOT', // block: nét tim cọc
        start: pt(cx, yT + nganm),
        end: pt(cx, yT - Lcoc * 0.94)
      })
      const bien = D * 0.05
      const buoc = D / 6
      const luon = []
      for (let k = 0; k <= 6; k++) {
        luon.push(pt(cx - r + k * buoc, yT - Lcoc + (k % 2 === 0 ? -bien : bien)))
      }
      ctx.polyline({ role: 'coc_khoan_nhoi', partId: cocId, closed: false, points: luon })
    })

    // --- Tường thân, tường đầu, tường tai, lớp phủ ------------------------
    //
    // Đỉnh tường thân có đỉnh tại tim để dốc hai mái gãy đúng chỗ; với 0 %
    // đỉnh ấy thẳng hàng và chỉ là một đỉnh thừa của polyline.
    ctx.polyline({
      role: 'mo_tuong_than',
      partId: formatPartId({ role: 'mo_tuong_than' }),
      params: { B, hThan, iTrai: docTrai, iPhai: docPhai },
      closed: true,
      points: [
        pt(-half, yBeDinh),
        pt(-half, dinhThan(-half)),
        pt(0, yThanTim),
        pt(half, dinhThan(half)),
        pt(half, yBeDinh)
      ]
    })
    ctx.polyline({
      role: 'mo_tuong_dau',
      partId: formatPartId({ role: 'mo_tuong_dau' }),
      params: { B, hDau, bVaiKe, hVaiKe },
      closed: true,
      points: [
        pt(half, dinhThan(half)),
        pt(half, gocNgoaiVaiKe(1)),
        pt(w, dinhDau(w)),
        pt(0, yDauTim),
        pt(-w, dinhDau(-w)),
        pt(-half, gocNgoaiVaiKe(-1)),
        pt(-half, dinhThan(-half))
      ]
    })
    if (bTai > 0 && hTai > 0) {
      for (const [side, dir] of [['trai', -1], ['phai', 1]]) {
        const xo = dir * half
        const xi = dir * (half - bTai)
        const goc = [
          pt(xi, dinhThan(xi)),
          pt(xi, dinhThan(xi) + hTai),
          pt(xo, dinhThan(xo) + hTai),
          pt(xo, dinhThan(xo))
        ]
        const partId = formatPartId({ role: 'mo_tuong_tai', side })
        ctx.polyline({
          role: 'mo_tuong_tai',
          partId,
          params: { bTai, hTai },
          closed: true,
          points: goc
        })
        ctx.hatch({ role: 'mo_tuong_tai', partId, boundary: goc })
      }
    }
    ctx.polyline({
      role: 'lop_phu',
      partId: formatPartId({ role: 'lop_phu' }),
      params: { tLopPhu, bMatDuong },
      closed: true,
      points: [
        pt(-w, dinhDau(-w)),
        pt(0, yDauTim),
        pt(w, dinhDau(w)),
        pt(w, matDuong(w)),
        pt(0, yDauTim + tLopPhu),
        pt(-w, matDuong(-w))
      ]
    })

    // --- Lan can hai bên --------------------------------------------------
    //
    // Biên dạng đo dx từ mép sau (phía ngoài), dy từ chân. Khấc ở chân bám
    // hai góc vai kê, nên hai điểm cuối tính từ hình chứ không chép số.
    //
    // Lan can thép chép nguyên block A$C6EA20CD3, kể cả màu: phần tử cuối
    // mỗi dòng là chỉ số ACI theo layer trong block (OUTLINE, DIM = 2 vàng;
    // TEXTHEADERTD, N2 = 4 lam; hatch = 9), 0 là theo layer lan can. Toạ độ
    // dy tính từ đỉnh tường bê tông. Cung bulge của trụ lan can lấy mẫu
    // thành đoạn thẳng.
    const LC_DOAN = [
      [145, 529, 241, 529, 0],
      [193, 532.5, 194, 443.5, 1],
      [200.8, 532.5, 200.8, 540, 2],
      [185.2, 532.5, 185.2, 540, 2],
      [200.8, 540, 185.2, 540, 2],
      [196.9, 453.7, 189.1, 453.7, 2],
      [196.9, 465.1, 196.9, 453.7, 2],
      [189.1, 465.1, 189.1, 453.7, 2],
      [200.8, 465.5, 200.8, 457.8, 2],
      [185.2, 465.5, 185.2, 457.8, 2],
      [200.8, 457.8, 185.2, 457.8, 2],
      [189.1, 532.5, 189.1, 486.3, 2],
      [196.9, 532.5, 196.9, 486.3, 2],
      [148.2, 469.4, 145.1, 485, 2],
      [217, 574.1, 218.8, 577.1, 2],
      [169, 574.1, 167.3, 577.1, 2],
      [206, 486.3, 180, 486.3, 2],
      [145, 532.5, 241, 532.5, 2],
      [175.9, 467.3, 160.8, 462.3, 2],
      [115, 20, 62.5, 20, 2],
      [62.8, 229.1, 85.3, 229.1, 2],
      [85.3, 235.1, 64.5, 235.1, 2],
      [52.5, 30, 52.5, 126, 2],
      [148.1, 233.2, 171.2, 169.7, 2],
      [141.9, 231, 165.1, 167.5, 2],
      [145, 232.1, 164.7, 178.1, 1],
      [120.5, 176.3, 117.3, 184.4, 2],
      [135.5, 177.7, 127.9, 173.6, 2],
      [157.6, 178.5, 159.7, 172.6, 2],
      [115, 20, 125, 10, 2],
      [169.9, 183, 172, 177, 2],
      [234.3, 20, 185, 20, 2],
      [260, 20, 260, 0, 4],
      [185, 20, 175, 10, 2],
      [172, 177, 159.7, 172.6, 2],
      [171.2, 169.7, 165.1, 167.5, 2],
      [167.9, 200.2, 148, 193, 2],
      [175, 10, 125, 10, 2],
      [204.7, 229.1, 211.2, 229.1, 2],
      [204.7, 235.1, 210.6, 235.1, 2],
      [151.2, 234.4, 149, 240.3, 2],
      [149, 240.3, 136.7, 235.8, 2],
      [138.9, 229.9, 136.7, 235.8, 2],
      [114.9, 257.4, 112.8, 259.2, 2],
      [151.8, 270.8, 152.3, 273.6, 2],
      [108.1, 218.7, 181.9, 245.6, 2],
      [230, 28, 230, 24, 0],
      [189.3, 28, 189.3, 24, 0],
      [186.3, 24, 233, 24, 0],
      [186.3, 20, 233, 20, 0],
      [186.3, 24, 186.3, 20, 0],
      [233, 24, 233, 20, 0],
      [227.2, 45.6, 192.2, 45.6, 2],
      [189.3, 28, 230, 28, 0],
      [192.2, 45.6, 192.2, 28, 2],
      [227.2, 45.6, 227.2, 28, 2],
      [215.5, 44.2, 215.5, 28, 0],
      [203.8, 44.2, 203.8, 28, 0],
      [199.7, 55.5, 199.7, 45.6, 2],
      [219.7, 55.5, 219.7, 45.6, 2],
      [199.7, 55.5, 219.7, 55.5, 2],
      [110.4, 28, 110.4, 24, 0],
      [69.7, 28, 69.7, 24, 0],
      [66.7, 24, 113.4, 24, 0],
      [66.7, 20, 113.4, 20, 0],
      [66.7, 24, 66.7, 20, 0],
      [113.4, 24, 113.4, 20, 0],
      [107.5, 45.6, 72.5, 45.6, 2],
      [69.7, 28, 110.4, 28, 0],
      [72.5, 45.6, 72.5, 28, 2],
      [107.5, 45.6, 107.5, 28, 2],
      [95.9, 44.2, 95.9, 28, 0],
      [84.2, 44.2, 84.2, 28, 0],
      [80, 55.5, 80, 45.6, 2],
      [100, 55.5, 100, 45.6, 2],
      [80, 55.5, 100, 55.5, 2],
      [40, 0, 260, 0, 4]
    ]
    const LC_CUNG = [
      [193, 532.5, 67.5, 202, 303, 2],
      [1852.5, 3466.1, 3447.5, 240, 241, 2],
      [127.2, 505.9, 3.5, 22, 159, 4],
      [231.4, 472.7, 3.5, 349, 123, 2],
      [193, 532.5, 48, 286, 60, 2],
      [193, 532.5, 48, 120, 254, 2],
      [193, 532.5, 67.5, 337, 163, 4],
      [1158.7, 116, 1106.2, 174, 180, 2],
      [62.5, 30, 10, 180, 270, 2],
      [62.8, 224.1, 5, 90, 174, 2],
      [64.5, 240.1, 5, 174, 270, 2],
      [145, 232.1, 55.2, 188, 352, 2],
      [1228, 272.9, 1013, 183, 194, 2],
      [145, 232.1, 39.3, 140, 274, 2],
      [145, 232.1, 39.3, 306, 80, 2],
      [752, 1947, 1880, 250, 251, 2],
      [234.3, 30, 10, 270, 14, 2],
      [210.6, 240.1, 5, 270, 2, 2],
      [211.2, 224.1, 5, 3, 90, 2],
      [204.7, 224.1, 5, 90, 172, 2],
      [85.3, 224.1, 5, 8, 90, 2],
      [204.7, 240.1, 5, 188, 270, 2],
      [85.3, 240.1, 5, 270, 352, 2],
      [145, 232.1, 55.2, 8, 172, 2],
      [1228, 272.9, 1000.5, 167, 195, 4],
      [1158.7, 116, 1106.2, 159, 174, 2],
      [1228, 272.9, 1013, 169, 182, 2],
      [221.1, 31.8, 13.8, 64, 114, 0],
      [209.5, 31.8, 13.8, 64, 114, 0],
      [197.8, 31.8, 13.8, 64, 114, 0],
      [101.5, 31.8, 13.8, 64, 114, 0],
      [89.8, 31.8, 13.8, 64, 114, 0],
      [78.2, 31.8, 13.8, 64, 114, 0]
    ]
    const LC_TRON = [
      [193, 532.5, 55, 2],
      [193, 532.5, 51.5, 2],
      [145, 232.1, 42.1, 2],
      [145, 232.1, 45, 2],
      [203.5, -362.6, 47, 9],
      [203.5, -362.6, 50, 9],
      [203.5, -362.6, 50, 9]
    ]
    const LC_TRU = [
      { c: 4, pts: [[40, 0], [40, 126.1], [46.4, 235.2], [63.3, 343.3], [90.7, 449.2], [128.4, 551.8]] }
    ]
    const rad = deg => (deg * Math.PI) / 180
    const mau = c => (c ? { color: c } : {})

    for (const [side, dir] of [['trai', -1], ['phai', 1]]) {
      const px = d => dir * (w + 500 - d)
      const yb = chanLanCan(dir)
      const HINH = [
        [500, 690],
        [300, hLanCan],
        [0, hLanCan],
        [50, 0],
        [150, 0],
        [150, KHAC],
        [500, dinhDau(dir * w) - yb]
      ]
      ctx.polyline({
        role: 'lan_can',
        partId: formatPartId({ role: 'lan_can', side }),
        params: { h: hLanCan, bCau, dieuKhoan: 'TCVN 11823-13:2017 §7.3.2.1' },
        color: 4, // block: biên dạng trên layer N2, màu lam
        closed: true,
        points: HINH.map(([d, dy]) => pt(px(d), yb + dy))
      })
      ctx.circle({
        role: 'ong_thoat_nuoc',
        partId: formatPartId({ role: 'ong_thoat_nuoc', side }),
        params: { D: 100 },
        color: 9,
        center: pt(px(203), yb + 727),
        radius: 50
      })
      const py = dy => yb + hLanCan + dy
      let n = 0
      const id = () => formatPartId({ role: 'lan_can', side, ordinal: ++n })
      for (const [x1, y1, x2, y2, c] of LC_DOAN) {
        ctx.line({ role: 'lan_can', partId: id(), ...mau(c), start: pt(px(x1), py(y1)), end: pt(px(x2), py(y2)) })
      }
      for (const [cx, cy, r, a1, a2, c] of LC_CUNG) {
        // Mép phải là ảnh gương của hình gốc (mép trái): θ → 180° − θ và hai
        // đầu cung đổi chỗ.
        const mirrored = dir === 1
        ctx.arc({
          role: 'lan_can',
          partId: id(),
          ...mau(c),
          center: pt(px(cx), py(cy)),
          radius: r,
          startAngle: mirrored ? rad(180 - a2) : rad(a1),
          endAngle: mirrored ? rad(180 - a1) : rad(a2)
        })
      }
      for (const [cx, cy, r, c] of LC_TRON) {
        ctx.circle({ role: 'lan_can', partId: id(), ...mau(c), center: pt(px(cx), py(cy)), radius: r })
      }
      for (const { c, pts } of LC_TRU) {
        ctx.polyline({
          role: 'lan_can',
          partId: id(),
          ...mau(c),
          closed: false,
          points: pts.map(([x, y]) => pt(px(x), py(y)))
        })
      }
    }

    // --- Tim tuyến --------------------------------------------------------
    const yTimTren = Math.max(dinhLanCanThep(-1), dinhLanCanThep(1)) - 196.589
    ctx.line({
      role: 'duong_tim',
      partId: formatPartId({ role: 'duong_tim', ordinal: 1 }),
      color: 1, // bản vẽ: tim tuyến đỏ trên layer xám
      lineType: 'CENTER',
      start: pt(0, 0),
      end: pt(0, yTimTren)
    })

    // --- Kích thước -------------------------------------------------------
    //
    // Vị trí đường kích thước là độ dời đo trên bản vẽ so với điểm đo, nên
    // chuỗi kích thước đi theo hình khi đổi tham số. Nhãn tên tham số chỉ in
    // khi kỹ sư chọn, vì bản vẽ gốc ghi tên thay cho số.
    if (ghiKT) {
      let n = 0
      const dim = (start, end, offset, huong, ten) =>
        ctx.dimension({
          role: 'kich_thuoc',
          partId: formatPartId({ role: 'kich_thuoc', ordinal: ++n }),
          ...(nhanTen && ten ? { params: { ten } } : {}),
          start,
          end,
          offset,
          huong,
          ...(nhanTen && ten ? { text: ten } : {})
        })

      // Chuỗi trên đỉnh: 500 | b mặt đường | 500, rồi B cầu.
      const yLcT = chanLanCan(-1) + hLanCan
      const yLcP = chanLanCan(1) + hLanCan
      const yChanVatT = chanLanCan(-1) + 690
      const yChanVatP = chanLanCan(1) + 690
      const yChuoiTren = Math.max(yLcT, yLcP) + 1226.575
      dim(pt(-w - 500, yLcT), pt(-w, yChanVatT), yChuoiTren - Math.max(yLcT, yChanVatT), 'ngang')
      dim(pt(-w, yChanVatT), pt(w, yChanVatP), yChuoiTren - Math.max(yChanVatT, yChanVatP), 'ngang', 'b mặt đường')
      dim(pt(w, yChanVatP), pt(w + 500, yLcP), yChuoiTren - Math.max(yLcP, yChanVatP), 'ngang')
      const yBCau = yChuoiTren + 450
      dim(pt(-w - 500, yLcT), pt(w + 500, yLcP), yBCau - Math.max(yLcT, yLcP), 'ngang', 'B cầu')

      // Chuỗi đứng mép trái và mép phải: bê tông lót, bệ.
      dim(pt(-half, 0), pt(-half, hLot), -1664.723, 'dung')
      dim(pt(-half, hLot), pt(-half, yBeDinh), -1664.723, 'dung', 'HB')
      dim(pt(half, 0), pt(half, hLot), 1833.844, 'dung')
      dim(pt(half, hLot), pt(half, yBeDinh), 1833.844, 'dung', 'HB')
      // Mép phải, gần hơn: tường thân, tường đầu tới góc trong vai kê, lan can.
      dim(pt(half, yBeDinh), pt(half, dinhThan(half)), 1383.844, 'dung', 'H3A')
      dim(pt(half, dinhThan(half)), pt(w, dinhDau(w)), 1383.844, 'dung', 'H3B')
      dim(pt(w, dinhDau(w)), pt(w, dinhLanCanThep(1)), 1733.844, 'dung')
      dim(pt(-w, dinhDau(-w)), pt(-w, dinhLanCanThep(-1)), -1564.723, 'dung')
      // Chuỗi tại tim.
      dim(pt(0, hLot), pt(0, yBeDinh), -295.407, 'dung', 'HB')
      dim(pt(0, yBeDinh), pt(0, yThanTim), -295.407, 'dung', 'H1A')
      dim(pt(0, yThanTim), pt(0, yDauTim), -295.407, 'dung', 'H1B')
      // Chuỗi dưới đáy bệ: D cọc | B mố − 2D | D cọc, rồi B mố.
      dim(pt(-half, hLot), pt(cocX[0], hLot), -1544.835, 'ngang', 'D cọc')
      dim(pt(cocX[0], hLot), pt(cocX[1], hLot), -1544.835, 'ngang', 'B mố - 2D')
      dim(pt(cocX[1], hLot), pt(half, hLot), -1544.835, 'ngang', 'D cọc')
      dim(pt(-half, hLot), pt(half, hLot), -1994.835, 'ngang', 'B mố')
    }

    if (!ghiChu) return

    // --- Ghi chú ----------------------------------------------------------
    let nGhiChu = 0
    // Bản vẽ cho năm dòng ghi chú màu xanh lá (3), số còn lại theo layer.
    const XANH = 3
    const ghi = (dx, dy, text, height = 150, color) =>
      ctx.text({
        role: 'ghi_chu',
        partId: formatPartId({ role: 'ghi_chu', ordinal: ++nGhiChu }),
        ...(color ? { color } : {}),
        position: pt(dx, dy),
        text,
        height
      })
    // Đường dẫn như LEADER trong file: mũi tên ở điểm đầu, tức điểm được chỉ.
    const dan = (...xy) => {
      const points = []
      for (let i = 0; i + 1 < xy.length; i += 2) points.push(pt(xy[i], xy[i + 1]))
      return ctx.leader({
        role: 'ghi_chu',
        partId: formatPartId({ role: 'ghi_chu', ordinal: ++nGhiChu }),
        points
      })
    }
    const soDoc = v => `${String(Math.round(v * 100) / 100).replace('.', ',')}`
    const yMD = yDauTim + tLopPhu // mặt đường tại tim

    dan(0, yMD + 330.061, -1287.907, yMD + 330.061)
    ghi(-1196.26, yMD + 415.284, 'Tim cầu')
    ghi(-1021.496, yMD + 91.896, 'gđ1')
    dan(-2608.763, yMD + 132.981, -1985.034, yMD + 132.981)
    ghi(-2407.876, yMD + 205.325, `i=${soDoc(docTrai)}%`, 150, XANH)
    dan(1161.598, yMD + 232.543, 1785.328, yMD + 232.543)
    ghi(1362.486, yMD + 304.886, `i=${soDoc(docPhai)}%`, 150, XANH)
    dan(lech, yMD + 636.644, lech - 1287.907, yMD + 636.644)
    ghi(lech - 2251.321, yMD + 721.867, 'Tim giai đoạn hoàn thiện')

    dan(450.561, 39.957, 913.18, 781.347, 2865.011, 781.347)
    ghi(964.909, 839.152, 'BÊ TÔNG ĐỆM C8', 150, XANH)

    const yDan = hLot - 552.677
    const xChu = cocX[1] + 1063.659
    dan(cocX[0] + D / 2, yDan, xChu + 990.35, yDan)
    dan(cocX[1] + D / 2, yDan, xChu + 1857.264, yDan)
    ghi(xChu, hLot - 503.765, 'CỌC KHOAN NHỒI', 150, XANH)
    ghi(xChu + 450.56, hLot - 803.581, `D${D} (M)`, 150, XANH)

    if (ghiKT) {
      const yLcT = chanLanCan(-1) + hLanCan
      const yLcP = chanLanCan(1) + hLanCan
      const yBCau = Math.max(yLcT, yLcP) + 1226.575 + 450
      dan(-w - 500 - 1769.528, yBCau, -w - 500, yBCau)
      ghi(-w - 500 - 1511.772, yBCau + 105.543, 'PHẢI TUYẾN')
      dan(w + 500 + 1769.528, yBCau, w + 500, yBCau)
      ghi(w + 500 + 238.412, yBCau + 105.543, 'TRÁI TUYẾN')
      ctx.text({
        role: 'tieu_de_ban_ve',
        partId: formatPartId({ role: 'tieu_de_ban_ve', ordinal: 1 }),
        params: { tenMo },
        position: pt(-1777.963, yBCau + 685.031),
        text: `%%UMẶT CHÍNH MỐ ${tenMo}`, // %%U: gạch chân như bản vẽ
        height: 250
      })
      ctx.text({
        role: 'tieu_de_ban_ve',
        partId: formatPartId({ role: 'tieu_de_ban_ve', ordinal: 2 }),
        position: pt(-622.57, yBCau + 334.221),
        text: '(TL: 1/100)',
        height: 150
      })
    }

    // Hai yêu cầu phát sinh của TCVN 11823-10:2017 §8.1.2, in như template cọc.
    const notes = []
    if (khoangCoc < 4 * D) {
      notes.push(`Tim-tim ${Math.round(khoangCoc)} mm < 4D (${4 * D} mm): phai danh gia anh huong tuong tac giua cac coc lien ke - TCVN 11823-10:2017 §8.1.2`)
    }
    if (khoangCoc < 6 * D) {
      notes.push(`Tim-tim ${Math.round(khoangCoc)} mm < 6D (${6 * D} mm): trinh tu khoan coc phai duoc neu ro trong ho so thiet ke - TCVN 11823-10:2017 §8.1.2`)
    }
    notes.forEach((line, index) => ghi(-half, hLot - Lcoc - 400 - index * 320, line, 200))

    // --- Mốc cao độ -------------------------------------------------------
    //
    // Block `cd11` tỉ lệ 0,11811: tam giác ngược đỉnh chạm mặt, đáy 120 rộng
    // 157,5 cao, vạch ngang 212,6, chữ cao 177. `huong` = −1 là block soi
    // gương (chữ sang trái).
    let nMoc = 0
    const moc = (dx, dy, nhan, huong, caoDo) => {
      const partId = formatPartId({ role: 'ghi_chu_cao_do', ordinal: ++nMoc })
      const text = caoDoGoc === null ? nhan : `${caoDo >= 0 ? '+' : ''}${caoDo.toFixed(3)}`
      const params = { nhan, ...(caoDoGoc === null ? {} : { caoDo: Math.round(caoDo * 1000) / 1000 }) }
      // Block cd11 vẽ tam giác và vạch màu vàng (2), chữ theo layer.
      ctx.polyline({
        role: 'ghi_chu_cao_do',
        partId,
        params,
        color: 2,
        closed: true,
        points: [pt(dx, dy), pt(dx - 59.92, dy + 157.48), pt(dx + 59.92, dy + 157.48)]
      })
      ctx.line({
        role: 'ghi_chu_cao_do',
        partId,
        color: 2,
        start: pt(dx - 106.29, dy),
        end: pt(dx + 106.29, dy)
      })
      const rong = 0.7 * 177.165 * text.length
      ctx.text({
        role: 'ghi_chu_cao_do',
        partId,
        color: 7, // ATTRIB của block nằm trên layer 0: trắng
        position: pt(huong === 1 ? dx + 113.1 : dx - 113.1 - rong, dy + 157.48),
        text,
        height: 177.165
      })
    }
    const m = dy => (caoDoGoc ?? 0) + dy / 1000
    moc(half + 441.7, hLot, 'EL6', 1, m(hLot))
    moc(half + 494.7, yBeDinh, 'EL5', 1, m(yBeDinh))
    moc(half + 422.4, dinhThan(half), 'EL4.L', 1, m(dinhThan(half)))
    moc(0, yThanTim, 'EL3', -1, m(yThanTim))
    moc(-half - 272.8, dinhThan(-half), 'EL4.R', -1, m(dinhThan(-half)))
    moc(0, yMD, 'FE', 1, m(yMD))
    moc(lech, matDuong(lech), 'FG', 1, m(matDuong(lech)))
    moc(w + 500 + 437.6, dinhLanCanThep(1), 'EL1.L', 1, m(dinhLanCanThep(1)))
    moc(-w - 500 - 1466.7, dinhLanCanThep(-1), 'EL1.R', -1, m(dinhLanCanThep(-1)))

    // --- Ký hiệu mặt cắt A-A (tim), B-B (mép phải), C-C (mép trái) ---------
    //
    // Layer `_33_Kyhieumatcat` của bản vẽ chưa có vai trò trong nền chuẩn
    // hoá nên truyền tường minh; vai trò `ky_hieu_mat_cat` để bổ sung sau.
    let nMC = 0
    const matCat = (ax, ay, sx, sy, chu, cx, cy) => {
      const partId = formatPartId({ role: 'ky_hieu_mat_cat', ordinal: ++nMC })
      ctx.polyline({
        role: 'ky_hieu_mat_cat',
        partId,
        layer: '_33_Kyhieumatcat',
        params: { matCat: chu },
        closed: false,
        points: [
          pt(ax, ay),
          pt(ax, ay + sy * 363.435),
          pt(ax + sx * 417.093, ay + sy * 363.435),
          pt(ax + sx * 200.755, ay + sy * 284.329),
          pt(ax + sx * 200.755, ay + sy * 492.504)
        ]
      })
      ctx.text({
        role: 'ky_hieu_mat_cat',
        partId,
        layer: '_33_Kyhieumatcat',
        position: pt(ax + cx, ay + cy),
        text: chu,
        height: 200
      })
    }
    matCat(0, yMD + 1180.461, 1, 1, 'A', 140.639, 49.948)
    matCat(0, -599.754, 1, -1, 'A', 140.639, -249.947)
    matCat(w + 500 + 828.649, yMD + 1544.88, -1, 1, 'B', -287.375, 35.593)
    matCat(w + 500 + 749.944, -1137.862, -1, -1, 'B', -329.241, -197.281)
    matCat(-w - 500 - 906.831, yMD + 1571.622, 1, 1, 'C', 82.736, 35.593)
    matCat(-w - 500 - 828.126, -1117.518, 1, -1, 'C', 124.602, -197.28)
  }
}
