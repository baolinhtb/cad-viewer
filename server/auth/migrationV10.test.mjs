/**
 * Migration v10 — one `_33_` layer catalogue, KC-* và KT-* kept for recognition.
 *
 * Built against a database shaped like the one in production: v9, the seed
 * from v3/v6, and the office's own `_33_` rows entered by hand through
 * `/standards` (the mapping in `moMatChinh.spec.ts`). Whatever a person
 * entered must survive untouched; only rows still holding the untouched seed
 * may move.
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'

import {
  applyStandardsV10,
  migrate,
  planStandardsV10,
  SCHEMA_VERSION,
  SEED_STANDARDS,
  SEED_STANDARDS_V10
} from './schema.mjs'
import {
  findContradictions,
  legacyLayerMap,
  listLayers,
  roleLayerMap
} from './standards.mjs'

/** The office's hand-entered mapping, as production carries it. */
const OFFICE = {
  mo_be: '_33_CAU_MO_Be',
  mo_be_tong_lot: '_33_CAU_MO_Betonglot',
  mo_tuong_than: '_33_CAU_MO_Tuongthan',
  mo_tuong_dau: '_33_CAU_MO_Tuongdau',
  mo_tuong_tai: '_33_CAU_MO_Tuongtai',
  lop_phu: '_33_Matduong_BTN',
  coc_khoan_nhoi: '_33_CAU_MO_Coc',
  lan_can: '_33_CAU_MIS_Lancan',
  duong_tim: '_33_Timtuyen',
  kich_thuoc: '_33_Duongghikichthuoc',
  ghi_chu: '_33_Ghichu',
  ghi_chu_cao_do: '_33_Ghichu_Caodo',
  tieu_de_ban_ve: '_33_Tieudebanve',
  ky_hieu_mat_cat: '_33_Kyhieumatcat'
}

/** KC rows the office deleted after renaming, to land on 29 layers. */
const DELETED_KC = [
  'KC-MO-BE',
  'KC-MO-BTLOT',
  'KC-MO-TUONGTHAN',
  'KC-MO-TUONGDAU',
  'KC-MO-TUONGTAI',
  'KC-LOPPHU'
]

/** A v9 database with the seed plus the office's own edits: 29 / 22. */
function productionLikeDb() {
  const db = new DatabaseSync(':memory:')
  migrate(db, 9)
  db.prepare(
    `INSERT INTO users (id, email, name, pass_hash, salt) VALUES (7, 'kts@vp', 'KTS', 'h', 's')`
  ).run()
  const addLayer = db.prepare(
    `INSERT INTO standard_layers (name, meaning, color, line_type, updated_by, updated_at)
     VALUES (?, ?, ?, ?, 7, '2026-09-01 08:00:00')`
  )
  for (const [role, name] of Object.entries(OFFICE)) {
    addLayer.run(
      name,
      `Ý nghĩa do văn phòng ghi — ${role}`,
      name === '_33_CAU_MIS_Lancan' ? 7 : 8,
      name === '_33_Timtuyen' ? 'CENTER' : null
    )
  }
  const del = db.prepare(`DELETE FROM standard_layers WHERE name = ?`)
  for (const name of DELETED_KC) del.run(name)
  db.prepare(
    `INSERT INTO standard_terms (role, label, aliases, layer, updated_by, updated_at)
     VALUES ('ky_hieu_mat_cat', 'Ký hiệu mặt cắt', '["mặt cắt A-A"]', NULL, 7, '2026-09-01 08:00:00')`
  ).run()
  const point = db.prepare(
    `UPDATE standard_terms SET layer = ?, updated_by = 7, updated_at = '2026-09-02 09:00:00'
      WHERE role = ?`
  )
  for (const [role, name] of Object.entries(OFFICE)) point.run(name, role)
  // ky_hieu_mat_cat was given its layer too, like the rest.
  return db
}

const dump = db => ({
  layers: db.prepare(`SELECT * FROM standard_layers ORDER BY name`).all(),
  terms: db.prepare(`SELECT * FROM standard_terms ORDER BY role`).all()
})

const count = (db, table) =>
  db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n

test('the fixture matches production: 29 layers, 22 terms, at v9', () => {
  const db = productionLikeDb()
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 9)
  assert.equal(count(db, 'standard_layers'), 29)
  assert.equal(count(db, 'standard_terms'), 22)
})

