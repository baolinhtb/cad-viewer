import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'

import { migrate } from './schema.mjs'
import { listLayers, listTerms } from './standards.mjs'
import {
  collectStandardsGaps,
  deleteTemplate,
  ERRORS,
  getTemplate,
  listTemplates,
  MAX_TEMPLATE_BYTES,
  publishTemplate,
  STATUS,
  uploadTemplate
} from './templates.mjs'

function freshDb() {
  const db = new DatabaseSync(':memory:')
  migrate(db)
  db.prepare(
    `INSERT INTO users (id, email, name, pass_hash, salt, role)
     VALUES (1, 'a@x.vn', 'Tác giả', 'h', 's', 'author'),
            (2, 'b@x.vn', 'Người khác', 'h', 's', 'author')`
  ).run()
  return db
}

/** Standards as the routes will pass them in. */
function standardsOf(db) {
  return {
    knownRoles: listTerms(db).map(term => term.role),
    knownLayers: listLayers(db).map(layer => layer.name)
  }
}

function upload(db, overrides = {}) {
  return uploadTemplate(
    db,
    overrides.userId ?? 1,
    {
      meta: {
        id: 'cau_dam_i',
        version: '1.0.0',
        name: 'Cầu dầm I',
        category: 'cau',
        ...overrides.meta
      },
      params: overrides.params ?? [{ key: 'B', label: 'Bề rộng', type: 'number' }],
      roleLayers: overrides.roleLayers ?? { lan_can: 'KC-LANCAN' },
      code: overrides.code ?? 'export default { meta: {}, params: [], generate() {} }'
    },
    overrides.standards ?? standardsOf(db)
  )
}

function codeOf(fn) {
  try {
    fn()
    return undefined
  } catch (error) {
    return error.code
  }
}

test('an upload lands as a draft, not visible to the company yet', () => {
  // A template that throws is worse than a missing one: it wastes the
  // engineer's time and their trust.
  const db = freshDb()
  const { template } = upload(db)
  assert.equal(template.status, STATUS.DRAFT)
  assert.equal(listTemplates(db, 2, { includeDrafts: false }).length, 0)
})

test('the author can see their own draft', () => {
  const db = freshDb()
  upload(db)
  assert.equal(listTemplates(db, 1).length, 1)
  // Another member cannot.
  assert.equal(listTemplates(db, 2).length, 0)
})

test('a template becomes visible once it has produced a drawing', () => {
  const db = freshDb()
  upload(db)
  const published = publishTemplate(db, 1, 'cau_dam_i', '1.0.0')
  assert.equal(published.status, STATUS.PUBLISHED)
  assert.ok(published.verifiedAt)
  assert.equal(listTemplates(db, 2, { includeDrafts: false }).length, 1)
})

test('only the uploader can vouch that their template ran', () => {
  // Otherwise one member could publish another's untested template.
  const db = freshDb()
  upload(db)
  assert.equal(
    codeOf(() => publishTemplate(db, 2, 'cau_dam_i', '1.0.0')),
    ERRORS.FORBIDDEN
  )
})

test('re-uploading the same version with different code is refused', () => {
  // A drawing pins (template_id, version). If the code behind that pair could
  // change, an approved drawing would regenerate into a different shape.
  const db = freshDb()
  upload(db)
  assert.equal(
    codeOf(() => upload(db, { code: 'export default { changed: true }' })),
    ERRORS.VERSION_CONFLICT
  )
})

test('re-uploading identical content is idempotent, not an error', () => {
  const db = freshDb()
  upload(db)
  const again = upload(db)
  assert.equal(again.template.version, '1.0.0')
  assert.equal(listTemplates(db, 1).length, 1)
})

test('a new version alongside the old one is allowed', () => {
  const db = freshDb()
  upload(db)
  upload(db, { meta: { version: '1.1.0' }, code: 'export default { v: 2 }' })
  assert.deepEqual(
    listTemplates(db, 1).map(t => t.version),
    ['1.0.0', '1.1.0']
  )
})

