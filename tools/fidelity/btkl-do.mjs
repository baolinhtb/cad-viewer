#!/usr/bin/env node
/* global process */
/**
 * BTKL B1 — measures the abutment's concrete parts on the source drawing and
 * sets them against the SUB-100 quantity table.
 *
 *   node tools/fidelity/btkl-do.mjs [--out /workspace/cadview-shots/btkl]
 *
 * Reads only `reference/layout-mo2.json` (SUB-010 outlines, model mm local to
 * the sheet window) and the SUB-020 dimension table. Every measured figure
 * names the entity handles it comes from, so the result can be checked on the
 * DWG. Prints the comparison table and writes `do-tiet-dien.json` outside the
 * repository.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const at = process.argv.indexOf('--out')
const OUT = at > 0 ? process.argv[at + 1] : '/workspace/cadview-shots/btkl'

const layout = JSON.parse(
  readFileSync(
    join(
      ROOT,
      'packages/cad-template-plugin/src/dossier/reference/layout-mo2.json'
    ),
    'utf8'
  )
)
const sheet = id => layout.sheets.find(s => s.id === id)
const sub010 = sheet('SUB-010').content
const byHandle = h => {
  const e = sub010.find(c => c.handle === h)
  if (!e) throw new Error(`Không thấy đối tượng ${h} trên SUB-010`)
  return e.points
}

/** SUB-020 dimension table: header → value (m). */
const table = (() => {
  const cells = sheet('SUB-020').paper.filter(c => c.kind === 'text')
  const head = cells.filter(c => / \(m\)$/.test(c.text))
  const row = cells.filter(c => /^\d+\.\d+$/.test(c.text))
  const out = {}
  for (const h of head) {
    const v = row.find(
      c =>
        Math.abs(c.at[0] - h.at[0]) < 3 &&
        c.at[1] < h.at[1] &&
        h.at[1] - c.at[1] < 6
    )
    if (v) out[h.text.replace(/ \(m\)$/, '')] = Number(v.text)
  }
  return out
})()

const m = v => v / 1000
/** Shoelace area, m², of a closed ring in mm. */
const area = pts =>
  Math.abs(
    pts.reduce((s, p, i) => {
      const q = pts[(i + 1) % pts.length]
      return s + p[0] * q[1] - q[0] * p[1]
    }, 0)
  ) / 2e6
const r3 = v => Math.round(v * 1000) / 1000

// ---- Where things are (SUB-010, local window mm) --------------------------
// A–A: stem front face polyline 20EB326, seat/head-wall 20EB32A, footing
// 20EB2FF.
const stemFront = byHandle('20EB326')
const seat = byHandle('20EB32A')
const footing = byHandle('20EB2FF')
const footTop = footing[0][1]
const xFront = stemFront[0][0]
const xBack = seat[2][0]
const xHeadBack = seat[0][0]
const ySeat = seat[1][1]
// Plan: stem/wing outline 20EF296 (wing inner faces, 300×300 haunches).
const plan = byHandle('20EF296')
const bMo = m(plan[9][0] - plan[0][0])
const tCanh = m(plan[2][0] - plan[1][0])
const haunch = r3(m(plan[4][0] - plan[3][0]))
const between = r3(m(plan[6][0] - plan[3][0]))
// B–B: wing bottom 20EF257, wing top (hidden) 211150F, stem back 20EF24D.
const wingBottom = byHandle('20EF257')
const wingTop = byHandle('211150F')
const xStemBackBB = byHandle('20EF24D')[0][0]
const footTopBB = wingBottom[0][1]
const topAt = x => {
  const [[x1, y1], [x0, y0]] = wingTop
  return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0)
}
// Front view: ear walls 20E9199/20E91D4 (right), 20E91D5/20E91D6 (left);
// shear keys 20E91CE/20E91CD/20E91D3, 20E91E0/20E91E5/20E91E4.
const earR = [byHandle('20E9199'), byHandle('20E91D4')]
const earL = [byHandle('20E91D5'), byHandle('20E91D6')]
const keyA = [byHandle('20E91CE'), byHandle('20E91CD')]
const keyB = [byHandle('20E91E0'), byHandle('20E91E5')]
// Parapet on the wing top: 1140 high (B–B 20EF255, 20EF254, 2111549).
const parapetH = m(byHandle('20EF255')[0][1] - byHandle('20EF255')[1][1])

