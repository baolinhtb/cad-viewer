const { formatPartId } = globalThis.__CAD_TEMPLATE_SDK__

/**
 * Tường thân mố cầu, mặt chính.
 *
 * Dựng từ `33_MO_TUONGTHAN.dwg` cho hình dạng, và từ bản vẽ lắp
 * `banve_mo.dwg` cho độ dốc.
 *
 * **Đáy phẳng, đỉnh nghiêng.** Đáy gối lên đỉnh bệ nên phẳng theo bệ; đỉnh
 * mang độ dốc ngang vì tường đầu và lớp phủ nằm trên nó phải dốc theo mặt
 * đường. Đó là chỗ file cấu kiện tách rời **nói sai**: khi tách ra thành file
 * riêng, cấu kiện đã bị san phẳng về nằm ngang, nên đo trên file cấu kiện sẽ
 * ra độ dốc gần bằng không. Bản vẽ lắp cho **2,00%** — đây là trị số đúng, và
 * là lý do template này lấy hình từ một nguồn còn lấy độ dốc từ nguồn kia.
 *
 * Cao độ đỉnh khai báo **tại tim**, nơi mặt nghiêng cắt trục đối xứng. Mọi
 * cao độ khác suy ra từ đó theo `doDocNgang`, nên một mặt nghiêng chỉ xác định
 * được khi kèm hoành độ.
 *
 * Ghép với hai bộ phận kia:
 *   - `y` của tường thân = đỉnh bệ = `y` + `hLot` + `hBe` của template bệ móng
 *   - đỉnh tường thân tại tim = `y` + `hThan`, chính là `y` của tường đầu
 *
 * TCVN 11823-11:2017 không cho trị số kích thước nào với mố bê tông thường;
 * các dải dưới đây chỉ chặn sai số nhập liệu.
 */
export default {
  meta: {
    id: 'mo_tuong_than',
    version: '1.0.0',
    name: 'Mố cầu — tường thân',
    category: 'Mố trụ',
    description:
      'Tường thân mố cầu, mặt chính, dựng theo bản vẽ cấu kiện ' +
      '33_MO_TUONGTHAN và độ dốc đo từ bản vẽ lắp. Đáy phẳng gối lên đỉnh bệ, ' +
      'đỉnh nghiêng theo độ dốc ngang mặt đường. Đặt y bằng cao độ đỉnh bệ thì ' +
      'khớp với template bệ móng; đỉnh tường thân tại tim là y + hThan, dùng ' +
      'làm y cho tường đầu. Các trị số do tính toán quyết định.'
  },
  params: [
    {
      key: 'B',
      label: 'Bề rộng tường thân',
      type: 'number',
      unit: 'mm',
      min: 2000,
      max: 30000,
      default: 7700,
      group: 'Kích thước chính',
      hint: 'Bản vẽ mẫu: 7700, bằng bề rộng bệ và tường đầu.'
    },
    {
      key: 'hThan',
      label: 'Chiều cao tường thân tại tim',
      type: 'number',
      unit: 'mm',
      min: 500,
      max: 15000,
      default: 4716,
      group: 'Kích thước chính',
      hint:
        'Đo tại trục đối xứng. Vì đỉnh nghiêng nên chiều cao ở hai mép khác ' +
        'trị số này. Bản vẽ mẫu: 4716.'
    },
    {
      key: 'doDocNgang',
      label: 'Độ dốc ngang đỉnh tường',
      type: 'number',
      unit: '%',
      min: -8,
      max: 8,
      default: 2,
      group: 'Kích thước chính',
      hint:
        'Dương là bên phải cao hơn, như bản vẽ lắp; đo được đúng 2,00%. File ' +
        'cấu kiện tách rời đã bị san phẳng nên không dùng để đo trị số này.'
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
      hint: 'Hoành độ trục đối xứng, cũng là trục mà mặt nghiêng xoay quanh.'
    },
    {
      key: 'y',
      label: 'Cao độ đáy tường thân',
      type: 'number',
      unit: 'mm',
      min: -30000,
      max: 30000,
      default: 2100,
      group: 'Vị trí',
      hint:
        'Bằng cao độ đỉnh bệ. Mặc định 2100 = 100 bê tông lót + 2000 bệ của ' +
        'bản vẽ mẫu, nên ba template xếp đúng chồng nhau khi để nguyên mặc định.'
    }
  ],

  generate(ctx, values) {
    const num = (key, fallback) => {
      const raw = values[key]
      const value = typeof raw === 'string' ? Number(raw) : raw
      return typeof value === 'number' && Number.isFinite(value) ? value : fallback
    }

    const B = num('B', 7700)
    const hThan = num('hThan', 4716)
    const doc = num('doDocNgang', 2)
    const x0 = num('x', 0)
    const y0 = num('y', 2100)
    const ghi = values.ghiKichThuoc !== 'khong'

    const half = B / 2
    const yDinh = y0 + hThan
    const at = (yTim, x) => yTim + ((x - x0) * doc) / 100

    ctx.polyline({
      role: 'mo_tuong_than',
      partId: formatPartId({ role: 'mo_tuong_than' }),
      params: { B, hThan, doDocNgang: doc },
      closed: true,
      points: [
        { x: x0 - half, y: y0, z: 0 },
        { x: x0 + half, y: y0, z: 0 },
        { x: x0 + half, y: at(yDinh, x0 + half), z: 0 },
        { x: x0 - half, y: at(yDinh, x0 - half), z: 0 }
      ]
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

    dim({ x: x0 - half, y: y0, z: 0 }, { x: x0 + half, y: y0, z: 0 }, -900, 'ngang')
    // Chiều cao đo tại mép phải, nơi đỉnh nghiêng có một cao độ xác định —
    // ghi tại tim thì mũi tên không tựa vào nét nào.
    dim(
      { x: x0 + half, y: y0, z: 0 },
      { x: x0 + half, y: at(yDinh, x0 + half), z: 0 },
      700,
      'dung'
    )
  }
}
