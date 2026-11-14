/**
 * Database schema and migrations.
 *
 * `CREATE TABLE IF NOT EXISTS` alone cannot evolve a schema: on a database
 * that already has the table, adding a column is a silent no-op — no error, no
 * column, and the bug only shows up as missing data later. Every change
 * therefore goes through a numbered migration, and `user_version` records how
 * far a given database has been taken.
 *
 * Rules for adding one: append a new entry, never edit an existing one, and
 * make it safe to run on a database that already carries real drawings.
 */

/**
 * The seed set as migrations v3 and v6 wrote it — frozen.
 *
 * Migrations must never change behaviour after they have shipped, so v3/v6
 * keep reading this exact list (KC-* layers) even though the current catalogue
 * is `SEED_STANDARDS` below. Migration v10 also uses it to recognise a term
 * that still carries its untouched v3/v6 layer, which is the only kind it
 * moves to `_33_`.
 */
export const SEED_STANDARDS_V3 = {
  ban_mat_cau: {
    label: 'Bản mặt cầu',
    layer: 'KC-BAN',
    aliases: ['bản mặt cầu', 'bản']
  },
  lop_phu: {
    label: 'Lớp phủ mặt cầu',
    layer: 'KC-LOPPHU',
    aliases: ['lớp phủ', 'bê tông nhựa']
  },
  lan_can: {
    label: 'Lan can',
    layer: 'KC-LANCAN',
    aliases: ['lan can', 'tay vịn']
  },
  go_chan_banh: {
    label: 'Gờ chắn bánh',
    layer: 'KC-GOCHAN',
    aliases: ['gờ chắn bánh', 'gờ chắn']
  },
  ban_qua_do: {
    label: 'Bản quá độ',
    layer: 'KC-BANQUADO',
    aliases: ['bản quá độ']
  },
  mo_cau: { label: 'Mố cầu', layer: 'KC-MO', aliases: ['mố', 'mố cầu'] },
  // The abutment taken apart. A sheet that separates the parts needs a term
  // per part, or "sửa tường thân" resolves to nothing; `mo_cau` stays for the
  // cross-sections that draw it as one shape. Layer names here are defaults —
  // an office that calls them `_33_CAU_MO_*` remaps them in this same table.
  mo_tuong_dau: {
    label: 'Tường đầu mố',
    layer: 'KC-MO-TUONGDAU',
    aliases: ['tường đầu', 'tường đỉnh mố']
  },
  mo_tuong_than: {
    label: 'Tường thân mố',
    layer: 'KC-MO-TUONGTHAN',
    aliases: ['tường thân', 'thân mố']
  },
  mo_tuong_tai: {
    label: 'Tường tai mố',
    layer: 'KC-MO-TUONGTAI',
    aliases: ['tường tai', 'tường cánh']
  },
  mo_be: {
    label: 'Bệ móng mố',
    layer: 'KC-MO-BE',
    aliases: ['bệ mố', 'bệ móng']
  },
  mo_be_tong_lot: {
    label: 'Bê tông lót',
    layer: 'KC-MO-BTLOT',
    aliases: ['bê tông lót', 'bê tông đệm']
  },
  coc_khoan_nhoi: {
    label: 'Cọc khoan nhồi',
    layer: 'KC-COC',
    aliases: ['cọc khoan nhồi', 'cọc nhồi', 'cọc']
  },
  goi_cau: { label: 'Gối cầu', layer: 'KC-GOI', aliases: ['gối', 'gối cầu'] },
  khe_co_gian: {
    label: 'Khe co giãn',
    layer: 'KC-KHE',
    aliases: ['khe co giãn', 'khe']
  },
  ong_thoat_nuoc: {
    label: 'Ống thoát nước',
    layer: 'KT-THOATNUOC',
    aliases: ['ống thoát nước', 'ống thoát']
  },
  cot_thep: {
    label: 'Cốt thép',
    layer: 'KC-COTTHEP',
    aliases: ['cốt thép', 'thép']
  },
  duong_tim: {
    label: 'Đường tim',
    layer: 'TRUC-TIM',
    aliases: ['tim cầu', 'đường tim']
  },
  // A level callout is a block with the elevation in an attribute, not free
  // text — nine of them in one abutment sheet. The drawing title likewise sits
  // on a layer of its own, so both are parts a drawing can be asked about.
  ghi_chu_cao_do: {
    label: 'Ghi chú cao độ',
    layer: 'GC-CAODO',
    aliases: ['cao độ', 'mốc cao độ']
  },
  tieu_de_ban_ve: {
    label: 'Tiêu đề bản vẽ',
    layer: 'GC-TIEUDE',
    aliases: ['tiêu đề', 'tên bản vẽ']
  },
  kich_thuoc: {
    label: 'Đường kích thước',
    layer: 'GC-KICHTHUOC',
    aliases: ['kích thước', 'cột kích thước']
  },
  ghi_chu: {
    label: 'Ghi chú',
    layer: 'GC-GHICHU',
    aliases: ['ghi chú', 'chú thích']
  }
}

