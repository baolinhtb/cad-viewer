#!/usr/bin/env node
/* global process */
/**
 * BTKL — writes the M1 sample and checks it with real spreadsheet software.
 *
 *   node tools/fidelity/btkl-xuat.mjs [--out /workspace/cadview-shots/btkl]
 *
 * 1. jest `btklXlsx.spec.ts` with BTKL_OUT: `btkl-M1.xlsx`, `m1-doi-chieu.md`
 *    (the full comparison with the SUB-100 table) and `btkl-M1.json`.
 * 2. openpyxl: sheets, headers, merged cells, number formats, formulas and
 *    their cached values.
 * 3. LibreOffice headless: opens the file, recalculates every formula
 *    (fullCalcOnLoad), exports each sheet as CSV and the workbook as PDF
 *    (first page as PNG); the recalculated steel total must equal the
 *    cached one.
 *
 * Writes only outside the repository; `xlsx-kiem.json` records the checks.
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const at = process.argv.indexOf('--out')
const OUT = at > 0 ? process.argv[at + 1] : '/workspace/cadview-shots/btkl'
mkdirSync(OUT, { recursive: true })

const run = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', ...opts })
  if (r.status !== 0)
    throw new Error(`${cmd} → mã ${r.status}\n${r.stdout}\n${r.stderr}`)
  return r.stdout
}

// 1. Sample files.
run(
  join(ROOT, 'node_modules/.bin/jest'),
  ['packages/cad-template-plugin/__tests__/btklXlsx.spec.ts', '--runInBand'],
  { env: { ...process.env, BTKL_OUT: OUT }, stdio: 'inherit' }
)
const xlsx = join(OUT, 'btkl-M1.xlsx')
const expected = JSON.parse(readFileSync(join(OUT, 'btkl-M1.json'), 'utf8'))

// 2. openpyxl.
const PY = `
import json, sys
import openpyxl
path, expected = sys.argv[1], json.loads(sys.argv[2])
f = openpyxl.load_workbook(path)
v = openpyxl.load_workbook(path, data_only=True)
out = {"sheets": f.sheetnames}
b, s = f["BTKL"], f["Thép chi tiết"]
out["btkl_header"] = [c.value for c in b[5]]
out["btkl_max_column"] = b.max_column
out["btkl_rows"] = [[b.cell(r, 1).value, b.cell(r, 4).value]
                    for r in range(7, 7 + len(expected["items"]))]
out["btkl_formats"] = sorted({b.cell(r, 4).number_format
                              for r in range(7, 7 + len(expected["items"]))
                              if isinstance(b.cell(r, 4).value, (int, float))})
out["merged"] = sorted(str(m) for m in b.merged_cells.ranges)[:3]
out["steel_header"] = [c.value for c in s[3]]
out["steel_rows"] = sum(1 for r in range(4, s.max_row + 1)
                        if isinstance(s.cell(r, 1).value, int))
out["steel_total_formula"] = s["I73"].value
out["steel_total_cached"] = v["Thép chi tiết"]["I73"].value
out["steel_formula_sample"] = [s["G4"].value, s["I4"].value]
out["freeze"] = [b.freeze_panes, s.freeze_panes]
out["landscape"] = [b.page_setup.orientation, s.page_setup.orientation]
print(json.dumps(out, ensure_ascii=False))
`
const py = JSON.parse(
  run('python3', [
    '-I',
    '-c',
    PY,
    xlsx,
    JSON.stringify({ items: expected.items.map(i => i.stt) })
  ])
)
const checks = []
const check = (name, ok, detail) => {
  checks.push({ name, ok, detail })
  if (!ok) console.error(`[btkl-xuat] SAI: ${name}`, detail ?? '')
}
check(
  'openpyxl: 2 sheet',
  py.sheets.join('|') === 'BTKL|Thép chi tiết',
  py.sheets
)
check(
  'openpyxl: BTKL đúng 5 cột',
  py.btkl_max_column === 5 &&
    py.btkl_header.join('|') ===
      'STT|Hạng mục|Đơn vị|Khối lượng|Diễn giải công thức',
  py.btkl_header
)
check(
  'openpyxl: số dòng và khối lượng BTKL',
  py.btkl_rows.every(
    ([stt, value], k) =>
      stt === expected.items[k].stt &&
      (expected.items[k].khoiLuong === null
        ? value === '—'
        : Math.abs(value - expected.items[k].khoiLuong) < 0.0005)
  ),
  py.btkl_rows.length
)
check(
  'openpyxl: định dạng số #,##0.000',
  py.btkl_formats.join() === '#,##0.000',
  py.btkl_formats
)
check('openpyxl: 69 dòng thép', py.steel_rows === 69, py.steel_rows)
check(
  'openpyxl: tổng thép là công thức, cache 14 058,319',
  py.steel_total_formula === '=SUM(I4:I72)' &&
    Math.abs(py.steel_total_cached - 14058.319) < 1e-6,
  [py.steel_total_formula, py.steel_total_cached]
)

// 3. LibreOffice: recalculate, CSV per sheet, PDF.
const lo = join(OUT, 'work', 'libreoffice')
mkdirSync(lo, { recursive: true })
const profile = `-env:UserInstallation=file://${join(OUT, 'work', 'lo-profile')}`
run('soffice', [
  profile,
  '--headless',
  '--convert-to',
  'csv:Text - txt - csv (StarCalc):44,34,76,1,,0,false,true,false,false,false,-1',
  '--outdir',
  lo,
  xlsx
])
run('soffice', [
  profile,
  '--headless',
  '--convert-to',
  'pdf',
  '--outdir',
  OUT,
  xlsx
])
run('pdftoppm', [
  '-png',
  '-r',
  '110',
  '-f',
  '1',
  '-l',
  '2',
  join(OUT, 'btkl-M1.pdf'),
  join(OUT, 'btkl-M1-trang')
])
const csvs = readdirSync(lo).filter(f => f.endsWith('.csv'))
const parse = text =>
  text
    .trim()
    .split('\n')
    .map(line => {
      const cells = []
      let cur = ''
      let quoted = false
      for (let i = 0; i < line.length; i++) {
        const ch = line[i]
        if (quoted) {
          if (ch === '"' && line[i + 1] === '"') ((cur += '"'), i++)
          else if (ch === '"') quoted = false
          else cur += ch
        } else if (ch === '"') quoted = true
        else if (ch === ',') (cells.push(cur), (cur = ''))
        else cur += ch
      }
      cells.push(cur)
      return cells
    })
const steelCsv = csvs.find(f => f.includes('Thép'))
const btklCsv = csvs.find(f => f.includes('BTKL'))
check('LibreOffice: xuất được 2 sheet CSV', csvs.length === 2, csvs)
const steelRows = parse(readFileSync(join(lo, steelCsv), 'utf8'))
const totalRow = steelRows.find(r => r[1] === 'Tổng cộng')
// Formatted cells come out as shown: "14,058.319" in the en-US locale.
const recalculated = Number(totalRow?.[8]?.replace(/,/g, ''))
check(
  'LibreOffice: tính lại tổng thép = 14 058,319',
  Math.abs(recalculated - 14058.319) < 0.0005,
  totalRow?.[8]
)
const btklRows = parse(readFileSync(join(lo, btklCsv), 'utf8'))
check(
  'LibreOffice: chữ tiếng Việt nguyên vẹn',
  btklRows.some(r => r[1] === 'Bê tông C30 mố') &&
    btklRows.some(r => r[1] === 'Tường cánh (2 bên)'),
  btklRows[4]
)

writeFileSync(
  join(OUT, 'xlsx-kiem.json'),
  JSON.stringify(
    { thoi_diem: new Date().toISOString(), openpyxl: py, checks },
    null,
    1
  )
)
const failed = checks.filter(c => !c.ok)
console.log(
  `[btkl-xuat] ${checks.length - failed.length}/${checks.length} kiểm đạt · ${OUT}`
)
if (failed.length) process.exit(1)
