/**
 * The TCVN corpus: what the standards actually say, made searchable.
 *
 * The assistant draws bridges and roads for Vietnamese engineers, and almost
 * every dimension it has to pick is already decided by a standard: lane width
 * by road class, railing height by test level, deck thickness, clearances. A
 * model asked to "vẽ cây cầu" will otherwise invent plausible numbers, and
 * plausible is exactly the failure an engineer cannot see at a glance.
 *
 * So the numbers come from the documents themselves. This module keeps the
 * corpus in memory, splits it by clause, and ranks clauses against a question
 * with BM25 — no external dependency, because the service runs on plain Node
 * with no package.json and must stay that way.
 *
 * What it deliberately does not do: summarise. A clause is returned verbatim
 * with its standard number and clause path, so the answer the model gives can
 * be checked against the printed standard.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Error codes clients map to messages; never show the raw string to a user. */
export const ERRORS = {
  EMPTY_QUERY: 'tcvn_empty_query',
  NO_CORPUS: 'tcvn_no_corpus'
}

/**
 * Where the `.md` files live.
 *
 * The image copies them to `/app/tcvn`, beside the service. Running from a
 * checkout there is no such directory, so it falls back to the repository's
 * `assets/tcvn` — otherwise every developer would have to know to set an
 * environment variable before the assistant could cite anything.
 */
export const DEFAULT_CORPUS_DIR =
  process.env.TCVN_DIR ??
  (existsSync(join(process.cwd(), 'tcvn'))
    ? join(process.cwd(), 'tcvn')
    : fileURLToPath(new URL('../../assets/tcvn', import.meta.url)))

/**
 * A section shorter than this is merged into the next one.
 *
 * Standards are full of headings whose body is a single line ("Xem Điều
 * 5.4.2"); as chunks of their own they match a query and then tell the reader
 * nothing.
 */
const MIN_CHUNK_CHARS = 120

/**
 * A section longer than this is split into windows of about this size.
 *
 * Part 6 has clauses running for pages. Ranked whole they beat every focused
 * clause on term count alone, and the useful sentence is buried.
 */
const MAX_CHUNK_CHARS = 2400

/** BM25 constants; the standard defaults, which need no tuning at this size. */
const K1 = 1.5
const B = 0.75

/**
 * Weight for a match that only agrees once diacritics are removed.
 *
 * It has to be low. In this vocabulary "làn" (lane) and "lan" (of "lan can",
 * railing) differ by one mark and mean unrelated things, so an accent-blind
 * match is a hint, not evidence — but engineers do type without accents, and
 * refusing them any result at all would be worse.
 */
const STRIPPED_WEIGHT = 0.35

/** Sections that are navigation, not content, and would drown real clauses. */
const SKIPPED_HEADINGS = /^(MỤC LỤC|LỜI NÓI ĐẦU|TÀI LIỆU VIỆN DẪN)$/i

class TcvnError extends Error {
  constructor(code, detail) {
    super(code)
    this.code = code
    this.detail = detail
  }
}

/**
 * Removes Vietnamese diacritics, including the `đ`/`Đ` that decomposition
 * leaves alone.
 */
export function stripDiacritics(value) {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
}

/**
 * Splits text into terms.
 *
 * Numbers keep their decimal separator: the standards write `3,75` for a lane
 * width, and a tokenizer that turns it into `3` and `75` loses the ability to
 * search for the number an engineer actually read.
 */
export function tokenize(value) {
  const matches = String(value)
    .toLowerCase()
    .match(/[\p{L}\p{N}]+(?:[.,]\p{N}+)*/gu)
  return matches ?? []
}

/** Reads the YAML-ish frontmatter this corpus uses (flat `key: value` only). */
function parseFrontmatter(text) {
  if (!text.startsWith('---')) return { meta: {}, body: text }
  const end = text.indexOf('\n---', 3)
  if (end === -1) return { meta: {}, body: text }

  const meta = {}
  for (const line of text.slice(3, end).split('\n')) {
    const match = line.match(/^([a-z_]+):\s*(.*)$/i)
    if (!match) continue
    meta[match[1]] = match[2].trim().replace(/^"(.*)"$/, '$1')
  }
  return { meta, body: text.slice(end + 4) }
}