/** Freezes a seed literal all the way down, so no caller can edit it. */
function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const inner of Object.values(value)) deepFreeze(inner)
    Object.freeze(value)
  }
  return value
}

/**
 * The catalogue exactly as migration v10 applies it — FROZEN.
 *
 * Like `SEED_STANDARDS_V3`, this never changes once released: a database
 * migrated last month and one migrated next year must end up the same. To
 * change the catalogue later (rename a layer, add a role), leave this alone,
 * point `SEED_STANDARDS` at a new literal, and add a new migration (v11…)
 * that carries the difference. `migrationV10.test.mjs` pins this literal by
 * hash, so an accidental edit fails the build.
 *
 * - `layer`: the `_33_` layer the role is drawn on.
 * - `color`: ACI colour given to that layer only when it is created here; an
 *   existing row keeps whatever the office set.
 * - `legacy`: old names kept for recognising old drawings only
 *   (`gan_nhan_tu_layer`), never drawn on.
 * - `aliases`: words engineers use for the part. Only this copy has them; a
 *   migration skips any alias another term already claims.
 */
export const SEED_STANDARDS_V10 = deepFreeze({
  ban_mat_cau: {
    label: 'Bản mặt cầu',
    layer: '_33_CAU_NHIP_Banmatcau',
    color: 8,
    legacy: ['KC-BAN'],
    aliases: ['bản mặt cầu', 'bản']
  },
  lop_phu: {
    label: 'Lớp phủ mặt cầu',
    layer: '_33_Matduong_BTN',
    color: 8,
    legacy: ['KC-LOPPHU', '_Matduong_BTN'],
    aliases: ['lớp phủ', 'bê tông nhựa']
  },
  lan_can: {
    label: 'Lan can',
    layer: '_33_CAU_MIS_Lancan',
    color: 7,
    legacy: ['KC-LANCAN'],
    aliases: ['lan can', 'tay vịn']
  },
  go_chan_banh: {
    label: 'Gờ chắn bánh',
    layer: '_33_CAU_MIS_Gochanbanh',
    color: 7,
    legacy: ['KC-GOCHAN'],
    aliases: ['gờ chắn bánh', 'gờ chắn']
  },
  bo_via: {
    label: 'Bó vỉa',
    layer: '_33_CAU_MIS_Bovia',
    color: 7,
    legacy: [],
    aliases: ['bó vỉa']
  },
  ban_qua_do: {
    label: 'Bản quá độ',
    layer: '_33_CAU_MO_Banquado',
    color: 8,
    legacy: ['KC-BANQUADO'],
    aliases: ['bản quá độ']
  },
  mo_cau: {
    label: 'Mố cầu',
    layer: '_33_CAU_MO_Tongthe',
    color: 8,
    legacy: ['KC-MO'],
    aliases: ['mố', 'mố cầu']
  },
  mo_tuong_dau: {
    label: 'Tường đầu mố',
    layer: '_33_CAU_MO_Tuongdau',
    color: 8,
    legacy: ['KC-MO-TUONGDAU'],
    aliases: ['tường đầu', 'tường đỉnh mố']
  },
  mo_tuong_than: {
    label: 'Tường thân mố',
    layer: '_33_CAU_MO_Tuongthan',
    color: 8,
    legacy: ['KC-MO-TUONGTHAN'],
    aliases: ['tường thân', 'thân mố']
  },
  mo_tuong_tai: {
    label: 'Tường tai mố',
    layer: '_33_CAU_MO_Tuongtai',
    color: 8,
    legacy: ['KC-MO-TUONGTAI'],
    aliases: ['tường tai', 'tường cánh']
  },
  mo_be: {
    label: 'Bệ móng mố',
    layer: '_33_CAU_MO_Be',
    color: 8,
    legacy: ['KC-MO-BE'],
    aliases: ['bệ mố', 'bệ móng']
  },
  mo_be_tong_lot: {
    label: 'Bê tông lót',
    layer: '_33_CAU_MO_Betonglot',
    color: 8,
    legacy: ['KC-MO-BTLOT'],
    aliases: ['bê tông lót', 'bê tông đệm']
  },
  coc_khoan_nhoi: {
    label: 'Cọc khoan nhồi',
    layer: '_33_CAU_MO_Coc',
    color: 8,
    legacy: ['KC-COC'],
    aliases: ['cọc khoan nhồi', 'cọc nhồi', 'cọc']
  },
  tru_xa_mu: {
    label: 'Xà mũ trụ',
    layer: '_33_CAU_TRU_Xamu',
    color: 8,
    legacy: [],
    aliases: ['xà mũ']
  },
  tru_than: {
    label: 'Thân trụ',
    layer: '_33_CAU_TRU_Thantru',
    color: 8,
    legacy: [],
    aliases: ['cột trụ', 'tường thân trụ']
  },
  tru_da_ke_goi: {
    label: 'Đá kê gối',
    layer: '_33_CAU_TRU_Dakegoi',
    color: 8,
    legacy: [],
    aliases: ['đá kê']
  },
  tru_be: {
    label: 'Bệ móng trụ',
    layer: '_33_CAU_TRU_Be',
    color: 8,
    legacy: [],
    aliases: ['bệ trụ']
  },
  tru_be_tong_lot: {
    label: 'Bê tông lót bệ trụ',
    layer: '_33_CAU_TRU_Betonglot',
    color: 8,
    legacy: [],
    aliases: ['bê tông lót trụ']
  },
  tru_coc_khoan_nhoi: {
    label: 'Cọc khoan nhồi trụ',
    layer: '_33_CAU_TRU_Coc',
    color: 8,
    legacy: [],
    aliases: ['cọc trụ']
  },
  goi_cau: {
    label: 'Gối cầu',
    layer: '_33_CAU_MIS_Goicau',
    color: 7,
    legacy: ['KC-GOI'],
    aliases: ['gối', 'gối cầu']
  },
  khe_co_gian: {
    label: 'Khe co giãn',
    layer: '_33_CAU_MIS_Khecogian',
    color: 7,
    legacy: ['KC-KHE'],
    aliases: ['khe co giãn', 'khe']
  },
  ong_thoat_nuoc: {
    label: 'Ống thoát nước',
    layer: '_33_CAU_MIS_Thoatnuoc',
    color: 7,
    legacy: ['KT-THOATNUOC'],
    aliases: ['ống thoát nước', 'ống thoát']
  },
  cot_thep: {
    label: 'Cốt thép',
    layer: '_33_Cotthep',
    color: 8,
    legacy: ['KC-COTTHEP'],
    aliases: ['cốt thép', 'thép']
  },
  duong_tim: {
    label: 'Đường tim',
    layer: '_33_Timtuyen',
    color: 8,
    legacy: ['TRUC-TIM'],
    aliases: ['tim cầu', 'đường tim']
  },
  ghi_chu_cao_do: {
    label: 'Ghi chú cao độ',
    layer: '_33_Ghichu_Caodo',
    color: 8,
    legacy: ['GC-CAODO'],
    aliases: ['cao độ', 'mốc cao độ']
  },
  tieu_de_ban_ve: {
    label: 'Tiêu đề bản vẽ',
    layer: '_33_Tieudebanve',
    color: 8,
    legacy: ['GC-TIEUDE'],
    aliases: ['tiêu đề', 'tên bản vẽ']
  },
  kich_thuoc: {
    label: 'Đường kích thước',
    layer: '_33_Duongghikichthuoc',
    color: 8,
    legacy: ['GC-KICHTHUOC'],
    aliases: ['kích thước', 'cột kích thước']
  },
  ghi_chu: {
    label: 'Ghi chú',
    layer: '_33_Ghichu',
    color: 8,
    legacy: ['GC-GHICHU'],
    aliases: ['ghi chú', 'chú thích']
  },
  ky_hieu_mat_cat: {
    label: 'Ký hiệu mặt cắt',
    layer: '_33_Kyhieumatcat',
    color: 8,
    legacy: [],
    aliases: ['mặt cắt']
  },
  khung_ban_ve: {
    label: 'Khung bản vẽ',
    layer: '_33_Khungbanve',
    color: 7,
    legacy: [],
    aliases: ['khung bản vẽ', 'khung giấy']
  },
  khung_ten: {
    label: 'Khung tên',
    layer: '_33_Khungten',
    color: 7,
    legacy: [],
    aliases: ['khung tên']
  }
})