test('identifiers and versions are validated', () => {
  const db = freshDb()
  assert.equal(codeOf(() => upload(db, { meta: { id: 'Cầu Dầm' } })), ERRORS.INVALID)
  assert.equal(codeOf(() => upload(db, { meta: { version: 'v1' } })), ERRORS.INVALID)
  assert.equal(codeOf(() => upload(db, { meta: { name: '  ' } })), ERRORS.INVALID)
  assert.equal(codeOf(() => upload(db, { code: '   ' })), ERRORS.INVALID)
})

test('parameter keys follow the identifier rule, not the role rule', () => {
  // Roles are matched against speech and stay lowercase; parameter keys are
  // JSON keys and Excel headers written by the author. The real template uses
  // `B`, `h`, `tLopPhu` — holding those to the role rule would reject it.
  const db = freshDb()
  const { template } = upload(db, {
    params: [{ key: 'B' }, { key: 'tLopPhu' }, { key: 'h' }]
  })
  assert.deepEqual(template.params.map(p => p.key), ['B', 'tLopPhu', 'h'])

  for (const key of ['Bề rộng', 'be rong', '2h', '']) {
    assert.equal(
      codeOf(() => upload(db, { meta: { version: '9.9.9' }, params: [{ key }], code: 'x' })),
      ERRORS.INVALID,
      `key '${key}' should be refused`
    )
  }
})

test('an oversized module is refused with the limit stated', () => {
  const db = freshDb()
  let error
  try {
    upload(db, { code: 'x'.repeat(MAX_TEMPLATE_BYTES + 1) })
  } catch (e) {
    error = e
  }
  assert.equal(error?.code, ERRORS.TOO_LARGE)
  assert.equal(error.detail.limit, MAX_TEMPLATE_BYTES)
})

test('missing roles and layers come back as warnings, not a refusal', () => {
  // An author adding a new kind of structure legitimately needs terms that do
  // not exist yet; refusing would make them edit the dictionary blind.
  const db = freshDb()
  const { template, warnings } = upload(db, {
    roleLayers: { lan_can: 'KC-LANCAN', dam_chu: 'KC-DAMCHU' }
  })
  assert.equal(template.status, STATUS.DRAFT)
  assert.deepEqual(warnings.missingRoles, ['dam_chu'])
  assert.deepEqual(warnings.missingLayers, [{ role: 'dam_chu', layer: 'KC-DAMCHU' }])
})

test('a template using only known roles warns about nothing', () => {
  const db = freshDb()
  const { warnings } = upload(db)
  assert.deepEqual(warnings, { missingRoles: [], missingLayers: [] })
})

test('layer matching ignores case, as AutoCAD does', () => {
  const gaps = collectStandardsGaps(
    { lan_can: 'kc-lancan' },
    { knownRoles: ['lan_can'], knownLayers: ['KC-LANCAN'] }
  )
  assert.deepEqual(gaps.missingLayers, [])
})

test('the library holds 50 templates and still lists them', () => {
  // The AC asks for proof at that scale rather than an assurance.
  const db = freshDb()
  for (let i = 1; i <= 50; i++) {
    uploadTemplate(
      db,
      1,
      {
        meta: { id: `mau_${String(i).padStart(2, '0')}`, version: '1.0.0', name: `Mẫu ${i}` },
        params: [],
        roleLayers: { lan_can: 'KC-LANCAN' },
        code: `export default { n: ${i} }`
      },
      standardsOf(db)
    )
    publishTemplate(db, 1, `mau_${String(i).padStart(2, '0')}`, '1.0.0')
  }

  const listed = listTemplates(db, 2, { includeDrafts: false })
  assert.equal(listed.length, 50)
  // The listing must not carry the code: 50 modules would be megabytes on a
  // request whose job is to fill a picker.
  assert.ok(listed.every(t => !('code' in t)))
  // Fetching one by id still works at that size.
  assert.equal(getTemplate(db, 'mau_25', '1.0.0').code, 'export default { n: 25 }')
})

test('deleting reports whether anything was deleted', () => {
  const db = freshDb()
  upload(db)
  assert.equal(deleteTemplate(db, 'cau_dam_i', '1.0.0'), true)
  assert.equal(deleteTemplate(db, 'cau_dam_i', '1.0.0'), false)
})
