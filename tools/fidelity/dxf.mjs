/**
 * Minimal DXF group-code reader/writer for the fidelity harness.
 *
 * Reads the whole file as (code, value) pairs, groups them into sections,
 * table entries, blocks and entities, and can write the (possibly edited)
 * pairs back out unchanged otherwise. Only what the harness needs; no
 * dependency.
 */
import { readFileSync, writeFileSync } from 'node:fs'

/** @returns {{code:number, value:string}[]} */
export function readPairs(path) {
  const lines = readFileSync(path, 'utf8').split(/\r?\n/)
  const pairs = []
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = Number(lines[i].trim())
    if (!Number.isFinite(code))
      throw new Error(`DXF: mã nhóm hỏng ở dòng ${i + 1}`)
    pairs.push({ code, value: lines[i + 1] })
  }
  return pairs
}

export function writePairs(path, pairs) {
  writeFileSync(
    path,
    pairs.map(p => `${String(p.code).padStart(3)}\n${p.value}`).join('\n') +
      '\n'
  )
}

/**
 * Splits pairs into records starting at each `0` code. A record keeps the
 * index range into `pairs` so edits can be written back in place.
 */
export function records(pairs) {
  const out = []
  let start = 0
  for (let i = 1; i <= pairs.length; i++) {
    if (i === pairs.length || pairs[i].code === 0) {
      out.push({
        type: pairs[start].value.trim(),
        start,
        end: i,
        pairs: pairs.slice(start, i)
      })
      start = i
    }
  }
  return out
}

/** First value of a code, or undefined. */
export const get = (rec, code) => rec.pairs.find(p => p.code === code)?.value
export const num = (rec, code, fallback) => {
  const v = get(rec, code)
  return v === undefined ? fallback : Number(v)
}
export const all = (rec, code) =>
  rec.pairs.filter(p => p.code === code).map(p => p.value)

/**
 * Owner handle (group 330) of a record, ignoring the 330s inside `102`
 * groups such as `{ACAD_REACTORS`: an associative array's INSERT lists its
 * reactor first, and taking that for the owner loses the entity.
 */
export function owner(rec) {
  let depth = 0
  for (const p of rec.pairs) {
    if (p.code === 102) depth += p.value.trim().startsWith('{') ? 1 : -1
    else if (p.code === 330 && depth === 0) return p.value.trim()
  }
  return undefined
}

/** Points from paired x/y codes (e.g. 10/20) in order of appearance. */
export function points(rec, xCode, yCode) {
  const out = []
  let x
  for (const p of rec.pairs) {
    if (p.code === xCode) x = Number(p.value)
    else if (p.code === yCode && x !== undefined) {
      out.push([x, Number(p.value)])
      x = undefined
    }
  }
  return out
}

/**
 * Walks the DXF structure: sections → (tables: entries | blocks: block
 * contents | entities). Yields `{section, table?, block?, rec}`.
 */
export function* walk(recs) {
  let section
  let table
  let block
  for (const rec of recs) {
    if (rec.type === 'SECTION') {
      section = get(rec, 2)?.trim()
      table = undefined
      block = undefined
      continue
    }
    if (rec.type === 'ENDSEC') {
      section = undefined
      continue
    }
    if (section === 'TABLES') {
      if (rec.type === 'TABLE') table = get(rec, 2)?.trim()
      else if (rec.type === 'ENDTAB') table = undefined
      else yield { section, table, rec }
      continue
    }
    if (section === 'BLOCKS') {
      if (rec.type === 'BLOCK') {
        block = {
          name: get(rec, 2)?.trim(),
          handle: get(rec, 5)?.trim(),
          owner: owner(rec)
        }
        continue
      }
      if (rec.type === 'ENDBLK') {
        block = undefined
        continue
      }
      yield { section, block, rec }
      continue
    }
    if (section) yield { section, rec }
  }
}
