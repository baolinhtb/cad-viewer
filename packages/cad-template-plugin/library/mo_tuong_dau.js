const { formatPartId } = globalThis.__CAD_TEMPLATE_SDK__

/**
 * Tường đầu mố cầu cùng vai kê, hai tường tai và lớp phủ, mặt chính.
 *
 * Dựng từ `33_MO_TUONGDAU.dwg` cho hình dạng, từ bản vẽ lắp `banve_mo.dwg`
 * cho độ dốc và cho vị trí tường tai.
 *
 * Bốn thứ đi cùng nhau ở đây vì chúng dính vào nhau về hình học, không phải
 * vì tiện: vai kê là chỗ tường đầu hạ xuống để đỡ lớp phủ, lớp phủ gối lên
 * đúng vai kê ấy, còn tường tai treo dưới đỉnh tường đầu và dốc theo nó. Tách
 * rời thì mỗi mảnh cần lặp lại cùng một chuỗi cao độ, và chúng sẽ lệch nhau
 * ngay lần đầu ai đó sửa độ dốc ở một chỗ mà quên chỗ kia.
 *
 * **Cả đáy lẫn đỉnh đều nghiêng** cùng một độ dốc — khác tường thân, vốn đáy
 * phẳng. Đáy tường đầu gối lên đỉnh tường thân, mà đỉnh ấy đã nghiêng rồi.
 *
 * Tường tai được **tô đặc**: đây là mặt cắt, tường tai bị cắt ngang. Bản vẽ
 * lắp tô hai dải này bằng `_SOLID` với 0 đường mẫu — cấu kiện mỏng cắt qua thì
 * tô đặc, không kẻ ký hiệu vật liệu.
 *
 * Ghép với hai bộ phận kia: `y` của tường đầu = đỉnh tường thân **tại tim** =
 * `y` + `hThan` của template tường thân.
 *
 * TCVN 11823-11:2017 không cho trị số kích thước nào với mố bê tông thường;
 * các dải dưới đây chỉ chặn sai số nhập liệu.
 */
