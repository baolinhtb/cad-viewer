/**
 * Reading TCVN3 / VNI text as Unicode.
 *
 * The TCVN3 fixtures are real strings from `assets/02. BTC- mo_2.dwg` and
 * `Phantachcaukienmo_va_dat_ten_layer.dwg`, exactly as LibreDWG returns them
 * (code page 1252, one Latin-1 character per byte), with the style each one
 * uses. The Unicode fixtures from the same drawings are there to prove they
 * are left alone.
 */
import {
  AcDbBlockTableRecord,
  AcDbDatabase,
  AcDbMText,
  AcDbText,
  AcDbTextStyleTableRecord,
  AcGePoint3d
} from '@mlightcad/data-model'

import {
  acTpCollectDrawingTexts,
  acTpDecodeVnText,
  acTpLegacyVnFont,
  acTpLooksLikeTcvn3,
  acTpMTextPlain,
  acTpTcvn3ToUnicode,
  acTpTextStyleFont,
  acTpVniToUnicode
} from '../src/AcTpVnText'

describe('font names', () => {
  test.each([
    ['.VnArial', { encoding: 'tcvn3', upper: false }],
    ['.VnArialH', { encoding: 'tcvn3', upper: true }],
    ['.VnArial NarrowH', { encoding: 'tcvn3', upper: true }],
    ['.VnAvantH', { encoding: 'tcvn3', upper: true }],
    ['.VnTime.ttf', { encoding: 'tcvn3', upper: false }],
    [
      'C:\\Program Files (x86)\\TDT Solution 7.1\\Vnsimple.shx',
      { encoding: 'tcvn3', upper: false }
    ],
    ['VNI-Helve-Condense', { encoding: 'vni', upper: false }],
    ['VNI-Times.ttf', { encoding: 'vni', upper: false }]
  ])('%s is a legacy Vietnamese font', (font, expected) => {
    expect(acTpLegacyVnFont(font)).toEqual(expected)
  })

  test.each([
    'Arial.ttf',
    'Arial Narrow.ttf',
    'txt',
    'unicode.shx',
    'C3Font',
    '',
    undefined
  ])('%s is not', font => {
    expect(acTpLegacyVnFont(font)).toBeNull()
  })
})

describe('TCVN3 → Unicode', () => {
  test('every code in the table decodes to a distinct Vietnamese letter', () => {
    const legacy =
      'µ¸¶·¹¨»¾¼½Æ©ÇÊÈÉË®ÌÐÎÏÑªÒÕÓÔÖ×ÝØÜÞßãáâä«åèæçé¬êíëìîïóñòô\u00adõøö÷ùúûüþ§¡¢£¤¥¦'
    const decoded = [...acTpTcvn3ToUnicode(legacy)]
    expect(decoded).toHaveLength([...legacy].length)
    expect(new Set(decoded).size).toBe(decoded.length)
    // Beyond Latin-1, or one of the Vietnamese letters Unicode keeps there.
    expect(
      decoded.filter(
        ch => ch.codePointAt(0)! <= 0xff && !'àáâãèéêìíòóôõùúÂÊÔ'.includes(ch)
      )
    ).toEqual([])
  })

  test.each([
    // [raw, font, expected] — titles of 02. BTC- mo_2.dwg, style 2_vnarialH.
    ['CÇu km0+400 (TuyÕn sè 2)', '.VnArial', 'Cầu km0+400 (Tuyến số 2)'],
    ['bè trÝ chung Mè M1 (1/2)', '.VnArial', 'bố trí chung Mố M1 (1/2)'],
    ['bè trÝ cèt thÐp Mè M1 (1/3)', '.VnArial', 'bố trí cốt thép Mố M1 (1/3)'],
    ['tæng hîp khèi l\u00adîng mè m1', '.VnArial', 'tổng hợp khối lượng mố m1'],
    ['CÇu km0+400 (TuyÕn sè 2)', '.VnArialH', 'CẦU KM0+400 (TUYẾN SỐ 2)'],
    [
      'B¶NG TH¤NG Sè KÝCH TH¦íC Mè m1',
      '.VnArialH',
      'BẢNG THÔNG SỐ KÍCH THƯỚC MỐ M1'
    ],
    // Phantachcaukienmo…dwg.
    ['Tim giai ®o¹n hoµn thiÖn', '.VnArial', 'Tim giai đoạn hoàn thiện'],
    ['ph¶i TUYÕN', '.VnArialH', 'PHẢI TUYẾN']
  ])('%s (%s)', (raw, font, expected) => {
    expect(acTpDecodeVnText(raw, { font })).toEqual({
      text: expected,
      encoding: 'tcvn3'
    })
  })

  test('%% control codes survive, including under a capitals font', () => {
    expect(
      acTpDecodeVnText('%%UmÆt chÝnh mè M1', { font: '.VnArialH' }).text
    ).toBe('%%UMẶT CHÍNH MỐ M1')
    expect(acTpDecodeVnText('i=0%%%', { font: '.VnArialH' }).text).toBe(
      'I=0%%%'
    )
    expect(acTpDecodeVnText('%%c1200 cäc', { font: '.VnArial' }).text).toBe(
      '%%c1200 cọc'
    )
  })
})

