import { AcDbDatabase, AcDbLine } from '@mlightcad/data-model'

import { createDrawContext } from '../src/AcTpDrawContext'
import { formatPartId } from '../src/AcTpPartId'
import { SEED_ROLE_LAYERS, SEED_ROLES } from '../src/AcTpSeed'
import {
  type AcTpTerm,
  canEditSemantically,
  describePart,
  locateParts,
  normalizeTerm,
  resolveTerm
} from '../src/AcTpSemanticQuery'

/** The company dictionary, shaped as the standardisation layer serves it. */
const DICTIONARY: AcTpTerm[] = [
  {
    role: 'ban_mat_cau',
    label: 'Bản mặt cầu',
    aliases: ['bản mặt cầu', 'bản']
  },
  { role: 'lan_can', label: 'Lan can', aliases: ['lan can', 'tay vịn'] },
  {
    role: 'lop_phu',
    label: 'Lớp phủ mặt cầu',
    aliases: ['lớp phủ', 'bê tông nhựa']
  },
  {
    role: 'ong_thoat_nuoc',
    label: 'Ống thoát nước',
    aliases: ['ống thoát nước', 'ống thoát']
  },
  { role: 'go_chan_banh', label: 'Gờ chắn bánh', aliases: ['gờ chắn'] },
  { role: 'ghi_chu', label: 'Ghi chú', aliases: ['ghi chú', 'chú thích'] }
]

function taggedDrawing(): AcDbDatabase {
  const db = new AcDbDatabase()
  db.createDefaultData()
  const ctx = createDrawContext(db, 'cau_ban_btct', SEED_ROLE_LAYERS)

  ctx.polyline({
    role: 'ban_mat_cau',
    partId: formatPartId({ role: 'ban_mat_cau' }),
    params: { B: 9000, h: 600 },
    closed: true,
    points: [
      { x: -4500, y: 0, z: 0 },
      { x: 4500, y: 0, z: 0 },
      { x: 4500, y: -600, z: 0 },
      { x: -4500, y: -600, z: 0 }
    ]
  })
  ctx.polyline({
    role: 'lop_phu',
    partId: formatPartId({ role: 'lop_phu' }),
    params: { tLopPhu: 70 },
    points: [
      { x: -4500, y: 0, z: 0 },
      { x: 0, y: 160, z: 0 },
      { x: 4500, y: 0, z: 0 }
    ]
  })
  for (const side of ['trai', 'phai'] as const) {
    ctx.line({
      role: 'lan_can',
      partId: formatPartId({ role: 'lan_can', side }),
      params: { hLanCan: 1270, mocDo: 'mat_lop_phu' },
      start: { x: side === 'trai' ? -4500 : 4500, y: 70, z: 0 },
      end: { x: side === 'trai' ? -4500 : 4500, y: 1340, z: 0 }
    })
  }
  for (let i = 1; i <= 3; i++) {
    ctx.circle({
      role: 'ong_thoat_nuoc',
      partId: formatPartId({ role: 'ong_thoat_nuoc', ordinal: i }),
      center: { x: -4500 + i * 2250, y: -650, z: 0 },
      radius: 50
    })
  }
  return db
}

/** A drawing as it arrives from DWG: real geometry, no semantic tags. */
function untaggedDrawing(): AcDbDatabase {
  const db = new AcDbDatabase()
  db.createDefaultData()
  db.tables.blockTable.modelSpace.appendEntity(
    new AcDbLine({ x: 0, y: 0, z: 0 }, { x: 9000, y: 0, z: 0 })
  )
  return db
}