test('v10 on a production-like database: one _33_ catalogue', () => {
  const db = productionLikeDb()
  migrate(db)
  assert.equal(
    db.prepare('PRAGMA user_version').get().user_version,
    SCHEMA_VERSION
  )

  const mapping = roleLayerMap(db)
  for (const role of Object.keys(SEED_STANDARDS)) {
    assert.ok(mapping[role], `vai trò ${role} phải có layer`)
  }
  assert.deepEqual(
    Object.entries(mapping).filter(([, layer]) => !layer.startsWith('_33_')),
    []
  )
  // Roles that were still on KC/KT moved.
  assert.equal(mapping.ban_mat_cau, '_33_CAU_NHIP_Banmatcau')
  assert.equal(mapping.goi_cau, '_33_CAU_MIS_Goicau')
  assert.equal(mapping.ong_thoat_nuoc, '_33_CAU_MIS_Thoatnuoc')
  assert.equal(mapping.cot_thep, '_33_Cotthep')
  // The old names recognise old drawings.
  const legacy = legacyLayerMap(db)
  assert.equal(legacy['KC-BAN'], 'ban_mat_cau')
  assert.equal(legacy['KC-COC'], 'coc_khoan_nhoi')
  assert.equal(legacy['_Matduong_BTN'], 'lop_phu')
  assert.equal(legacy['KT-THOATNUOC'], 'ong_thoat_nuoc')
  // Old names the office had deleted come back only as recognition rows.
  assert.equal(legacy['KC-MO-BE'], 'mo_be')
})

test('v10 never removes or rewrites what a person entered', () => {
  const db = productionLikeDb()
  const before = dump(db)
  migrate(db)
  const after = dump(db)

  assert.ok(after.layers.length >= before.layers.length)
  assert.ok(after.terms.length >= before.terms.length)

  const layerAfter = new Map(after.layers.map(row => [row.name, row]))
  for (const row of before.layers) {
    const now = layerAfter.get(row.name)
    assert.ok(now, `layer ${row.name} bị mất`)
    for (const key of [
      'meaning',
      'color',
      'line_type',
      'updated_by',
      'updated_at'
    ]) {
      assert.equal(now[key], row[key], `${row.name}.${key} bị sửa`)
    }
  }

  const termAfter = new Map(after.terms.map(row => [row.role, row]))
  for (const row of before.terms) {
    const now = termAfter.get(row.role)
    assert.ok(now, `thuật ngữ ${row.role} bị mất`)
    assert.equal(now.label, row.label)
    assert.equal(now.aliases, row.aliases)
    assert.equal(now.updated_by, row.updated_by)
    // Terms the office had already put on `_33_` are not touched at all.
    if (row.layer && row.layer.startsWith('_33_')) {
      assert.equal(now.layer, row.layer)
      assert.equal(now.updated_at, row.updated_at)
    }
  }
})

test('running v10 twice changes nothing the second time', () => {
  const db = productionLikeDb()
  migrate(db)
  const once = dump(db)

  const plan = planStandardsV10(db)
  assert.deepEqual(
    {
      addColumn: plan.addColumn,
      insertLayers: plan.insertLayers,
      insertTerms: plan.insertTerms,
      moveTerms: plan.moveTerms,
      markLegacy: plan.markLegacy
    },
    {
      addColumn: false,
      insertLayers: [],
      insertTerms: [],
      moveTerms: [],
      markLegacy: []
    }
  )
  applyStandardsV10(db, plan)
  // A stale plan (the first one) applied again is also harmless.
  const fresh = productionLikeDb()
  const firstPlan = planStandardsV10(fresh)
  applyStandardsV10(fresh, firstPlan)
  applyStandardsV10(fresh, firstPlan)
  migrate(db)

  assert.deepEqual(dump(db), once)
  assert.deepEqual(
    dump(fresh).layers.map(row => row.name),
    once.layers.map(row => row.name)
  )
})

test('a term a person pointed elsewhere keeps its layer', () => {
  const db = productionLikeDb()
  db.prepare(
    `INSERT INTO standard_layers (name, meaning) VALUES ('BAN-RIENG', 'Bản mặt cầu kiểu cũ của dự án')`
  ).run()
  db.prepare(
    `UPDATE standard_terms SET layer = 'BAN-RIENG' WHERE role = 'ban_mat_cau'`
  ).run()
  const plan = planStandardsV10(db)
  assert.ok(
    plan.skipped.some(s => s.kind === 'term' && s.role === 'ban_mat_cau')
  )
  migrate(db)
  assert.equal(roleLayerMap(db).ban_mat_cau, 'BAN-RIENG')
})

test('an old name some term still draws on is not marked legacy', () => {
  const db = productionLikeDb()
  db.prepare(
    `UPDATE standard_terms SET layer = 'KC-GOI' WHERE role = 'khe_co_gian'`
  ).run()
  migrate(db)
  const goi = listLayers(db).find(layer => layer.name === 'KC-GOI')
  assert.equal(goi.legacyOf, null)
  assert.equal(roleLayerMap(db).khe_co_gian, 'KC-GOI')
})

