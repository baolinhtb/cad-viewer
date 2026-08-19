/**
 * A drawing has to say which call made each part, not just what the part is.
 *
 * `params` records what a part *is* — a 1500 mm footing. That is not enough to
 * edit it: changing the footing thickness is a change to the call that drew the
 * footing, the walls stacked on it and the six dimensions measuring them. And
 * two runs of the same template produce identical `partId`s — the abutment on
 * the left and the one on the right — so without a run id there is nothing to
 * tell an edit which one was meant.
 */
jest.mock('@mlightcad/cad-simple-viewer', () => ({
  AcApDocManager: { instance: { regen: jest.fn() } },
  acapRunGroupedEdit: async (
    _db: unknown,
    _label: string,
    fn: () => void | Promise<void>
  ) => {
    await fn()
  }
}))

import {
  AcDbDatabase,
  AcDbLine,
  AcDbOpenMode
} from '@mlightcad/data-model'
import {
  createDrawContext,
  readSemanticTag,
  SEED_ROLE_LAYERS,
  writeSemanticTag
} from '@mlightcad/cad-template-sdk'

import { entitiesOfRun, listRuns, nextRunId } from '../src/runIdentity'
import { runTemplate } from '../src/runTemplate'
import { listTemplates } from '../src/templateRegistry'

function newDatabase() {
  const db = new AcDbDatabase()
  db.createDefaultData()
  return db
}

/** `dxfOut` is typed as string | Uint8Array; ASCII DXF is the string form. */
function dxfText(db: AcDbDatabase): string {
  const out = db.dxfOut(undefined, 6) as unknown
  return typeof out === 'string'
    ? out
    : new TextDecoder().decode(out as Uint8Array)
}

async function roundTrip(db: AcDbDatabase): Promise<AcDbDatabase> {
  const bytes = new TextEncoder().encode(dxfText(db))
  const reopened = new AcDbDatabase()
  await reopened.read(bytes.buffer as ArrayBuffer, {
    readOnly: false
  } as never)
  return reopened
}

const template = () => listTemplates().find(t => t.meta.id === 'cau_ban_btct')!

describe('nextRunId', () => {
  test('starts at r1 on an empty drawing', () => {
    expect(nextRunId(newDatabase())).toBe('r1')
  })

  test('continues past what the drawing already holds', () => {
    // Scanned from the drawing rather than counted in memory, so reopening a
    // file does not restart at r1 and collide with the ids already in it.
    const db = newDatabase()
    const line = new AcDbLine({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 })
    line.layer = '0'
    db.tables.blockTable.modelSpace.appendEntity(line)
    writeSemanticTag(line, {
      role: 'ban_mat_cau',
      partId: 'ban_mat_cau',
      templateId: 'x',
      run: { id: 'r7', version: '1.0.0', values: {} }
    })
    expect(nextRunId(db)).toBe('r8')
  })
})

describe('running a template', () => {
  test('stamps the run on every entity it draws', async () => {
    const db = newDatabase()
    const result = await runTemplate(template(), { B: 9, h: 60 }, db)

    expect(result.errors).toEqual([])
    expect(result.runId).toBe('r1')

    let tagged = 0
    for (const entity of db.tables.blockTable.modelSpace.newIterator()) {
      const run = readSemanticTag(entity)?.run
      expect(run?.id).toBe('r1')
      // The version travels so a later rebuild can refuse to guess.
      expect(run?.version).toBe(template().meta.version)
      tagged += 1
    }
    expect(tagged).toBe(result.entityCount)
  })

  test('records the arguments the call was made with', async () => {
    const db = newDatabase()
    await runTemplate(template(), { B: 9, h: 60 }, db)
    const runs = listRuns(db)

    expect(runs).toHaveLength(1)
    expect(runs[0].values.B).toBe(9)
    expect(runs[0].values.h).toBe(60)
    expect(runs[0].templateId).toBe('cau_ban_btct')
  })

  test('two runs of one template stay separable', async () => {
    // The case a partId cannot answer: same template, same part names.
    const db = newDatabase()
    await runTemplate(template(), { B: 9 }, db)
    await runTemplate(template(), { B: 12 }, db)

    const runs = listRuns(db)
    expect(runs.map(r => r.id)).toEqual(['r1', 'r2'])
    expect(runs[0].values.B).toBe(9)
    expect(runs[1].values.B).toBe(12)

    expect(entitiesOfRun(db, 'r1').length).toBe(runs[0].entityCount)
    expect(entitiesOfRun(db, 'r2').length).toBe(runs[1].entityCount)
    expect(entitiesOfRun(db, 'r3')).toEqual([])
  })

  test('survives a save and reopen', async () => {
    // The whole design rests on this: a record that does not come back is a
    // record that may as well not exist.
    const db = newDatabase()
    await runTemplate(template(), { B: 9, h: 60 }, db)
    const before = listRuns(db)

    const after = listRuns(await roundTrip(db))
    expect(after).toEqual(before)
  }, 60_000)
})

describe('drawings made before this existed', () => {
  test('a tag with no run reads as having none, not as broken', () => {
    // Every drawing tagged from layer names is like this, and so is every
    // drawing made before the field was added.
    const db = newDatabase()
    const line = new AcDbLine({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 })
    line.layer = '0'
    db.tables.blockTable.modelSpace.appendEntity(line)
    writeSemanticTag(line, {
      role: 'lan_can',
      partId: 'lan_can_trai',
      templateId: 'gan-nhan-tu-layer'
    })

    const tag = readSemanticTag(line)
    expect(tag?.role).toBe('lan_can')
    expect(tag?.run).toBeUndefined()
    expect(listRuns(db)).toEqual([])
  })

  test('a context with no run tags exactly as before', () => {
    // Previews and one-off generation pass no run; those tags must be
    // unchanged, or every existing test of them is testing something else.
    const db = newDatabase()
    const ctx = createDrawContext(db, 'thu', SEED_ROLE_LAYERS)
    const drawn = ctx.line({
      role: 'lan_can',
      partId: 'lan_can_trai',
      start: { x: 0, y: 0, z: 0 },
      end: { x: 100, y: 0, z: 0 }
    })
    expect(readSemanticTag(drawn)).toEqual({
      role: 'lan_can',
      partId: 'lan_can_trai',
      templateId: 'thu'
    })
  })
})

describe('what will not fit', () => {
  test('refuses a run record too long for one XData string', () => {
    // 255 bytes is the ceiling of a single DXF string. Better to refuse at the
    // point of writing, naming the limit, than to write a truncated record that
    // reads back as a run with the wrong arguments.
    const db = newDatabase()
    const line = new AcDbLine({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 })
    line.layer = '0'
    db.tables.blockTable.modelSpace.appendEntity(line)

    const enormous: Record<string, number> = {}
    for (let i = 0; i < 40; i++) enormous[`thamSoRatDaiSo${i}`] = 123456

    expect(() =>
      writeSemanticTag(line, {
        role: 'lan_can',
        partId: 'lan_can_trai',
        templateId: 'x',
        run: { id: 'r1', version: '1.0.0', values: enormous }
      })
    ).toThrow(/lượt dựng|255/)
  })
})
