import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'

import { migrate, SEED_STANDARDS } from './schema.mjs'
import {
  createLayer,
  createTerm,
  deleteTerm,
  ERRORS,
  findContradictions,
  findRolesWithoutLayer,
  getTerm,
  listLayers,
  listTerms,
  roleLayerMap,
  updateTerm
} from './standards.mjs'

function freshDb() {
  const db = new DatabaseSync(':memory:')
  migrate(db)
  db.prepare(
    `INSERT INTO users (id, email, name, pass_hash, salt) VALUES (1, 'a@b.c', 'A', 'h', 's')`
  ).run()
  return db
}

/** Captures the code a call throws with, so the assertion reads as intent. */
function codeOf(fn) {
  try {
    fn()
    return undefined
  } catch (error) {
    return error.code
  }
}

test('a fresh database starts with the seed dictionary, not empty', () => {
  // An empty dictionary matches nothing, so the assistant would answer "I do
  // not know that term" about every part the first template draws.
  const db = freshDb()
  const terms = listTerms(db)
  assert.equal(terms.length, Object.keys(SEED_STANDARDS).length)
  assert.ok(terms.some(term => term.role === 'lan_can'))
  assert.equal(listLayers(db).length, Object.keys(SEED_STANDARDS).length)
})

test('a term is searchable by its aliases, not only its canonical name', () => {
  // Someone who says "tay vịn" must find the rail even though the dictionary
  // calls it "lan can".
  const db = freshDb()
  const found = listTerms(db, { search: 'tay vịn' })
  assert.deepEqual(
    found.map(term => term.role),
    ['lan_can']
  )
})

test('search ignores case and surrounding space', () => {
  const db = freshDb()
  assert.equal(listTerms(db, { search: '  TAY VỊN ' })[0]?.role, 'lan_can')
})

test('a role key must be an ASCII slug', () => {
  const db = freshDb()
  for (const role of ['Lan Can', 'lan-can', 'lan can', 'lanCan', '']) {
    assert.equal(
      codeOf(() => createTerm(db, 1, { role, label: 'X' })),
      ERRORS.INVALID,
      `role '${role}' should be rejected`
    )
  }
})

test('a duplicate role is refused rather than overwriting', () => {
  const db = freshDb()
  assert.equal(
    codeOf(() => createTerm(db, 1, { role: 'lan_can', label: 'Lan can khác' })),
    ERRORS.DUPLICATE
  )
})

test('an alias already claimed by another term is refused, naming the clash', () => {
  // Two terms answering to one word is exactly the ambiguity the dictionary
  // exists to remove, and it must be caught on the server where the whole
  // table is visible.
  const db = freshDb()
  let error
  try {
    createTerm(db, 1, { role: 'tay_vin_moi', label: 'Tay vịn mới', aliases: ['tay vịn'] })
  } catch (e) {
    error = e
  }
  assert.equal(error?.code, ERRORS.ALIAS_CONFLICT)
  assert.deepEqual(error.detail.conflicts, [{ role: 'lan_can', aliases: ['tay vịn'] }])
})

test("a term's own label counts as an alias for conflict purposes", () => {
  const db = freshDb()
  assert.equal(
    codeOf(() =>
      createTerm(db, 1, { role: 'khac', label: 'Lan can' })
    ),
    ERRORS.ALIAS_CONFLICT
  )
})

test('a term can keep its own aliases when edited', () => {
  // Updating a term must not report it as conflicting with itself.
  const db = freshDb()
  const updated = updateTerm(db, 1, 'lan_can', {
    label: 'Lan can',
    aliases: ['tay vịn', 'lan can', 'thanh chắn']
  })
  assert.ok(updated.aliases.includes('thanh chắn'))
})

test('an edit records who made it and when', () => {
  // A standard nobody can attribute is a standard nobody will correct.
  const db = freshDb()
  const before = getTerm(db, 'lan_can')
  assert.equal(before.updatedBy, null)
  const after = updateTerm(db, 1, 'lan_can', { label: 'Lan can' })
  assert.equal(after.updatedBy, 1)
  assert.ok(after.updatedAt)
})

test('editing a term that does not exist is not found, not a silent insert', () => {
  const db = freshDb()
  assert.equal(
    codeOf(() => updateTerm(db, 1, 'khong_co', { label: 'X' })),
    ERRORS.NOT_FOUND
  )
})

test('deleting reports whether anything was deleted', () => {
  const db = freshDb()
  assert.equal(deleteTerm(db, 'lan_can'), true)
  assert.equal(deleteTerm(db, 'lan_can'), false)
})

