/**
 * Vietnamese text written with the pre-Unicode encodings, read as Unicode.
 *
 * Older drawings write Vietnamese with 8-bit fonts: TCVN3/ABC (`.VnArial`,
 * `.VnTime`, `.VnAvantH`, `Vnsimple.shx`…) and VNI (`VNI-Times`,
 * `VNI-Helve`…). The DWG stores the raw bytes; read back through code page
 * 1252 they arrive as Latin-1 characters, so a title reads
 * "bè trÝ chung Mè M1" instead of "bố trí chung Mố M1". This module only
 * *reads*: nothing here changes a drawing.
 *
 * The encoding is decided by the **font**, never by looking at the text
 * alone: the same drawings also carry real Unicode (Arial styles, `{\fArial…}`
 * runs in dimension text, attribute values typed later), and decoding those
 * as TCVN3 turns "BÊ TÔNG" into "Bấ TễNG". When the font is unknown — DWG
 * import leaves most TrueType style fonts empty, because the name sits in the
 * style's XDATA — a narrower guess is made and reported as a guess (see
 * {@link acTpDecodeVnText}).
 */
import type { AcDbDatabase, AcDbEntity } from '@mlightcad/data-model'

/** Legacy Vietnamese encodings this module decodes. */
export type AcTpVnLegacyEncoding = 'tcvn3' | 'vni'

/** What a font name says about how its text is encoded. */
export interface AcTpVnFontInfo {
  encoding: AcTpVnLegacyEncoding
  /**
   * The font draws every letter as a capital (`.VnArialH`, `.VnAvantH`):
   * lower-case codes render upper-case, so the decoded text is upper-cased to
   * read the way the sheet shows it.
   */
  upper: boolean
}

// TCVN3 (ABC) code points as read through cp1252, in the same order as the
// Unicode letters below. Taken from tools/extract-m1-linework.py, which was
// checked against the titles of `02. BTC- mo_2.dwg`. `ý` is the same code
// point in both and so is absent; U+00AD (soft hyphen) is `ư`.
const TCVN3_LEGACY =
  'µ¸¶·¹¨»¾¼½Æ©ÇÊÈÉË®ÌÐÎÏÑªÒÕÓÔÖ×ÝØÜÞßãáâä«åèæçé¬êíëìîïóñòô­õøö÷ùúûüþ§¡¢£¤¥¦'
const TCVN3_UNICODE =
  'àáảãạăằắẳẵặâầấẩẫậđèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳỷỹỵĐĂÂÊÔƠƯ'

const TCVN3_MAP: ReadonlyMap<string, string> = new Map(
  [...TCVN3_LEGACY].map((ch, i) => [ch, [...TCVN3_UNICODE][i]])
)

/**
 * Vietnamese letters that Unicode itself encodes inside Latin-1. Text made
 * only of these (plus ASCII) can be genuine Unicode — "BÊ TÔNG" — so their
 * presence alone is never evidence of TCVN3.
 */
const UNICODE_VN_LATIN1 = new Set('ÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚÝàáâãèéêìíòóôõùúý')

/**
 * A TCVN3 code between two ASCII capitals (`TUYÕN`): whoever typed it meant
 * capitals, which TCVN3 only draws with the `…H` fonts. Used to pick the
 * capitals form when the font itself is unknown.
 */
const TCVN3_BETWEEN_CAPITALS = new RegExp(
  `[A-Z][${[...TCVN3_LEGACY].map(ch => `\\u${ch.codePointAt(0)!.toString(16).padStart(4, '0')}`).join('')}]+[A-Z]`
)

/** TCVN3 codes that are not Unicode Vietnamese letters: unambiguous. */
const TCVN3_ONLY = new Set(
  [...TCVN3_LEGACY].filter(ch => !UNICODE_VN_LATIN1.has(ch))
)

/**
 * VNI for Windows: a base letter followed by a mark character. Pairs are
 * matched before single characters. Marked **experimental**: there is no VNI
 * sample in the repository's drawings to check it against beyond the
 * standard table.
 */