/**
 * The current standardisation catalogue: every role on a `_33_` layer.
 *
 * Mirrors `SEED_CATALOG` in `packages/cad-template-sdk/src/AcTpSeed.ts`, which
 * is the one place an office edits names, labels and colours. Duplicated here
 * because the service runs on plain Node with no bundler and the image copies
 * only `server/auth/*.mjs`; `AcTpSeedMatchesServer.spec.ts` pins the two.
 *
 * Today it is the v10 catalogue. When it changes, it becomes its own literal
 * here and a new migration brings existing databases to it; migrations never
 * read this constant.
 */
export const SEED_STANDARDS = SEED_STANDARDS_V10

const lower = value => String(value ?? '').toLowerCase()

/**
 * What migration v10 would change in this database, without changing it.
 *
 * Shared by the migration and by `dry-run-v10.mjs`, so what an operator reads
 * on a copy of production is exactly what the migration will do. Works on a
 * v9 database (no `legacy_of` column yet) and on one already at v10.
 *
 * Conservative by construction — it only ever adds:
 * - layers: a missing `_33_` layer is inserted; an existing row (compared
 *   case-insensitively, as AutoCAD does) is never rewritten.
 * - terms: a missing role is inserted; an existing term is moved only while it
 *   still carries the untouched v3/v6 layer, no layer, or one of its own
 *   legacy names. A term pointing anywhere else was chosen by a person.
 * - legacy names: marked `legacy_of` only when nothing draws on them any more.
 *
 * @param db - Open database (may be read-only).
 * @returns The plan, plus what was skipped and why.
 */
