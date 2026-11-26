#!/usr/bin/env node
/**
 * Publishes the repository's library templates whose version is not in the
 * library yet — the FIX-NOTE follow-up: `mo_mat_chinh` 2.0.1,
 * `mo_coc_khoan_nhoi` / `tru_mat_chinh` / `tru_mat_ben` 1.0.1 (the GHI CHÚ
 * block). The browser evaluates the newest *published* version of each id
 * from `GET /api/templates`; a version already uploaded with other code is
 * refused (`uploadTemplate`: drawings pin id@version), so a change ships as a
 * new version.
 *
 * Same road as an author's upload (see server/auth/libraryUpload.test.mjs):
 * the module is evaluated, trial-drawn with its defaults to collect role →
 * layer, then `uploadTemplate` + `publishTemplate` as that user.
 *
 * Idempotent: a version already there with the same content hash is left as
 * it is (published if it was still a draft of the same user); another hash is
 * reported and nothing is written for that file. Never migrates the schema.
 *
 * Usage (back up auth.db first; never point it at the live DB from a dev box):
 *
 *   node tools/codex-cad/publish-library-templates.mjs \
 *     --db /path/to/auth.db --user author@example.com [--dry-run] \
 *     [packages/cad-template-plugin/library/mo_mat_chinh.js ...]
 *
 * With no files, the four FIX-NOTE files are taken. `--dry-run` reports what
 * would be done and writes nothing.
 */
import { readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import {
  listLayers,
  listTerms,
  roleLayerMap
} from '../../server/auth/standards.mjs'
import {
  hashCode,
  publishTemplate,
  STATUS,
  uploadTemplate
} from '../../server/auth/templates.mjs'

const ROOT = join(import.meta.dirname, '..', '..')
const LIBRARY = join(ROOT, 'packages', 'cad-template-plugin', 'library')
const DEFAULT_FILES = [
  'mo_mat_chinh.js',
  'mo_coc_khoan_nhoi.js',
  'tru_mat_chinh.js',
  'tru_mat_ben.js'
].map(f => join(LIBRARY, f))

function parseArgs(argv) {
  const out = { files: [], dryRun: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--db') out.db = argv[++i]
    else if (a === '--user') out.user = argv[++i]
    else if (a === '--dry-run') out.dryRun = true
    else out.files.push(a)
  }
  if (!out.db || !out.user) {
    console.error(
      'usage: publish-library-templates.mjs --db <auth.db> --user <email> [--dry-run] [files...]'
    )
    process.exit(2)
  }
  if (!out.files.length) out.files = DEFAULT_FILES
  return out
}

/** Evaluates an uploadable module the way the browser does: SDK on globalThis. */
function evaluate(code) {
  globalThis.__CAD_TEMPLATE_SDK__ = {
    formatPartId: ({ role, side, ordinal }) =>
      [role, side, ordinal && String(ordinal).padStart(2, '0')]
        .filter(Boolean)
        .join('_'),
    // The GHI CHÚ block (FIX-NOTE) draws its lines as TEXT on `ghi_chu` (or
    // the role given): for the trial run, what it draws on is what counts.
    acTpPlaceGhiChuBlock: (ctx, notes, options = {}) => {
      if (notes?.length) ctx.text({ role: options.role ?? 'ghi_chu' })
    }
  }
  return new Function(code.replace(/^\s*export default /m, 'return '))()
}

/** Role → layer of what the defaults draw (the browser's trial run). */
function trialRoleLayers(template, catalogue, overrides = {}) {
  const used = {}
  const take = args => {
    used[args.role] = args.layer ?? catalogue[args.role] ?? '(chưa có layer)'
  }
  const ctx = new Proxy({}, { get: () => take })
  const values = Object.fromEntries(
    template.params.map(p => [p.key, p.default])
  )
  template.generate(ctx, { ...values, ...overrides })
  return used
}

const args = parseArgs(process.argv.slice(2))
const db = new DatabaseSync(args.db)
const user = db
  .prepare('SELECT id FROM users WHERE email = ?')
  .get(String(args.user))
if (!user) {
  console.error(`Không có người dùng ${args.user} trong ${args.db}.`)
  process.exit(2)
}
const standards = {
  knownRoles: listTerms(db).map(t => t.role),
  knownLayers: listLayers(db).map(l => l.name)
}
const catalogue = roleLayerMap(db)

let failed = 0
for (const file of args.files) {
  const code = readFileSync(file, 'utf8')
  const template = evaluate(code)
  const { id, version } = template.meta
  const label = `${basename(file)} → ${id}@${version}`
  const hash = hashCode(code)
  const existing = db
    .prepare(
      'SELECT content_hash, status, uploaded_by FROM templates WHERE template_id = ? AND version = ?'
    )
    .get(id, version)
  if (existing && existing.content_hash !== hash) {
    console.error(
      `${label}: ĐÃ CÓ với nội dung khác (${existing.content_hash.slice(0, 8)}… ≠ ${hash.slice(0, 8)}…) — tăng phiên bản; bỏ qua.`
    )
    failed++
    continue
  }
  if (existing?.status === STATUS.PUBLISHED) {
    console.log(
      `${label}: đã phát hành, cùng hash ${hash.slice(0, 8)}… — bỏ qua.`
    )
    continue
  }
  if (existing && existing.uploaded_by !== user.id) {
    console.error(
      `${label}: bản nháp của người dùng khác (id ${existing.uploaded_by}); chỉ người tải lên mới phát hành được — bỏ qua.`
    )
    failed++
    continue
  }
  const roleLayers = trialRoleLayers(template, catalogue)
  // Piers: the column stem too, so both variants are known.
  if (template.params.some(p => p.key === 'loaiThan'))
    Object.assign(
      roleLayers,
      trialRoleLayers(template, catalogue, { loaiThan: 'cot' })
    )
  if (args.dryRun) {
    console.log(
      `${label}: sẽ ${existing ? 'phát hành bản nháp có sẵn' : 'tải lên và phát hành'} (hash ${hash.slice(0, 8)}…).`
    )
    continue
  }
  try {
    db.exec('BEGIN')
    const { warnings } = uploadTemplate(
      db,
      user.id,
      { meta: template.meta, params: template.params, roleLayers, code },
      standards
    )
    publishTemplate(db, user.id, id, version)
    db.exec('COMMIT')
    const gaps = warnings.missingRoles.length + warnings.missingLayers.length
    console.log(
      `${label}: đã phát hành (hash ${hash.slice(0, 8)}…)${gaps ? `; thiếu trong danh mục: ${JSON.stringify(warnings)}` : ''}.`
    )
  } catch (error) {
    db.exec('ROLLBACK')
    console.error(
      `${label}: lỗi ${error.code ?? ''} ${error.message}`,
      error.detail ?? ''
    )
    failed++
  }
}
db.close()
process.exit(failed ? 1 : 0)