// ---- Parts -----------------------------------------------------------------
const tThan = m(xBack - xFront)
const T = m(xHeadBack - xFront)
const N = m(xBack - xHeadBack)
// The table value: the drawn seat sits 1 mm off (4716).
const H1A = table.H1A
const H1Adrawn = m(ySeat - footTop)
const items = []
const add = (key, source, value, formula, handles, note) =>
  items.push({
    key,
    nguon: source,
    do: value == null ? null : r3(value),
    formula,
    handles,
    note
  })

// Stem below the seat: the seat follows the 2 % crossfall, linear across, so
// its mean height is the centre value (H1A, the A–A cut is on the centre
// line); table EL4.L/EL4.R agree (H2A 4.640, H3A 4.794, mean 4.717).
add(
  'than',
  53.667,
  bMo * tThan * H1A,
  `B Mố × B(TT) × H1A = ${bMo} × ${tThan} × ${H1A} (hình đo ${r3(H1Adrawn)})`,
  ['20EB326', '20EB32A', '20EF296'],
  'Không giải thích được: bản gốc nhỏ hơn 0,814 m³ (1,5 %). Đã thử: chiều cao mép thấp H2A (53,592), trừ chỗ cánh chồng thân (52,122), bỏ khối vút/vai (chỉ làm tăng). Tổng thân + đỉnh + cánh của bản gốc (88,644) nhỏ hơn khối hình học hợp lại ở dưới, nên không phải chia lại ranh giới giữa các dòng.'
)
const H1B = table.H1B
add(
  'dinh',
  7.267,
  bMo * T * H1B,
  `B Mố × T × H1B = ${bMo} × ${T} × ${H1B}`,
  ['20EB32A', '20EB2FC'],
  'Khớp (đỉnh cũng dốc 2 % nên trung bình = giá trị tim). Chênh do làm tròn H1B.'
)
// Wing (B–B shows the right wing, H4A): from the stem back face along LC,
// on the footing up to its end, then the 1:1 underside (A), the 1500 end and
// the top line. The left wing is the same shape 140 lower (H4B = H4A − 0.140,
// H2 = H3 − 0.140) except where it stands on the flat footing.
const wingRight = area([
  [xStemBackBB, footTopBB],
  ...wingBottom,
  [xStemBackBB, topAt(xStemBackBB)]
])
const onFooting = m(wingBottom[0][0] - xStemBackBB)
const drop = r3(table.H4A - table.H4B)
const wingLeft = wingRight - drop * onFooting
add(
  'canh',
  27.71,
  tCanh * (wingRight + wingLeft),
  `tCanh × (S phải + S trái) = ${tCanh} × (${r3(wingRight)} + ${r3(wingLeft)}), S trái = S phải − ${drop} × ${onFooting}`,
  ['20EF257', '211150F', '20EF24D', '20EF296'],
  'Gần khớp (+0,047 m³ ở bản gốc, 0,17 %). Cánh trái thấp hơn cánh phải 0,140 (H4B, H2), trừ phần đứng trên bệ phẳng. Hai cánh như B–B thì 27,838.'
)
const ear = pair =>
  m(Math.abs(pair[0][0][1] - pair[0][1][1])) *
  m(Math.abs(pair[1][0][0] - pair[1][1][0]))
add(
  'tai',
  0.36,
  (ear(earR) + ear(earL)) * N,
  `2 × (cao × dày) × N = (${r3(ear(earR))} + ${r3(ear(earL))}) × ${N}`,
  ['20E9199', '20E91D4', '20E91D5', '20E91D6'],
  'Khớp: mỗi bên tường tai 150 × 1200 trên mặt chính, dài bằng bệ kê gối N = 1000.'
)
const keyFace = k =>
  m(k[1][0][0] - k[0][0][0]) *
  ((m(k[0][0][1] - k[0][1][1]) + m(k[1][1][1] - k[1][0][1])) / 2)
