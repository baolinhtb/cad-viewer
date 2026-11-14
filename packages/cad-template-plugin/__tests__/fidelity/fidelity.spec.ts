/**
 * Fidelity of the abutment dossier to `assets/02. BTC- mo_2.dwg` — the part
 * of the harness that runs in CI (no browser): entity histogram, texts and
 * dimensions per sheet, against the committed reference inventory.
 *
 * With `FIDELITY_OUT=<dir>` it also writes what the pixel part needs:
 * the generated DXF, its inventory, these scores and the render windows.
 * The full harness: `node tools/fidelity/run.mjs` (see tools/fidelity/README.md).
 */
jest.mock('../../../cad-simple-viewer/src/editor/global/eventBus', () => ({
  eventBus: { emit: jest.fn() }
}))
jest.mock('@mlightcad/cad-simple-viewer', () => ({
  AcApDocManager: { instance: { regen: jest.fn() } },
  ...jest.requireActual('../../../cad-simple-viewer/src/util/AcApDatabaseEdit')
}))

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  acTpDxfOut,
  createDrawContext,
  SEED_ROLE_LAYERS
} from '@mlightcad/cad-template-sdk'
import { AcDbDatabase } from '@mlightcad/data-model'

import {
  buildDossierModel,
  DOSSIER_ID,
  DOSSIER_NEXT_VERSION,
  dossierDefaults
} from '../../src/dossier/model'
import { buildDossierScene, drawDossierScene } from '../../src/dossier/scene'
import {
  generatedInventory,
  Inventory,
  InventoryScore,
  scoreDims,
  scoreHistogram,
  scoreInventory,
  scoreTexts
} from '../helpers/fidelityInventory'

const ORIGINAL: Inventory = JSON.parse(
  readFileSync(join(__dirname, 'mo2-inventory.json'), 'utf8')
)
const BASELINE_PATH = join(__dirname, 'fidelity-baseline.json')
/** Generator version being scored: the one being built. */
const VERSION = DOSSIER_NEXT_VERSION

/**
 * Original sheet of each generated one. From 0.3.0 the sheets carry the
 * source numbers; before, they had their own (kept for scoring old runs).
 */
const LEGACY_SHEET_OF: Record<string, string> = {
  BC01: 'SUB-010',
  BC02: 'SUB-020',
  CT01: 'SUB-070',
  CT02: 'SUB-080',
  CT03: 'SUB-090',
  KL01: 'SUB-100'
}
const SHEET_OF = (id: string) => LEGACY_SHEET_OF[id] ?? id

/**
 * Roles of the SDK's A3 border and title block. The source's own frame is
 * the external reference `FR A3`, missing from the file, so the reference
 * sheets have no frame at all. Scoring is done on what both drawings have:
 * the generated frame is left out of the scored drawing (inventory and
 * pixels), not out of the dossier. The three source title texts are kept.
 */
const FRAME_ROLES = new Set(['khung_ban_ve', 'khung_ten'])

function generate() {
  const values = dossierDefaults()
  const built = buildDossierScene(buildDossierModel(values), VERSION)
  const scene = {
    ...built,
    sheets: built.sheets.map(s => ({
      ...s,
      primitives: s.primitives.filter(p => !FRAME_ROLES.has(p.role))
    }))
  }
  const db = new AcDbDatabase()
  db.createDefaultData()
  const ctx = createDrawContext(db, DOSSIER_ID, SEED_ROLE_LAYERS, {
    id: 'r1',
    version: VERSION,
    values: scene.model.values
  })
  drawDossierScene(ctx, scene)
  const placements = scene.sheets.map(s => ({
    id: s.id,
    orig: SHEET_OF(s.id),
    origin: s.origin,
    scale: s.scale,
    width: s.width,
    height: s.height
  }))
  return {
    db,
    scene,
    placements,
    inventory: generatedInventory(db, placements)
  }
}

const run = generate()
const scores = scoreInventory(ORIGINAL, run.inventory)

describe('the scorer', () => {
  test('the original scored against itself is perfect on every sheet', () => {
    for (const s of scoreInventory(ORIGINAL, ORIGINAL)) {
      expect([s.id, s.S_kiem, s.S_chu, s.S_dim]).toEqual([s.id, 1, 1, 1])
    }
  })

  test('each component drops when its own thing differs, and only then', () => {
    const o = ORIGINAL.sheets[0]
    const moved = { ...o, texts: o.texts.map(t => ({ ...t, x: t.x + 5 })) }
    expect(scoreTexts(o, moved).score).toBe(0)
    expect(scoreHistogram(o, moved)).toBe(1)
    const renamed = { ...o, dims: o.dims.map(d => ({ ...d, t: d.t + 'x' })) }
    expect(scoreDims(o, renamed).score).toBeCloseTo(0.7, 5)
    const halved = {
      ...o,
      hist: Object.fromEntries(
        Object.entries(o.hist).map(([k, n]) => [k, Math.floor(n / 2)])
      )
    }
    expect(scoreHistogram(o, halved)).toBeLessThan(0.8)
  })

  test('the reference inventory is the six sheets of mo_2 and stays small', () => {
    expect(ORIGINAL.sheets.map(s => s.id)).toEqual(
      Object.values(LEGACY_SHEET_OF)
    )
    expect(
      readFileSync(join(__dirname, 'mo2-inventory.json')).length
    ).toBeLessThan(1_000_000)
  })
})

describe(`ho_so_mo_m1 ${VERSION} against mo_2`, () => {
  test('scores do not fall below the committed baseline', () => {
    const baseline: { version: string; sheets: InventoryScore[] } = JSON.parse(
      readFileSync(BASELINE_PATH, 'utf8')
    )
    for (const s of scores) {
      const b = baseline.sheets.find(x => x.id === s.id)!
      for (const k of ['S_kiem', 'S_chu', 'S_dim'] as const)
        expect({ id: s.id, k, ok: s[k] >= b[k] - 1e-9 }).toEqual({
          id: s.id,
          k,
          ok: true
        })
    }
  })

  test('writes the pixel harness inputs when FIDELITY_OUT is set', () => {
    const out = process.env.FIDELITY_OUT
    if (!out) return
    mkdirSync(out, { recursive: true })
    const dxf = acTpDxfOut(run.db, 6)
    writeFileSync(
      join(out, 'gen.dxf'),
      typeof dxf === 'string' ? dxf : Buffer.from(dxf)
    )
    writeFileSync(
      join(out, 'gen-inventory.json'),
      JSON.stringify(run.inventory)
    )
    writeFileSync(
      join(out, 'inventory-scores.json'),
      JSON.stringify({ version: VERSION, sheets: scores }, null, 1)
    )
    writeFileSync(
      join(out, 'gen-manifest.json'),
      JSON.stringify(
        {
          version: VERSION,
          sheets: run.placements.map(p => ({
            id: p.orig,
            gen: p.id,
            // The A3-sized region from the sheet's lower-left, at the
            // sheet's scale: what an A3 sheet of this layout would show.
            window: {
              x0: p.origin[0],
              y0: p.origin[1],
              x1: p.origin[0] + 420 * p.scale,
              y1: p.origin[1] + 297 * p.scale
            },
            scale: p.scale
          }))
        },
        null,
        1
      )
    )
    if (process.env.FIDELITY_WRITE_BASELINE)
      writeFileSync(
        BASELINE_PATH,
        JSON.stringify({ version: VERSION, sheets: scores }, null, 1) + '\n'
      )
  })
})