describe('matching what an engineer said', () => {
  test('tone marks and case do not decide the answer', () => {
    // An engineer typing quickly writes "lan can" as often as "làn can".
    for (const phrase of ['Lan can', 'lan can', 'LAN CAN', ' làn  can ']) {
      expect(resolveTerm(phrase, DICTIONARY).role).toBe('lan_can')
    }
  })

  test('đ folds, which NFD alone does not do', () => {
    expect(normalizeTerm('Đường tim')).toBe('duong tim')
  })

  test('an alias resolves to its canonical role', () => {
    expect(resolveTerm('tay vịn', DICTIONARY).role).toBe('lan_can')
    expect(resolveTerm('bê tông nhựa', DICTIONARY).role).toBe('lop_phu')
  })

  test('a qualified phrase still resolves to the base role', () => {
    // "lan can bên phải" contains "lan can"; containment beats edit distance.
    expect(resolveTerm('lan can bên phải', DICTIONARY).role).toBe('lan_can')
  })

  test('a word nobody declared is refused, with suggestions', () => {
    // Acting on a near-miss is how "xóa lan can" becomes "xóa lan can trái".
    const outcome = resolveTerm('lan cn', DICTIONARY)
    expect(outcome.role).toBeUndefined()
    expect(outcome.suggestions.map(s => s.role)).toContain('lan_can')
  })

  test('a word with nothing like it gets no invented suggestion', () => {
    const outcome = resolveTerm('máy xúc', DICTIONARY)
    expect(outcome.role).toBeUndefined()
    expect(outcome.suggestions).toEqual([])
  })
})

describe('locating a part in a drawing', () => {
  const db = taggedDrawing()

  test('a unique part is found and named back', () => {
    const result = locateParts(db, 'bản mặt cầu', DICTIONARY)
    expect(result.status).toBe('found')
    expect(result.parts[0].partId).toBe('ban_mat_cau')
    expect(result.message).toContain('Bản mặt cầu')
  })

  test('two matches are ambiguous, never a pick', () => {
    // Choosing one of two rails is exactly the silent wrong edit this whole
    // layer exists to prevent.
    const result = locateParts(db, 'lan can', DICTIONARY)
    expect(result.status).toBe('ambiguous')
    expect(result.parts).toHaveLength(2)
    expect(result.message).toContain('bên trái')
    expect(result.message).toContain('bên phải')
  })

  test('a side qualifier resolves the ambiguity', () => {
    const result = locateParts(db, 'lan can', DICTIONARY, { side: 'phai' })
    expect(result.status).toBe('found')
    expect(result.parts[0].partId).toBe('lan_can_phai')
  })

  test('an ordinal picks one of a numbered run', () => {
    const result = locateParts(db, 'ống thoát nước', DICTIONARY, { ordinal: 2 })
    expect(result.status).toBe('found')
    expect(result.parts[0].partId).toBe('ong_thoat_nuoc_02')
  })

  test('a part the drawing does not have is not found', () => {
    const result = locateParts(db, 'gờ chắn', DICTIONARY)
    expect(result.status).toBe('not_found')
    expect(result.parts).toEqual([])
  })

  test('an unknown word is unknown, not "not found"', () => {
    // The two mean different things to the person reading the answer: one is
    // about the drawing, the other about the dictionary.
    const result = locateParts(db, 'lan cn', DICTIONARY)
    expect(result.status).toBe('unknown_term')
    expect(result.suggestions?.[0].label).toBe('Lan can')
  })
})

describe('a drawing that carries no tags', () => {
  const db = untaggedDrawing()

  test('the answer is "cannot ask", not "not found"', () => {
    // Answering "there is no railing here" about a drawing that is entirely
    // railing is worse than answering nothing: it sounds like knowledge.
    const result = locateParts(db, 'lan can', DICTIONARY)
    expect(result.status).toBe('unsupported')
    expect(result.message).toContain('DWG')
    expect(result.message).toContain('Không thể sửa tự động')
  })

  test('the state is reported the same way for a term that does not exist', () => {
    // On an untagged drawing every question has the same answer, and letting
    // an unknown-term result escape would hide the real reason.
    expect(locateParts(db, 'máy xúc', DICTIONARY).status).toBe('unsupported')
  })

  test('editing is refused up front, before any model call', () => {
    const verdict = canEditSemantically(db)
    expect(verdict.allowed).toBe(false)
    expect(verdict.reason).toContain('không mang nhãn')
  })

  test('a tagged drawing is editable', () => {
    expect(canEditSemantically(taggedDrawing()).allowed).toBe(true)
  })
})

