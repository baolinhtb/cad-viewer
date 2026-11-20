import type { ToolResult } from '@mlightcad/cad-agent-core'
import { writeSemanticTag } from '@mlightcad/cad-template-sdk'
import { AcDbDatabase, AcDbLine } from '@mlightcad/data-model'

import {
  createCadScriptTools as createCadTools,
  scriptEntityOwner
} from '../src/tools/scriptTools'

const mockExecute = jest.fn<Promise<ToolResult>, [unknown]>()
const mockCatalogOptions = jest.fn()
jest.mock('@mlightcad/cad-agent-core', () => {
  const { z } = jest.requireActual<typeof import('zod')>('zod')
  return {
    createCadToolCatalog: (_session: unknown, options: unknown) => {
      mockCatalogOptions(options)
      return catalog(z)
    }
  }
  function catalog(z: typeof import('zod').z) {
    return [
      {
        name: 'execute_cad_script',
        description: 'run a script',
        access: 'write',
        inputSchema: z.object({ code: z.string() }),
        execute: (input: unknown) => mockExecute(input)
      }
    ]
  }
})

const SCRIPT_RESULT: ToolResult = {
  success: true,
  message: 'Script finished — Inspect drawing',
  data: { total: 917, byType: { Table: 1, MText: 139 } },
  images: [{ mediaType: 'image/png', dataUrl: 'data:image/png;base64,AAAA' }]
}

/**
 * Calls the tool's `toModelOutput` the way AI SDK v5 does: with the raw
 * `execute()` result, not wrapped in `{ output }`.
 */
async function modelOutputFor(agentMode: 'simple' | 'high-inference') {
  mockExecute.mockResolvedValueOnce(SCRIPT_RESULT)
  const tool = createCadTools({ agentMode }).execute_cad_script
  const output = await tool.execute!(
    { code: 'return 1' },
    {
      toolCallId: 't1',
      messages: []
    }
  )
  return tool.toModelOutput!(output as ToolResult)
}

describe('createCadTools toModelOutput', () => {
  test('Simple mode sends the script result to the model, not null', async () => {
    const out = await modelOutputFor('simple')
    expect(out.type).toBe('json')
    const value = (out as { value: Record<string, unknown> }).value
    expect(value).not.toBeNull()
    expect(value.success).toBe(true)
    expect(value.data).toEqual(SCRIPT_RESULT.data)
    expect(value).not.toHaveProperty('images')
  })

  test('High inference mode sends JSON text plus screenshots', async () => {
    const out = await modelOutputFor('high-inference')
    expect(out.type).toBe('content')
    const parts = (
      out as { value: Array<{ type: string; text?: string; data?: string }> }
    ).value
    expect(parts[0].type).toBe('text')
    expect(JSON.parse(parts[0].text!).data).toEqual(SCRIPT_RESULT.data)
    expect(parts[1]).toMatchObject({ type: 'media', data: 'AAAA' })
  })
})

describe('createCadTools guards template runs', () => {
  test('the catalog gets the template-run owner of each entity', () => {
    createCadTools({ agentMode: 'simple' })
    expect(mockCatalogOptions).toHaveBeenLastCalledWith(
      expect.objectContaining({ entityOwner: scriptEntityOwner })
    )
  })

  test('an entity a template drew is owned by its run; others by nobody', () => {
    const db = new AcDbDatabase()
    db.createDefaultData()
    const drawn = new AcDbLine({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 })
    const free = new AcDbLine({ x: 0, y: 1, z: 0 }, { x: 1, y: 1, z: 0 })
    db.tables.blockTable.modelSpace.appendEntity(drawn)
    db.tables.blockTable.modelSpace.appendEntity(free)
    writeSemanticTag(drawn, {
      role: 'lan_can',
      partId: 'lan_can_SUB-010',
      templateId: 'ho_so_mo_m1',
      run: { id: 'r1', version: '0.3.0', values: {} }
    })
    expect(scriptEntityOwner(drawn)).toBe('ho_so_mo_m1 r1')
    expect(scriptEntityOwner(free)).toBeUndefined()
  })
})

describe('createCadTools: one script, one undo step', () => {
  test('a script runs through the injected undo step, with its intent', async () => {
    mockExecute.mockResolvedValueOnce({ success: true, message: 'ok' })
    const step = jest.fn(
      async (_intent: string | undefined, run: () => Promise<ToolResult>) =>
        await run()
    )
    const tool = createCadTools({
      agentMode: 'simple',
      scriptUndoStep: step
    }).execute_cad_script
    const out = await tool.execute!(
      { code: 'return 1', intent: 'xoá lan can trái' },
      { toolCallId: 't2', messages: [] }
    )
    expect(step).toHaveBeenCalledWith('xoá lan can trái', expect.any(Function))
    expect(out).toEqual({ success: true, message: 'ok' })
  })
})
