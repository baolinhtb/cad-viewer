const { formatPartId } = globalThis.__CAD_TEMPLATE_SDK__

/**
 * Cọc khoan nhồi dưới bệ mố, mặt chính.
 *
 * Chép từ block `A$C76AA27A5` trong `33_MO_BE.dwg` — bản vẽ cấu kiện của kỹ
 * sư. Một cọc trong bản vẽ ấy gồm đúng sáu thứ:
 *
 *   - hai nét bao thân cọc ở x = ±600, tức ⌀1200
 *   - sáu nét gạch ký hiệu vật liệu ở x = ±132, ±348, ±492
 *   - đầu cọc ngàm 150 mm vào bệ, vẽ bằng ba nét khuất
 *   - một nét tim ở giữa
 *   - một nét lượn cắt ngang chân, nghĩa là "cọc còn tiếp"
 *
 * Hai cọc, tim ở x = ±2650, tức tim–tim 5300.
 *
 * **Không có bệ.** Template cọc trước đây tự vẽ thêm một cái bệ mà bản vẽ
 * không có, và bề rộng nó tính ra đúng 7700 — trùng khít bệ của template
 * `mo_be_mong`. Chạy cả hai là ra hai đường bao chồng lên nhau trên hai layer,
 * thứ nhìn trên màn hình không thấy vì nét đè lên nét. Ở đây bệ là việc của
 * `mo_be_mong`; template này chỉ vẽ cọc.
 *
 * TCVN 11823-10:2017 điều 8.1.2 cho ba ràng buộc, và chúng **không cùng một
 * mức**: cự ly từ mặt bên cọc đến mép bệ tối thiểu 300 mm là cấm, còn tim–tim
 * dưới 4D và dưới 6D chỉ phát sinh yêu cầu chứ không cấm. Nên trị số dưới 300
 * bị từ chối, còn hai trường hợp kia vẫn dựng được và được in thành ghi chú
 * trên bản vẽ. Bản vẽ mẫu rơi vào đúng trường hợp ấy: 5300 = 4,42D.
 */
