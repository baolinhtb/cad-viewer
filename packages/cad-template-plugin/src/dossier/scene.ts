import type { AcTpDrawContext } from '@mlightcad/cad-template-sdk'

import type { DossierModel } from './model'
import { DOSSIER_VERSION, dossierDefaults, REFERENCE_ID } from './model'
import bars from './reference/bars.json'
import reference from './reference/reinforcement.json'

export type XY = [number, number]
interface Base {
  role: string
  partId: string
  color?: number
  sourceHandle?: string
  sourceLayer?: string
  sourceType?: string
}
export type DossierPrimitive = Base &
  (
    | { kind: 'path'; points: XY[]; closed?: boolean }
    | { kind: 'fill'; loops: XY[][] }
    | { kind: 'circle'; at: XY; radius: number }
    | {
        kind: 'text'
        at: XY
        text: string
        height: number
        rotation?: number
        align?: number
        widthFactor?: number
      }
    | {
        kind: 'dimension'
        start: XY
        end: XY
        offset: number
        direction: 'ngang' | 'dung'
      }
  )
export interface DossierSheet {
  id: string
  title: string
  width: number
  height: number
  scale: number
  origin: XY
  primitives: DossierPrimitive[]
}
export interface DossierScene {
  version: string
  reference: string
  status: 'draft'
  detailMode: 'source' | 'parametric'
  model: DossierModel
  sheets: DossierSheet[]
}

const W = 84100,
  H = 59400
const fmt = (n: number, digits = 3) => n.toFixed(digits)
const steelGroups: Record<string, string> = {
  be: 'Bệ',
  than: 'Thân',
  dau: 'Đỉnh',
  canh_trai: 'Cánh trái',
  canh_phai: 'Cánh phải',
  lan_can: 'Lan can',
  tai: 'Tai',
  phu: 'Phụ',
  goi: 'Gối/ụ'
}

/** A pure scene is prepared before any database mutation, shared by CAD,
 * SVG, print/PDF, and tests. It never invokes the LLM or fetches a library. */