const VNI_PAIRS: Readonly<Record<string, string>> = (() => {
  const pairs: Record<string, string> = {}
  // Tone marks after a plain vowel: sắc, huyền, hỏi, ngã, nặng.
  const tones = ['ù', 'ø', 'û', 'õ', 'ï']
  const plain: Record<string, string[]> = {
    a: ['á', 'à', 'ả', 'ã', 'ạ'],
    e: ['é', 'è', 'ẻ', 'ẽ', 'ẹ'],
    o: ['ó', 'ò', 'ỏ', 'õ', 'ọ'],
    u: ['ú', 'ù', 'ủ', 'ũ', 'ụ'],
    y: ['ý', 'ỳ', 'ỷ', 'ỹ', 'ỵ'],
    ô: ['ớ', 'ờ', 'ở', 'ỡ', 'ợ'], // `ô` alone is ơ in VNI
    ö: ['ứ', 'ừ', 'ử', 'ữ', 'ự'] // `ö` alone is ư
  }
  // Circumflex (â) and its tones: â, á, à, å, ã, ä.
  const hat = ['â', 'á', 'à', 'å', 'ã', 'ä']
  const hatted: Record<string, string[]> = {
    a: ['â', 'ấ', 'ầ', 'ẩ', 'ẫ', 'ậ'],
    e: ['ê', 'ế', 'ề', 'ể', 'ễ', 'ệ'],
    o: ['ô', 'ố', 'ồ', 'ổ', 'ỗ', 'ộ']
  }
  // Breve (ă) and its tones: ê, é, è, ú, ü, ë.
  const breve = ['ê', 'é', 'è', 'ú', 'ü', 'ë']
  const breved = ['ă', 'ắ', 'ằ', 'ẳ', 'ẵ', 'ặ']

  const add = (base: string, marks: string[], out: string[]) => {
    marks.forEach((mark, i) => {
      pairs[base + mark] = out[i]
      pairs[base.toUpperCase() + mark.toUpperCase()] = out[i].toUpperCase()
    })
  }
  for (const [base, out] of Object.entries(plain)) add(base, tones, out)
  for (const [base, out] of Object.entries(hatted)) add(base, hat, out)
  add('a', breve, breved)
  return pairs
})()

const VNI_SINGLE: Readonly<Record<string, string>> = {
  ô: 'ơ',
  Ô: 'Ơ',
  ö: 'ư',
  Ö: 'Ư',
  ñ: 'đ',
  Ñ: 'Đ',
  í: 'í',
  Í: 'Í',
  ì: 'ì',
  Ì: 'Ì',
  æ: 'ỉ',
  Æ: 'Ỉ',
  ó: 'ĩ',
  Ó: 'Ĩ',
  ò: 'ị',
  Ò: 'Ị',
  î: 'ỵ',
  Î: 'Ỵ'
}

/** Base name of a font: no folder, no extension, no surrounding space. */
function fontBase(font: string): string {
  const name = font.trim().split(/[\\/]/).pop() ?? ''
  return name.replace(/\.(ttf|otf|shx|ttc|pfb)$/i, '').trim()
}

/**
 * What a font name says about its encoding.
 *
 * `.VnArial`, `.VnTime`, `VnArial`, `Vnsimple.shx` → TCVN3; the `…H` members
 * of the family (`.VnArialH`, `.VnArial NarrowH`) draw capitals. `VNI-Times`,
 * `VNI-Helve-Condense` → VNI. Anything else → `null` (Unicode or unknown).
 */
export function acTpLegacyVnFont(
  fontName: string | undefined | null
): AcTpVnFontInfo | null {
  if (!fontName) return null
  const base = fontBase(fontName)
  if (/^vni[-_ ]/i.test(base)) {
    return { encoding: 'vni', upper: false }
  }
  if (/^\.?vn(?!i)/i.test(base)) {
    return { encoding: 'tcvn3', upper: /H$/.test(base) }
  }
  return null
}

const upperVi = (text: string) => text.toLocaleUpperCase('vi')

/** Decodes TCVN3 (ABC) text; ASCII passes through unchanged. */
export function acTpTcvn3ToUnicode(
  text: string,
  options: { upper?: boolean } = {}
): string {
  let out = ''
  for (const ch of text) out += TCVN3_MAP.get(ch) ?? ch
  return options.upper ? upperVi(out) : out
}

/** Decodes VNI text (experimental, see {@link VNI_PAIRS}). */
export function acTpVniToUnicode(
  text: string,
  options: { upper?: boolean } = {}
): string {
  const chars = [...text]
  let out = ''
  for (let i = 0; i < chars.length; i++) {
    const pair = VNI_PAIRS[chars[i] + (chars[i + 1] ?? '')]
    if (pair) {
      out += pair
      i++
      continue
    }
    out += VNI_SINGLE[chars[i]] ?? chars[i]
  }
  out = out.normalize('NFC')
  return options.upper ? upperVi(out) : out
}