/**
 * Splits one document into ranked-sized chunks, each carrying the heading path
 * that locates it in the printed standard.
 */
function splitIntoChunks(docId, standard, title, body) {
  const chunks = []
  /** Heading text by level, so a `####` knows which `##` it sits under. */
  const path = []
  let buffer = []

  const flush = () => {
    const text = buffer.join('\n').trim()
    buffer = []
    if (!text) return
    const heading = path[path.length - 1] ?? ''
    if (SKIPPED_HEADINGS.test(heading)) return

    // A window boundary lands on a blank line where possible: cutting a
    // Markdown table in half produces a chunk that renders as garbage.
    const windows =
      text.length <= MAX_CHUNK_CHARS ? [text] : splitLongText(text)

    for (const window of windows) {
      const previous = chunks[chunks.length - 1]
      if (
        window.length < MIN_CHUNK_CHARS &&
        previous &&
        previous.docId === docId
      ) {
        previous.text = `${previous.text}\n\n${window}`
        continue
      }
      chunks.push({
        docId,
        standard,
        title,
        clause: path.filter(Boolean).join(' › '),
        text: window
      })
    }
  }

  for (const line of body.split('\n')) {
    const heading = line.match(/^(#{1,6})\s+(.*)$/)
    if (!heading) {
      buffer.push(line)
      continue
    }
    flush()
    const level = heading[1].length
    path.length = level - 1
    path[level - 1] = heading[2].trim()
  }
  flush()

  return chunks
}

/** Breaks a long section on paragraph boundaries, never mid-table. */
function splitLongText(text) {
  const windows = []
  let current = []
  let size = 0

  for (const paragraph of text.split(/\n{2,}/)) {
    if (size > 0 && size + paragraph.length > MAX_CHUNK_CHARS) {
      windows.push(current.join('\n\n'))
      current = []
      size = 0
    }
    current.push(paragraph)
    size += paragraph.length + 2
  }
  if (current.length) windows.push(current.join('\n\n'))
  return windows
}

/**
 * Reads every `.md` in `dir` and builds the search index.
 *
 * Both the accented term and its accent-free form are posted, so a query typed
 * either way finds the clause — see {@link STRIPPED_WEIGHT} for why they do
 * not count the same.
 */
export function loadCorpus(dir = DEFAULT_CORPUS_DIR) {
  let files
  try {
    files = readdirSync(dir)
      .filter(name => name.endsWith('.md'))
      .sort()
  } catch {
    throw new TcvnError(ERRORS.NO_CORPUS, dir)
  }
  if (!files.length) throw new TcvnError(ERRORS.NO_CORPUS, dir)

  const documents = []
  const chunks = []

  for (const file of files) {
    const raw = readFileSync(join(dir, file), 'utf8')
    const { meta, body } = parseFrontmatter(raw)
    // Only files that name the standard they transcribe are searchable. The
    // directory also holds the corpus's own README, and a note about how the
    // conversion was done outranked real clauses whenever a query was typed
    // without diacritics — it is the one file written *about* the standards
    // rather than *from* them.
    if (!meta.tieu_chuan) continue

    const docId = file.replace(/\.md$/, '')
    const standard = meta.tieu_chuan
    const title = meta.ten ?? meta.ten_tieng_anh ?? ''

    const docChunks = splitIntoChunks(docId, standard, title, body)
    documents.push({ docId, standard, title, chunks: docChunks.length })
    chunks.push(...docChunks)
  }

  const postings = new Map()
  const lengths = new Array(chunks.length)
  let totalLength = 0

  chunks.forEach((chunk, index) => {
    // The clause path is part of what a chunk is about: "7.1.2 Lan can đường
    // đầu cầu" is the sentence a searcher's words most often match.
    const terms = tokenize(`${chunk.standard} ${chunk.clause} ${chunk.text}`)
    lengths[index] = terms.length
    totalLength += terms.length

    const counts = new Map()
    for (const term of terms) {
      counts.set(term, (counts.get(term) ?? 0) + 1)
      const stripped = stripDiacritics(term)
      if (stripped !== term) {
        const key = `~${stripped}`
        counts.set(key, (counts.get(key) ?? 0) + 1)
      }
    }
    for (const [term, count] of counts) {
      let list = postings.get(term)
      if (!list) postings.set(term, (list = []))
      list.push([index, count])
    }
  })

  return {
    dir,
    documents,
    chunks,
    postings,
    lengths,
    avgLength: chunks.length ? totalLength / chunks.length : 0
  }
}

/** One loaded corpus per directory; the files never change while we run. */
const cache = new Map()

/** Returns the cached index for `dir`, loading it the first time it is asked for. */
export function getCorpus(dir = DEFAULT_CORPUS_DIR) {
  let corpus = cache.get(dir)
  if (!corpus) cache.set(dir, (corpus = loadCorpus(dir)))
  return corpus
}

/** Drops the cache; tests use it after writing a fixture corpus. */
export function resetCorpus() {
  cache.clear()
}

function bm25Scores(corpus, query) {
  const scores = new Map()
  const total = corpus.chunks.length

  for (const term of tokenize(query)) {
    const stripped = stripDiacritics(term)
    // Whether the accent-blind posting is a fallback or the main signal
    // depends on how the question was typed. Someone who wrote "làn" told us
    // which word they meant, so an accent-blind hit is only a hint; someone
    // who wrote "lan" told us nothing either way, and downweighting the one
    // posting that can still find "làn" would punish them for their keyboard.
    const strippedWeight = stripped === term ? 1 : STRIPPED_WEIGHT
    const lookups = [
      [term, 1],
      [`~${stripped}`, strippedWeight]
    ]

    for (const [key, weight] of lookups) {
      const list = corpus.postings.get(key)
      if (!list) continue
      const idf = Math.log(
        1 + (total - list.length + 0.5) / (list.length + 0.5)
      )

      for (const [index, count] of list) {
        const length = corpus.lengths[index]
        const norm = 1 - B + (B * length) / (corpus.avgLength || 1)
        const score = idf * ((count * (K1 + 1)) / (count + K1 * norm))
        scores.set(index, (scores.get(index) ?? 0) + weight * score)
      }
    }
  }

  return scores
}

/**
 * Ranks clauses against a question.
 *
 * @param query Free text, with or without diacritics.
 * @param options.limit How many clauses to return (1–10).
 * @param options.maxChars Cap on each clause's returned text.
 * @param options.dir Corpus directory; tests point this at a fixture.
 * @returns Clauses ordered by relevance, each citable on its own.
 */
export function searchTcvn(query, options = {}) {
  const text = String(query ?? '').trim()
  if (!text) throw new TcvnError(ERRORS.EMPTY_QUERY)

  // Defaults are a budget, not a preference. A tool result stays in the
  // conversation and is re-sent on every later call of the turn, so a generous
  // default is paid for again and again: at four clauses of 1.600 characters,
  // four lookups filled 96% of one turn's history. Three shorter clauses answer
  // "chiều cao lan can cấp TL-4" just as well, and a caller that genuinely
  // needs the long version can still ask for it.
  const limit = Math.min(Math.max(Number(options.limit) || 3, 1), 10)
  const maxChars = Math.min(
    Math.max(Number(options.maxChars) || 700, 200),
    6000
  )
  const corpus = getCorpus(options.dir)

  const ranked = [...bm25Scores(corpus, text)]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)

  return ranked.map(([index, score]) => {
    const chunk = corpus.chunks[index]
    const truncated = chunk.text.length > maxChars
    return {
      standard: chunk.standard,
      title: chunk.title,
      clause: chunk.clause,
      score: Number(score.toFixed(4)),
      truncated,
      // Cut on a line boundary: half a table row reads as data and is not.
      text: truncated
        ? `${chunk.text.slice(0, chunk.text.lastIndexOf('\n', maxChars) + 1 || maxChars).trimEnd()}\n…`
        : chunk.text
    }
  })
}

/** The catalogue, for a client that wants to show what can be searched. */
export function listTcvnDocuments(dir = DEFAULT_CORPUS_DIR) {
  return getCorpus(dir).documents.map(({ docId, standard, title, chunks }) => ({
    docId,
    standard,
    title,
    chunks
  }))
}
