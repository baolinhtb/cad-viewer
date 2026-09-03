import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'

import { migrate } from './schema.mjs'
import {
  deleteSkill,
  ERRORS,
  getSkill,
  hashFiles,
  listSkills,
  MAX_DESCRIPTION_CHARS,
  MAX_SKILL_BYTES,
  MAX_SKILL_FILES,
  parseSkillMarkdown,
  publishSkill,
  skillFile,
  STATUS,
  uploadSkill
} from './skills.mjs'

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

const MAIN = [
  '---',
  'name: mo-cau',
  'description: Sinh và sửa bản vẽ mố cầu theo tham số. Kích hoạt với — mố cầu, bệ mố, tường thân.',
  '---',
  '# Sinh & sửa bản vẽ mố cầu',
  '',
  'Đọc `references/tham-so.md` trước.'
].join('\n')

function upload(db, overrides = {}) {
  return uploadSkill(db, overrides.userId ?? 1, {
    files: overrides.files ?? [
      { path: 'references/tham-so.md', content: '# Tham số\nB_MO = 7700' },
      { path: 'SKILL.md', content: overrides.main ?? MAIN }
    ]
  })
}

function codeOf(fn) {
  try {
    fn()
    return undefined
  } catch (error) {
    return error.code
  }
}

function reasonOf(fn) {
  try {
    fn()
    return undefined
  } catch (error) {
    return error.detail?.reason ?? error.detail?.field
  }
}

// --- Frontmatter ---

