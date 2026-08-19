const { formatPartId } = globalThis.__CAD_TEMPLATE_SDK__

/**
 * Bệ cọc trên nhóm cọc khoan nhồi, mặt cắt ngang.
 *
 * TCVN 11823-10:2017 điều 8.1.2 cho ba trị số, và điều đáng chú ý là chúng
 * **không cùng một mức ràng buộc** — đọc lướt rất dễ gộp làm một:
 *
 *   1. "khoảng cách từ mặt bên của bất kỳ cọc khoan đến mặt gần nhất của bệ
 *      cọc cũng không được nhỏ hơn 300 mm"  → cấm.
 *   2. "khoảng cách từ tim đến tim cọc khoan nhỏ hơn 4 lần đường kính, phải
 *      đánh giá ảnh hưởng tương tác giữa các cọc khoan liền kề"  → không cấm,
 *      mà buộc làm thêm việc.
 *   3. "Nếu khoảng cách từ tim đến tim cọc khoan nhỏ hơn 6 lần đường kính,
 *      trình tự khoan cọc phải được nêu rõ trong hồ sơ thiết kế"  → cũng không
 *      cấm, mà buộc ghi vào hồ sơ.
 *
 * Nên template chỉ từ chối trường hợp 1. Biến (2) và (3) thành lỗi sẽ chặn mất
 * những phương án hoàn toàn hợp lệ — bố trí cọc dày là bình thường khi mặt bằng
 * chật. Nhưng bỏ qua chúng thì cũng sai: yêu cầu vẫn tồn tại, chỉ là nó rơi vào
 * người làm hồ sơ chứ không rơi vào hình vẽ. Vậy nên nguyên văn được in thành
 * ghi chú trên bản vẽ, còn nhãn ngữ nghĩa chỉ mang tỉ lệ tim-tim trên đường
 * kính — một con số đủ để lượt sau suy ra yêu cầu nào đang áp dụng.
 */
