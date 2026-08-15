import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'

import {
  createDrawing,
  deleteDrawing,
  ERRORS,
  getDrawing,
  listDrawings,
  updateDrawing
} from './drawings.mjs'
import { migrate, SCHEMA_VERSION } from './schema.mjs'

function freshDb() {
  const db = new DatabaseSync(':memory:')
  migrate(db)
  db.prepare(
    `INSERT INTO users (id, email, name, pass_hash, salt, status)
     VALUES (1, 'a@x.vn', 'A', 'h', 's', 'active'), (2, 'b@x.vn', 'B', 'h', 's', 'active')`
  ).run()
  return db
}

test('migrate brings a blank database to the current version', () => {
  const db = new DatabaseSync(':memory:')
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 0)

  migrate(db)

  assert.equal(
    db.prepare('PRAGMA user_version').get().user_version,
    SCHEMA_VERSION
  )
})

test('migrate is idempotent and keeps existing rows', () => {
  const db = freshDb()
  createDrawing(db, 1, { name: 'Cầu A', dxf: '0\nSECTION\n' })

  migrate(db)
  migrate(db)

  assert.equal(listDrawings(db, 1).length, 1)
  assert.equal(
    db.prepare('PRAGMA user_version').get().user_version,
    SCHEMA_VERSION
  )
})

test('a saved drawing comes back with its recipe and its bytes', () => {
  const db = freshDb()
  const dxf = '0\nSECTION\n2\nENTITIES\n'

  const { id } = createDrawing(db, 1, {
    name: 'Cầu Sông Lô',
    templateId: 'cau_ban_btct',
    templateVersion: '1.0.0',
    params: { B: 9, h: 60 },
    dxf
  })

  const row = getDrawing(db, 1, id)
  assert.equal(row.name, 'Cầu Sông Lô')
  assert.equal(row.template_id, 'cau_ban_btct')
  assert.equal(row.template_version, '1.0.0')
  assert.deepEqual(JSON.parse(row.params), { B: 9, h: 60 })
  assert.equal(Buffer.from(row.dxf).toString('utf8'), dxf)
  assert.equal(row.revision, 1)
})

test('one user cannot read or delete another user’s drawing', () => {
  const db = freshDb()
  const { id } = createDrawing(db, 1, { name: 'Của A', dxf: 'x' })

  assert.equal(getDrawing(db, 2, id), undefined)
  assert.equal(deleteDrawing(db, 2, id), false)
  assert.equal(listDrawings(db, 2).length, 0)
  // …and A still has it.
  assert.equal(listDrawings(db, 1).length, 1)
})

test('a stale revision is refused instead of overwriting', () => {
  const db = freshDb()
  const { id } = createDrawing(db, 1, { name: 'Cầu A', dxf: 'v1' })

  // Two tabs both loaded revision 1. The first save wins.
  const first = updateDrawing(db, 1, id, { revision: 1, dxf: 'v2' })
  assert.equal(first.revision, 2)

  const second = updateDrawing(db, 1, id, { revision: 1, dxf: 'v3-mat-viec' })
  assert.equal(second.error, ERRORS.CONFLICT)
  assert.equal(second.currentRevision, 2)

  // The losing write left no trace.
  assert.equal(
    Buffer.from(getDrawing(db, 1, id).dxf).toString('utf8'),
    'v2'
  )
})

test('an update without new bytes keeps the drawing it had', () => {
  const db = freshDb()
  const { id } = createDrawing(db, 1, { name: 'Cầu A', dxf: 'giu-nguyen' })

  updateDrawing(db, 1, id, { revision: 1, name: 'Cầu A (đổi tên)' })

  const row = getDrawing(db, 1, id)
  assert.equal(row.name, 'Cầu A (đổi tên)')
  assert.equal(Buffer.from(row.dxf).toString('utf8'), 'giu-nguyen')
})

test('updating someone else’s drawing reports not-found, not a conflict', () => {
  const db = freshDb()
  const { id } = createDrawing(db, 1, { name: 'Của A', dxf: 'x' })

  const result = updateDrawing(db, 2, id, { revision: 1, dxf: 'y' })

  assert.equal(result.error, ERRORS.NOT_FOUND)
})

test('search matches name and template, within the owner’s drawings only', () => {
  const db = freshDb()
  createDrawing(db, 1, { name: 'Cầu Sông Lô', templateId: 'cau_ban_btct', dxf: 'x' })
  createDrawing(db, 1, { name: 'Cống hộp K12', templateId: 'cong_hop', dxf: 'x' })
  createDrawing(db, 2, { name: 'Cầu của B', templateId: 'cau_ban_btct', dxf: 'x' })

  assert.equal(listDrawings(db, 1, { search: 'sông' }).length, 1)
  assert.equal(listDrawings(db, 1, { search: 'cau_ban' }).length, 1)
  assert.equal(listDrawings(db, 1, { search: 'c' }).length, 2)
})

test('drawings from one batch stay grouped', () => {
  const db = freshDb()
  const batchId = 'batch-01'
  createDrawing(db, 1, { name: 'PA1', batchId, dxf: 'x' })
  createDrawing(db, 1, { name: 'PA2', batchId, dxf: 'x' })
  createDrawing(db, 1, { name: 'Riêng lẻ', dxf: 'x' })

  const rows = listDrawings(db, 1).filter(r => r.batch_id === batchId)
  assert.equal(rows.length, 2)
})

test('binary payloads survive base64 transport', () => {
  const db = freshDb()
  const bytes = Buffer.from([0x00, 0x01, 0xff, 0xfe])

  const { id } = createDrawing(db, 1, {
    name: 'Nhị phân',
    dxf: { base64: bytes.toString('base64') }
  })

  assert.deepEqual(Buffer.from(getDrawing(db, 1, id).dxf), bytes)
})
