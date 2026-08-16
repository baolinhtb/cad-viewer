import { readFileSync } from 'fs'
import { join } from 'path'

import { SEED_ROLE_LAYERS, SEED_ROLES } from '../src/AcTpSeed'

/**
 * Keeps the SDK's compile-time seed and the server's runtime seed in step.
 *
 * The service runs on plain Node with no bundler, so it cannot import this
 * package; it carries its own copy of the same list. Two copies drift, and the
 * drift is invisible — a role the SDK knows but the dictionary does not simply
 * fails to resolve when an engineer names it, with no error anywhere.
 *
 * The server file is read as text rather than imported because importing it
 * would pull `node:sqlite` into a jsdom-less Jest run for no benefit.
 */
const schema = readFileSync(
  join(__dirname, '../../../server/auth/schema.mjs'),
  'utf8'
)

const serverSeed = new Map<string, string>()
for (const match of schema.matchAll(
  /(\w+):\s*\{\s*label:\s*'([^']+)',\s*layer:\s*'([^']+)'/g
)) {
  serverSeed.set(match[1], match[3])
}

describe('seed standards', () => {
  test('the server file was parsed at all', () => {
    // A regex that silently matches nothing would make every check below pass.
    expect(serverSeed.size).toBeGreaterThan(5)
  })

  test('every SDK role exists in the server seed', () => {
    const missing = Object.keys(SEED_ROLES).filter(
      role => !serverSeed.has(role)
    )
    expect(missing).toEqual([])
  })

  test('the server seed adds no role the SDK does not know', () => {
    const extra = [...serverSeed.keys()].filter(role => !(role in SEED_ROLES))
    expect(extra).toEqual([])
  })

  test('both agree on which layer each role is drawn on', () => {
    const disagreements = Object.entries(SEED_ROLE_LAYERS)
      .filter(([role, layer]) => serverSeed.get(role) !== layer)
      .map(
        ([role, layer]) =>
          `${role}: sdk=${layer} server=${serverSeed.get(role)}`
      )
    expect(disagreements).toEqual([])
  })
})