export default {
  meta: {
    id: 'mo_tuong_dau',
    version: '1.0.0',
    name: 'Mố cầu — tường đầu, tường tai và lớp phủ',
    category: 'Mố trụ',
    description:
      'Tường đầu mố cầu cùng vai kê, hai tường tai và lớp phủ, mặt chính, ' +
      'dựng theo bản vẽ cấu kiện 33_MO_TUONGDAU và bản vẽ lắp. Cả đáy lẫn đỉnh ' +
      'đều nghiêng theo độ dốc ngang. Tường tai tô đặc như bản vẽ lắp. Đặt y ' +
      'bằng cao độ đỉnh tường thân tại tim thì khớp với template tường thân. ' +
      'Các trị số do tính toán quyết định.'
  },
  params: [
    {
      key: 'B',
      label: 'Bề rộng tường đầu',
      type: 'number',
      unit: 'mm',
      min: 2000,
      max: 30000,
      default: 7700,
      group: 'Kích thước chính',
      hint: 'Bản vẽ mẫu: 7700, bằng bề rộng bệ và tường thân.'
    },
    {
      key: 'hDau',
      label: 'Chiều cao tường đầu tại tim',
      type: 'number',
      unit: 'mm',
      min: 300,
      max: 6000,
      default: 1819,
      group: 'Kích thước chính',
      hint: 'Đo tại trục đối xứng, từ đáy đến đỉnh. Bản vẽ mẫu: 1819.'
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
        'Áp cho cả đáy, đỉnh, vai kê và lớp phủ. Dương là bên phải cao hơn, ' +
        'như bản vẽ lắp; đo được đúng 2,00%.'
    },
    {
      key: 'bVaiKe',
      label: 'Bề rộng vai kê mỗi bên',
      type: 'number',
      unit: 'mm',
      min: 0,
      max: 3000,
      default: 350,
      group: 'Vai kê và lớp phủ',
      hint: 'Đoạn đỉnh tường đầu hạ xuống để đỡ lớp phủ. Bản vẽ mẫu: 350.'
    },
    {
      key: 'hVaiKe',
      label: 'Độ hạ của vai kê',
      type: 'number',
      unit: 'mm',
      min: 0,
      max: 500,
      default: 7,
      group: 'Vai kê và lớp phủ',
      hint:
        'Chênh cao giữa đỉnh tường đầu và mặt vai kê. Bản vẽ mẫu: 7 — đây ' +
        'không phải chiều dày lớp phủ, hai trị số rất dễ lẫn.'
    },
    {
      key: 'tLopPhu',
      label: 'Chiều dày lớp phủ',
      type: 'number',
      unit: 'mm',
      min: 0,
      max: 300,
      default: 70,
      group: 'Vai kê và lớp phủ',
      hint: 'Đặt 0 để không vẽ lớp phủ. Bản vẽ mẫu: 70.'
    },
    {
      key: 'bTai',
      label: 'Bề rộng tường tai thấy trên mặt chính',
      type: 'number',
      unit: 'mm',
      min: 0,
      max: 3000,
      default: 150,
      group: 'Tường tai',
      hint: 'Đặt 0 để không vẽ tường tai. Bản vẽ mẫu: 150.'
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
      hint: 'Bản vẽ mẫu: 1200.'
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
      hint: 'Tắt khi ghép vào một mố đã có chuỗi kích thước riêng.'
    },
    {
      key: 'x',
      label: 'Vị trí tim tường',
      type: 'number',
      unit: 'mm',
      min: -30000,
      max: 30000,
      default: 0,
      group: 'Vị trí',
      hint: 'Hoành độ trục đối xứng, cũng là trục mà các mặt nghiêng xoay quanh.'
    },
    {
      key: 'y',
      label: 'Cao độ đáy tường đầu tại tim',
      type: 'number',
      unit: 'mm',
      min: -30000,
      max: 30000,
      default: 6816,
      group: 'Vị trí',
      hint:
        'Bằng cao độ đỉnh tường thân tại tim. Mặc định 6816 = 100 + 2000 + ' +
        '4716 của bản vẽ mẫu, nên ba template xếp đúng chồng nhau khi để ' +
        'nguyên mặc định.'
    }
  ],

  generate(ctx, values) {
    const num = (key, fallback) => {
      const raw = values[key]
      const value = typeof raw === 'string' ? Number(raw) : raw
      return typeof value === 'number' && Number.isFinite(value) ? value : fallback
    }

    const B = num('B', 7700)
    const hDau = num('hDau', 1819)
    const doc = num('doDocNgang', 2)
    const bVaiKe = num('bVaiKe', 350)
    const hVaiKe = num('hVaiKe', 7)
    const tLopPhu = num('tLopPhu', 70)
    const bTai = num('bTai', 150)
    const hTai = num('hTai', 1200)
    const x0 = num('x', 0)
    const y0 = num('y', 6816)
    const ghi = values.ghiKichThuoc !== 'khong'

    if (bTai * 2 > B) {
      throw new Error(
        `Hai tường tai rộng ${bTai} mm mỗi bên không nằm lọt trong bề rộng tường đầu ${B} mm.`
      )
    }
    if (bVaiKe * 2 > B) {
      throw new Error(
        `Vai kê rộng ${bVaiKe} mm mỗi bên không nằm lọt trong bề rộng tường đầu ${B} mm.`
      )
    }

    const half = B / 2
    const inner = half - bVaiKe
    const yDinh = y0 + hDau
    const at = (yTim, x) => yTim + ((x - x0) * doc) / 100

    ctx.polyline({
      role: 'mo_tuong_dau',
      partId: formatPartId({ role: 'mo_tuong_dau' }),
      params: { B, hDau, doDocNgang: doc, bVaiKe },
      closed: true,
      points: [
        { x: x0 - half, y: at(y0, x0 - half), z: 0 },
        { x: x0 + half, y: at(y0, x0 + half), z: 0 },
        { x: x0 + half, y: at(yDinh, x0 + half), z: 0 },
        { x: x0 + inner, y: at(yDinh, x0 + inner) + hVaiKe, z: 0 },
        { x: x0 - inner, y: at(yDinh, x0 - inner) + hVaiKe, z: 0 },
        { x: x0 - half, y: at(yDinh, x0 - half), z: 0 }
      ]
    })

    if (tLopPhu > 0) {
      ctx.polyline({
        role: 'lop_phu',
        partId: formatPartId({ role: 'lop_phu' }),
        params: { tLopPhu, doDocNgang: doc },
        closed: true,
        points: [
          { x: x0 - inner, y: at(yDinh, x0 - inner) + hVaiKe, z: 0 },
          { x: x0 + inner, y: at(yDinh, x0 + inner) + hVaiKe, z: 0 },
          { x: x0 + inner, y: at(yDinh, x0 + inner) + hVaiKe + tLopPhu, z: 0 },
          { x: x0 - inner, y: at(yDinh, x0 - inner) + hVaiKe + tLopPhu, z: 0 }
        ]
      })
    }

    if (bTai > 0 && hTai > 0) {
      for (const side of ['trai', 'phai']) {
        const x1 = side === 'trai' ? x0 - half : x0 + half - bTai
        const x2 = x1 + bTai
        const yTren = at(yDinh, (x1 + x2) / 2) - 100
        const partId = formatPartId({ role: 'mo_tuong_tai', side })
        const goc = [
          { x: x1, y: yTren - hTai, z: 0 },
          { x: x2, y: yTren - hTai, z: 0 },
          { x: x2, y: yTren, z: 0 },
          { x: x1, y: yTren, z: 0 }
        ]
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
      { x: x0 - half, y: at(y0, x0 - half), z: 0 },
      { x: x0 + half, y: at(y0, x0 + half), z: 0 },
      -900,
      'ngang'
    )
    // Chiều cao đo tại mép phải: cả hai mặt đều nghiêng, nên chỉ ở một mép
    // xác định thì hai mũi tên mới tựa vào nét thật.
    dim(
      { x: x0 + half, y: at(y0, x0 + half), z: 0 },
      { x: x0 + half, y: at(yDinh, x0 + half), z: 0 },
      700,
      'dung'
    )
    if (bVaiKe > 0) {
      dim(
        { x: x0 + inner, y: at(yDinh, x0 + inner) + hVaiKe, z: 0 },
        { x: x0 + half, y: at(yDinh, x0 + half), z: 0 },
        900,
        'ngang'
      )
    }
  }
}
