/**
 * The repository's library templates and guides, taken through the server
 * exactly the way an author uploads them — `POST /api/templates` and
 * `POST /api/skills` reach `uploadTemplate` / `uploadSkill`.
 *
 * Nothing is uploaded to a real server: this runs on an in-memory database
 * migrated to the current schema (v10 catalogue). What it proves is that each
 * file in `packages/cad-template-plugin/library/` and `assets/skills/` is
 * accepted, draws only on roles and layers the catalogue knows, publishes,
 * and then reaches the assistant's standards block — the same road the
 * abutment templates travel.
 */
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'

import { buildStandardsBlock } from './ai.mjs'
import { migrate } from './schema.mjs'
import { publishSkill, uploadSkill } from './skills.mjs'
import { listLayers, listTerms, roleLayerMap } from './standards.mjs'
import { listTemplates, publishTemplate, uploadTemplate } from './templates.mjs'

const ROOT = join(import.meta.dirname, '..', '..')
const LIBRARY = join(ROOT, 'packages', 'cad-template-plugin', 'library')
const SKILLS = join(ROOT, 'assets', 'skills')

function freshDb() {
  const db = new DatabaseSync(':memory:')
  migrate(db)
  db.prepare(
    `INSERT INTO users (id, email, name, pass_hash, salt, role)
     VALUES (1, 'tg@vp', 'Tác giả', 'h', 's', 'author')`
  ).run()
  return db
}

/** Evaluates an uploadable module the way the browser does: SDK on globalThis. */
function evaluate(code) {
  globalThis.__CAD_TEMPLATE_SDK__ = {
    formatPartId: ({ role, side, ordinal }) =>
      [role, side, ordinal && String(ordinal).padStart(2, '0')]
        .filter(Boolean)
        .join('_')
  }
  return new Function(code.replace(/^\s*export default /m, 'return '))()
}

/**
 * The trial run `uploadTemplateModule` performs before uploading: draw with
 * defaults and collect role → layer from what was drawn. Roles come from the
 * template; layers from the catalogue (or the explicit layer it named).
 */
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

const libraryFiles = readdirSync(LIBRARY).filter(f => f.endsWith('.js'))

test('the library holds the abutment and the pier templates', () => {
  for (const f of ['mo_be_mong.js', 'tru_mat_chinh.js', 'tru_mat_ben.js'])
    assert.ok(libraryFiles.includes(f), f)
})

for (const file of libraryFiles) {
  test(`${file}: uploads, knows every role and layer, publishes`, () => {
    const db = freshDb()
    const code = readFileSync(join(LIBRARY, file), 'utf8')
    const template = evaluate(code)
    const catalogue = roleLayerMap(db)
    const roleLayers = trialRoleLayers(template, catalogue)
    // Piers: the column stem too, so both variants are known to the catalogue.
    if (template.params.some(p => p.key === 'loaiThan'))
      Object.assign(
        roleLayers,
        trialRoleLayers(template, catalogue, { loaiThan: 'cot' })
      )

    const { warnings } = uploadTemplate(
      db,
      1,
      { meta: template.meta, params: template.params, roleLayers, code },
      {
        knownRoles: listTerms(db).map(t => t.role),
        knownLayers: listLayers(db).map(l => l.name)
      }
    )
    assert.deepEqual(warnings, { missingRoles: [], missingLayers: [] })
    for (const layer of Object.values(roleLayers))
      assert.ok(
        layer.startsWith('_33_'),
        `${file} vẽ lên ${layer}, không phải _33_`
      )

    publishTemplate(db, 1, template.meta.id, template.meta.version)
    const published = listTemplates(db, null, { includeDrafts: false })
    assert.deepEqual(
      published.map(t => `${t.templateId}@${t.version}`),
      [`${template.meta.id}@${template.meta.version}`]
    )
    assert.match(
      buildStandardsBlock(db).text,
      new RegExp(
        `- ${template.meta.id} v${template.meta.version.replace(/\./g, '\\.')}: `
      )
    )
  })
}

for (const dir of readdirSync(SKILLS, { withFileTypes: true }).filter(d =>
  d.isDirectory()
)) {
  test(`skill ${dir.name}: uploads under its folder name, publishes, reaches the assistant`, () => {
    const db = freshDb()
    const root = join(SKILLS, dir.name)
    const files = [
      {
        path: 'SKILL.md',
        content: readFileSync(join(root, 'SKILL.md'), 'utf8')
      },
      ...readdirSync(join(root, 'references')).map(f => ({
        path: `references/${f}`,
        content: readFileSync(join(root, 'references', f), 'utf8')
      }))
    ]
    const { skill } = uploadSkill(db, 1, { files })
    assert.equal(skill.skillId, dir.name)
    publishSkill(db, 1, dir.name)
    assert.match(buildStandardsBlock(db).text, new RegExp(`\\n- ${dir.name}: `))
  })
}