add(
  'u_chong_xo',
  0.304,
  null,
  `mặt đứng 2 ụ = ${r3(keyFace(keyA))} + ${r3(keyFace(keyB))} m²; chiều sâu không có trên hình`,
  ['20E91CE', '20E91CD', '20E91D3', '20E91E0', '20E91E5', '20E91E4'],
  `Không dẫn xuất được: chỉ có mặt đứng (1000 × ~355), chiều sâu theo dọc cầu suy ra từ bảng là ${r3(0.304 / (keyFace(keyA) + keyFace(keyB)))} m — không có kích thước nào trên hình.`
)
add(
  'lan_can',
  5.223,
  null,
  `cao ${parapetH} m trên đỉnh cánh, dài LC; tiết diện không có trên hình`,
  ['20EF255', '20EF254', '2111549'],
  `Không dẫn xuất được: chỉ có cao 1140 và dài LC = 6,5 m mỗi bên; tiết diện suy ra từ bảng là ${r3(5.223 / 2 / 6.5)} m² — không có hình mặt cắt lan can.`
)
// Parts drawn but not in any table row.
const corbelSection = area(stemFront.slice(1, 5).concat([[xFront, 21091]]))
add(
  'vai_ke_bqd',
  null,
  corbelSection * between,
  `tiết diện A–A ${r3(corbelSection)} m² × ${between} m (giữa hai cánh; bỏ qua vát đầu)`,
  ['20EB326', '20E91CC'],
  'Vai kê bản quá độ (300 × 300 + vát 300) có trên A–A, B–B, mặt chính nhưng không có dòng nào trong bảng.'
)
add(
  'vut_canh',
  null,
  2 * ((haunch * haunch) / 2) * m(20481 - footTop),
  `2 × ${haunch}²/2 × ${r3(m(20481 - footTop))}`,
  ['20EF296'],
  'Vút 300 × 300 giữa thân và cánh (mặt bằng, nét khuất mặt chính) — không có dòng nào trong bảng.'
)

// ---- Report -----------------------------------------------------------------
const rows = items.map(i => ({
  ...i,
  chenh: i.nguon != null && i.do != null ? r3(i.nguon - i.do) : null
}))
const sum = keys =>
  r3(rows.filter(r => keys.includes(r.key)).reduce((s, r) => s + r.do, 0))
const union = sum(['than', 'dinh', 'canh', 'vai_ke_bqd', 'vut_canh'])
const result = {
  thoi_diem: new Date().toISOString(),
  bang_thong_so_SUB_020: table,
  kich_thuoc_do: {
    bMo,
    tThan,
    T,
    N,
    H1A,
    H1Adrawn: r3(H1Adrawn),
    tCanh,
    haunch,
    between,
    parapetH
  },
  dong: rows,
  kiem_tong: {
    ban_goc_than_dinh_canh: 88.644,
    hinh_hoc_hop_lai: union,
    ghi_chu:
      'Thân + đỉnh + cánh + vai kê + vút đo trên hình; bản gốc thiếu so với hình học.'
  }
}
mkdirSync(OUT, { recursive: true })
writeFileSync(join(OUT, 'do-tiet-dien.json'), JSON.stringify(result, null, 1))
const pad = (v, n) => String(v ?? '—').padStart(n)
console.log('Dòng          Bản gốc     Đo   Chênh(gốc−đo)')
for (const r of rows)
  console.log(
    `${r.key.padEnd(12)}${pad(r.nguon, 8)}${pad(r.do, 9)}${pad(r.chenh, 9)}  ${r.formula}`
  )
console.log(
  `Kiểm tổng: bản gốc thân+đỉnh+cánh 88,644 · hình học hợp lại ${union}`
)
console.log(`[btkl-do] ${join(OUT, 'do-tiet-dien.json')}`)
