/**
 * The guide library — "skills", in Claude Code's vocabulary.
 *
 * A guide is a folder of markdown an author uploads: `SKILL.md`, whose
 * frontmatter carries a `name` and a `description`, plus optional
 * `references/*.md` the guide points to. The assistant sees every published
 * guide's one-line description on every call, and reads the body only when a
 * request matches it — the same two-tier loading Claude Code uses, done with
 * a cached system block and a tool instead of a filesystem.
 *
 * Why this is gated like the template library and not like the dictionary:
 * a term steers which entity the assistant *finds*; a guide steers what the
 * assistant *does*, and its description lands in the system block every
 * engineer's calls are built on. Whoever can publish a guide can steer the
 * whole office's assistant, so writing needs the author role and a draft
 * stays private to its author until they have tried it.
 */

import { createHash } from 'node:crypto'

/**
 * Size ceiling for one guide, all files together.
 *
 * A guide is prose the model reads on demand; the cheapest guide is the one
 * that says what it has to and stops. Half a megabyte is already far past
 * what a model should be asked to read per request.
 */
export const MAX_SKILL_BYTES = 512 * 1024

/** `SKILL.md` and a handful of references. More is a manual, not a guide. */
export const MAX_SKILL_FILES = 20

/**
 * Ceiling on the description.
 *
 * It rides in the shared system block on every call for every user, so it is
 * the one part of a guide that is never free. Long enough for the trigger
 * words a request is matched on; short enough that ten guides cost less than
 * one tool description.
 */
export const MAX_DESCRIPTION_CHARS = 1000

export const MAIN_FILE = 'SKILL.md'

export const ERRORS = {
  NOT_FOUND: 'skill_not_found',
  TOO_LARGE: 'skill_too_large',
  INVALID: 'skill_invalid',
  FORBIDDEN: 'skill_forbidden'
}

/** Guides everyone's assistant knows about, versus ones still on trial. */
export const STATUS = { DRAFT: 'draft', PUBLISHED: 'published' }

/** Same shape Claude Code accepts for a skill name: `mo-cau`, `cau_ban_btct`. */
const ID_SLUG = /^[a-z0-9][a-z0-9_-]*$/

/**
 * Where a file may sit inside a guide.
 *
 * `SKILL.md` at the root, or one level under `references/`. No other
 * directories, no other extensions, no dot-segments: the path is later
 * echoed back to the assistant and used as a lookup key, and the narrow
 * grammar is what keeps both uses trivially safe.
 */
const FILE_PATH = /^(?:SKILL\.md|references\/[A-Za-z0-9][A-Za-z0-9._-]*\.md)$/

class SkillError extends Error {
  constructor(code, detail) {
    super(code)
    this.code = code
    this.detail = detail
  }
}

/**
 * Content hash over every file, so a re-upload can be told apart from a
 * change without diffing.
 */
export function hashFiles(files) {
  const hash = createHash('sha256')
  for (const file of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    hash
      .update(file.path, 'utf8')
      .update('\0')
      .update(file.content, 'utf8')
      .update('\0')
  }
  return hash.digest('hex')
}

/**
 * Splits a `SKILL.md` into its frontmatter and body.
 *
 * Only the subset of YAML a skill header actually uses: one `key: value` per
 * line, optionally quoted. A block scalar (`description: >`) is refused with
 * a reason rather than silently read as ">" — the description is what the
 * assistant matches requests against, and a one-character description is a
 * guide that never triggers.
 *
 * @returns `{ meta, body }`; `meta` holds every key found, as strings.
 * @throws {SkillError} `INVALID` when there is no frontmatter block.
 */