/**
 * Text that reads as Unicode capitals: every accented letter is a Vietnamese
 * capital Unicode keeps in Latin-1 (`LÝ TRÌNH`, `BÊ TÔNG`), each such word is
 * all capitals, and nothing TCVN3-only appears. TCVN3 would spell the same
 * sounds with lower-case codes (`Lý TR×NH`), so this is treated as Unicode
 * even under a `.Vn` font — real drawings carry Unicode attribute values in
 * styles that still name a TCVN3 font. The cost is that a TCVN3 string made
 * only of such capitals (rare: `TUYÕN` alone) is left as typed.
 */
function looksLikeUnicodeCapitals(text: string): boolean {
  let accented = false
  for (const ch of text) {
    if (ch.codePointAt(0)! < 0x80) continue
    if (TCVN3_ONLY.has(ch)) return false
    if (!UNICODE_VN_LATIN1.has(ch) || ch !== ch.toUpperCase()) return false
    accented = true
  }
  if (!accented) return false
  return text
    .split(/[^A-Za-z\u00c0-\u00ff]+/)
    .filter(word => /[\u0080-\u00ff]/.test(word))
    .every(word => !/[a-z]/.test(word))
}

/** True when a run of text contains a character outside Latin-1. */
function hasBeyondLatin1(text: string): boolean {
  for (const ch of text) if (ch.codePointAt(0)! > 0xff) return true
  return false
}

/**
 * Evidence that text is TCVN3 even though its font is unknown.
 *
 * Two signs, both impossible in Unicode Vietnamese: a TCVN3 code that is not
 * a Vietnamese Latin-1 letter (`Ç`, `Æ`, `µ`, `®`…), or an accented capital
 * right after a lower-case letter inside a word (`trÝ`, `chÝnh` — TCVN3's
 * lower-case í is the code of Unicode `Ý`). Text with characters beyond
 * Latin-1 is Unicode already and never matches.
 */
export function acTpLooksLikeTcvn3(text: string): boolean {
  if (hasBeyondLatin1(text)) return false
  for (const ch of text) if (TCVN3_ONLY.has(ch)) return true
  return /[a-z][ÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚÝ]/.test(text)
}

/** Result of decoding one string. */
export interface AcTpDecodedText {
  /** The text in Unicode (unchanged when it needed no decoding). */
  text: string
  /** Set when something was decoded. */
  encoding?: AcTpVnLegacyEncoding
  /**
   * The font was unknown and the encoding was inferred from the style name
   * or from the text. Worth saying when the result is shown to a person.
   */
  guessed?: boolean
}

/** How the encoding of a run is chosen. */
interface RunEncoding {
  info: AcTpVnFontInfo | null
  guessed: boolean
}

function chooseEncoding(
  text: string,
  font: string | undefined,
  styleName: string | undefined
): RunEncoding {
  if (hasBeyondLatin1(text)) return { info: null, guessed: false }
  if (looksLikeUnicodeCapitals(text)) return { info: null, guessed: false }
  if (font && fontBase(font)) {
    return { info: acTpLegacyVnFont(font), guessed: false }
  }
  // Font unknown. The style name often still says it: `2_vnarialH`,
  // `VNARIALH`, `VnAvantH`, `vna`; failing that, the text has to.
  const style = styleName ?? ''
  if (/vni/i.test(style)) {
    return { info: { encoding: 'vni', upper: false }, guessed: true }
  }
  if (/vn/i.test(style) || acTpLooksLikeTcvn3(text)) {
    return {
      info: {
        encoding: 'tcvn3',
        upper: /H$/.test(style.trim()) || TCVN3_BETWEEN_CAPITALS.test(text)
      },
      guessed: true
    }
  }
  return { info: null, guessed: false }
}

function decodeRun(text: string, info: AcTpVnFontInfo): string {
  return info.encoding === 'vni'
    ? acTpVniToUnicode(text, { upper: info.upper })
    : acTpTcvn3ToUnicode(text, { upper: info.upper })
}

/**
 * Decodes the plain-text parts of a TEXT string, leaving `%%` control codes
 * (`%%U`, `%%c`, `%%d`, `%%p`, `%%%`) exactly as they were.
 */
function decodeTextString(text: string, info: AcTpVnFontInfo): string {
  return text
    .split(/(%%(?:%|[A-Za-z]|\d{3}))/)
    .map((part, i) => (i % 2 === 1 ? part : decodeRun(part, info)))
    .join('')
}