describe('Unicode text is never decoded', () => {
  test.each([
    // Btext → Arial in the BTC drawing.
    ['BÊ TÔNG ĐỆM C8', 'Arial.ttf'],
    ['CỌC KHOAN NHỒI', 'Arial.ttf'],
    // Block "Tieude0.5": style TEXT → .VnAvantH, yet stored as Unicode.
    ['TÊN CỌC', '.VnAvantH'],
    ['CAO ĐỘ THIẾT KẾ', '.VnAvantH']
  ])('%s (%s)', (raw, font) => {
    expect(acTpDecodeVnText(raw, { font })).toEqual({ text: raw })
  })

  test('the corruption a blind conversion causes does not happen', () => {
    // Converting this as TCVN3 regardless of font gives "Bấ TễNG ĐỆM C8".
    expect(acTpTcvn3ToUnicode('BÊ TÔNG')).toBe('Bấ TễNG')
    expect(acTpDecodeVnText('BÊ TÔNG', { styleName: 'Btext' }).text).toBe(
      'BÊ TÔNG'
    )
    expect(acTpDecodeVnText('BÊ TÔNG', { font: 'Arial.ttf' }).text).toBe(
      'BÊ TÔNG'
    )
  })
})

describe('font unknown (DWG import leaves TrueType style fonts empty)', () => {
  test('the style name says vn: decoded, and reported as a guess', () => {
    expect(
      acTpDecodeVnText('bè trÝ chung', { styleName: '2_vnarialH' })
    ).toEqual({
      text: 'BỐ TRÍ CHUNG',
      encoding: 'tcvn3',
      guessed: true
    })
  })

  test('the text itself proves TCVN3: decoded, as a guess', () => {
    // Style KT → .VnArialH in the drawing, but the name says nothing. The
    // capitals around Õ show it is drawn with a capitals font, so the whole
    // string reads the way the sheet shows it.
    expect(acTpDecodeVnText('ph¶i TUYÕN', { styleName: 'KT' })).toEqual({
      text: 'PHẢI TUYẾN',
      encoding: 'tcvn3',
      guessed: true
    })
    expect(acTpDecodeVnText('Tim cÇu', { styleName: 'ARIALH' })).toEqual({
      text: 'TIM CẦU',
      encoding: 'tcvn3',
      guessed: true
    })
    expect(acTpDecodeVnText('Tim cÇu', { styleName: 'ARIAL1' }).text).toBe(
      'Tim cầu'
    )
  })

  test('Unicode capitals under a .Vn font are left alone', () => {
    // From 02. BTC- mo_2.dwg: style TEXT names .VnAvantH, yet the value is
    // Unicode. Read as TCVN3 it would become "LÍ TRÈNH".
    expect(acTpDecodeVnText('LÝ TRÌNH', { font: '.VnAvantH' })).toEqual({
      text: 'LÝ TRÌNH'
    })
    expect(acTpDecodeVnText('BÊ TÔNG', { font: '.VnArial' })).toEqual({
      text: 'BÊ TÔNG'
    })
    // The known cost: TCVN3 made only of such capitals stays as typed.
    expect(acTpDecodeVnText('TUYÕN', { font: '.VnArialH' }).text).toBe('TUYÕN')
    // Any lower case or TCVN3-only code and it is TCVN3 again.
    expect(acTpDecodeVnText('TUYÕN sè', { font: '.VnArial' }).text).toBe(
      'TUYếN số'
    )
  })

  test('evidence rules', () => {
    expect(acTpLooksLikeTcvn3('CÇu')).toBe(true) // Ç is not a Vietnamese letter
    expect(acTpLooksLikeTcvn3('trÝ')).toBe(true) // capital after lower case
    expect(acTpLooksLikeTcvn3('BÊ TÔNG')).toBe(false)
    expect(acTpLooksLikeTcvn3('Ý KIẾN')).toBe(false)
    expect(acTpLooksLikeTcvn3('Mè M1')).toBe(false) // could be either: left alone
    expect(acTpLooksLikeTcvn3('plain ascii')).toBe(false)
  })

  test('nothing to go on: left alone', () => {
    expect(acTpDecodeVnText('Mè M1', { styleName: 'TEXT' })).toEqual({
      text: 'Mè M1'
    })
  })
})