describe('the Story 1.1 sentence set', () => {
  const db = taggedDrawing()

  /**
   * Each sentence with the part it refers to, taken from the draft term list.
   * Sentences naming parts a cross-section does not contain are marked with
   * the status they must produce — those are `not_found`, never a wrong pick.
   */
  // Objects rather than tuples: a positional list where some entries omit the
  // trailing fields is exactly the shape that quietly passes the wrong
  // argument, and the failure looks like a bug in the code under test.
  const SENTENCES: Array<{
    sentence: string
    phrase: string
    side?: 'trai' | 'phai'
    ordinal?: number
  }> = [
    { sentence: 'đổi bề rộng bản mặt cầu thành 9m', phrase: 'bản mặt cầu' },
    { sentence: 'tăng chiều dày bản lên 60cm', phrase: 'bản' },
    { sentence: 'nâng lan can lên 1.27m', phrase: 'lan can', side: 'phai' },
    { sentence: 'đổi lớp phủ thành 7cm', phrase: 'lớp phủ' },
    { sentence: 'xóa lan can bên phải', phrase: 'lan can', side: 'phai' },
    {
      sentence: 'bỏ ống thoát nước ở giữa nhịp',
      phrase: 'ống thoát nước',
      ordinal: 2
    },
    { sentence: 'bản mặt cầu dày bao nhiêu?', phrase: 'bản mặt cầu' },
    { sentence: 'lan can cao bao nhiêu?', phrase: 'tay vịn', side: 'trai' },
    {
      sentence: 'khoảng cách ống thoát nước là bao nhiêu?',
      phrase: 'ống thoát',
      ordinal: 1
    }
  ]

  test.each(SENTENCES)(
    '$sentence resolves to a concrete part',
    ({ phrase, side, ordinal }) => {
      const result = locateParts(db, phrase, DICTIONARY, { side, ordinal })
      expect(result.status).toBe('found')
      expect(result.parts).toHaveLength(1)
    }
  )

  test('every sentence produces an explicit outcome, never a silent guess', () => {
    // The measure that matters is not the hit rate; it is that no sentence
    // ends in a confident wrong answer.
    const phrases = [
      ...SENTENCES.map(item => item.phrase),
      'bản quá độ',
      'khe co giãn',
      'gối cầu',
      'cột kích thước',
      'máy xúc'
    ]
    const outcomes = phrases.map(
      phrase => locateParts(db, phrase, DICTIONARY).status
    )
    expect(
      outcomes.every(status =>
        [
          'found',
          'ambiguous',
          'not_found',
          'unknown_term',
          'unsupported'
        ].includes(status)
      )
    ).toBe(true)
    // Parts the cross-section genuinely lacks must not resolve to something
    // else that happens to be nearby.
    expect(locateParts(db, 'gờ chắn', DICTIONARY).status).toBe('not_found')
  })

  test('every role the dictionary declares is a real seed role', () => {
    const unknown = DICTIONARY.filter(term => !(term.role in SEED_ROLES))
    expect(unknown).toEqual([])
  })
})

describe('naming a part back to an engineer', () => {
  test('side and ordinal are spoken, not printed as slugs', () => {
    expect(
      describePart({
        role: 'lan_can',
        roleLabel: 'Lan can',
        partId: 'lan_can_phai',
        side: 'phai',
        layers: [],
        entityCount: 1
      })
    ).toBe('Lan can bên phải')

    expect(
      describePart({
        role: 'ong_thoat_nuoc',
        roleLabel: 'Ống thoát nước',
        partId: 'ong_thoat_nuoc_03',
        ordinal: 3,
        layers: [],
        entityCount: 1
      })
    ).toBe('Ống thoát nước số 3')
  })
})