/** MTEXT escapes that take an argument up to `;`. */
const MTEXT_ARG = new Set([
  'A',
  'C',
  'c',
  'F',
  'f',
  'H',
  'Q',
  'T',
  'W',
  'p',
  'S'
])

/**
 * Decodes MTEXT contents run by run.
 *
 * Each `{…}` group may switch font with `\f<name>|…;`; the encoding follows
 * the font in force for that run, and formatting codes are copied verbatim.
 */
function decodeMText(
  contents: string,
  font: string | undefined,
  styleName: string | undefined
): AcTpDecodedText {
  let out = ''
  let run = ''
  let used: AcTpVnLegacyEncoding | undefined
  let guessed = false
  const stack: (string | undefined)[] = []
  let current = font

  const flush = () => {
    if (!run) return
    const choice = chooseEncoding(
      run,
      current,
      current === font ? styleName : undefined
    )
    if (choice.info) {
      const decoded = decodeRun(run, choice.info)
      if (decoded !== run) {
        used = choice.info.encoding
        guessed ||= choice.guessed
      }
      out += decoded
    } else {
      out += run
    }
    run = ''
  }

  for (let i = 0; i < contents.length; i++) {
    const ch = contents[i]
    if (ch === '\\' && i + 1 < contents.length) {
      const code = contents[i + 1]
      flush()
      if (MTEXT_ARG.has(code)) {
        const end = contents.indexOf(';', i + 2)
        const stop = end < 0 ? contents.length - 1 : end
        if (code === 'f' || code === 'F') {
          current = contents.slice(i + 2, stop).split('|')[0]
        }
        out += contents.slice(i, stop + 1)
        i = stop
      } else {
        out += ch + code
        i++
      }
      continue
    }
    if (ch === '{') {
      flush()
      stack.push(current)
      out += ch
      continue
    }
    if (ch === '}') {
      flush()
      current = stack.length ? stack.pop() : font
      out += ch
      continue
    }
    run += ch
  }
  flush()
  if (!used) return { text: out }
  return guessed
    ? { text: out, encoding: used, guessed: true }
    : { text: out, encoding: used }
}

/**
 * Reads one string as Unicode, decoding it when its font is a legacy one.
 *
 * - Font known and legacy → decoded.
 * - Font known and not legacy → unchanged.
 * - Font unknown (typical of DWG import) → decoded as TCVN3 only when the
 *   style name contains `vn`, or the text carries TCVN3-only evidence
 *   ({@link acTpLooksLikeTcvn3}); VNI only when the style name says `vni`.
 *   Such results carry `guessed: true`.
 * - Any run containing a character beyond Latin-1 is already Unicode and is
 *   never touched.
 *
 * @param text - TEXT/ATTRIB string, or MTEXT contents when `mtext` is set.
 * @param options.font - Font of the entity's text style (file or face name).
 * @param options.styleName - Name of the text style, used only as a hint.
 * @param options.mtext - Parse MTEXT formatting (`\f` font switches, groups).
 */
export function acTpDecodeVnText(
  text: string,
  options: { font?: string; styleName?: string; mtext?: boolean } = {}
): AcTpDecodedText {
  if (!text) return { text }
  if (options.mtext) return decodeMText(text, options.font, options.styleName)
  const choice = chooseEncoding(text, options.font, options.styleName)
  if (!choice.info) return { text }
  const decoded = decodeTextString(text, choice.info)
  if (decoded === text) return { text }
  return {
    text: decoded,
    encoding: choice.info.encoding,
    ...(choice.guessed ? { guessed: true } : {})
  }
}

/**
 * Font of a text style: the TrueType face from ACAD XDATA when present, else
 * the font file. `undefined` when the drawing does not say — which is the
 * usual case for TrueType styles imported from DWG.
 *
 * Two quirks of the data model are undone here. A style with no font gets
 * its own *name* as the font file, which would make every style look like it
 * names its font; that fallback is treated as "unknown". And the extension
 * strip turns `.VnArialH` into an empty string (the leading dot reads as an
 * extension), so an empty file name is also "unknown" — the style name and
 * the text are then the only evidence left.
 */
export function acTpTextStyleFont(
  db: AcDbDatabase,
  styleName: string | undefined
): string | undefined {
  if (!styleName) return undefined
  const record = db.tables.textStyleTable.getAt(styleName)
  if (!record) return undefined
  let extended: string | undefined
  try {
    extended = record.textStyle.extendedFont
  } catch {
    // A record the renderer cannot describe still has a file name.
  }
  if (extended && fontBase(extended)) return extended
  const file = record.fileName
  if (!file || !fontBase(file)) return undefined
  if (file.trim().toLowerCase() === record.name.trim().toLowerCase()) {
    return undefined
  }
  return file
}