test('frontmatter yields name, description and the body after it', () => {
  const { meta, body } = parseSkillMarkdown(MAIN)
  assert.equal(meta.name, 'mo-cau')
  assert.match(meta.description, /^Sinh và sửa/)
  assert.match(body, /^# Sinh & sửa/)
})

test('quoted values lose their quotes; CRLF and a BOM are tolerated', () => {
  const text =
    '﻿---\r\nname: "cau-ban"\r\ndescription: \'Cầu bản.\'\r\n---\r\nThân.'
  const { meta, body } = parseSkillMarkdown(text)
  assert.equal(meta.name, 'cau-ban')
  assert.equal(meta.description, 'Cầu bản.')
  assert.equal(body, 'Thân.')
})

test('a description wrapped onto indented lines is folded into one, as YAML would', () => {
  const wrapped = [
    '---',
    'name: mo-cau',
    'description: Sinh bản vẽ mố cầu.',
    '  Kích hoạt với — mố cầu, bệ mố,',
    '  tường thân.',
    'version: 2',
    '---',
    'Thân.'
  ].join('\n')
  const { meta } = parseSkillMarkdown(wrapped)
  assert.equal(
    meta.description,
    'Sinh bản vẽ mố cầu. Kích hoạt với — mố cầu, bệ mố, tường thân.'
  )
  // The next key is not swallowed into the continuation.
  assert.equal(meta.version, '2')
})

test('a SKILL.md without frontmatter, or with a block-scalar description, is refused with a reason', () => {
  assert.equal(
    codeOf(() => parseSkillMarkdown('# Chỉ có tiêu đề')),
    ERRORS.INVALID
  )
  // `description: >` would otherwise be read as the one-character string ">".
  const block = '---\nname: x\ndescription: >\n  nhiều dòng\n---\nThân.'
  assert.match(
    reasonOf(() => parseSkillMarkdown(block)),
    /một dòng/
  )
})

// --- Upload ---

test('an upload is keyed by the frontmatter name, titled by the first heading, and starts as a draft', () => {
  const db = freshDb()
  const { skill, changed } = upload(db)
  assert.equal(changed, true)
  assert.equal(skill.skillId, 'mo-cau')
  assert.equal(skill.title, 'Sinh & sửa bản vẽ mố cầu')
  assert.equal(skill.status, STATUS.DRAFT)
  assert.equal(skill.uploadedBy, 1)
  assert.equal(skill.verifiedAt, null)
  // SKILL.md first, references after, whatever order they were sent in.
  assert.deepEqual(skill.paths, ['SKILL.md', 'references/tham-so.md'])
  assert.equal(
    skillFile(skill, 'references/tham-so.md').content,
    '# Tham số\nB_MO = 7700'
  )
  assert.equal(skillFile(skill, 'references/khong-co.md'), undefined)
})

test('the title falls back to the id when the body has no heading', () => {
  const db = freshDb()
  const { skill } = upload(db, {
    main: '---\nname: tru-cau\ndescription: Trụ cầu.\n---\nKhông có tiêu đề.'
  })
  assert.equal(skill.title, 'tru-cau')
})

test('newlines inside the description are flattened, because the block is one line per guide', () => {
  const db = freshDb()
  const { skill } = upload(db, {
    main: '---\nname: a\ndescription: "Dòng một   \n dòng hai"\n---\nThân.'
  })
  assert.equal(skill.description, 'Dòng một dòng hai')
})

test('what is refused: no files, no SKILL.md, a bad name, no description, an empty body', () => {
  const db = freshDb()
  assert.equal(
    codeOf(() => uploadSkill(db, 1, {})),
    ERRORS.INVALID
  )
  assert.equal(
    codeOf(() => uploadSkill(db, 1, { files: [] })),
    ERRORS.INVALID
  )
  assert.match(
    reasonOf(() =>
      upload(db, { files: [{ path: 'references/a.md', content: 'x' }] })
    ),
    /Thiếu SKILL\.md/
  )
  assert.match(
    reasonOf(() =>
      upload(db, { main: '---\nname: Mố Cầu\ndescription: x\n---\nThân.' })
    ),
    /slug/
  )
  assert.match(
    reasonOf(() => upload(db, { main: '---\nname: mo-cau\n---\nThân.' })),
    /description/
  )
  assert.match(
    reasonOf(() =>
      upload(db, { main: '---\nname: mo-cau\ndescription: x\n---\n\n' })
    ),
    /không có nội dung/
  )
})

test('only SKILL.md and references/<name>.md are accepted as paths', () => {
  const db = freshDb()
  const files = path => [
    { path: 'SKILL.md', content: MAIN },
    { path, content: 'x' }
  ]
  for (const bad of [
    '../SKILL.md',
    'references/../x.md',
    'refs/x.md',
    'references/sub/x.md',
    'references/x.js',
    'references/.hidden.md',
    'skill.md',
    ''
  ]) {
    assert.equal(
      codeOf(() => upload(db, { files: files(bad) })),
      ERRORS.INVALID,
      bad
    )
  }
  // Case-insensitive duplicates would be two rows for one file on Windows.
  assert.match(
    reasonOf(() =>
      upload(db, {
        files: [
          { path: 'SKILL.md', content: MAIN },
          { path: 'references/A.md', content: 'x' },
          { path: 'references/a.md', content: 'y' }
        ]
      })
    ),
    /lặp/
  )
})

test('limits: file count, total bytes, description length', () => {
  const db = freshDb()
  const many = [{ path: 'SKILL.md', content: MAIN }]
  for (let i = 0; i < MAX_SKILL_FILES; i++) {
    many.push({ path: `references/f${i}.md`, content: 'x' })
  }
  assert.equal(
    codeOf(() => upload(db, { files: many })),
    ERRORS.INVALID
  )

  const big = [
    { path: 'SKILL.md', content: MAIN },
    { path: 'references/big.md', content: 'x'.repeat(MAX_SKILL_BYTES) }
  ]
  assert.equal(
    codeOf(() => upload(db, { files: big })),
    ERRORS.TOO_LARGE
  )

  const long = `---\nname: a\ndescription: ${'d'.repeat(MAX_DESCRIPTION_CHARS + 1)}\n---\nThân.`
  assert.equal(
    codeOf(() => upload(db, { main: long })),
    ERRORS.INVALID
  )
})

test('re-uploading identical content changes nothing, not even a published status', () => {
  const db = freshDb()
  upload(db)
  publishSkill(db, 1, 'mo-cau')
  const { skill, changed } = upload(db)
  assert.equal(changed, false)
  assert.equal(skill.status, STATUS.PUBLISHED)
})

test('re-uploading changed content replaces the guide and sends it back to draft', () => {
  const db = freshDb()
  const first = upload(db).skill
  publishSkill(db, 1, 'mo-cau')

  const { skill, changed } = upload(db, {
    files: [{ path: 'SKILL.md', content: MAIN + '\n\nThêm một đoạn.' }]
  })
  assert.equal(changed, true)
  assert.notEqual(skill.contentHash, first.contentHash)
  assert.equal(skill.status, STATUS.DRAFT)
  assert.equal(skill.verifiedAt, null)
  // The reference that was not re-sent is gone: a guide is uploaded whole.
  assert.deepEqual(skill.paths, ['SKILL.md'])
})

test('a guide belongs to whoever uploaded it', () => {
  const db = freshDb()
  upload(db)
  assert.equal(
    codeOf(() => upload(db, { userId: 2 })),
    ERRORS.FORBIDDEN
  )
  assert.equal(
    codeOf(() => publishSkill(db, 2, 'mo-cau')),
    ERRORS.FORBIDDEN
  )
  assert.equal(
    codeOf(() => publishSkill(db, 1, 'khong-co')),
    ERRORS.NOT_FOUND
  )
})

test('the hash covers every file and its path, in any order', () => {
  const a = [
    { path: 'SKILL.md', content: 'x' },
    { path: 'references/r.md', content: 'y' }
  ]
  const b = [...a].reverse()
  assert.equal(hashFiles(a), hashFiles(b))
  assert.notEqual(hashFiles(a), hashFiles([{ path: 'SKILL.md', content: 'x' }]))
  assert.notEqual(
    hashFiles(a),
    hashFiles([
      { path: 'SKILL.md', content: 'x' },
      { path: 'references/s.md', content: 'y' }
    ])
  )
})

// --- Listing and publishing ---

test('drafts are listed for their author only; published guides for everyone', () => {
  const db = freshDb()
  upload(db)
  upload(db, {
    userId: 2,
    main: '---\nname: tru-cau\ndescription: Trụ cầu.\n---\nThân.'
  })
  publishSkill(db, 2, 'tru-cau')

  assert.deepEqual(
    listSkills(db, 1).map(s => s.skillId),
    ['mo-cau', 'tru-cau']
  )
  assert.deepEqual(
    listSkills(db, 2).map(s => s.skillId),
    ['tru-cau']
  )
  assert.deepEqual(
    listSkills(db, 99).map(s => s.skillId),
    ['tru-cau']
  )
  assert.deepEqual(
    listSkills(db, 1, { includeDrafts: false }).map(s => s.skillId),
    ['tru-cau']
  )
  // A listing carries paths, never contents.
  assert.equal('files' in listSkills(db, 1)[0], false)
})

test('publishing records when, and getSkill returns the files', () => {
  const db = freshDb()
  upload(db)
  const published = publishSkill(db, 1, 'mo-cau')
  assert.equal(published.status, STATUS.PUBLISHED)
  assert.ok(published.verifiedAt)
  assert.equal(getSkill(db, 'mo-cau').files.length, 2)
  assert.equal(getSkill(db, 'khong-co'), undefined)
})

test('deleting reports whether there was anything to delete', () => {
  const db = freshDb()
  upload(db)
  assert.equal(deleteSkill(db, 'mo-cau'), true)
  assert.equal(deleteSkill(db, 'mo-cau'), false)
  assert.equal(getSkill(db, 'mo-cau'), undefined)
})
