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
 * The seed standardisation set, mirroring `SEED_ROLES` / `SEED_ROLE_LAYERS` in
 * `cad-template-sdk`.
 *
 * Duplicated here rather than imported: the service runs on plain Node with no
 * bundler and must not depend on a browser package. The SDK constants stay the
 * compile-time contract for template authors; these are the runtime seed for a
 * fresh database. A test pins the two together.
 *
 * Aliases are the words engineers actually use for the same part. They are
 * deliberately sparse — the company fills them in, and guessing on their
 * behalf is how a dictionary ends up describing nobody's drawings.
 */
export const SEED_STANDARDS = {
  ban_mat_cau: { label: 'Bản mặt cầu', layer: 'KC-BAN', aliases: ['bản mặt cầu', 'bản'] },
  lop_phu: { label: 'Lớp phủ mặt cầu', layer: 'KC-LOPPHU', aliases: ['lớp phủ', 'bê tông nhựa'] },
  lan_can: { label: 'Lan can', layer: 'KC-LANCAN', aliases: ['lan can', 'tay vịn'] },
  go_chan_banh: { label: 'Gờ chắn bánh', layer: 'KC-GOCHAN', aliases: ['gờ chắn bánh', 'gờ chắn'] },
  ban_qua_do: { label: 'Bản quá độ', layer: 'KC-BANQUADO', aliases: ['bản quá độ'] },
  mo_cau: { label: 'Mố cầu', layer: 'KC-MO', aliases: ['mố', 'mố cầu'] },
  goi_cau: { label: 'Gối cầu', layer: 'KC-GOI', aliases: ['gối', 'gối cầu'] },
  khe_co_gian: { label: 'Khe co giãn', layer: 'KC-KHE', aliases: ['khe co giãn', 'khe'] },
  ong_thoat_nuoc: { label: 'Ống thoát nước', layer: 'KT-THOATNUOC', aliases: ['ống thoát nước', 'ống thoát'] },
  cot_thep: { label: 'Cốt thép', layer: 'KC-COTTHEP', aliases: ['cốt thép', 'thép'] },
  duong_tim: { label: 'Đường tim', layer: 'TRUC-TIM', aliases: ['tim cầu', 'đường tim'] },
  kich_thuoc: { label: 'Đường kích thước', layer: 'GC-KICHTHUOC', aliases: ['kích thước', 'cột kích thước'] },
  ghi_chu: { label: 'Ghi chú', layer: 'GC-GHICHU', aliases: ['ghi chú', 'chú thích'] }
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
    for (const [role, seed] of Object.entries(SEED_STANDARDS)) {
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
  }
]

/**
 * Brings a database up to the current schema version.
 *
 * @param db - Open database.
 * @returns The version the database is now at.
 */
export function migrate(db) {
  db.exec('PRAGMA journal_mode = WAL;')

  const current = db.prepare('PRAGMA user_version').get().user_version ?? 0

  for (let version = current; version < MIGRATIONS.length; version++) {
    MIGRATIONS[version](db)
    // PRAGMA does not accept bound parameters, and `version` is a loop counter
    // over a fixed array — never user input.
    db.exec(`PRAGMA user_version = ${version + 1}`)
  }

  return MIGRATIONS.length
}

/** Schema version this code expects. */
export const SCHEMA_VERSION = MIGRATIONS.length