/** MTEXT contents as plain text: codes dropped, `\P` as a line break. */
export function acTpMTextPlain(contents: string): string {
  return contents
    .replace(/\\P/g, '\n')
    .replace(/\\[ACcFfHQTWpS][^;]*;/g, '')
    .replace(/\\[LlOoKkNX~]/g, m => (m === '\\~' ? ' ' : ''))
    .replace(/\\([\\{}])/g, '$1')
    .replace(/[{}]/g, '')
}

/** One piece of text found in a drawing, decoded for reading. */
export interface AcTpDrawingText {
  layer: string
  space: 'model' | 'paper'
  kind: 'TEXT' | 'MTEXT' | 'ATTRIB'
  /** Plain Unicode text. */
  text: string
  /** The string as stored, only when it differs from `text`. */
  rawText?: string
  encoding?: AcTpVnLegacyEncoding
  guessed?: boolean
  height: number
}

/** What the collector gathers. */
export interface AcTpCollectTextsOptions {
  /**
   * Layers whose text is wanted (case-insensitive) — title, notes, elevation
   * callouts. Paper-space text is always included: that is where titles and
   * sheet numbers sit.
   */
  layers?: readonly string[]
  /** Maximum number of entries; the tallest text is kept first. */
  limit?: number
}

/**
 * Collects titles and notes from a drawing, decoded to Unicode.
 *
 * Model space contributes TEXT, MTEXT and block attributes on the requested
 * layers; every paper-space layout contributes all of its text. Read-only.
 */
export function acTpCollectDrawingTexts(
  db: AcDbDatabase,
  options: AcTpCollectTextsOptions = {}
): { texts: AcTpDrawingText[]; truncated: boolean } {
  const wanted = new Set((options.layers ?? []).map(l => l.toLowerCase()))
  const limit = options.limit ?? 60
  const found: AcTpDrawingText[] = []
  const fontCache = new Map<string, string | undefined>()
  const fontOf = (style: string) => {
    if (!fontCache.has(style))
      fontCache.set(style, acTpTextStyleFont(db, style))
    return fontCache.get(style)
  }

  const take = (
    entity: AcDbEntity,
    space: 'model' | 'paper',
    always: boolean
  ) => {
    const layer = entity.layer || '0'
    if (!always && !wanted.has(layer.toLowerCase())) return
    const e = entity as AcDbEntity & {
      dxfTypeName: string
      textString?: string
      contents?: string
      styleName?: string
      height?: number
    }
    const type = e.dxfTypeName
    if (type !== 'TEXT' && type !== 'MTEXT' && type !== 'ATTRIB') return
    const raw = (type === 'MTEXT' ? e.contents : e.textString) ?? ''
    if (!raw.trim()) return
    const decoded = acTpDecodeVnText(raw, {
      font: fontOf(e.styleName ?? ''),
      styleName: e.styleName,
      mtext: type === 'MTEXT'
    })
    const text = (
      type === 'MTEXT' ? acTpMTextPlain(decoded.text) : decoded.text
    ).trim()
    found.push({
      layer,
      space,
      kind: type as AcTpDrawingText['kind'],
      text,
      ...(text !== raw ? { rawText: raw } : {}),
      ...(decoded.encoding ? { encoding: decoded.encoding } : {}),
      ...(decoded.guessed ? { guessed: true } : {}),
      height: e.height ?? 0
    })
  }

  const walk = (
    entities: Iterable<AcDbEntity>,
    space: 'model' | 'paper',
    always: boolean
  ) => {
    for (const entity of entities) {
      take(entity, space, always)
      const withAttributes = entity as AcDbEntity & {
        attributeIterator?: () => Iterable<AcDbEntity>
      }
      if (typeof withAttributes.attributeIterator === 'function') {
        for (const attribute of withAttributes.attributeIterator()) {
          take(attribute, space, always)
        }
      }
    }
  }

  walk(db.tables.blockTable.modelSpace.newIterator(), 'model', false)
  for (const block of db.tables.blockTable.newIterator()) {
    if (block.isPaperSapce) walk(block.newIterator(), 'paper', true)
  }

  found.sort((a, b) => b.height - a.height)
  return { texts: found.slice(0, limit), truncated: found.length > limit }
}
