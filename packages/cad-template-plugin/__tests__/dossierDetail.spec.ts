import { AcDbDatabase, AcDbFileType } from '@mlightcad/data-model'
import { readSemanticTag } from '@mlightcad/cad-template-sdk'

import { buildDossierModel } from '../src/dossier/model'
import { buildDossierScene } from '../src/dossier/scene'
import { dossierDxf, dossierSheetSvg } from '../src/dossier/export'
import reference from '../src/dossier/reference/reinforcement.json'

test('source panels retain every extracted primitive and source identity', () => {
  const scene = buildDossierScene(buildDossierModel())
  expect(scene.detailMode).toBe('source')
  for (const [id, key] of [
    ['BC01', 'general'],
    ['CT01', 'main'],
    ['CT02', 'left'],
    ['CT03', 'right']
  ] as const) {
    const sheet = scene.sheets.find(s => s.id === id)!
    const ops = sheet.primitives.filter(p => p.sourceHandle)
    expect(ops).toHaveLength(reference.views[key].ops.length)
    expect(ops.some(p => p.kind === 'fill')).toBe(true)
    expect(
      ops.some(p => p.kind === 'text' && Math.abs(p.rotation ?? 0) > 1)
    ).toBe(true)
    expect(dossierSheetSvg(sheet)).toContain('fill-rule="evenodd"')
  }
  expect(scene.sheets.find(s => s.id === 'CT01')!.scale).toBe(75)
})

test('changed dimensions never inherit unchanged source geometry', () => {
  const scene = buildDossierScene(buildDossierModel({ bBe: 8500 }))
  expect(scene.detailMode).toBe('parametric')
  expect(scene.sheets[0].primitives.some(p => p.sourceHandle)).toBe(false)
  expect(
    scene.sheets
      .find(s => s.id === 'CT01')!
      .primitives.some(p => p.sourceHandle)
  ).toBe(false)
})

test('filled arrows and rotated annotation remain editable CAD entities after DXF reopen', async () => {
  const scene = buildDossierScene(buildDossierModel())
  const output = dossierDxf(scene)
  const bytes =
    typeof output === 'string' ? new TextEncoder().encode(output) : output
  const db = new AcDbDatabase()
  await db.read(
    bytes.buffer as ArrayBuffer,
    { readOnly: false },
    AcDbFileType.DXF
  )
  const entities = [...db.tables.blockTable.modelSpace.newIterator()]
  const source = entities.filter(e => readSemanticTag(e)?.params?.sourceHandle)
  expect(source.length).toBeGreaterThan(4500)
  expect(source.filter(e => e.dxfTypeName === 'HATCH').length).toBeGreaterThan(
    1000
  )
  expect(
    source.some(
      e =>
        e.dxfTypeName === 'TEXT' &&
        Math.abs((e as unknown as { rotation: number }).rotation) > 0.7
    )
  ).toBe(true)
}, 60000)
