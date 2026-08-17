import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

import {
  ERRORS,
  listTcvnDocuments,
  loadCorpus,
  resetCorpus,
  searchTcvn,
  stripDiacritics,
  tokenize
} from './tcvn.mjs'

/**
 * The real corpus, so the tests measure retrieval on the documents that ship
 * rather than on a fixture written to make them pass.
 */
const REAL_CORPUS = fileURLToPath(new URL('../../assets/tcvn', import.meta.url))

/** Writes a small corpus when a test needs to control exactly what is in it. */
function fixtureCorpus(files) {
  const dir = mkdtempSync(join(tmpdir(), 'tcvn-'))
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(dir, name), content)
  }
  resetCorpus()
  return dir
}

function codeOf(fn) {
  try {
    fn()
    return undefined
  } catch (error) {
    return error.code
  }
}

test('a decimal number stays one term', () => {
  // The standards write a lane width as "3,75". Split on the comma it becomes
  // "3" and "75", and the number an engineer read cannot be searched for.
  assert.deepEqual(tokenize('rộng 3,75 m'), ['rộng', '3,75', 'm'])
})

test('stripping diacritics also folds đ, which decomposition leaves alone', () => {
  assert.equal(stripDiacritics('đường'), 'duong')
  assert.equal(stripDiacritics('Điều'), 'Dieu')
})

test('a missing corpus directory is reported, not treated as no results', () => {
  resetCorpus()
  assert.equal(
    codeOf(() => loadCorpus(join(tmpdir(), 'tcvn-does-not-exist'))),
    ERRORS.NO_CORPUS
  )
})

test('an empty question is refused rather than ranking the whole corpus', () => {
  assert.equal(codeOf(() => searchTcvn('   ', { dir: REAL_CORPUS })), ERRORS.EMPTY_QUERY)
})

test('only files that name the standard they transcribe are indexed', () => {
  // The shipped directory holds its own README describing the conversion. It
  // is written about the standards rather than from them, and it outranked
  // real clauses on accent-free queries until it was excluded.
  const docs = listTcvnDocuments(REAL_CORPUS)
  assert.ok(docs.length >= 15, `expected the full corpus, got ${docs.length}`)
  assert.ok(
    !docs.some(doc => doc.docId.startsWith('README')),
    'the corpus README must not be searchable'
  )
  assert.ok(docs.every(doc => doc.standard && doc.chunks > 0))
})

test('a clause is returned with the standard and clause path that cite it', () => {
  const [top] = searchTcvn('chiều cao lan can cấp thử nghiệm TL-4', {
    limit: 1,
    dir: REAL_CORPUS
  })

  assert.equal(top.standard, 'TCVN 11823-13:2017')
  assert.match(top.clause, /7\.3\.2/)
  // The number itself, because the point of the tool is that the model stops
  // inventing plausible ones.
  assert.match(top.text, /810\s*mm/i)
})

test('the question can be typed without diacritics and still find the clause', () => {
  const accented = searchTcvn('chiều cao lan can TL-4', {
    limit: 1,
    dir: REAL_CORPUS
  })
  const plain = searchTcvn('chieu cao lan can TL-4', {
    limit: 1,
    dir: REAL_CORPUS
  })

  assert.equal(plain[0].standard, accented[0].standard)
  assert.equal(plain[0].clause, accented[0].clause)
})

test('an accented question prefers the word it spelled out', () => {
  // "làn" (lane) and "lan" (of "lan can", railing) differ by one mark and mean
  // unrelated things. Someone who typed the mark said which one they meant.
  const dir = fixtureCorpus({
    'a.md': '---\ntieu_chuan: "TEST 1"\n---\n\n## Làn xe\n\nBề rộng một làn xe là 3,75 m trên đường cấp I, và làn xe phải đủ rộng cho xe tải.\n',
    'b.md': '---\ntieu_chuan: "TEST 2"\n---\n\n## Lan can\n\nLan can phải cao tối thiểu 810 mm, và lan can đặt trên gờ chắn bê tông của cầu.\n'
  })

  const [top] = searchTcvn('làn xe', { limit: 1, dir })
  assert.equal(top.standard, 'TEST 1')
})

test('the table of contents is not a searchable clause', () => {
  const dir = fixtureCorpus({
    'a.md':
      '---\ntieu_chuan: "TEST 1"\n---\n\n## MỤC LỤC\n\n- 7 LAN CAN\n- 7.3 THIẾT KẾ LAN CAN\n\n## 7 LAN CAN\n\nChiều cao lan can phải nhỏ nhất 810 mm đối với cấp thử nghiệm TL-4 theo quy định của tiêu chuẩn này.\n'
  })

  const results = searchTcvn('lan can', { limit: 5, dir })
  assert.ok(results.length > 0)
  assert.ok(
    results.every(result => !/MỤC LỤC/i.test(result.clause)),
    'navigation sections must not be returned as clauses'
  )
})

test('a long clause is cut on a line boundary and says that it was cut', () => {
  const row = '| a | b | c |'
  const dir = fixtureCorpus({
    'a.md': `---\ntieu_chuan: "TEST 1"\n---\n\n## Bảng tra\n\n${Array(60).fill(row).join('\n')}\n`
  })

  const [top] = searchTcvn('bảng tra', { limit: 1, maxChars: 200, dir })
  assert.equal(top.truncated, true)
  assert.ok(top.text.endsWith('…'))
  // Every returned row is whole: half a table row reads as data and is not.
  for (const line of top.text.split('\n')) {
    if (line.startsWith('|')) assert.equal(line, row)
  }
})

test('limit is clamped so one question cannot ask for the whole corpus', () => {
  assert.equal(searchTcvn('lan can', { limit: 999, dir: REAL_CORPUS }).length, 10)
  assert.equal(searchTcvn('lan can', { limit: 0, dir: REAL_CORPUS }).length, 4)
})