export function parseSkillMarkdown(text) {
  const source = String(text ?? '').replace(/^\uFEFF/, '')
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/.exec(source)
  if (!match) {
    throw new SkillError(ERRORS.INVALID, {
      field: MAIN_FILE,
      reason:
        'SKILL.md phải mở đầu bằng khối frontmatter giữa hai dòng ---, có name và description.'
    })
  }

  // Values are collected first and unquoted after, because a long description
  // is routinely wrapped by an editor onto indented continuation lines —
  // YAML folds those into one string, and so does this.
  const raw = {}
  let current
  for (const line of match[1].split(/\r?\n/)) {
    const pair = /^([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/.exec(line)
    if (pair) {
      const value = pair[2].trim()
      if (value === '>' || value === '|' || value === '>-' || value === '|-') {
        throw new SkillError(ERRORS.INVALID, {
          field: pair[1],
          reason: `Trường ${pair[1]} phải nằm trên một dòng, không dùng khối > hay |.`
        })
      }
      current = pair[1]
      raw[current] = value
    } else if (current && /^\s+\S/.test(line)) {
      raw[current] = `${raw[current]} ${line.trim()}`.trim()
    } else {
      current = undefined
    }
  }

  const meta = {}
  for (const [key, joined] of Object.entries(raw)) {
    let value = joined
    const quoted =
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    if (quoted && value.length >= 2) value = value.slice(1, -1)
    meta[key] = value
  }
  return { meta, body: match[2] }
}

function rowToSummary(row) {
  const files = JSON.parse(row.files)
  return {
    skillId: row.skill_id,
    title: row.title,
    description: row.description,
    paths: files.map(file => file.path),
    contentHash: row.content_hash,
    status: row.status,
    uploadedBy: row.uploaded_by ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    verifiedAt: row.verified_at ?? null
  }
}

/**
 * Lists guides, without their contents.
 *
 * Drafts are visible to the person who uploaded them and to nobody else, for
 * the same reason as templates: an author has to be able to try their own
 * draft, and everyone else needs a library where every entry is vouched for.
 */
export function listSkills(db, viewerId, { includeDrafts = true } = {}) {
  const rows = includeDrafts
    ? db
        .prepare(
          `SELECT * FROM skills WHERE status = ? OR uploaded_by = ? ORDER BY skill_id`
        )
        .all(STATUS.PUBLISHED, viewerId ?? -1)
    : db
        .prepare(`SELECT * FROM skills WHERE status = ? ORDER BY skill_id`)
        .all(STATUS.PUBLISHED)
  return rows.map(rowToSummary)
}

/** Fetches one guide with every file's content. */
export function getSkill(db, skillId) {
  const row = db
    .prepare(`SELECT * FROM skills WHERE skill_id = ?`)
    .get(String(skillId ?? ''))
  if (!row) return undefined
  return { ...rowToSummary(row), files: JSON.parse(row.files) }
}

/** Picks one file out of a fetched guide, by the path the guide names. */
export function skillFile(skill, path) {
  return skill?.files?.find(file => file.path === path)
}

function assertUploadInput(input) {
  const files = Array.isArray(input?.files) ? input.files : []
  if (files.length === 0) {
    throw new SkillError(ERRORS.INVALID, {
      field: 'files',
      reason: 'Thiếu danh sách file. Cần ít nhất SKILL.md.'
    })
  }
  if (files.length > MAX_SKILL_FILES) {
    throw new SkillError(ERRORS.INVALID, {
      field: 'files',
      reason: `Một hướng dẫn có tối đa ${MAX_SKILL_FILES} file.`
    })
  }

  const seen = new Set()
  let bytes = 0
  const clean = files.map(file => {
    const path = typeof file?.path === 'string' ? file.path.trim() : ''
    const content = typeof file?.content === 'string' ? file.content : null
    if (!FILE_PATH.test(path)) {
      throw new SkillError(ERRORS.INVALID, {
        field: 'files',
        reason: `Đường dẫn không hợp lệ: ${path || '(trống)'}. Chỉ nhận SKILL.md và references/<tên>.md.`
      })
    }
    if (content === null) {
      throw new SkillError(ERRORS.INVALID, {
        field: path,
        reason: 'Nội dung file phải là chuỗi.'
      })
    }
    const key = path.toLowerCase()
    if (seen.has(key)) {
      throw new SkillError(ERRORS.INVALID, {
        field: 'files',
        reason: `File bị lặp: ${path}`
      })
    }
    seen.add(key)
    bytes += Buffer.byteLength(content, 'utf8')
    return { path, content }
  })

  if (bytes > MAX_SKILL_BYTES) {
    throw new SkillError(ERRORS.TOO_LARGE, { limit: MAX_SKILL_BYTES })
  }

  const main = clean.find(file => file.path === MAIN_FILE)
  if (!main) {
    throw new SkillError(ERRORS.INVALID, {
      field: 'files',
      reason: 'Thiếu SKILL.md.'
    })
  }

  const { meta, body } = parseSkillMarkdown(main.content)
  const skillId = String(meta.name ?? '').trim()
  // Newlines cannot survive into a block that is one line per guide.
  const description = String(meta.description ?? '')
    .replace(/\s+/g, ' ')
    .trim()

  if (!ID_SLUG.test(skillId)) {
    throw new SkillError(ERRORS.INVALID, {
      field: 'name',
      reason:
        'name trong frontmatter phải là slug ASCII không dấu (a-z, 0-9, _ hoặc -), ví dụ mo-cau.'
    })
  }
  if (!description) {
    throw new SkillError(ERRORS.INVALID, {
      field: 'description',
      reason:
        'description trong frontmatter không được để trống — trợ lý dựa vào nó để biết khi nào mở hướng dẫn.'
    })
  }
  if (description.length > MAX_DESCRIPTION_CHARS) {
    throw new SkillError(ERRORS.INVALID, {
      field: 'description',
      reason: `description dài ${description.length} ký tự, tối đa ${MAX_DESCRIPTION_CHARS}. Nó nằm trong mọi lần gọi của mọi người.`
    })
  }
  if (!body.trim()) {
    throw new SkillError(ERRORS.INVALID, {
      field: MAIN_FILE,
      reason: 'SKILL.md không có nội dung sau frontmatter.'
    })
  }

  const heading = /^#\s+(.+?)\s*$/m.exec(body)
  const title = heading ? heading[1].trim() : skillId

  // SKILL.md first, references after, so a listing reads the way a folder does.
  clean.sort((a, b) =>
    a.path === MAIN_FILE
      ? -1
      : b.path === MAIN_FILE
        ? 1
        : a.path.localeCompare(b.path)
  )

  return { skillId, title, description, files: clean }
}

/**
 * Accepts a guide upload.
 *
 * A guide is keyed by its `name` alone — nothing pins a guide the way a
 * drawing pins a template version, so there is no version to bump. Instead:
 * identical content is idempotent; changed content replaces the guide and
 * sends it back to draft, because what an author vouched for was the old
 * text. And a guide belongs to whoever uploaded it: another author who wants
 * to change it uploads under a new name or asks for the old one to be
 * deleted, rather than silently rewriting a colleague's instructions.
 *
 * @returns `{ skill, changed }` — `changed` is false for an identical re-upload.
 */
export function uploadSkill(db, userId, input) {
  const parsed = assertUploadInput(input)
  const contentHash = hashFiles(parsed.files)

  const existing = db
    .prepare(
      `SELECT uploaded_by, content_hash, status FROM skills WHERE skill_id = ?`
    )
    .get(parsed.skillId)

  if (existing && existing.uploaded_by !== userId) {
    throw new SkillError(ERRORS.FORBIDDEN, {
      skillId: parsed.skillId,
      reason:
        'Hướng dẫn này do người khác tải lên. Đổi name trong frontmatter, hoặc nhờ họ xoá bản cũ.'
    })
  }

  if (existing && existing.content_hash === contentHash) {
    return { skill: getSkill(db, parsed.skillId), changed: false }
  }

  if (existing) {
    db.prepare(
      `UPDATE skills
          SET title = ?, description = ?, files = ?, content_hash = ?,
              status = ?, verified_at = NULL, updated_at = datetime('now')
        WHERE skill_id = ?`
    ).run(
      parsed.title,
      parsed.description,
      JSON.stringify(parsed.files),
      contentHash,
      STATUS.DRAFT,
      parsed.skillId
    )
  } else {
    db.prepare(
      `INSERT INTO skills
         (skill_id, title, description, files, content_hash, status, uploaded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      parsed.skillId,
      parsed.title,
      parsed.description,
      JSON.stringify(parsed.files),
      contentHash,
      STATUS.DRAFT,
      userId
    )
  }

  return { skill: getSkill(db, parsed.skillId), changed: true }
}

/**
 * Publishes a guide, which is the author saying they tried it.
 *
 * Only the uploader can, for the same reason as templates: otherwise one
 * member could push another's untried instructions into everyone's assistant
 * by calling the route.
 */
export function publishSkill(db, userId, skillId) {
  const row = db
    .prepare(`SELECT uploaded_by FROM skills WHERE skill_id = ?`)
    .get(String(skillId ?? ''))
  if (!row) throw new SkillError(ERRORS.NOT_FOUND, { skillId })
  if (row.uploaded_by !== userId) {
    throw new SkillError(ERRORS.FORBIDDEN, {
      reason: 'Chỉ người tải lên mới công bố được hướng dẫn của mình.'
    })
  }
  db.prepare(
    `UPDATE skills SET status = ?, verified_at = datetime('now') WHERE skill_id = ?`
  ).run(STATUS.PUBLISHED, skillId)
  return getSkill(db, skillId)
}

export function deleteSkill(db, skillId) {
  const result = db
    .prepare(`DELETE FROM skills WHERE skill_id = ?`)
    .run(String(skillId ?? ''))
  return result.changes > 0
}

export { SkillError }