export default {
  meta: {
    id: 'be_coc_khoan_nhoi',
    version: '1.1.0',
    name: 'Bệ cọc trên nhóm cọc khoan nhồi',
    category: 'Móng cầu',
    description:
      'Bệ cọc và nhóm cọc khoan nhồi, mặt cắt ngang. Cự ly từ mặt bên cọc đến ' +
      'mép bệ tối thiểu 300 mm theo TCVN 11823-10:2017 điều 8.1.2 — dưới mức này ' +
      'template từ chối. Cùng điều khoản còn buộc đánh giá tương tác khi tim-tim ' +
      '< 4D và nêu rõ trình tự khoan khi < 6D; hai điều đó không bị cấm nên vẫn ' +
      'dựng được, và được in thành ghi chú trên bản vẽ.'
  },
  params: [
    {
      key: 'D',
      label: 'Đường kính cọc khoan nhồi',
      type: 'number',
      unit: 'mm',
      min: 600,
      max: 3000,
      default: 1000,
      group: 'Cọc',
      hint: 'Bản vẽ mố mẫu (33_MO_BE.dwg): ⌀1200.'
    },
    {
      key: 'soCoc',
      label: 'Số cọc trên mặt cắt',
      type: 'integer',
      min: 2,
      max: 8,
      default: 3,
      group: 'Cọc',
      hint: 'Bản vẽ mố mẫu: 2 cọc thấy trên mặt chính.'
    },
    {
      key: 'khoangCach',
      label: 'Khoảng cách tim–tim cọc',
      type: 'number',
      unit: 'mm',
      min: 1200,
      max: 12000,
      default: 3000,
      group: 'Cọc',
      hint:
        'TCVN 11823-10:2017, điều 8.1.2 — dưới 4D và dưới 6D đều phát sinh ' +
        'yêu cầu. Bản vẽ mố mẫu: 5300 (tim cọc ở x ±2650), tức 4,42D.'
    },
    {
      key: 'Lcoc',
      label: 'Chiều dài cọc thể hiện',
      type: 'number',
      unit: 'm',
      min: 1,
      max: 40,
      default: 6,
      group: 'Cọc',
      hint:
        'Chỉ là chiều dài vẽ trên mặt cắt, không phải chiều dài thiết kế. ' +
        'Bản vẽ mố mẫu không cho trị số này: cọc bị cắt bằng nét lượn ở 1201 ' +
        'mm dưới đỉnh, nghĩa là "còn tiếp".'
    },
    {
      key: 'cuLyMepBe',
      label: 'Cự ly từ mặt bên cọc đến mép bệ',
      type: 'number',
      unit: 'mm',
      min: 300,
      max: 3000,
      default: 500,
      group: 'Bệ cọc',
      hint:
        'TCVN 11823-10:2017, điều 8.1.2 — không được nhỏ hơn 300 mm. Bản vẽ ' +
        'mố mẫu: 600 (mép bệ ở 3850, mặt ngoài cọc ở 3250).'
    },
    {
      key: 'hBe',
      label: 'Chiều dày bệ cọc',
      type: 'number',
      unit: 'mm',
      min: 800,
      max: 4000,
      default: 1500,
      group: 'Bệ cọc',
      hint:
        'Do tính toán quyết định; dải này chỉ chặn sai số nhập liệu. Bản vẽ ' +
        'mố mẫu: 2000, bằng chiều cao bệ trong template mo_be_mong.'
    },
    {
      key: 'nganm',
      label: 'Chiều dài ngàm đầu cọc vào bệ',
      type: 'number',
      unit: 'mm',
      min: 100,
      max: 1500,
      default: 300,
      group: 'Bệ cọc',
      hint:
        'TCVN 11823-10:2017 §8.1.2 chỉ yêu cầu "đủ sâu để tạo sức kháng kết ' +
        'cấu", không cho trị số. Bản vẽ mố mẫu: 150 (đỉnh cọc cao hơn đáy bệ ' +
        '150 mm).'
    },
    {
      key: 'x',
      label: 'Vị trí X so với tim mố/trụ',
      type: 'number',
      unit: 'mm',
      min: -30000,
      max: 30000,
      default: 0,
      group: 'Vị trí'
    },
    {
      key: 'y',
      label: 'Cao độ đỉnh bệ',
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

    const D = num('D', 1000)
    const count = Math.max(2, Math.round(num('soCoc', 3)))
    const pitch = num('khoangCach', 3000)
    const pileLength = num('Lcoc', 6) * 1000
    const edge = num('cuLyMepBe', 500)
    const capDepth = num('hBe', 1500)
    const embed = Math.min(num('nganm', 300), capDepth)
    const x0 = num('x', 0)
    const yTop = num('y', 0)

    // Cấm: cự ly mặt bên cọc tới mép bệ.
    if (edge < 300) {
      throw new Error(
        `Cự ly từ mặt bên cọc đến mép bệ ${edge} mm nhỏ hơn 300 mm. ` +
          'TCVN 11823-10:2017 điều 8.1.2 không cho phép. ' +
          'Hãy tăng cự ly hoặc mở rộng bệ cọc.'
      )
    }
    // Cấm: cọc chồng lên nhau. Không phải điều khoản, chỉ là hình học.
    if (pitch <= D) {
      throw new Error(
        `Khoảng cách tim–tim ${pitch} mm không lớn hơn đường kính cọc ${D} mm — ` +
          'các cọc sẽ chồng lên nhau.'
      )
    }

    // Không cấm, nhưng phát sinh yêu cầu. Ghi lại thay vì chặn.
    const notes = []
    if (pitch < 4 * D) {
      notes.push(
        `Tim-tim ${Math.round(pitch)} mm < 4D (${4 * D} mm): phai danh gia anh huong ` +
          'tuong tac giua cac coc lien ke — TCVN 11823-10:2017 §8.1.2'
      )
    }
    if (pitch < 6 * D) {
      notes.push(
        `Tim-tim ${Math.round(pitch)} mm < 6D (${6 * D} mm): trinh tu khoan coc phai ` +
          'duoc neu ro trong ho so thiet ke — TCVN 11823-10:2017 §8.1.2'
      )
    }

    const span = (count - 1) * pitch
    const capHalf = span / 2 + D / 2 + edge
    const capId = formatPartId({ role: 'be_coc' })

    ctx.polyline({
      role: 'be_coc',
      partId: capId,
      params: {
        soCoc: count,
        D,
        khoangCach: pitch,
        cuLyMepBe: edge,
        hBe: capDepth,
        // Tỉ lệ, không phải câu văn. Nhãn ngữ nghĩa chỉ chứa 255 ký tự và SDK
        // nói rõ nó dành cho giá trị định nghĩa bộ phận — nhét diễn giải vào
        // đây thì bộ phận đầu tiên có ghi chú dài là bộ phận không vẽ được.
        // Một con số thì lượt sau vẫn suy ra được yêu cầu nào đang áp dụng, và
        // nguyên văn thì nằm trên bản vẽ, nơi kỹ sư đọc.
        tyLeTimD: Math.round((pitch / D) * 100) / 100,
        dieuKhoan: 'TCVN 11823-10:2017 §8.1.2'
      },
      layer: 'KC-BECOC',
      closed: true,
      points: [
        { x: x0 - capHalf, y: yTop, z: 0 },
        { x: x0 + capHalf, y: yTop, z: 0 },
        { x: x0 + capHalf, y: yTop - capDepth, z: 0 },
        { x: x0 - capHalf, y: yTop - capDepth, z: 0 }
      ]
    })

    // Cọc, đánh số từ trái sang phải theo chiều lý trình tăng dần.
    for (let i = 0; i < count; i++) {
      const cx = x0 - span / 2 + i * pitch
      const headY = yTop - capDepth + embed
      ctx.polyline({
        role: 'coc_khoan_nhoi',
        partId: formatPartId({ role: 'coc_khoan_nhoi', ordinal: i + 1 }),
        params: { D, nganm: embed },
        layer: 'KC-COC',
        closed: true,
        points: [
          { x: cx - D / 2, y: headY, z: 0 },
          { x: cx + D / 2, y: headY, z: 0 },
          { x: cx + D / 2, y: headY - pileLength, z: 0 },
          { x: cx - D / 2, y: headY - pileLength, z: 0 }
        ]
      })
      // Tim cọc, để đo khoảng cách trên bản vẽ.
      ctx.line({
        role: 'duong_tim',
        partId: formatPartId({ role: 'duong_tim', ordinal: i + 1 }),
        layer: 'TRUC-TIM',
        start: { x: cx, y: yTop + 300, z: 0 },
        end: { x: cx, y: headY - pileLength - 300, z: 0 }
      })
    }

    notes.forEach((note, index) => {
      ctx.text({
        role: 'ghi_chu',
        partId: formatPartId({ role: 'ghi_chu', ordinal: index + 1 }),
        layer: 'GC-GHICHU',
        position: { x: x0 - capHalf, y: yTop + 400 + index * 350, z: 0 },
        height: 250,
        text: note
      })
    })
  }
}
