/**
 * The schema the model is validated against for sua_ho_so_mo — the zod object
 * of createCadTools(), not DOSSIER_TOOLS.input_schema — carries the two flags
 * the dossier tool reads (UI acceptance 0.3.1, blocked: the agent passed
 * mo_khoa_031 at the top level and the strict object answered "invalid
 * format"; inside thong_so it was refused as an unknown parameter).
 *
 * The real cad-template-plugin is used (its DOSSIER_TOOLS and runDossierTool);
 * only the viewer it would drive and the script catalogue are stood in for.
 */
jest.mock('../../cad-simple-viewer/src/editor/global/eventBus', () => ({
  eventBus: { emit: jest.fn() }
}))
jest.mock('@mlightcad/cad-simple-viewer', () => ({
  AcApDocManager: { instance: { regen: jest.fn() } },
  AcEdCommand: class {},
  ...jest.requireActual('../../cad-simple-viewer/src/util/AcApDatabaseEdit')
}))
jest.mock('@mlightcad/cad-agent-core', () => ({
  createCadToolCatalog: () => []
}))
jest.mock('../src/tools/CadActionExecutor', () => ({
  __esModule: true,
  cadActionExecutor: new Proxy({}, { get: () => () => ({}) })
}))

import { DOSSIER_TOOLS, runDossierTool } from '@mlightcad/cad-template-plugin'
import { readSemanticTag, writeSemanticTag } from '@mlightcad/cad-template-sdk'
import { AcDbDatabase, AcDbText } from '@mlightcad/data-model'
import { z } from 'zod/v4'

import { createCadTools } from '../src/tools/cadTools'

type Schema = z.ZodType
const suaHoSoMo = () => createCadTools().sua_ho_so_mo
const exported = () => suaHoSoMo().inputSchema as unknown as Schema
/** What sua_ho_so_mo accepted before (deploy 0.3.1): strict, no flags. */
const before = z
  .object({
    ma_lan_chay: z.string().min(1),
    thong_so: z.record(
      z.string(),
      z.union([z.number(), z.string(), z.boolean()])
    ),
    xac_nhan_bo_doi_tuong: z.boolean().optional()
  })
  .strict()

const call = { ma_lan_chay: 'r1', thong_so: { hThan: 5017 } }

describe('sua_ho_so_mo: the schema the model sees', () => {
  test('both flags are top-level optional booleans, described as the tool reads them', () => {
    const json = z.toJSONSchema(exported()) as {
      type: string
      properties: Record<
        string,
        { type?: string; description?: string; additionalProperties?: unknown }
      >
      required?: string[]
      additionalProperties?: unknown
    }
    expect(json.additionalProperties).toBe(false)
    const tool = DOSSIER_TOOLS.find(t => t.name === 'sua_ho_so_mo')!
      .input_schema as {
      properties: Record<string, { description: string }>
    }
    for (const flag of ['mo_khoa_031', 'dua_ve_so_bo_sinh']) {
      expect(json.properties[flag]?.type).toBe('boolean')
      expect(json.required ?? []).not.toContain(flag)
      expect(json.properties[flag].description).toBe(
        tool.properties[flag].description
      )
    }
    expect(json.required).toEqual(['ma_lan_chay', 'thong_so'])
    // Same top-level fields as the dossier tool's own schema.
    expect(Object.keys(json.properties).sort()).toEqual(
      Object.keys(tool.properties).sort()
    )
  })

  test.each([
    { mo_khoa_031: true },
    { dua_ve_so_bo_sinh: true },
    { mo_khoa_031: true, dua_ve_so_bo_sinh: true },
    { dua_ve_so_bo_sinh: false, xac_nhan_bo_doi_tuong: true }
  ])('a call with %j is accepted', flags => {
    const parsed = exported().safeParse({ ...call, ...flags })
    expect(parsed.success).toBe(true)
    expect(parsed.data).toMatchObject(flags)
  })

  test('the live failure: the old strict object refused the same call', () => {
    for (const flags of [{ mo_khoa_031: true }, { dua_ve_so_bo_sinh: true }]) {
      const old = before.safeParse({ ...call, ...flags })
      expect(old.success).toBe(false)
      expect(JSON.stringify(old.error?.issues)).toContain('unrecognized_keys')
    }
  })

  test('a flag inside thong_so stays a parameter, not the flag', () => {
    const parsed = exported().safeParse({
      ma_lan_chay: 'r1',
      thong_so: { hThan: 5017, mo_khoa_031: true }
    })
    expect(parsed.success).toBe(true)
    const data = parsed.data as Record<string, unknown>
    expect(data.mo_khoa_031).toBeUndefined()
    expect((data.thong_so as Record<string, unknown>).mo_khoa_031).toBe(true)
    // Other unknown top-level keys are still refused.
    expect(exported().safeParse({ ...call, moKhoa031: true }).success).toBe(
      false
    )
  })
})

describe('sua_ho_so_mo end to end, through the tool the model calls', () => {
  /** A 0.3.0 dossier the generator has moved on from (one cell grey). */
  async function oldDossier() {
    const db = new AcDbDatabase()
    db.createDefaultData()
    const made = await runDossierTool(
      'tao_ho_so_mo',
      {
        thong_so: {
          tenMo: 'QA-030-CU',
          bMatDuong: 8000,
          tThan: 1200,
          lCanh: 4000,
          D: 1000,
          lCoc: 25000
        }
      },
      db
    )
    expect(made.ok).toBe(true)
    for (const e of db.tables.blockTable.modelSpace.newIterator()) {
      const tag = readSemanticTag(e)
      if (tag?.run)
        writeSemanticTag(e, { ...tag, run: { ...tag.run, version: '0.3.0' } })
      if (
        e instanceof AcDbText &&
        tag?.params?.sheet === 'SUB-020' &&
        e.textString === '228.837'
      )
        e.color.colorIndex = 8
    }
    return db
  }

  test('mo_khoa_031 reaches runDossierTool: refused without, unlocked with', async () => {
    const db = await oldDossier()
    const manager = jest.requireMock('@mlightcad/cad-simple-viewer')
      .AcApDocManager.instance
    manager.curDocument = { database: db }
    manager.regen.mockResolvedValue(undefined)
    manager.curView = {
      waitUntilIdle: jest.fn(async () => true),
      getDrawingExtents: jest.fn(() => undefined),
      zoomTo: jest.fn()
    }
    const tool = suaHoSoMo()
    const run = async (input: Record<string, unknown>) =>
      (await tool.execute!(exported().parse(input) as never, {
        toolCallId: 't',
        messages: []
      })) as { ok: boolean; message: string }
    const refused = await run({ ...call, thong_so: { hThan: 5017 } })
    expect(refused.ok).toBe(false)
    expect(refused.message).toContain('mo_khoa_031: true')
    const unlocked = await run({
      ...call,
      thong_so: { hThan: 5017 },
      mo_khoa_031: true
    })
    expect(unlocked.ok).toBe(true)
    const tag = [...db.tables.blockTable.modelSpace.newIterator()]
      .map(e => readSemanticTag(e))
      .find(t => t?.run)!
    expect(tag.run!.version).toBe('0.3.1')
    expect(tag.run!.values.hThan).toBe(5017)
  })
})