export function buildDossierScene(model: DossierModel): DossierScene {
  const errors = model.issues.filter(i => i.level === 'error')
  if (errors.length) throw new Error(errors.map(i => i.message).join('\n'))
  const v = model.values,
    n = (k: string) => Number(v[k])
  const sheets: DossierSheet[] = []
  function sheet(id: string, title: string): DossierSheet {
    const index = sheets.length
    const s: DossierSheet = {
      id,
      title,
      width: W,
      height: H,
      scale: 100,
      origin: [
        n('x') + (index % 3) * (W + 5000),
        n('y') - Math.floor(index / 3) * (H + 5000)
      ],
      primitives: []
    }
    sheets.push(s)
    return s
  }
  const base = (s: DossierSheet, role: string) => ({
    role,
    // A part may own many strokes. Keeping one id per role/sheet avoids
    // turning a reinforcement panel into a thousand semantic "parts".
    partId: `${role}_${s.id}`
  })
  const path = (s: DossierSheet, role: string, points: XY[], closed = false) =>
    s.primitives.push({ ...base(s, role), kind: 'path', points, closed })
  const rect = (
    s: DossierSheet,
    role: string,
    x: number,
    y: number,
    w: number,
    h: number
  ) =>
    path(
      s,
      role,
      [
        [x, y],
        [x + w, y],
        [x + w, y + h],
        [x, y + h]
      ],
      true
    )
  const text = (
    s: DossierSheet,
    x: number,
    y: number,
    t: string,
    height = 260
  ) =>
    s.primitives.push({
      ...base(s, 'ghi_chu'),
      kind: 'text',
      at: [x, y],
      text: t,
      height
    })
  const circle = (s: DossierSheet, role: string, at: XY, radius: number) =>
    s.primitives.push({ ...base(s, role), kind: 'circle', at, radius })
  const dim = (
    s: DossierSheet,
    a: XY,
    b: XY,
    offset: number,
    direction: 'ngang' | 'dung' = 'ngang'
  ) =>
    s.primitives.push({
      ...base(s, 'kich_thuoc'),
      kind: 'dimension',
      start: a,
      end: b,
      offset,
      direction
    })
  function frame(s: DossierSheet) {
    rect(s, 'tieu_de_ban_ve', 1500, 1500, s.width - 3000, s.height - 3000)
    path(s, 'tieu_de_ban_ve', [
      [1500, 6500],
      [s.width - 1500, 6500]
    ])
    text(s, 3000, 4900, String(v.congTrinh), 350)
    text(s, 3000, 3600, `${v.tenMo} — ${s.title}`, 350)
    text(
      s,
      3000,
      2200,
      `${s.id} | A1 | TL 1:${s.scale} | ${DOSSIER_VERSION} | ${REFERENCE_ID}`,
      230
    )
    text(s, 48000, 4400, 'BẢN NHÁP — CHƯA PHÁT HÀNH THI CÔNG', 360)
    text(
      s,
      48000,
      2900,
      'Kích thước mm; cao độ m. Hình khai triển theo mô hình.',
      230
    )
  }
  function pileStub(s: DossierSheet, x: number, y: number) {
    const d = n('D')
    path(s, 'coc_khoan_nhoi', [
      [x - d / 2, y + 150],
      [x - d / 2, y - 650]
    ])
    path(s, 'coc_khoan_nhoi', [
      [x + d / 2, y + 150],
      [x + d / 2, y - 650]
    ])
    path(s, 'coc_khoan_nhoi', [
      [x - d / 2, y - 650],
      [x - d / 4, y - 500],
      [x + d / 4, y - 800],
      [x + d / 2, y - 650]
    ])
    path(s, 'coc_khoan_nhoi', [
      [x - d / 2, y - 950],
      [x - d / 2, y - 1700],
      [x + d / 2, y - 1700],
      [x + d / 2, y - 950]
    ])
  }
  function front(s: DossierSheet, cx: number, by: number) {
    const b = n('bThan'),
      h = n('hBe'),
      ht = n('hThan'),
      hd = n('hDau'),
      rise = (x: number) => (n('docNgang') / 100) * x
    text(
      s,
      cx - 3500,
      by + h + ht + hd + 3000,
      'MẶT CHÍNH — NHÌN VỀ ĐƯỜNG ĐẦU CẦU',
      300
    )
    rect(s, 'mo_be', cx - n('bBe') / 2, by, n('bBe'), h)
    rect(
      s,
      'mo_be_tong_lot',
      cx - n('bBe') / 2 - n('phuLot'),
      by - n('hLot'),
      n('bBe') + 2 * n('phuLot'),
      n('hLot')
    )
    path(
      s,
      'mo_tuong_than',
      [
        [cx - b / 2, by + h],
        [cx + b / 2, by + h],
        [cx + b / 2, by + h + ht + rise(b / 2)],
        [cx - b / 2, by + h + ht + rise(-b / 2)]
      ],
      true
    )
    path(
      s,
      'mo_tuong_dau',
      [
        [cx - b / 2, by + h + ht + rise(-b / 2)],
        [cx + b / 2, by + h + ht + rise(b / 2)],
        [cx + b / 2, by + h + ht + hd + rise(b / 2)],
        [cx - b / 2, by + h + ht + hd + rise(-b / 2)]
      ],
      true
    )
    for (const side of [-1, 1]) {
      const x = side * (n('bMatDuong') / 2 + 250),
        y = by + h + ht + hd + rise(x)
      path(
        s,
        'lan_can',
        [
          [cx + x - 250, y],
          [cx + x + 250, y],
          [cx + x + 150, y + n('hLanCan')],
          [cx + x - 100, y + n('hLanCan')]
        ],
        true
      )
    }
    for (let col = 0; col < n('soCotCoc'); col++)
      pileStub(s, cx + (col - (n('soCotCoc') - 1) / 2) * n('aCocNgang'), by)
    for (const x of model.bearings)
      rect(s, 'goi_cau', cx + x - 250, by + h + ht + rise(x), 500, 100)
    path(s, 'duong_tim', [
      [cx, by - 2200],
      [cx, by + h + ht + hd + 1800]
    ])
    dim(s, [cx - n('bBe') / 2, by], [cx + n('bBe') / 2, by], -2800)
    dim(s, [cx + n('bBe') / 2, by], [cx + n('bBe') / 2, by + h], 1500, 'dung')
    dim(
      s,
      [cx + b / 2, by + h],
      [cx + b / 2, by + h + ht + rise(b / 2)],
      2200,
      'dung'
    )
    text(s, cx - b / 2 - 1700, by + h + ht + hd + 1300, 'PHẢI TUYẾN', 230)
    text(s, cx + b / 2 - 700, by + h + ht + hd + 1300, 'TRÁI TUYẾN', 230)
    text(s, cx - b / 2, by + h + ht + hd + 600, `i ngang = ${v.docNgang}%`, 230)
    text(
      s,
      cx - b / 2,
      by - 3700,
      `${model.piles.length} cọc trên mặt bằng; hình đứng thể hiện ngắt đoạn`,
      220
    )
  }
  function section(s: DossierSheet, cx: number, by: number, side: -1 | 0 | 1) {
    const firstPrimitive = s.primitives.length
    const h = n('hBe'),
      shift = (((side * n('docNgang')) / 100) * n('bThan')) / 2,
      ht = n('hThan') + shift,
      hd = n('hDau'),
      t = n('tThan'),
      x = cx - n('lBe') / 2 + n('muiBe')
    const title =
      side === 0
        ? 'MẶT CẮT A–A'
        : side === 1
          ? 'MẶT CẮT B–B — CÁNH TRÁI'
          : 'MẶT CẮT C–C — CÁNH PHẢI'
    text(s, cx - 4000, by + h + ht + hd + 3000, title, 300)
    rect(s, 'mo_be', cx - n('lBe') / 2, by, n('lBe'), h)
    rect(
      s,
      'mo_be_tong_lot',
      cx - n('lBe') / 2 - n('phuLot'),
      by - n('hLot'),
      n('lBe') + 2 * n('phuLot'),
      n('hLot')
    )
    rect(s, 'mo_tuong_than', x, by + h, t, ht)
    rect(s, 'mo_tuong_dau', x + t - 500, by + h + ht, 500, hd)
    rect(s, 'goi_cau', x + 200, by + h + ht, 500, 100)
    if (side !== 0) {
      const start = x + t - 500,
        end = start + n('lCanh'),
        top = by + h + ht + hd,
        tail = top + (n('docDoc') / 100) * n('lCanh'),
        knee = by + h + 1700 + shift
      path(
        s,
        'mo_cau',
        [
          [start, by + h],
          [end - 3500, by + h],
          [end - 3500, knee],
          [end, knee + 3500],
          [end, tail],
          [start, top]
        ],
        true
      )
      dim(s, [start, top], [end, tail], 1700)
      text(s, start, top + 800, `Lc=${v.lCanh}; i dọc=${v.docDoc}%`, 230)
    }
    for (let row = 0; row < n('soHangCoc'); row++)
      pileStub(s, cx + (row - (n('soHangCoc') - 1) / 2) * n('aCocDoc'), by)
    dim(s, [cx - n('lBe') / 2, by], [cx + n('lBe') / 2, by], -2800)
    dim(s, [cx - n('lBe') / 2, by], [cx - n('lBe') / 2, by + h], -1500, 'dung')
    // C–C looks at the opposite side. Mirror geometry, not text glyphs.
    if (side === -1) {
      const mirror = (p: XY): XY => [2 * cx - p[0], p[1]]
      for (const op of s.primitives.slice(firstPrimitive)) {
        if (op.kind === 'path') op.points = op.points.map(mirror)
        else if (op.kind === 'circle') op.at = mirror(op.at)
        else if (op.kind === 'dimension') {
          op.start = mirror(op.start)
          op.end = mirror(op.end)
          if (op.direction === 'dung') op.offset *= -1
        }
      }
    }
  }
  function plan(s: DossierSheet, cx: number, cy: number, pilesOnly: boolean) {
    const b = n('bBe'),
      l = n('lBe')
    text(
      s,
      cx - b / 2,
      cy + l / 2 + 2500,
      pilesOnly ? 'MẶT BẰNG CỌC' : 'MẶT BẰNG MỐ',
      300
    )
    rect(s, 'mo_be', cx - b / 2, cy - l / 2, b, l)
    for (const p of model.piles) {
      circle(s, 'coc_khoan_nhoi', [cx + p.x, cy + p.y], n('D') / 2)
      path(s, 'duong_tim', [
        [cx + p.x - 800, cy + p.y],
        [cx + p.x + 800, cy + p.y]
      ])
      path(s, 'duong_tim', [
        [cx + p.x, cy + p.y - 800],
        [cx + p.x, cy + p.y + 800]
      ])
    }
    if (!pilesOnly) {
      const y = cy - l / 2 + n('muiBe')
      rect(s, 'mo_tuong_than', cx - n('bThan') / 2, y, n('bThan'), n('tThan'))
      for (const side of [-1, 1])
        rect(
          s,
          'mo_cau',
          cx + (side * n('bThan')) / 2 - (side > 0 ? n('tCanh') : 0),
          y + n('tThan') - 500,
          n('tCanh'),
          n('lCanh')
        )
      for (const [i, x] of model.bearings.entries()) {
        rect(s, 'goi_cau', cx + x - 250, y + 200, 500, 400)
        text(s, cx + x - 250, y - 600, `g${i + 1}`, 220)
      }
    }
    dim(s, [cx - b / 2, cy - l / 2], [cx + b / 2, cy - l / 2], -1800)
    dim(s, [cx + b / 2, cy - l / 2], [cx + b / 2, cy + l / 2], 1700, 'dung')
    text(
      s,
      cx - b / 2,
      cy - l / 2 - 2800,
      `${v.soHangCoc} hàng × ${v.soCotCoc} cọc D${v.D}; tim ${v.aCocNgang} × ${v.aCocDoc}`,
      230
    )
  }
  const general = sheet('BC01', 'Bố trí chung — hình chiếu')
  const panels: {
    name: string
    minX: number
    maxX: number
    minY: number
    maxY: number
  }[] = []
  function panel(name: string, generate: () => void) {
    const start = general.primitives.length
    generate()
    const points: XY[] = []
    for (const op of general.primitives.slice(start)) {
      if (op.kind === 'text') continue
      if (op.kind === 'fill') points.push(...op.loops.flat())
      else if (op.kind === 'path') points.push(...op.points)
      else if (op.kind === 'circle')
        points.push(
          [op.at[0] - op.radius, op.at[1] - op.radius],
          [op.at[0] + op.radius, op.at[1] + op.radius]
        )
      else {
        points.push(op.start, op.end)
        if (op.direction === 'ngang')
          points.push(
            [op.start[0], op.start[1] + op.offset],
            [op.end[0], op.start[1] + op.offset]
          )
        else
          points.push(
            [op.start[0] + op.offset, op.start[1]],
            [op.start[0] + op.offset, op.end[1]]
          )
      }
    }
    const box = {
      name,
      minX: Math.min(...points.map(p => p[0])),
      maxX: Math.max(...points.map(p => p[0])),
      minY: Math.min(...points.map(p => p[1])),
      maxY: Math.max(...points.map(p => p[1]))
    }
    if (
      box.minX < 2000 ||
      box.maxX > W - 2000 ||
      box.minY < 7000 ||
      box.maxY > H - 2000
    )
      throw new Error(
        `${name}: hình vượt vùng bố trí tờ A1 tại tỷ lệ 1:100; cần bố trí/tỷ lệ khác.`
      )
    for (const other of panels)
      if (
        Math.min(box.maxX, other.maxX) > Math.max(box.minX, other.minX) &&
        Math.min(box.maxY, other.maxY) > Math.max(box.minY, other.minY)
      )
        throw new Error(
          `${name} chồng vùng hình ${other.name}; cần bố trí/tỷ lệ khác, chưa áp dụng thay đổi.`
        )
    panels.push(box)
  }
  panel('Mặt chính', () => front(general, 12000, 33000))
  panel('A–A', () => section(general, 31000, 33000, 0))
  panel('B–B', () => section(general, 49000, 33000, 1))
  panel('C–C', () => section(general, 69000, 33000, -1))
  panel('Mặt bằng mố', () => plan(general, 22000, 16000, false))
  panel('Mặt bằng cọc', () => plan(general, 55000, 16000, true))
  const control = sheet('BC02', 'Thông số, cao độ và kiểm tra')
  text(
    control,
    5000,
    54000,
    'CAO ĐỘ TÍNH TỪ MÔ HÌNH — KHÔNG SAO CHÉP NHÃN',
    380
  )
  const elevRows = [
    ['Đáy bệ EL6', model.elevations.bottom],
    ['Đỉnh bệ EL5', model.elevations.footing],
    ['Kê gối tại tim', model.elevations.seat],
    ['Kê gối trái tuyến', model.elevations.seatLeft],
    ['Kê gối phải tuyến', model.elevations.seatRight],
    ['Đỉnh tường tại tim', model.elevations.wall]
  ] as const
  elevRows.forEach(([name, value], i) =>
    text(control, 5000, 52000 - i * 900, `${name}: ${fmt(value)} m`, 300)
  )
  text(control, 43000, 54000, 'THÔNG SỐ THIẾT KẾ', 380)
  Object.entries(v)
    .filter(([k]) => !['x', 'y'].includes(k))
    .forEach(([k, value], i) =>
      text(control, 43000, 52000 - i * 1000, `${k}: ${value}`, 260)
    )
  text(control, 5000, 44000, 'CÁC MỤC CẦN HOÀN THIỆN', 380)
  let iy = 42000
  for (const i of model.issues) {
    const words = i.message.split(' ')
    let line = ''
    for (const word of words) {
      if ((line + ' ' + word).length > 95) {
        text(control, 5000, iy, line, 250)
        iy -= 600
        line = ''
      }
      line += (line ? ' ' : '') + word
    }
    if (line) {
      text(control, 5000, iy, line, 250)
      iy -= 600
    }
    iy -= 300
  }
  text(
    control,
    5000,
    10000,
    'Nguồn: 02. BTC- mo_2.dwg; dùng bảng H1A/H1B làm chuẩn dựng.',
    250
  )
  text(
    control,
    5000,
    9000,
    'Số đo trong CAD có chênh với bảng gốc; đây là mô hình triển khai bản nháp.',
    250
  )
  // Source geometry must not be presented as an updated design after dimensions change.
  const sourceGeometry = Object.entries(dossierDefaults()).every(
    ([key, value]) =>
      [
        'x',
        'y',
        'congTrinh',
        'tenMo',
        'thep',
        'thepF3',
        'thepW16',
        'beTongLot'
      ].includes(key) || v[key] === value
  )
  const appendReference = (
    s: DossierSheet,
    key: keyof typeof reference.views,
    x: number,
    y: number
  ) => {
    for (const raw of reference.views[key].ops) {
      const op = { ...raw } as unknown as {
        kind: 'text' | 'path' | 'fill'
        role: string
        color: number
        at?: XY
        text?: string
        height?: number
        rotation?: number
        align?: number
        widthFactor?: number
        points?: XY[]
        closed?: boolean
        loops?: XY[][]
        sourceHandle: string
        sourceLayer: string
        sourceType: string
      }
      if (op.text && key !== 'general') {
        op.text = op.text.replace(/\bM1\b/g, String(v.tenMo))
        if (v.thepF3 === 'D22') op.text = op.text.replace(/F3-D25/g, 'F3-D22')
        if (v.thepW16 === 'D16')
          op.text = op.text.replace(/W16(')?-D14/g, 'W16$1-D16')
      }
      const role =
        op.role === 'geometry'
          ? key === 'general'
            ? 'mo_cau'
            : 'cot_thep'
          : op.role
      const color =
        [7, 8, 9].includes(op.color) && role !== 'mo_cau' && role !== 'cot_thep'
          ? undefined
          : op.color
      const identity = {
        ...base(s, role),
        color,
        sourceHandle: op.sourceHandle,
        sourceLayer: op.sourceLayer,
        sourceType: op.sourceType
      }
      const shift = (p: XY): XY => [x + p[0], y + p[1]]
      if (op.kind === 'text' && op.at && op.text)
        s.primitives.push({
          ...identity,
          kind: 'text',
          at: shift(op.at),
          text: op.text,
          height: op.height ?? 150,
          rotation: op.rotation,
          align: op.align,
          widthFactor: op.widthFactor
        })
      else if (op.kind === 'fill' && op.loops)
        s.primitives.push({
          ...identity,
          kind: 'fill',
          loops: op.loops.map(loop => loop.map(shift))
        })
      else if (op.points)
        s.primitives.push({
          ...identity,
          kind: 'path',
          points: op.points.map(shift),
          closed: op.closed
        })
    }
  }
  if (sourceGeometry) {
    const general = sheets[0]
    general.primitives = []
    appendReference(general, 'general', 5000, 13000)
    text(
      general,
      5000,
      54000,
      `BỐ TRÍ MỐ ${v.tenMo} — CHI TIẾT TRÍCH TỪ CAD GỐC`,
      420
    )
    text(
      general,
      5000,
      10000,
      'Giữ hình học, ký hiệu và nhãn kích thước gốc; đối chiếu chênh lệch với bảng thông số BC02.',
      230
    )
  }
  for (const [id, title, key] of [
    ['CT01', 'Cốt thép bệ, thân và đỉnh', 'main'],
    ['CT02', 'Cốt thép tường cánh trái', 'left'],
    ['CT03', 'Cốt thép tường cánh phải', 'right']
  ] as const) {
    const s = sheet(id, title)
    s.scale = 75
    s.width = W * 0.75
    s.height = H * 0.75
    text(s, 6000, s.height - 3500, title.toUpperCase(), 420)
    if (model.referenceSteelApplicable) {
      appendReference(s, key, (s.width - reference.views[key].width) / 2, 8500)
      text(
        s,
        6000,
        7500,
        'Chi tiết nguồn: giữ nét hatch, mũi tên, ký hiệu thép và góc xoay chữ. Chưa tái thiết kế thép.',
        240
      )
    } else {
      text(s, 6000, 34000, 'CHƯA CÓ PHƯƠNG ÁN THÉP CHO HÌNH HỌC NÀY', 450)
      text(
        s,
        6000,
        32000,
        'Không kéo giãn hoặc sao chép cấu tạo thép M1 sang kích thước mới.',
        300
      )
      text(
        s,
        6000,
        30000,
        'Bổ sung thiết kế thép đã duyệt để hoàn thiện tờ này.',
        300
      )
    }
  }
  const schedule = sheet('KL01', 'Thống kê thép và khối lượng')
  text(
    schedule,
    4000,
    55000,
    'THỐNG KÊ THÉP THAM CHIẾU M1 — CHIỀU DÀI GIA CÔNG THEO BẢNG GỐC',
    340
  )
  if (model.referenceSteelApplicable) {
    bars.forEach((bar, i) => {
      const column = Math.floor(i / 35),
        row = i % 35,
        x = 4000 + column * 39000,
        y = 52000 - row * 850
      if (row === 0)
        text(
          schedule,
          x,
          y + 1000,
          'Mã / Nhóm | D | SL | Dài (mm) | Khối lượng (kg)',
          250
        )
      const mass = ((bar.count * bar.length) / 1000) * bar.kgPerM
      text(
        schedule,
        x,
        y,
        `${bar.mark} / ${steelGroups[bar.group]} | ${bar.diameter} | ${bar.count} | ${bar.length} | ${fmt(mass)}`,
        250
      )
    })
    const kg = bars.reduce(
      (sum, b) => sum + ((b.count * b.length) / 1000) * b.kgPerM,
      0
    )
    text(
      schedule,
      4000,
      19500,
      `Tổng tính từ SL × dài × kg/m: ${fmt(kg)} kg; bảng gốc: 14058.319 kg.`,
      300
    )
  } else
    text(
      schedule,
      4000,
      51000,
      'Không có thống kê thép áp dụng cho mô hình hiện tại.',
      320
    )
  const q = model.quantities
  text(
    schedule,
    4000,
    17500,
    'KHỐI LƯỢNG HÌNH HỌC ĐƠN GIẢN — CHƯA KHẤU TRỪ GIAO NHAU',
    320
  )
  text(
    schedule,
    4000,
    16000,
    `Bệ hộp: ${fmt(q.footing)} m³ | Lót: ${fmt(q.blinding)} m³ | Thân: ${fmt(q.stem)} m³`,
    280
  )
  text(
    schedule,
    4000,
    14700,
    q.pileConcrete === null
      ? 'Cọc: chưa tính — thiếu chiều dài thực.'
      : `Cọc trụ tròn: ${fmt(q.pileConcrete)} m³; chưa trừ ngàm/giao bệ.`,
    280
  )
  text(
    schedule,
    4000,
    13400,
    'Tường đỉnh/cánh/lan can và tổng bê tông: chưa bóc hình khối đầy đủ.',
    280
  )
  text(
    schedule,
    4000,
    12100,
    'Tham chiếu bảng gốc: BT C30 = 186.253 m³; lót C10 = 4.446 m³.',
    280
  )
  text(
    schedule,
    4000,
    10800,
    'Khối lượng gốc chỉ để đối chiếu, không dùng cho hình học đã thay đổi.',
    280
  )
  for (const s of sheets) frame(s)
  return {
    version: DOSSIER_VERSION,
    reference: REFERENCE_ID,
    status: 'draft',
    detailMode: sourceGeometry ? 'source' : 'parametric',
    model,
    sheets
  }
}

export function drawDossierScene(
  ctx: AcTpDrawContext,
  scene: DossierScene
): void {
  const fields: Record<string, string[]> = {
    mo_be: ['bBe', 'lBe', 'hBe'],
    mo_be_tong_lot: ['hLot', 'phuLot'],
    mo_tuong_than: ['bThan', 'tThan', 'hThan'],
    mo_tuong_dau: ['hDau'],
    coc_khoan_nhoi: [
      'D',
      'soCotCoc',
      'soHangCoc',
      'aCocNgang',
      'aCocDoc',
      'lCoc'
    ],
    mo_cau: ['lCanh', 'tCanh'],
    goi_cau: ['soGoi', 'aGoi'],
    lan_can: ['hLanCan']
  }
  const point = (s: DossierSheet, p: XY) => ({
    x: s.origin[0] + p[0],
    y: s.origin[1] + p[1],
    z: 0
  })
  for (const s of scene.sheets)
    for (const op of s.primitives) {
      const tag = {
        role: op.role,
        partId: op.partId,
        color: op.color,
        params: {
          ...Object.fromEntries(
            (fields[op.role] ?? []).map(k => [k, scene.model.values[k]])
          ),
          ...(op.sourceHandle
            ? {
                sourceHandle: op.sourceHandle,
                sourceLayer: op.sourceLayer ?? '',
                sourceType: op.sourceType ?? ''
              }
            : {}),
          sheet: s.id,
          reference: scene.reference,
          status: scene.status
        }
      }
      if (op.kind === 'fill')
        ctx.hatch({
          ...tag,
          boundary: op.loops[0].map(p => point(s, p)),
          additionalLoops: op.loops
            .slice(1)
            .map(loop => loop.map(p => point(s, p)))
        })
      else if (op.kind === 'path')
        ctx.polyline({
          ...tag,
          points: op.points.map(p => point(s, p)),
          closed: op.closed
        })
      else if (op.kind === 'circle')
        ctx.circle({ ...tag, center: point(s, op.at), radius: op.radius })
      else if (op.kind === 'text')
        ctx.text({
          ...tag,
          position: point(s, op.at),
          text: op.text,
          height: op.height,
          rotationDeg: op.rotation,
          align: (op.align ?? 0) as 0 | 1 | 2,
          widthFactor: op.widthFactor
        })
      else
        ctx.dimension({
          ...tag,
          start: point(s, op.start),
          end: point(s, op.end),
          offset: op.offset,
          huong: op.direction
        })
    }
}