describe('MTEXT runs follow their own font', () => {
  test('a TCVN3 run and an inline Arial run in one string', () => {
    const raw = 'B mÆt {\\fArial|b0|i0|c0|p34;đường} cÇu\\P(tl: 1/100)'
    const decoded = acTpDecodeVnText(raw, { font: '.VnArial', mtext: true })
    expect(decoded).toEqual({
      text: 'B mặt {\\fArial|b0|i0|c0|p34;đường} cầu\\P(tl: 1/100)',
      encoding: 'tcvn3'
    })
    expect(acTpMTextPlain(decoded.text)).toBe('B mặt đường cầu\n(tl: 1/100)')
  })

  test('an inline .Vn font switch decodes inside an Arial MTEXT', () => {
    const raw = 'Ghi chú: {\\f.VnArial|b0|i0|c0|p34;cèt thÐp}'
    expect(acTpDecodeVnText(raw, { font: 'Arial.ttf', mtext: true }).text).toBe(
      'Ghi chú: {\\f.VnArial|b0|i0|c0|p34;cốt thép}'
    )
  })

  test('formatting codes are never decoded or upper-cased', () => {
    const raw = '\\H2.5x;\\C1;mÆt'
    expect(acTpDecodeVnText(raw, { font: '.VnArialH', mtext: true }).text).toBe(
      '\\H2.5x;\\C1;MẶT'
    )
  })
})

describe('VNI → Unicode (experimental)', () => {
  test.each([
    ['Vieät Nam', 'Việt Nam'],
    ['Caàu', 'Cầu'],
    ['ñöôøng', 'đường'],
    ['Möôøi', 'Mười'],
    ['naêm', 'năm'],
    ['Thieát keá', 'Thiết kế'],
    ['Coïc khoan nhoài', 'Cọc khoan nhồi'],
    ['tænh', 'tỉnh'],
    ['CAÀU ÑÖÔØNG', 'CẦU ĐƯỜNG']
  ])('%s', (raw, expected) => {
    expect(acTpVniToUnicode(raw)).toBe(expected)
    expect(acTpDecodeVnText(raw, { font: 'VNI-Times' })).toEqual({
      text: expected,
      encoding: 'vni'
    })
  })
})