export default {
  meta: {
    id: 'mo_coc_khoan_nhoi',
    version: '1.0.0',
    name: 'Mố cầu — cọc khoan nhồi',
    category: 'Mố trụ',
    description:
      'Cọc khoan nhồi dưới bệ mố, mặt chính, chép từ block cọc trong bản vẽ ' +
      'cấu kiện 33_MO_BE.dwg: nét bao thân cọc, ký hiệu vật liệu, đầu cọc ngàm ' +
      'vào bệ vẽ nét khuất, nét tim và nét lượn "còn tiếp" ở chân. Không vẽ ' +
      'bệ — bệ là việc của template mo_be_mong, đặt y bằng cao độ đáy bệ thì ' +
      'hai cái khớp nhau. Bản vẽ mẫu: 2 cọc ⌀1200, tim ở x ±2650. Cự ly mặt ' +
      'bên cọc đến mép bệ tối thiểu 300 mm theo TCVN 11823-10:2017 điều 8.1.2.'
  },
  params: [
    {
      key: 'D',
      label: 'Đường kính cọc khoan nhồi',
      type: 'number',
      unit: 'mm',
      min: 600,
      max: 3000,
      default: 1200,
      group: 'Cọc',
      hint: 'Bản vẽ: nét bao ở x ±600, tức ⌀1200.'
    },
    {
      key: 'soCoc',
      label: 'Số cọc trên mặt cắt',
      type: 'integer',
      min: 1,
      max: 8,
      default: 2,
      group: 'Cọc',
      hint: 'Bản vẽ: 2 cọc thấy trên mặt chính.'
    },
    {
      key: 'khoangCach',
      label: 'Khoảng cách tim–tim cọc',
      type: 'number',
      unit: 'mm',
      min: 1200,
      max: 12000,
      default: 5300,
      group: 'Cọc',
      hint:
        'Bản vẽ: tim cọc ở x ±2650, tức 5300 = 4,42D. Dưới 4D và dưới 6D đều ' +
        'phát sinh yêu cầu theo TCVN 11823-10:2017 điều 8.1.2 — template dựng ' +
        'bình thường và in ghi chú, vì điều khoản không cấm.'
    },
    {
      key: 'Lcoc',
      label: 'Chiều dài cọc thể hiện dưới đáy bệ',
      type: 'number',
      unit: 'mm',
      min: 300,
      max: 40000,
      default: 1050,
      group: 'Cọc',
      hint:
        'Chỉ là đoạn vẽ trên mặt cắt, không phải chiều dài thiết kế: bản vẽ ' +
        'cắt cọc bằng nét lượn ở khoảng 1050 mm dưới đáy bệ, nghĩa là còn tiếp.'
    },
    {
      key: 'nganm',
      label: 'Chiều dài ngàm đầu cọc vào bệ',
      type: 'number',
      unit: 'mm',
      min: 0,
      max: 1500,
      default: 150,
      group: 'Cọc',
      hint:
        'Bản vẽ: 150, vẽ bằng nét khuất vì nằm trong bệ. TCVN 11823-10:2017 ' +
        '§8.1.2 chỉ yêu cầu "đủ sâu để tạo sức kháng kết cấu", không cho trị số.'
    },
    {
      key: 'beRongBe',
      label: 'Bề rộng bệ để kiểm cự ly mép',
      type: 'number',
      unit: 'mm',
      min: 1000,
      max: 40000,
      default: 7700,
      group: 'Kiểm tra',
      hint:
        'Không vẽ gì — chỉ dùng để kiểm cự ly từ mặt bên cọc ngoài cùng đến ' +
        'mép bệ, thứ TCVN cấm dưới 300 mm. Bản vẽ mẫu: bệ 7700, cự ly 600.'
    },
    {
      key: 'veKyHieuVatLieu',
      label: 'Vẽ ký hiệu vật liệu trong thân cọc',
      type: 'choice',
      choices: [
        { value: 'co', label: 'Có' },
        { value: 'khong', label: 'Không' }
      ],
      default: 'co',
      group: 'Thể hiện',
      hint: 'Sáu nét gạch dọc như bản vẽ. Tắt khi in ở tỉ lệ nhỏ.'
    },
    {
      key: 'x',
      label: 'Vị trí tim nhóm cọc',
      type: 'number',
      unit: 'mm',
      min: -30000,
      max: 30000,
      default: 0,
      group: 'Vị trí'
    },
    {
      key: 'y',
      label: 'Cao độ đáy bệ',
      type: 'number',
      unit: 'mm',
      min: -30000,
      max: 30000,
      default: 100,
      group: 'Vị trí',
      hint:
        'Mặt dưới bệ, nơi cọc chui ra. Mặc định 100 = đỉnh bê tông lót của ' +
        'template mo_be_mong, nên hai mẫu để nguyên mặc định là khớp nhau.'
    }
  ],

  generate(ctx, values) {
    const num = (key, fallback) => {
      const raw = values[key]
      const value = typeof raw === 'string' ? Number(raw) : raw
      return typeof value === 'number' && Number.isFinite(value) ? value : fallback
    }

    const D = num('D', 1200)
    const count = Math.max(1, Math.round(num('soCoc', 2)))
    const pitch = num('khoangCach', 5300)
    const Lcoc = num('Lcoc', 1050)
    const embed = num('nganm', 150)
    const capWidth = num('beRongBe', 7700)
    const x0 = num('x', 0)
    const y0 = num('y', 100)
    const veGach = values.veKyHieuVatLieu !== 'khong'

    if (count > 1 && pitch < D) {
      throw new Error(
        `Tim–tim ${Math.round(pitch)} mm nhỏ hơn đường kính ${D} mm nên hai cọc ` +
          'chồng lên nhau. Đây không phải điều khoản nào cả — hình như vậy không dựng được.'
      )
    }

    const span = (count - 1) * pitch
    const edge = capWidth / 2 - (span / 2 + D / 2)
    if (edge < 300) {
      throw new Error(
        `Cự ly từ mặt bên cọc ngoài cùng đến mép bệ chỉ còn ${Math.round(edge)} mm, ` +
          'dưới mức 300 mm mà TCVN 11823-10:2017 điều 8.1.2 quy định. ' +
          'Giảm khoảng cách tim–tim, giảm đường kính, hoặc mở rộng bệ.'
      )
    }

    // Ký hiệu vật liệu: bản vẽ đặt sáu nét ở ±132, ±348, ±492 trên cọc ⌀1200 —
    // tức 0,22 / 0,58 / 0,82 lần bán kính. Giữ theo tỉ lệ để cọc đường kính
    // khác vẫn ra khoảng cách nét trông giống bản vẽ.
    const GACH = [0.22, 0.58, 0.82]

    for (let i = 0; i < count; i++) {
      const cx = x0 - span / 2 + i * pitch
      const half = D / 2
      const side = i + 1
      // Một partId cho cả cọc, không phải mỗi nét một cái: "cọc số 2 sâu thêm
      // 3 m" phải tìm ra đúng một bộ phận, và bản tóm tắt bản vẽ đếm bộ phận
      // chứ không đếm nét.
      const cocId = formatPartId({ role: 'coc_khoan_nhoi', ordinal: side })

      // Thân cọc: hai nét bao chạy từ đáy bệ xuống tới nét lượn.
      for (const dir of [-1, 1]) {
        ctx.line({
          role: 'coc_khoan_nhoi',
          partId: cocId,
          params: { D, khoangCach: pitch, tyLeTimD: Math.round((pitch / D) * 100) / 100 },
          start: { x: cx + dir * half, y: y0, z: 0 },
          end: { x: cx + dir * half, y: y0 - Lcoc, z: 0 }
        })
      }

      // Đầu cọc ngàm vào bệ: ba nét, vẽ như bản vẽ bằng đường bao hở.
      if (embed > 0) {
        ctx.polyline({
          role: 'coc_khoan_nhoi',
          partId: cocId,
          params: { nganm: embed },
          closed: false,
          points: [
            { x: cx - half, y: y0, z: 0 },
            { x: cx - half, y: y0 + embed, z: 0 },
            { x: cx + half, y: y0 + embed, z: 0 },
            { x: cx + half, y: y0, z: 0 }
          ]
        })
      }

      if (veGach) {
        for (const t of GACH) {
          for (const dir of [-1, 1]) {
            ctx.line({
              role: 'coc_khoan_nhoi',
              partId: cocId,
              start: { x: cx + dir * t * half, y: y0, z: 0 },
              end: { x: cx + dir * t * half, y: y0 - Lcoc * 0.94, z: 0 }
            })
          }
        }
      }

      ctx.line({
        role: 'duong_tim',
        partId: formatPartId({ role: 'duong_tim', ordinal: side }),
        start: { x: cx, y: y0 + embed, z: 0 },
        end: { x: cx, y: y0 - Lcoc * 0.94, z: 0 }
      })

      // Nét lượn "còn tiếp". Bản vẽ dùng spline; draw context chưa vẽ được
      // spline, nên dựng bằng đường gấp khúc cùng vị trí và cùng biên độ —
      // thà xấp xỉ có nói ra còn hơn bỏ mất ký hiệu, vì thiếu nó thì bản vẽ
      // khẳng định cọc dừng ở đó.
      const bien = D * 0.05
      const buoc = D / 6
      const diem = []
      for (let k = 0; k <= 6; k++) {
        diem.push({
          x: cx - half + k * buoc,
          y: y0 - Lcoc + (k % 2 === 0 ? -bien : bien),
          z: 0
        })
      }
      ctx.polyline({
        role: 'coc_khoan_nhoi',
        partId: cocId,
        closed: false,
        points: diem
      })
    }

    // Hai yêu cầu phát sinh của cùng điều khoản, in ra để kỹ sư thấy trên bản
    // vẽ chứ không phải chỉ trong hộp thoại.
    const notes = []
    if (count > 1 && pitch < 4 * D) {
      notes.push(
        `Tim-tim ${Math.round(pitch)} mm < 4D (${4 * D} mm): phai danh gia anh huong ` +
          'tuong tac giua cac coc lien ke — TCVN 11823-10:2017 §8.1.2'
      )
    }
    if (count > 1 && pitch < 6 * D) {
      notes.push(
        `Tim-tim ${Math.round(pitch)} mm < 6D (${6 * D} mm): trinh tu khoan coc phai ` +
          'duoc neu ro trong ho so thiet ke — TCVN 11823-10:2017 §8.1.2'
      )
    }
    notes.forEach((line, index) => {
      ctx.text({
        role: 'ghi_chu',
        partId: formatPartId({ role: 'ghi_chu', ordinal: index + 1 }),
        position: { x: x0 - capWidth / 2, y: y0 - Lcoc - 400 - index * 320, z: 0 },
        text: line,
        height: 200
      })
    })
  }
}