export function planStandardsV10(db) {
  const hasColumn = db
    .prepare(`PRAGMA table_info(standard_layers)`)
    .all()
    .some(column => column.name === 'legacy_of')
  const layerRows = db
    .prepare(
      `SELECT name, ${hasColumn ? 'legacy_of' : 'NULL AS legacy_of'} FROM standard_layers`
    )
    .all()
  const layers = new Map(layerRows.map(row => [lower(row.name), row]))
  const termRows = db
    .prepare(`SELECT role, label, aliases, layer FROM standard_terms`)
    .all()
  const terms = new Map(termRows.map(row => [row.role, row]))

  const plan = {
    addColumn: !hasColumn,
    insertLayers: [],
    insertTerms: [],
    moveTerms: [],
    markLegacy: [],
    skipped: []
  }

  for (const [role, seed] of Object.entries(SEED_STANDARDS_V10)) {
    if (!layers.has(lower(seed.layer))) {
      const row = { name: seed.layer, meaning: seed.label, color: seed.color }
      plan.insertLayers.push(row)
      layers.set(lower(seed.layer), { name: seed.layer, legacy_of: null })
    }
  }

  // Words other terms already answer to. A seed alias that clashes is dropped:
  // the person who entered the other one decided what it means.
  const claimed = new Map()
  const claim = (word, role) => {
    const key = lower(String(word).trim())
    if (key && !claimed.has(key)) claimed.set(key, role)
  }
  for (const row of termRows) {
    claim(row.label, row.role)
    let aliases = []
    try {
      aliases = JSON.parse(row.aliases ?? '[]')
    } catch {
      aliases = []
    }
    if (Array.isArray(aliases))
      for (const alias of aliases) claim(alias, row.role)
  }

  const finalLayer = new Map(termRows.map(row => [row.role, row.layer]))
  for (const [role, seed] of Object.entries(SEED_STANDARDS_V10)) {
    const row = terms.get(role)
    if (!row) {
      if (claimed.has(lower(seed.label))) {
        plan.skipped.push({
          kind: 'term',
          role,
          reason: `nhãn "${seed.label}" đã thuộc thuật ngữ ${claimed.get(lower(seed.label))}`
        })
        continue
      }
      claim(seed.label, role)
      const aliases = []
      for (const alias of seed.aliases) {
        if (lower(alias) === lower(seed.label)) continue
        if (claimed.has(lower(alias))) {
          plan.skipped.push({
            kind: 'alias',
            role,
            name: alias,
            reason: `đã thuộc thuật ngữ ${claimed.get(lower(alias))}`
          })
          continue
        }
        claim(alias, role)
        aliases.push(alias)
      }
      plan.insertTerms.push({
        role,
        label: seed.label,
        aliases,
        layer: seed.layer
      })
      finalLayer.set(role, seed.layer)
      continue
    }

    const current = row.layer
    if (current && lower(current) === lower(seed.layer)) continue
    const untouched = [SEED_STANDARDS_V3[role]?.layer, ...seed.legacy]
      .filter(Boolean)
      .map(lower)
    if (!current || untouched.includes(lower(current))) {
      plan.moveTerms.push({ role, from: current ?? null, to: seed.layer })
      finalLayer.set(role, seed.layer)
    } else {
      plan.skipped.push({
        kind: 'term',
        role,
        reason: `đang trỏ layer người dùng chọn "${current}", giữ nguyên`
      })
    }
  }

  const drawnOn = new Set([...finalLayer.values()].filter(Boolean).map(lower))
  for (const [role, seed] of Object.entries(SEED_STANDARDS_V10)) {
    for (const name of seed.legacy) {
      const row = layers.get(lower(name))
      if (drawnOn.has(lower(name))) {
        const owner = [...finalLayer.entries()].find(
          ([, layer]) => lower(layer) === lower(name)
        )?.[0]
        plan.skipped.push({
          kind: 'legacy',
          role,
          name,
          reason: `thuật ngữ ${owner} vẫn vẽ lên layer này, không đánh dấu là tên cũ`
        })
        continue
      }
      if (!row) {
        plan.markLegacy.push({
          name,
          legacyOf: seed.layer,
          insert: true,
          meaning: `Tên cũ của ${seed.layer} — chỉ để nhận dạng bản vẽ cũ`
        })
      } else if (!row.legacy_of) {
        plan.markLegacy.push({
          name: row.name,
          legacyOf: seed.layer,
          insert: false
        })
      } else if (lower(row.legacy_of) !== lower(seed.layer)) {
        plan.skipped.push({
          kind: 'legacy',
          role,
          name: row.name,
          reason: `đã là tên cũ của "${row.legacy_of}", giữ nguyên`
        })
      }
    }
  }

  return plan
}

