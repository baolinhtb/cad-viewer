/**
 * A minimal `.xlsx` writer: SpreadsheetML parts in a ZIP stored without
 * compression. Runs in the browser and in Node (TextEncoder, Uint8Array
 * only), so the plugin needs no new dependency.
 *
 * Covers what a take-off needs: inline strings, numbers with a cached
 * formula, a handful of cell styles (borders, bold, wrap, 3-decimal numbers),
 * column widths, merged cells, a frozen header and landscape fit-to-width.
 */

/** Cell styles, by name; see {@link STYLES}. */
export type AcTpXlsxStyle =
  | 'text'
  | 'title'
  | 'subtitle'
  | 'header'
  | 'cell'
  | 'cellCenter'
  | 'cellWrap'
  | 'number'
  | 'integer'
  | 'bold'
  | 'boldNumber'
  | 'note'
  | 'noteNumber'

export interface AcTpXlsxCell {
  /** String, number, or empty. */
  v: string | number | null
  s?: AcTpXlsxStyle
  /** A formula; `v` is written as its cached result. */
  f?: string
}

export interface AcTpXlsxSheet {
  /** At most 31 characters, none of `[]:*?/\`. */
  name: string
  /** Column widths, characters. */
  columns: number[]
  rows: AcTpXlsxCell[][]
  /** Ranges such as `A1:E1`. */
  merges?: string[]
  /** Rows kept on screen when scrolling. */
  freezeRows?: number
  /** Rows repeated on every printed page (1-based, inclusive). */
  printTitleRows?: [number, number]
  landscape?: boolean
}

// ---- Styles ---------------------------------------------------------------
// Fonts: 0 normal, 1 bold, 2 bold 14, 3 italic grey.
// Borders: 0 none, 1 thin all round.
// Number formats: 164 = #,##0.000, 3 = #,##0 (built in).
const STYLES: Record<
  AcTpXlsxStyle,
  {
    font: number
    border: number
    numFmt: number
    h?: 'center' | 'left' | 'right'
    wrap?: boolean
  }
> = {
  text: { font: 0, border: 0, numFmt: 0 },
  title: { font: 2, border: 0, numFmt: 0, h: 'center' },
  subtitle: { font: 0, border: 0, numFmt: 0, h: 'center' },
  header: { font: 1, border: 1, numFmt: 0, h: 'center', wrap: true },
  cell: { font: 0, border: 1, numFmt: 0 },
  cellCenter: { font: 0, border: 1, numFmt: 0, h: 'center' },
  cellWrap: { font: 0, border: 1, numFmt: 0, wrap: true },
  number: { font: 0, border: 1, numFmt: 164 },
  integer: { font: 0, border: 1, numFmt: 3 },
  bold: { font: 1, border: 1, numFmt: 0, wrap: true },
  boldNumber: { font: 1, border: 1, numFmt: 164 },
  note: { font: 3, border: 1, numFmt: 0, wrap: true },
  noteNumber: { font: 3, border: 1, numFmt: 164 }
}
const STYLE_NAMES = Object.keys(STYLES) as AcTpXlsxStyle[]

function stylesXml() {
  const xfs = STYLE_NAMES.map(name => {
    const s = STYLES[name]
    // Bordered cells centre vertically, so numbers line up with wrapped text.
    const align =
      s.h || s.wrap || s.border
        ? `<alignment${s.h ? ` horizontal="${s.h}"` : ''} vertical="center"${s.wrap ? ' wrapText="1"' : ''}/>`
        : ''
    return (
      `<xf numFmtId="${s.numFmt}" fontId="${s.font}" fillId="0" borderId="${s.border}" xfId="0"` +
      `${s.numFmt ? ' applyNumberFormat="1"' : ''}${s.font ? ' applyFont="1"' : ''}${s.border ? ' applyBorder="1"' : ''}` +
      (align ? ` applyAlignment="1">${align}</xf>` : '/>')
    )
  })
  const thin =
    '<left style="thin"/><right style="thin"/><top style="thin"/><bottom style="thin"/><diagonal/>'
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.000"/></numFmts>' +
    '<fonts count="4">' +
    '<font><sz val="11"/><name val="Times New Roman"/><family val="1"/></font>' +
    '<font><b/><sz val="11"/><name val="Times New Roman"/><family val="1"/></font>' +
    '<font><b/><sz val="14"/><name val="Times New Roman"/><family val="1"/></font>' +
    '<font><i/><sz val="11"/><color rgb="FF595959"/><name val="Times New Roman"/><family val="1"/></font>' +
    '</fonts>' +
    '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
    `<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border>${thin}</border></borders>` +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    `<cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs>` +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    '</styleSheet>'
  )
}