test('an existing _33_ row in another case is reused, not duplicated', () => {
  const db = productionLikeDb()
  db.prepare(
    `INSERT INTO standard_layers (name, meaning, color) VALUES ('_33_cotthep', 'Thép (văn phòng)', 1)`
  ).run()
  migrate(db)
  const rows = listLayers(db).filter(
    l => l.name.toLowerCase() === '_33_cotthep'
  )
  assert.equal(rows.length, 1)
  assert.equal(rows[0].meaning, 'Thép (văn phòng)')
  assert.equal(rows[0].color, 1)
})

test('a seed alias another term already claims is skipped', () => {
  const db = productionLikeDb()
  db.prepare(
    `UPDATE standard_terms SET aliases = '["xà mũ"]' WHERE role = 'mo_tuong_dau'`
  ).run()
  migrate(db)
  const xaMu = db
    .prepare(`SELECT aliases FROM standard_terms WHERE role = 'tru_xa_mu'`)
    .get()
  assert.deepEqual(JSON.parse(xaMu.aliases), [])
})

test('a failing step rolls the whole migration back', () => {
  const db = productionLikeDb()
  const before = dump(db)
  const plan = planStandardsV10(db)
  // The last step fails (a value SQLite cannot bind) after the column, the
  // layers, the terms and the moves have all been written.
  plan.markLegacy.push({ name: {}, legacyOf: 'x', insert: false })
  assert.throws(() => applyStandardsV10(db, plan))
  const hasColumn = db
    .prepare(`PRAGMA table_info(standard_layers)`)
    .all()
    .some(column => column.name === 'legacy_of')
  assert.equal(hasColumn, false)
  assert.deepEqual(dump(db), before)
})

test('the seeded catalogue is clean after v10 on a fresh database', () => {
  const db = new DatabaseSync(':memory:')
  migrate(db)
  assert.deepEqual(findContradictions(db), {
    rolesWithoutLayer: [],
    rolesWithUnknownLayer: [],
    unusedLayers: [],
    rolesOnLegacyLayer: [],
    legacyWithUnknownTarget: []
  })
})

test('the dry run reports the plan and does not write', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cad-v10-'))
  try {
    const path = join(dir, 'copy.db')
    const db = productionLikeDb()
    db.exec(`VACUUM INTO '${path}'`)
    db.close()
    const hash = () =>
      createHash('sha256').update(readFileSync(path)).digest('hex')
    const before = hash()
    const output = execFileSync(
      process.execPath,
      [join(import.meta.dirname, 'dry-run-v10.mjs'), path],
      { encoding: 'utf8' }
    )
    assert.match(output, /user_version: 9/)
    assert.match(output, /Hiện có: 29 layer, 22 thuật ngữ/)
    assert.match(output, /~ ban_mat_cau: KC-BAN → _33_CAU_NHIP_Banmatcau/)
    assert.match(output, /\+ _Matduong_BTN → thay cho _33_Matduong_BTN/)
    assert.match(output, /DB không bị ghi/)
    assert.equal(hash(), before)

    const json = JSON.parse(
      execFileSync(
        process.execPath,
        [join(import.meta.dirname, 'dry-run-v10.mjs'), path, '--json'],
        { encoding: 'utf8' }
      )
    )
    assert.equal(json.userVersion, 9)
    assert.ok(json.plan.moveTerms.length > 0)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('the v10 catalogue is frozen: an edit means a new migration', () => {
  // A database migrated last month and one migrated next year must end up the
  // same. If this fails because the catalogue changed on purpose: revert the
  // edit to SEED_STANDARDS_V10, give SEED_STANDARDS its own literal, and add
  // migration v11 for the difference.
  const hash = createHash('sha256')
    .update(JSON.stringify(SEED_STANDARDS_V10))
    .digest('hex')
  assert.equal(
    hash,
    '6a9bfa2cf9f18a8d90232699962950eec7b19ef7041ad4d0dee67ab9e8948b0f'
  )
  assert.equal(Object.keys(SEED_STANDARDS_V10).length, 31)

  // Frozen all the way down, so no code path can edit it at run time either.
  assert.ok(Object.isFrozen(SEED_STANDARDS_V10))
  assert.ok(Object.isFrozen(SEED_STANDARDS_V10.lop_phu))
  assert.ok(Object.isFrozen(SEED_STANDARDS_V10.lop_phu.legacy))
  assert.throws(() => {
    SEED_STANDARDS_V10.lop_phu.layer = '_33_Khac'
  }, TypeError)
})

test('v10 reads only its frozen catalogue, never the current one', () => {
  // The current catalogue will move on; the migration must not move with it.
  const source = planStandardsV10.toString()
  assert.match(source, /SEED_STANDARDS_V10/)
  assert.doesNotMatch(source, /SEED_STANDARDS(?!_V)/)
  // Today the two are the same catalogue.
  assert.equal(SEED_STANDARDS, SEED_STANDARDS_V10)
})