/**
 * Applies a plan from {@link planStandardsV10} in one transaction.
 *
 * Every statement re-checks its own guard, so applying a stale plan, or the
 * same plan twice, changes nothing that was not meant to change. Nothing is
 * deleted; rows inserted here have no `updated_by`.
 */
export function applyStandardsV10(db, plan) {
  db.exec('BEGIN')
  try {
    if (plan.addColumn) {
      const has = db
        .prepare(`PRAGMA table_info(standard_layers)`)
        .all()
        .some(column => column.name === 'legacy_of')
      if (!has) db.exec(`ALTER TABLE standard_layers ADD COLUMN legacy_of TEXT`)
    }

    const insertLayer = db.prepare(
      `INSERT INTO standard_layers (name, meaning, color, legacy_of, updated_by, updated_at)
       SELECT ?, ?, ?, ?, NULL, datetime('now')
        WHERE NOT EXISTS
          (SELECT 1 FROM standard_layers WHERE lower(name) = lower(?))`
    )
    for (const layer of plan.insertLayers) {
      insertLayer.run(
        layer.name,
        layer.meaning,
        layer.color ?? null,
        null,
        layer.name
      )
    }

    const insertTerm = db.prepare(
      `INSERT OR IGNORE INTO standard_terms
         (role, label, aliases, layer, updated_by, updated_at)
       VALUES (?, ?, ?, ?, NULL, datetime('now'))`
    )
    for (const term of plan.insertTerms) {
      insertTerm.run(
        term.role,
        term.label,
        JSON.stringify(term.aliases),
        term.layer
      )
    }

    const moveTerm = db.prepare(
      `UPDATE standard_terms SET layer = ?, updated_at = datetime('now')
        WHERE role = ?
          AND ((? IS NULL AND layer IS NULL) OR lower(layer) = lower(?))`
    )
    for (const move of plan.moveTerms) {
      moveTerm.run(move.to, move.role, move.from, move.from)
    }

    const markLegacy = db.prepare(
      `UPDATE standard_layers SET legacy_of = ?
        WHERE lower(name) = lower(?) AND legacy_of IS NULL`
    )
    for (const legacy of plan.markLegacy) {
      if (legacy.insert) {
        insertLayer.run(
          legacy.name,
          legacy.meaning,
          null,
          legacy.legacyOf,
          legacy.name
        )
      } else {
        markLegacy.run(legacy.legacyOf, legacy.name)
      }
    }
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

/**
 * What a person is allowed to do, in increasing order of trust.
 *
 * `author` exists because uploading a template means uploading code that runs
 * in other members' browsers. That is a different question from "may this
 * person manage accounts", and one boolean cannot answer both.
 */
export const ROLES = { MEMBER: 'member', AUTHOR: 'author', ADMIN: 'admin' }

/** Rank used for "at least this role" checks. */
const ROLE_RANK = { member: 0, author: 1, admin: 2 }

/** True when `role` is at least as trusted as `required`. */
export function hasRoleAtLeast(role, required) {
  return (ROLE_RANK[role] ?? -1) >= (ROLE_RANK[required] ?? Infinity)
}

/** Ordered migrations. Index + 1 is the resulting `user_version`. */
const MIGRATIONS = [
  // v1 — accounts and sessions (the shape that shipped first).
  db => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        pass_hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        is_admin INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        expires_at INTEGER NOT NULL
      );
    `)
  },

  // v2 — drawings.
  //
  // `dxf` holds the drawing itself: the record of truth for a submission,
  // stored as opaque bytes because the server has no business parsing CAD.
  // `template_id` / `template_version` / `params` are the recipe — enough to
  // regenerate or to produce a variant, pinned to the exact template version
  // so a later template update cannot change an approved drawing.
  //
  // `revision` is the optimistic lock: a write carrying a stale revision is
  // refused rather than silently overwriting whatever arrived first.
  db => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS drawings (
        id TEXT PRIMARY KEY,
        owner_id INTEGER NOT NULL REFERENCES users(id),
        name TEXT NOT NULL,
        template_id TEXT,
        template_version TEXT,
        params TEXT,
        batch_id TEXT,
        dxf BLOB,
        revision INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_drawings_owner
        ON drawings(owner_id, updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_drawings_batch
        ON drawings(owner_id, batch_id);
    `)
  },

  // v3 — the standardisation layer: trade terms and the layer catalogue.
  //
  // Until now these lived as constants in `cad-template-sdk`, which meant the
  // company could not add a term without someone shipping a release. They are
  // data, not code: an engineer who says "tay vịn" where the dictionary says
  // "lan can" is describing the same rail, and only the company knows which
  // words its own drawings use.
  //
  // `aliases` is a JSON array rather than a child table on purpose. It is read
  // whole, written whole, never joined against, and never grows past a handful
  // of entries per term — a table would buy nothing and cost a join on every
  // lookup.
  //
  // Both tables record who last touched a row and when, because a standard
  // nobody can attribute is a standard nobody will correct.
  db => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS standard_terms (
        role TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        aliases TEXT NOT NULL DEFAULT '[]',
        description TEXT,
        entity_kind TEXT,
        updated_by INTEGER REFERENCES users(id),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS standard_layers (
        name TEXT PRIMARY KEY,
        meaning TEXT NOT NULL,
        color INTEGER,
        line_type TEXT,
        updated_by INTEGER REFERENCES users(id),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `)

    // Seeded from the constants the first template already draws against, so
    // an existing deployment keeps working the moment it migrates rather than
    // starting from an empty dictionary that matches nothing.
    const term = db.prepare(
      `INSERT OR IGNORE INTO standard_terms (role, label, aliases)
       VALUES (?, ?, ?)`
    )
    const layer = db.prepare(
      `INSERT OR IGNORE INTO standard_layers (name, meaning) VALUES (?, ?)`
    )
    for (const [role, seed] of Object.entries(SEED_STANDARDS_V3)) {
      term.run(role, seed.label, JSON.stringify(seed.aliases ?? []))
      layer.run(seed.layer, seed.label)
    }
  },

  // v4 — three roles in place of one admin flag.
  //
  // `is_admin` answered one question: may this person manage accounts. Story
  // 2.5 introduces a second, sharper one: may this person upload template
  // *code* that will execute in everyone else's browser. Those are different
  // permissions and a boolean cannot express both — with only a flag, either
  // every member can push code or only the administrator can author templates.
  //
  // The flag is dropped rather than left behind. Two sources of truth for a
  // privilege check is how one of them ends up stale and consulted.
  db => {
    db.exec(`ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'member'`)
    db.exec(`UPDATE users SET role = 'admin' WHERE is_admin = 1`)
    db.exec(`ALTER TABLE users DROP COLUMN is_admin`)
  },

  // v5 — the template library.
  //
  // `code` is the built JS module an author uploads. The server never executes
  // it: templates run in the browser, which is both where the CAD runtime
  // lives and the only place a runaway template can only spoil its own tab.
  //
  // `content_hash` is what makes a saved drawing's "regenerate" mean anything.
  // A drawing pins `(template_id, template_version)`; if that pair could be
  // re-uploaded with different code, an approved drawing would silently
  // regenerate into a different shape. Re-uploading identical content is fine
  // and idempotent — it is a changed body under an unchanged version that is
  // refused.
  //
  // `status` starts at 'draft'. A template becomes visible to the rest of the
  // company only after it has actually produced a drawing once, because a
  // template that throws is worse than a missing one: it wastes the engineer's
  // time and their trust.
  db => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS templates (
        template_id TEXT NOT NULL,
        version TEXT NOT NULL,
        name TEXT NOT NULL,
        category TEXT,
        description TEXT,
        params TEXT NOT NULL DEFAULT '[]',
        role_layers TEXT NOT NULL DEFAULT '{}',
        code TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft',
        uploaded_by INTEGER REFERENCES users(id),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        verified_at TEXT,
        PRIMARY KEY (template_id, version)
      );
      CREATE INDEX IF NOT EXISTS idx_templates_status
        ON templates(status, template_id, version);
    `)
  },

  // v6 — the layer a role is drawn on.
  //
  // v3 created both tables and lost the relationship between them: the SDK has
  // always paired `lan_can` with `KC-LANCAN`, but on the server the two sat in
  // separate tables with nothing joining them. That left the client with no
  // central mapping to override its built-in one, and made "a role with no
  // layer" — the contradiction Story 2.3 has to warn about — unaskable.
  //
  // Nullable on purpose: a term can exist before anyone has decided which
  // layer it belongs on, and forcing a layer at creation would make people
  // invent one.
  db => {
    db.exec(`ALTER TABLE standard_terms ADD COLUMN layer TEXT`)
    const setLayer = db.prepare(
      `UPDATE standard_terms SET layer = ? WHERE role = ? AND layer IS NULL`
    )
    for (const [role, seed] of Object.entries(SEED_STANDARDS_V3)) {
      setLayer.run(seed.layer, role)
    }
  },

  // v7 — a log of every AI call.
  //
  // Two questions this has to answer, and they pull in different directions.
  // The administrator's: what did this cost us this month. The engineer's:
  // did the assistant do something I had to undo — which is the only honest
  // measure of whether it is helping. `undone_within_30s` is that measure: an
  // edit reverted within half a minute was not what the person asked for, and
  // a rate nobody can see is a rate nobody fixes.
  //
  // The prompt is stored, the drawing is not. What an engineer typed is
  // needed to tell a misunderstanding from a bad edit; the geometry is
  // already in `drawings` and copying it here would double the blast radius
  // of this table for no question it answers.
  db => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS ai_calls (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id),
        drawing_id TEXT,
        command TEXT NOT NULL,
        model TEXT NOT NULL,
        input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        cache_read_tokens INTEGER NOT NULL DEFAULT 0,
        cache_write_tokens INTEGER NOT NULL DEFAULT 0,
        entities_touched INTEGER,
        undone_within_30s INTEGER NOT NULL DEFAULT 0,
        error_code TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_ai_calls_month
        ON ai_calls(created_at);
      CREATE INDEX IF NOT EXISTS idx_ai_calls_user
        ON ai_calls(user_id, created_at DESC);
    `)
  },

  // v8 — the guide library.
  //
  // A guide is a folder of markdown for the assistant: `SKILL.md` with a
  // `name` and `description` in its frontmatter, plus `references/*.md`. The
  // files travel as one JSON column rather than a table of their own because
  // they are only ever read together — a guide with half its references is
  // not a smaller guide, it is a broken one — and a guide is a few kilobytes.
  //
  // Keyed by `skill_id` alone. Templates carry a version because a drawing
  // pins one; nothing pins a guide, so a changed guide simply replaces the old
  // text and drops back to draft until its author has tried the new one.
  db => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS skills (
        skill_id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        files TEXT NOT NULL DEFAULT '[]',
        content_hash TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft',
        uploaded_by INTEGER REFERENCES users(id),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        verified_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_skills_status
        ON skills(status, skill_id);
    `)
  },
  // v9 — persist bootstrap completion so restarts cannot reset edited accounts.
  db => {
    db.exec(
      'CREATE TABLE IF NOT EXISTS auth_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)'
    )
  },

  // v10 — one `_33_` catalogue; KC-*/KT-* become names kept for recognition.
  //
  // The office draws on `_33_*` and had re-pointed most terms by hand; the
  // rest still sat on the KC-* defaults, so one drawing could come out on two
  // naming systems. Old names cannot simply be deleted — the archive is drawn
  // on them and `gan_nhan_tu_layer` needs to read it — so they stay as rows
  // marked `legacy_of`, which the role → layer map never serves.
  //
  // Additive only; see planStandardsV10. `dry-run-v10.mjs` prints the same
  // plan without writing, for checking against a copy of production first.
  db => {
    applyStandardsV10(db, planStandardsV10(db))
  }
]

/**
 * Brings a database up to the current schema version.
 *
 * @param db - Open database.
 * @param target - Stop at this version instead of the latest. Only tests use
 * it, to build a database exactly as an older release left it.
 * @returns The version the database is now at.
 */
export function migrate(db, target = MIGRATIONS.length) {
  db.exec('PRAGMA journal_mode = WAL;')

  const current = db.prepare('PRAGMA user_version').get().user_version ?? 0
  const last = Math.min(target, MIGRATIONS.length)

  for (let version = current; version < last; version++) {
    MIGRATIONS[version](db)
    // PRAGMA does not accept bound parameters, and `version` is a loop counter
    // over a fixed array — never user input.
    db.exec(`PRAGMA user_version = ${version + 1}`)
  }

  return Math.max(current, last)
}

/** Schema version this code expects. */
export const SCHEMA_VERSION = MIGRATIONS.length
