import { readFileSync } from 'fs'
import { join } from 'path'

import {
  SEED_CATALOG,
  SEED_LEGACY_LAYERS,
  SEED_ROLE_LAYERS,
  SEED_ROLES
} from '../src/AcTpSeed'

/**
 * Keeps the SDK's catalogue and the server's runtime seed in step.
 *
 * The service runs on plain Node with no bundler, so it cannot import this
 * package; it carries its own copy of the same list. Two copies drift, and the
 * drift is invisible — a role the SDK knows but the dictionary does not simply
 * fails to resolve when an engineer names it, with no error anywhere.
 *
 * The server file is read as text rather than imported because importing it
 * would pull an ES module (and `node:sqlite` users) into a CommonJS Jest run.
 * The `SEED_STANDARDS` object literal is cut out and evaluated on its own: it
 * is plain data, and evaluating it compares every field rather than whatever
 * a regex happened to capture.
 */
const schema = readFileSync(
  join(__dirname, '../../../server/auth/schema.mjs'),
  'utf8'
)

interface ServerSeed {
  label: string
  layer: string
  color: number | null
  legacy: string[]
  aliases: string[]
}

function extract(name: string): Record<string, ServerSeed> {
  const start = schema.indexOf(`export const ${name} = {`)
  if (start < 0) return {}
  const open = schema.indexOf('{', start)
  const end = schema.indexOf('\n}\n', open)
  return new Function(`return ${schema.slice(open, end + 2)}`)()
}

const serverSeed = extract('SEED_STANDARDS')

describe('seed standards', () => {
  test('the server file was parsed at all', () => {
    // An extraction that silently found nothing would make every check pass.
    expect(Object.keys(serverSeed).length).toBeGreaterThan(20)
  })

  test('the same roles, in the same order, on both sides', () => {
    expect(Object.keys(serverSeed)).toEqual(Object.keys(SEED_CATALOG))
  })

  test('label, layer, colour and old names agree for every role', () => {
    const disagreements = Object.entries(SEED_CATALOG).flatMap(
      ([role, sdk]) => {
        const server = serverSeed[role]
        if (!server) return [`${role}: thiếu ở server`]
        const sdkView = {
          label: sdk.label,
          layer: sdk.layer,
          color: sdk.color,
          legacy: [...sdk.legacy]
        }
        const serverView = {
          label: server.label,
          layer: server.layer,
          color: server.color,
          legacy: server.legacy
        }
        return JSON.stringify(sdkView) === JSON.stringify(serverView)
          ? []
          : [
              `${role}: sdk=${JSON.stringify(sdkView)} server=${JSON.stringify(serverView)}`
            ]
      }
    )
    expect(disagreements).toEqual([])
  })

  test('the derived maps follow the catalogue', () => {
    expect(Object.keys(SEED_ROLES)).toEqual(Object.keys(SEED_CATALOG))
    expect(SEED_ROLE_LAYERS.mo_tuong_than).toBe('_33_CAU_MO_Tuongthan')
    expect(SEED_LEGACY_LAYERS['KC-BAN']).toBe('ban_mat_cau')
    expect(SEED_LEGACY_LAYERS['_Matduong_BTN']).toBe('lop_phu')
  })
})

describe('one _33_ catalogue', () => {
  test('every role is drawn on a _33_ layer', () => {
    expect(
      Object.entries(SEED_ROLE_LAYERS).filter(
        ([, layer]) => !layer.startsWith('_33_')
      )
    ).toEqual([])
  })

  test('no two roles share a layer', () => {
    const seen = new Map<string, string>()
    const shared: string[] = []
    for (const [role, layer] of Object.entries(SEED_ROLE_LAYERS)) {
      const other = seen.get(layer.toLowerCase())
      if (other) shared.push(`${layer}: ${other}, ${role}`)
      seen.set(layer.toLowerCase(), role)
    }
    expect(shared).toEqual([])
  })

  test('an old name is never also a current layer, and belongs to one role', () => {
    const current = new Set(
      Object.values(SEED_ROLE_LAYERS).map(layer => layer.toLowerCase())
    )
    const all = Object.values(SEED_CATALOG).flatMap(entry => entry.legacy)
    expect(all.filter(name => current.has(name.toLowerCase()))).toEqual([])
    expect(new Set(all.map(n => n.toLowerCase())).size).toBe(all.length)
  })

  test('names follow the office convention and AutoCAD rules', () => {
    // `_33_` then either `CAU_<NHÓM>_<Tên>` or a shared `<Tên>`; no characters
    // AutoCAD refuses (the server rejects `|`, so `FR A3|Frame` is not an alias).
    const forbidden = /[<>/\\":;?*|,='`]/
    for (const [role, entry] of Object.entries(SEED_CATALOG)) {
      expect(`${role} ${entry.layer}`).toMatch(
        / _33_(CAU_(MO|TRU|NHIP|MIS)_)?[A-Z][a-z0-9]*(_[A-Za-z0-9]+)*$/
      )
      for (const name of [entry.layer, ...entry.legacy]) {
        expect(forbidden.test(name)).toBe(false)
      }
    }
  })

  test('the roles templates draw today all have a layer', () => {
    // Includes `ky_hieu_mat_cat`, which mo_mat_chinh drew on a hard-coded
    // layer because the seed had no role for it.
    for (const role of [
      'ky_hieu_mat_cat',
      'coc_khoan_nhoi',
      'lop_phu',
      'tieu_de_ban_ve'
    ]) {
      expect(SEED_ROLE_LAYERS[role]).toBeDefined()
    }
  })
})