// ---- Sheets ---------------------------------------------------------------
/** Escapes text for XML and drops characters XML 1.0 cannot carry. */
function xmlText(s: string) {
  return (
    s
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  )
}

/** Column letters of a 0-based index: 0 → A, 26 → AA. */
export function acTpXlsxColumn(i: number): string {
  let s = ''
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26))
    s = String.fromCharCode(65 + ((n - 1) % 26)) + s
  return s
}

function sheetXml(sheet: AcTpXlsxSheet) {
  const width = Math.max(1, ...sheet.rows.map(r => r.length))
  const last = `${acTpXlsxColumn(width - 1)}${Math.max(1, sheet.rows.length)}`
  const rows = sheet.rows.map((row, r) => {
    const cells = row.map((cell, c) => {
      const ref = `${acTpXlsxColumn(c)}${r + 1}`
      const s = ` s="${STYLE_NAMES.indexOf(cell.s ?? 'text')}"`
      const f = cell.f ? `<f>${xmlText(cell.f)}</f>` : ''
      if (typeof cell.v === 'number') {
        if (!Number.isFinite(cell.v))
          throw new Error(`Ô ${ref}: số không hữu hạn.`)
        return `<c r="${ref}"${s}>${f}<v>${cell.v}</v></c>`
      }
      if (cell.v === null || cell.v === '')
        return f ? `<c r="${ref}"${s}>${f}</c>` : `<c r="${ref}"${s}/>`
      return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${xmlText(cell.v)}</t></is></c>`
    })
    return `<row r="${r + 1}">${cells.join('')}</row>`
  })
  const freeze = sheet.freezeRows
    ? `<pane ySplit="${sheet.freezeRows}" topLeftCell="A${sheet.freezeRows + 1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft"/>`
    : ''
  const cols = sheet.columns
    .map(
      (w, i) =>
        `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`
    )
    .join('')
  const merges = sheet.merges?.length
    ? `<mergeCells count="${sheet.merges.length}">${sheet.merges.map(m => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>`
    : ''
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>' +
    `<dimension ref="A1:${last}"/>` +
    `<sheetViews><sheetView workbookViewId="0">${freeze}</sheetView></sheetViews>` +
    '<sheetFormatPr defaultRowHeight="15"/>' +
    (cols ? `<cols>${cols}</cols>` : '') +
    `<sheetData>${rows.join('')}</sheetData>` +
    merges +
    '<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>' +
    `<pageSetup paperSize="9" orientation="${sheet.landscape ? 'landscape' : 'portrait'}" fitToWidth="1" fitToHeight="0"/>` +
    '</worksheet>'
  )
}

function workbookXml(sheets: AcTpXlsxSheet[]) {
  const titles = sheets
    .map((s, i) =>
      s.printTitleRows
        ? `<definedName name="_xlnm.Print_Titles" localSheetId="${i}">'${xmlText(s.name.replace(/'/g, '\u0027\u0027'))}'!$${s.printTitleRows[0]}:$${s.printTitleRows[1]}</definedName>`
        : ''
    )
    .join('')
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<bookViews><workbookView/></bookViews>' +
    `<sheets>${sheets.map((s, i) => `<sheet name="${xmlText(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>` +
    (titles ? `<definedNames>${titles}</definedNames>` : '') +
    '<calcPr calcId="191029" fullCalcOnLoad="1"/>' +
    '</workbook>'
  )
}

// ---- ZIP (stored) -----------------------------------------------------------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

/** CRC-32 (IEEE), as ZIP stores it. */
export function acTpCrc32(data: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < data.length; i++)
    c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/**
 * A ZIP archive of `files`, stored (no compression). Entries carry a fixed
 * 1980-01-01 time so the same input always gives the same bytes.
 */
export function acTpZipStore(
  files: { name: string; data: Uint8Array }[]
): Uint8Array {
  const enc = new TextEncoder()
  const DOS_DATE = (0 << 9) | (1 << 5) | 1
  const locals: Uint8Array[] = []
  const centrals: Uint8Array[] = []
  let offset = 0
  for (const file of files) {
    const name = enc.encode(file.name)
    const crc = acTpCrc32(file.data)
    const size = file.data.length
    const local = new Uint8Array(30 + name.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true)
    lv.setUint16(4, 20, true)
    lv.setUint16(6, 0x0800, true) // UTF-8 names
    lv.setUint16(8, 0, true) // stored
    lv.setUint16(10, 0, true)
    lv.setUint16(12, DOS_DATE, true)
    lv.setUint32(14, crc, true)
    lv.setUint32(18, size, true)
    lv.setUint32(22, size, true)
    lv.setUint16(26, name.length, true)
    local.set(name, 30)
    const central = new Uint8Array(46 + name.length)
    const cv = new DataView(central.buffer)
    cv.setUint32(0, 0x02014b50, true)
    cv.setUint16(4, 20, true)
    cv.setUint16(6, 20, true)
    cv.setUint16(8, 0x0800, true)
    cv.setUint16(10, 0, true)
    cv.setUint16(12, 0, true)
    cv.setUint16(14, DOS_DATE, true)
    cv.setUint32(16, crc, true)
    cv.setUint32(20, size, true)
    cv.setUint32(24, size, true)
    cv.setUint16(28, name.length, true)
    cv.setUint32(42, offset, true)
    central.set(name, 46)
    locals.push(local, file.data)
    centrals.push(central)
    offset += local.length + size
  }
  const centralSize = centrals.reduce((s, c) => s + c.length, 0)
  const end = new Uint8Array(22)
  const ev = new DataView(end.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(8, files.length, true)
  ev.setUint16(10, files.length, true)
  ev.setUint32(12, centralSize, true)
  ev.setUint32(16, offset, true)
  const parts = [...locals, ...centrals, end]
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

/** An `.xlsx` workbook of `sheets`. */
export function acTpXlsx(
  sheets: AcTpXlsxSheet[],
  props: { title?: string; creator?: string } = {}
): Uint8Array {
  if (!sheets.length) throw new Error('Sổ tính cần ít nhất một sheet.')
  const names = new Set<string>()
  for (const s of sheets) {
    if (!s.name || s.name.length > 31 || /[[\]:*?/\\]/.test(s.name))
      throw new Error(`Tên sheet không hợp lệ: "${s.name}".`)
    if (names.has(s.name.toLowerCase()))
      throw new Error(`Trùng tên sheet: "${s.name}".`)
    names.add(s.name.toLowerCase())
  }
  const enc = new TextEncoder()
  const head = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
  const rel = (id: string, type: string, target: string) =>
    `<Relationship Id="${id}" Type="${type}" Target="${target}"/>`
  const R =
    'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
  const files: [string, string][] = [
    [
      '[Content_Types].xml',
      head +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        sheets
          .map(
            (_, i) =>
              `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
          )
          .join('') +
        '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
        '</Types>'
    ],
    [
      '_rels/.rels',
      head +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        rel('rId1', `${R}/officeDocument`, 'xl/workbook.xml') +
        rel(
          'rId2',
          'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties',
          'docProps/core.xml'
        ) +
        '</Relationships>'
    ],
    [
      'docProps/core.xml',
      head +
        '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">' +
        (props.title ? `<dc:title>${xmlText(props.title)}</dc:title>` : '') +
        (props.creator
          ? `<dc:creator>${xmlText(props.creator)}</dc:creator>`
          : '') +
        '</cp:coreProperties>'
    ],
    ['xl/workbook.xml', workbookXml(sheets)],
    [
      'xl/_rels/workbook.xml.rels',
      head +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        sheets
          .map((_, i) =>
            rel(`rId${i + 1}`, `${R}/worksheet`, `worksheets/sheet${i + 1}.xml`)
          )
          .join('') +
        rel(`rId${sheets.length + 1}`, `${R}/styles`, 'styles.xml') +
        '</Relationships>'
    ],
    ['xl/styles.xml', stylesXml()],
    ...sheets.map(
      (s, i) =>
        [`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s)] as [string, string]
    )
  ]
  return acTpZipStore(
    files.map(([name, text]) => ({ name, data: enc.encode(text) }))
  )
}