test('layer names are unique regardless of case', () => {
  // AutoCAD treats layer names case-insensitively; two rows for KC-BAN and
  // KC-Ban would describe one layer and disagree about it.
  const db = freshDb()
  assert.equal(
    codeOf(() => createLayer(db, 1, { name: 'kc-ban', meaning: 'Bản' })),
    ERRORS.DUPLICATE
  )
})

test('a layer needs a meaning, not just a name', () => {
  const db = freshDb()
  assert.equal(
    codeOf(() => createLayer(db, 1, { name: 'KC-MOI', meaning: '  ' })),
    ERRORS.INVALID
  )
})

test('roles drawn on an unknown layer are reported for a template upload', () => {
  // Story 2.5 refuses a template that draws onto layers the catalogue does not
  // have; this is the check behind it.
  const db = freshDb()
  const gaps = findRolesWithoutLayer(db, {
    lan_can: 'KC-LANCAN',
    dam_chu: 'KC-DAMCHU'
  })
  assert.deepEqual(gaps, [{ role: 'dam_chu', layer: 'KC-DAMCHU' }])
})

test('migrating twice leaves the seed alone', () => {
  // Re-running migrations on a live database must not duplicate or reset the
  // rows the company has since edited.
  const db = freshDb()
  updateTerm(db, 1, 'lan_can', { label: 'Lan can (đã sửa)' })
  migrate(db)
  assert.equal(getTerm(db, 'lan_can').label, 'Lan can (đã sửa)')
  assert.equal(listTerms(db).length, Object.keys(SEED_STANDARDS).length)
})

test('the seed pairs every role with the layer the SDK draws it on', () => {
  // v3 created both tables and lost the relationship; v6 restored it. Without
  // it the client has no central mapping to override its built-in one.
  const db = freshDb()
  const mapping = roleLayerMap(db)
  assert.equal(mapping.lan_can, 'KC-LANCAN')
  assert.equal(mapping.ban_mat_cau, 'KC-BAN')
  assert.equal(Object.keys(mapping).length, Object.keys(SEED_STANDARDS).length)
})

test('a role with no layer is reported, not silently mapped', () => {
  // Mapping it to something plausible would put geometry on a layer nobody
  // chose.
  const db = freshDb()
  createTerm(db, 1, { role: 'dam_chu', label: 'Dầm chủ' })
  const found = findContradictions(db)
  assert.deepEqual(found.rolesWithoutLayer, [
    { role: 'dam_chu', label: 'Dầm chủ' }
  ])
  assert.equal(roleLayerMap(db).dam_chu, undefined)
})

test('a role pointing at a layer the catalogue lacks is reported', () => {
  const db = freshDb()
  createTerm(db, 1, { role: 'dam_chu', label: 'Dầm chủ', layer: 'KC-DAMCHU' })
  assert.deepEqual(findContradictions(db).rolesWithUnknownLayer, [
    { role: 'dam_chu', layer: 'KC-DAMCHU' }
  ])
})

test('adding the missing layer clears the contradiction', () => {
  const db = freshDb()
  createTerm(db, 1, { role: 'dam_chu', label: 'Dầm chủ', layer: 'KC-DAMCHU' })
  createLayer(db, 1, { name: 'KC-DAMCHU', meaning: 'Dầm chủ' })
  assert.deepEqual(findContradictions(db).rolesWithUnknownLayer, [])
})

test('a layer no term draws on is reported as unused', () => {
  const db = freshDb()
  createLayer(db, 1, { name: 'KC-THUA', meaning: 'Không ai dùng' })
  assert.deepEqual(findContradictions(db).unusedLayers, [
    { name: 'KC-THUA', meaning: 'Không ai dùng' }
  ])
})

test('the seeded standards contradict themselves in no way', () => {
  // The set the company starts from has to be clean, or the first thing a new
  // deployment shows is a list of its own problems.
  const found = findContradictions(freshDb())
  assert.deepEqual(found, {
    rolesWithoutLayer: [],
    rolesWithUnknownLayer: [],
    unusedLayers: []
  })
})

test('contradiction checks ignore layer-name case, as AutoCAD does', () => {
  const db = freshDb()
  createTerm(db, 1, { role: 'dam_chu', label: 'Dầm chủ', layer: 'kc-ban' })
  assert.deepEqual(findContradictions(db).rolesWithUnknownLayer, [])
})
