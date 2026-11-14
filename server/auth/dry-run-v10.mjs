#!/usr/bin/env node
/**
 * Prints what migration v10 (one `_33_` layer catalogue) would change in a
 * database, without writing to it.
 *
 * Run it on a COPY of the production database before deploying:
 *
 *   cp /data/auth.db /tmp/auth-copy.db
 *   node server/auth/dry-run-v10.mjs /tmp/auth-copy.db
 *   node server/auth/dry-run-v10.mjs /tmp/auth-copy.db --json
 *
 * The database is opened read-only; the plan is computed by the very function
 * the migration uses (`planStandardsV10`), so what this prints is what the
 * migration does. Not copied into the image (see Dockerfile).
 */
import { DatabaseSync } from 'node:sqlite'

import { planStandardsV10 } from './schema.mjs'

const [path, ...flags] = process.argv.slice(2)
if (!path) {
  console.error(
    'Cách dùng: node server/auth/dry-run-v10.mjs <đường-dẫn-db> [--json]'
  )
  process.exit(2)
}

const db = new DatabaseSync(path, { readOnly: true })
const version = db.prepare('PRAGMA user_version').get().user_version ?? 0
const count = table => db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n

if (version < 3) {
  console.error(
    `DB ở user_version ${version}: chưa có bảng chuẩn hoá, không có gì để xem.`
  )
  process.exit(1)
}

const plan = planStandardsV10(db)
if (flags.includes('--json')) {
  console.log(JSON.stringify({ userVersion: version, plan }, null, 2))
  process.exit(0)
}

const lines = []
const out = line => lines.push(line)
out(`DB: ${path}`)
out(
  `user_version: ${version}${version >= 10 ? ' (v10 đã chạy — kế hoạch dưới đây phải rỗng)' : ''}`
)
if (version < 9) {
  out(
    `Lưu ý: DB ở v${version}; các migration v${version + 1}..v9 sẽ chạy trước v10.`
  )
}
out(
  `Hiện có: ${count('standard_layers')} layer, ${count('standard_terms')} thuật ngữ.`
)
out('')
out(`Thêm cột legacy_of: ${plan.addColumn ? 'CÓ' : 'không (đã có)'}`)
out(`Thêm ${plan.insertLayers.length} layer _33_:`)
for (const l of plan.insertLayers)
  out(`  + ${l.name}  (${l.meaning}, màu ${l.color ?? '—'})`)
out(`Thêm ${plan.insertTerms.length} thuật ngữ:`)
for (const t of plan.insertTerms)
  out(`  + ${t.role}: ${t.label} → ${t.layer}  [${t.aliases.join(', ')}]`)
out(`Chuyển ${plan.moveTerms.length} thuật ngữ sang layer _33_:`)
for (const m of plan.moveTerms)
  out(`  ~ ${m.role}: ${m.from ?? '(chưa có layer)'} → ${m.to}`)
out(`Đánh dấu ${plan.markLegacy.length} tên layer cũ (chỉ nhận dạng):`)
for (const m of plan.markLegacy)
  out(
    `  ${m.insert ? '+' : '~'} ${m.name} → thay cho ${m.legacyOf}${m.insert ? ' (dòng mới)' : ''}`
  )
out(`Bỏ qua ${plan.skipped.length} mục:`)
for (const s of plan.skipped)
  out(`  ! [${s.kind}] ${s.role}${s.name ? ` / ${s.name}` : ''}: ${s.reason}`)
out('')
out('Không có dòng nào bị xoá. DB không bị ghi.')
console.log(lines.join('\n'))
db.close()
