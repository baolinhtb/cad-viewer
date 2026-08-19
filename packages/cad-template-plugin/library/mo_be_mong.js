const { formatPartId } = globalThis.__CAD_TEMPLATE_SDK__

/**
 * Bệ móng mố cầu và lớp bê tông lót dưới nó, mặt chính.
 *
 * Dựng từ `33_MO_BE.dwg` — bản vẽ cấu kiện của kỹ sư — cho hình dạng, và từ
 * bản vẽ lắp `banve_mo.dwg` cho quan hệ với các bộ phận trên nó.
 *
 * Bệ là bộ phận duy nhất của mố **không nghiêng**. Mọi mặt từ đỉnh bệ trở lên
 * đều mang độ dốc ngang, nhưng đáy và đỉnh bệ thì phẳng — đo trên bản vẽ lắp:
 * đỉnh bệ ở cùng một cao độ suốt bề rộng 7700. Đó là lý do bệ không có tham
 * số độ dốc, và cũng là lý do nó là mốc để đặt tường thân.
 *
 * **Đỉnh bệ = `y` + `hLot` + `hBe`.** Đó là cao độ đáy tường thân; truyền
 * đúng trị số ấy vào `y` của template `mo_tuong_than` thì hai bộ phận khớp
 * nhau, không cần đo lại.
 *
 * Bê tông lót phủ rộng hơn bệ mỗi bên một đoạn `phuLot`. Bản vẽ lắp cho 100
 * mm; đó là phần lót thò ra để đổ bê tông bệ, không phải kết cấu chịu lực.
 *
 * TCVN 11823-11:2017 nói về mố nhưng phần định lượng của nó nằm ở tường chắn
 * đất có cốt; với mố bê tông thường điều 6 chỉ nêu yêu cầu định tính. Không có
 * trị số nào để viện dẫn, nên các dải ở đây chỉ chặn sai số nhập liệu — và nói
 * đúng như vậy, thay vì mượn uy tín của một điều khoản không tồn tại.
 */
export default {
  meta: {
    id: 'mo_be_mong',
    version: '1.0.0',
    name: 'Mố cầu — bệ móng và bê tông lót',
    category: 'Mố trụ',
    description:
      'Bệ móng mố cầu và lớp bê tông lót, mặt chính, dựng theo bản vẽ cấu ' +
      'kiện 33_MO_BE của kỹ sư. Bộ phận duy nhất của mố không nghiêng — đáy ' +
      'và đỉnh đều phẳng. Đỉnh bệ ở cao độ y + hLot + hBe, chính là cao độ đáy ' +
      'tường thân. Các trị số do tính toán quyết định; TCVN 11823-11:2017 ' +
      'không quy định kích thước cho mố bê tông thường.'
  },
  params: [
    {
      key: 'B',
      label: 'Bề rộng bệ',
      type: 'number',
      unit: 'mm',
      min: 2000,
      max: 30000,
      default: 7700,
      group: 'Kích thước chính',
      hint: 'Do khổ cầu quyết định. Bản vẽ mẫu: 7700, bằng bề rộng hai tường.'
    },
    {
      key: 'hBe',
      label: 'Chiều cao bệ',
      type: 'number',
      unit: 'mm',
      min: 500,
      max: 6000,
      default: 2000,
      group: 'Kích thước chính',
      hint: 'Do tính toán móng quyết định. Bản vẽ mẫu: 2000.'
    },
    {
      key: 'hLot',
      label: 'Chiều dày bê tông lót',
      type: 'number',
      unit: 'mm',
      min: 50,
      max: 300,
      default: 100,
      group: 'Bê tông lót',
      hint: 'Lớp lót tạo phẳng để đổ bệ, không chịu lực. Bản vẽ mẫu: 100.'
    },
    {
      key: 'phuLot',
      label: 'Bê tông lót phủ ra mỗi bên',
      type: 'number',
      unit: 'mm',
      min: 0,
      max: 500,
      default: 100,
      group: 'Bê tông lót',
      hint: 'Phần lót thò ra ngoài mép bệ. Bản vẽ mẫu: 100.'
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
      hint:
        'Tắt khi ghép bệ vào một mố đã có chuỗi kích thước riêng — ba bộ phận ' +
        'cùng ghi thì bản vẽ đầy số trùng nhau.'
    },
    {
      key: 'x',
      label: 'Vị trí tim bệ',
      type: 'number',
      unit: 'mm',
      min: -30000,
      max: 30000,
      default: 0,
      group: 'Vị trí',
      hint: 'Hoành độ trục đối xứng của bệ.'
    },
    {
      key: 'y',
      label: 'Cao độ đáy bê tông lót',
      type: 'number',
      unit: 'mm',
      min: -30000,
      max: 30000,
      default: 0,
      group: 'Vị trí',
      hint: 'Mặt dưới cùng của cả cụm. Đỉnh bệ nằm cao hơn đúng hLot + hBe.'
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
    const x0 = num('x', 0)
    const y0 = num('y', 0)
    const ghi = values.ghiKichThuoc !== 'khong'

    const half = B / 2
    const yLotDinh = y0 + hLot
    const yBeDinh = yLotDinh + hBe

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

    dim({ x: x0 - half, y: y0, z: 0 }, { x: x0 + half, y: y0, z: 0 }, -900, 'ngang')

    const right = x0 + half + phuLot
    dim({ x: right, y: y0, z: 0 }, { x: right, y: yLotDinh, z: 0 }, 700, 'dung')
    dim({ x: right, y: yLotDinh, z: 0 }, { x: right, y: yBeDinh, z: 0 }, 700, 'dung')
  }
}
