/**
 * Every clause the assistant is told to cite must exist in `assets/tcvn`.
 *
 * Guides (`assets/skills/*`) and library templates quote TCVN clause numbers,
 * tables and equations. A wrong number sends an engineer to the wrong page —
 * or worse, lends a standard's authority to a figure it never gave. This test
 * resolves each citation against the converted standards in the repository:
 *
 * - `TCVN 11823-10:2017 đ.8.1.2`, `11823-10 đ.8.1.2`, `TCVN 4054 đ.5.5.1` →
 *   that numbered heading (or bold clause number) exists in that standard;
 * - `… Bảng 16`, `… Phương trình 25` → that table / equation exists there;
 * - each reference binds to the nearest standard named before it — on the
 *   same line, else earlier in the same Markdown section (a heading resets
 *   it), else within the two previous lines of code (wrapped strings); a
 *   reference with no standard in reach is an error, because the reader
 *   could not tell which standard is meant;
 * - every `> quoted line` in a guide is verbatim text from the standards.
 *
 * It cannot check that a clause *says* what the guide claims; the verbatim
 * quotes are how the guides make that checkable by a reader.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname, '..', '..', '..')
const TCVN = join(ROOT, 'assets', 'tcvn')
const SKILLS = join(ROOT, 'assets', 'skills')
const LIBRARY = join(__dirname, '..', 'library')

const standards = readdirSync(TCVN).filter(f => f.startsWith('TCVN_'))
const text = (file: string) => readFileSync(join(TCVN, file), 'utf8')

/** File of a standard: `11823` + part `10`, or `4054`, `13592`. */
function standardFile(num: string, part?: string): string | undefined {
  const prefix = part ? `TCVN_${num}-${part}_` : `TCVN_${num}-`
  return standards.find(f => f.startsWith(prefix))
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Does this numbered clause exist as a heading or bold clause number? */
function hasClause(source: string, clause: string): boolean {
  const n = escape(clause)
  return new RegExp(`^#+\\s+${n}(\\s|$)|\\*\\*${n}(\\s|\\*\\*)`, 'm').test(
    source
  )
}
const hasTable = (source: string, n: string) =>
  new RegExp(`Bảng ${n}(?!\\d)`).test(source)
const hasEquation = (source: string, n: string) =>
  new RegExp(`\\\\tag\\{${n}\\}|Phương trình ${n}(?!\\d)`).test(source)

interface Citation {
  where: string
  standard: string
  kind: 'điều' | 'bảng' | 'phương trình'
  ref: string
}

const STANDARD =
  /(?:TCVN\s*)?\b(11823)-(\d+)(?::\d{4})?|TCVN\s*(4054|13592)(?::\d{4})?/g
const REFERENCE = /đ\.\s?(\d+(?:\.\d+)*)|Bảng\s+(\d+)|Phương trình\s+(\d+)/g

interface Mark {
  num: string
  part?: string
}

/** Citations on one line, each bound to the nearest standard before it. */
function citationsOf(
  line: string,
  where: string,
  errors: string[],
  inherited?: Mark
): Citation[] {
  const marks = [...line.matchAll(STANDARD)].map(m => ({
    at: m.index!,
    num: m[1] ?? m[3],
    part: m[2]
  }))
  const out: Citation[] = []
  for (const r of line.matchAll(REFERENCE)) {
    const std = marks.filter(m => m.at < r.index!).pop() ?? inherited
    const ref = r[1] ?? r[2] ?? r[3]
    const kind = r[1] ? 'điều' : r[2] ? 'bảng' : 'phương trình'
    if (!std) {
      errors.push(
        `${where}: "${r[0]}" không xác định được thuộc tiêu chuẩn nào`
      )
      continue
    }
    out.push({
      where,
      standard: std.part ? `${std.num}-${std.part}` : std.num,
      kind,
      ref
    })
  }
  return out
}

function lastStandard(line: string): Mark | undefined {
  const m = [...line.matchAll(STANDARD)].pop()
  return m ? { num: m[1] ?? m[3], part: m[2] } : undefined
}

function scan(name: string, content: string) {
  const errors: string[] = []
  const citations: Citation[] = []
  const markdown = name.endsWith('.md') || !name.includes('.')
  const lines = content.split('\n')
  let section: Mark | undefined
  lines.forEach((line, i) => {
    if (markdown && /^#+\s/.test(line)) section = undefined
    // Only the guides' own prose; a quoted line is checked verbatim below.
    if (!line.startsWith('>')) {
      const inherited = markdown
        ? section
        : (lastStandard(lines[i - 1] ?? '') ?? lastStandard(lines[i - 2] ?? ''))
      citations.push(
        ...citationsOf(line, `${name}:${i + 1}`, errors, inherited)
      )
    }
    if (markdown) section = lastStandard(line) ?? section
  })
  for (const c of citations) {
    const [num, part] = c.standard.split('-')
    const file = standardFile(num, part)
    if (!file) {
      errors.push(
        `${c.where}: không có tệp TCVN ${c.standard} trong assets/tcvn`
      )
      continue
    }
    const source = text(file)
    const ok =
      c.kind === 'điều'
        ? hasClause(source, c.ref)
        : c.kind === 'bảng'
          ? hasTable(source, c.ref)
          : hasEquation(source, c.ref)
    if (!ok)
      errors.push(`${c.where}: TCVN ${c.standard} không có ${c.kind} ${c.ref}`)
  }
  return { errors, citations }
}

const guideFiles = (skill: string) => {
  const root = join(SKILLS, skill)
  return [
    join(root, 'SKILL.md'),
    ...readdirSync(join(root, 'references')).map(f =>
      join(root, 'references', f)
    )
  ]
}

describe.each(['mo-cau', 'tru-cau', 'duong-mat-cat'])('skill %s', skill => {
  const files = guideFiles(skill)

  test('every clause, table and equation it cites exists in assets/tcvn', () => {
    const errors: string[] = []
    let count = 0
    for (const file of files) {
      const result = scan(
        file.slice(ROOT.length + 1),
        readFileSync(file, 'utf8')
      )
      errors.push(...result.errors)
      count += result.citations.length
    }
    expect(errors).toEqual([])
    // A scan that found nothing would pass vacuously.
    expect(count).toBeGreaterThan(5)
  })

  test('every quoted line is verbatim text from a standard', () => {
    const all = standards.map(text).join('\n')
    const missing: string[] = []
    for (const file of files) {
      for (const line of readFileSync(file, 'utf8').split('\n')) {
        if (!line.startsWith('> ')) continue
        const quote = line.slice(2).trim()
        if (!all.includes(quote))
          missing.push(`${file.slice(ROOT.length + 1)}: ${quote}`)
      }
    }
    expect(missing).toEqual([])
  })
})

describe('the drilled-shaft clauses are cited with their conditions', () => {
  // The two mistakes the abutment guide used to make: 8.1.2 sets no minimum
  // spacing (below 4D it requires an interaction assessment when drilled
  // without casing), and 8.1.3's 750 mm applies only to holes inspected by
  // hand. Both guides must say so wherever they give those numbers.
  test.each(['mo-cau', 'tru-cau'])('%s', skill => {
    for (const file of guideFiles(skill)) {
      for (const line of readFileSync(file, 'utf8').split('\n')) {
        if (line.startsWith('>')) continue
        if (/750/.test(line) && /đ\.8\.1\.3/.test(line))
          expect({ line, ok: /thủ công/.test(line) }).toEqual({
            line,
            ok: true
          })
        if (/4\s*[·.]?\s*D\b|4D/.test(line) && /đ\.8\.1\.2/.test(line))
          expect({ line, ok: /ống vách|tương tác/.test(line) }).toEqual({
            line,
            ok: true
          })
        expect(line).not.toMatch(/≥\s*4\s*·\s*D;/)
      }
    }
  })
})

describe('library templates', () => {
  test('every clause in hints, descriptions and notes exists in assets/tcvn', () => {
    const errors: string[] = []
    let count = 0
    for (const file of readdirSync(LIBRARY).filter(f => f.endsWith('.js'))) {
      const result = scan(
        `library/${file}`,
        readFileSync(join(LIBRARY, file), 'utf8')
      )
      errors.push(...result.errors)
      count += result.citations.length
    }
    expect(errors).toEqual([])
    expect(count).toBeGreaterThan(5)
  })
})

describe('compiled road cross-section', () => {
  // The road section is compiled into the plugin, not a library template,
  // but its hints and refusals cite TCVN 4054 / 13592 the same way.
  test('every clause in src/road exists in assets/tcvn', () => {
    const dir = join(__dirname, '..', 'src', 'road')
    const errors: string[] = []
    let count = 0
    for (const file of readdirSync(dir).filter(f => f.endsWith('.ts'))) {
      const result = scan(
        `src/road/${file}`,
        readFileSync(join(dir, file), 'utf8')
      )
      errors.push(...result.errors)
      count += result.citations.length
    }
    expect(errors).toEqual([])
    expect(count).toBeGreaterThan(20)
  })
})

describe('the resolver itself', () => {
  test('finds real clauses and rejects invented ones', () => {
    const p10 = text(standardFile('11823', '10')!)
    expect(hasClause(p10, '8.1.2')).toBe(true)
    expect(hasClause(p10, '8.1.9')).toBe(false)
    expect(hasEquation(text(standardFile('11823', '4')!), '25')).toBe(true)
    expect(hasTable(text(standardFile('11823', '4')!), '16')).toBe(true)
    expect(hasTable(text(standardFile('11823', '4')!), '160')).toBe(false)
    expect(hasClause(text(standardFile('4054')!), '5.5.1')).toBe(true)
    // In a section that names a standard, a bare clause belongs to it; a new
    // heading forgets it.
    const { errors } = scan(
      'x.md',
      '## TCVN 11823-10:2017\nđ.8.1.9 và đ.8.1.2\n## Khác\nchỉ đ.8.1.2'
    )
    expect(errors).toEqual([
      'x.md:4: "đ.8.1.2" không xác định được thuộc tiêu chuẩn nào',
      'x.md:2: TCVN 11823-10 không có điều 8.1.9'
    ])
    // In code, only the two lines before.
    expect(
      scan('x.js', "'TCVN 11823-10:2017 ' +\n'đ.8.1.2'\n\n\n'đ.8.1.2'").errors
    ).toEqual(['x.js:5: "đ.8.1.2" không xác định được thuộc tiêu chuẩn nào'])
  })
})