describe('reading a drawing', () => {
  function drawing() {
    const db = new AcDbDatabase()
    db.createDefaultData()
    db.tables.textStyleTable.add(
      new AcDbTextStyleTableRecord({
        name: 'VNH',
        standardFlag: 0,
        fixedTextHeight: 0,
        widthFactor: 1,
        obliqueAngle: 0,
        textGenerationFlag: 0,
        lastHeight: 2.5,
        font: '',
        bigFont: '',
        // How a DXF delivers a TrueType face: ACAD XDATA → extendedFont.
        extendedFont: '.VnArialH'
      })
    )
    db.tables.textStyleTable.add(
      new AcDbTextStyleTableRecord({
        name: 'MANGLED',
        standardFlag: 0,
        fixedTextHeight: 0,
        widthFactor: 1,
        obliqueAngle: 0,
        textGenerationFlag: 0,
        lastHeight: 2.5,
        // The data model strips ".VnArialH" to "" (leading dot = extension).
        font: '.VnArialH',
        bigFont: ''
      })
    )
    db.tables.textStyleTable.add(
      new AcDbTextStyleTableRecord({
        name: 'KT',
        standardFlag: 0,
        fixedTextHeight: 0,
        widthFactor: 1,
        obliqueAngle: 0,
        textGenerationFlag: 0,
        lastHeight: 2.5,
        font: '',
        bigFont: ''
      })
    )
    return db
  }

  function text(
    db: AcDbDatabase,
    value: string,
    layer: string,
    style: string,
    height: number,
    space = db.tables.blockTable.modelSpace
  ) {
    if (!db.tables.layerTable.has(layer)) {
      // Layer existence is irrelevant to reading; the entity records the name.
    }
    const t = new AcDbText()
    t.textString = value
    t.styleName = style
    t.height = height
    t.position = new AcGePoint3d(0, 0, 0)
    space.appendEntity(t)
    t.layer = layer
    return t
  }

  test('the style font is read from the drawing', () => {
    const db = drawing()
    expect(acTpTextStyleFont(db, 'VNH')).toBe('.VnArialH')
    // No font: the data model fills in the style name, which is not a font.
    expect(acTpTextStyleFont(db, 'KT')).toBeUndefined()
    expect(acTpTextStyleFont(db, 'MANGLED')).toBeUndefined()
    expect(acTpTextStyleFont(db, 'missing')).toBeUndefined()
  })

  test('titles and notes on the requested layers come back decoded', () => {
    const db = drawing()
    text(db, 'mÆt chÝnh mè M1', '_33_Tieudebanve', 'VNH', 5)
    text(db, 'ph¶i TUYÕN', '_33_Ghichu', 'KT', 2.5)
    text(db, 'hình học', '_33_CAU_MO_Be', 'VNH', 9) // not a requested layer
    const mtext = new AcDbMText()
    mtext.contents = 'Ghi chú\\Pdòng 2'
    mtext.location = new AcGePoint3d(0, 0, 0)
    db.tables.blockTable.modelSpace.appendEntity(mtext)
    mtext.layer = 'GC-GHICHU'

    const { texts, truncated } = acTpCollectDrawingTexts(db, {
      layers: ['_33_tieudebanve', '_33_Ghichu', 'GC-GHICHU']
    })
    expect(truncated).toBe(false)
    expect(texts.map(t => t.text)).toEqual([
      'MẶT CHÍNH MỐ M1',
      'PHẢI TUYẾN',
      'Ghi chú\ndòng 2'
    ])
    expect(texts[0]).toMatchObject({
      layer: '_33_Tieudebanve',
      space: 'model',
      kind: 'TEXT',
      rawText: 'mÆt chÝnh mè M1',
      encoding: 'tcvn3'
    })
    expect(texts[0].guessed).toBeUndefined()
    expect(texts[1].guessed).toBe(true)
    expect(texts[2].encoding).toBeUndefined()
  })

  test('paper-space text is always read, and the limit keeps the tallest', () => {
    const db = drawing()
    let paper = [...db.tables.blockTable.newIterator()].find(
      b => b.isPaperSapce
    )
    if (!paper) {
      paper = new AcDbBlockTableRecord()
      paper.name = '*Paper_Space'
      db.tables.blockTable.add(paper)
    }
    text(db, 'sub-010', 'Text_01', 'VNH', 1.5, paper)
    text(db, 'CÇu km0+400', 'Text_01', 'VNH', 2.5, paper)
    const { texts, truncated } = acTpCollectDrawingTexts(db, { limit: 1 })
    expect(truncated).toBe(true)
    expect(texts).toEqual([
      expect.objectContaining({
        space: 'paper',
        text: 'CẦU KM0+400',
        height: 2.5
      })
    ])
  })
})
