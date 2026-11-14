import { acapRunGroupedEdit } from '@mlightcad/cad-simple-viewer'
import type { AcTpParamValues } from '@mlightcad/cad-template-sdk'
import {
  createDrawContext,
  readSemanticTag,
  writeSemanticTag
} from '@mlightcad/cad-template-sdk'
import {
  AcDbDatabase,
  AcDbEntity,
  AcDbText,
  AcGeMatrix3d
} from '@mlightcad/data-model'

import type { AcApRunEditResult } from '../editRun'
import { entitiesOfRun, listRuns } from '../runIdentity'
import { layerStyles, legacyLayers, roleLayers } from '../templateRegistry'
import {
  buildDossierModel,
  DOSSIER_ID,
  DOSSIER_NEXT_VERSION,
  DOSSIER_TITLE_KEYS
} from './model'
import type { DossierPrimitive, DossierScene } from './scene'
import { buildDossierScene, drawDossierScene } from './scene'

/** Roles of the sheet border and title block (0.2.0 and later). */
const FRAME_ROLES = new Set(['khung_ban_ve', 'khung_ten'])
const isFrame = (p: { role: string }) => FRAME_ROLES.has(p.role)

/** The frame primitives of every sheet, for comparing two scenes. */
const frameOf = (scene: DossierScene) =>
  scene.sheets.map(s => s.primitives.filter(isFrame))

/** Frame texts per sheet, sorted — what the drawing should still show. */
const frameTexts = (sheets: DossierPrimitive[][]) =>
  sheets.map(primitives =>
    primitives.flatMap(p => (p.kind === 'text' ? [p.text] : [])).sort()
  )

/** Patch dossier labels/placement without regenerating any existing geometry.
 * Geometry parameters require native, scoped edits until a detail-preserving
 * dependency model exists; replacing source linework with a schematic is refused. */
export async function acapEditDossierRun(
  db: AcDbDatabase,
  run: ReturnType<typeof listRuns>[number],
  values: AcTpParamValues
): Promise<AcApRunEditResult> {
  const entities = entitiesOfRun(db, run.id)
  const result = (errors: string[]): AcApRunEditResult => ({
    runId: run.id,
    removed: 0,
    entityCount: entities.length,
    layers: [...new Set(entities.map(e => e.layer))],
    values,
    errors
  })
  const changed = Object.keys(values).filter(k => values[k] !== run.values[k])
  if (!changed.length) return result([])
  const labelKeys = ['tenMo', 'congTrinh', 'x', 'y', ...DOSSIER_TITLE_KEYS]
  if (
    run.version === '0.1.0' &&
    changed.some(k => DOSSIER_TITLE_KEYS.includes(k))
  )
    return result([
      `Hồ sơ ${run.id} dựng bằng bộ sinh 0.1.0, chưa có khung tên nên không ghi được ${changed
        .filter(k => DOSSIER_TITLE_KEYS.includes(k))
        .join(
          ', '
        )}. Dựng hồ sơ mới (phiên bản hiện hành) để có khung tên; chưa sửa gì.`
    ])
  if (
    changed.some(k => !labelKeys.includes(k)) &&
    run.version === DOSSIER_NEXT_VERSION
  )
    return regenerateRun(db, run, values, entities, result)
  if (changed.some(k => !labelKeys.includes(k)))
    return result([
      'Giữ nguyên bản vẽ chi tiết: không xóa để dựng lại từ template/sơ đồ. Dùng execute_cad_script, đọc đối tượng hiện tại rồi sửa đúng chữ/điểm grip bằng tx.setText hoặc tx.moveGrips. Thay đổi toàn bộ kích thước hồ sơ cần xác định các hình chiếu, kích thước và cấu tạo liên quan; chưa thay đổi thông số nào.'
    ])

  // Plan label changes before opening the transaction. An edited label must
  // not be silently overwritten by a value reconstructed from the template.
  // Both scenes with the run's own generator: a 0.1.0 dossier keeps its
  // border, a 0.2.0 one its title block.
  const before = buildDossierScene(
    buildDossierModel({ ...run.values }),
    run.version
  )
  const after = buildDossierScene(buildDossierModel(values), run.version)
  const replacements = new Map<
    string,
    { old: string; next: string; expected: number }
  >()
  // A frame whose structure is unchanged (same lines, same number of text
  // lines) is patched in place like any other label, keeping every handle.
  // Only a frame that changes shape — a blank cell filled in, a title that
  // now wraps onto another line — is redrawn, as a whole, below.
  const shape = (scene: DossierScene) =>
    frameOf(scene).map(primitives =>
      primitives.map(p =>
        p.kind === 'text' ? ['text', p.at, p.height, p.widthFactor] : p
      )
    )
  const redrawFrame =
    JSON.stringify(shape(before)) !== JSON.stringify(shape(after))
  for (let s = 0; s < before.sheets.length; s++) {
    const keep = (p: DossierPrimitive) => !redrawFrame || !isFrame(p)
    const oldPrimitives = before.sheets[s].primitives.filter(keep)
    const nextPrimitives = after.sheets[s].primitives.filter(keep)
    const old = before.sheets[s]
    if (oldPrimitives.length !== nextPrimitives.length)
      return result([
        'Cấu trúc hồ sơ đã khác mẫu; giữ nguyên chi tiết và sửa trực tiếp các đối tượng.'
      ])
    for (let i = 0; i < oldPrimitives.length; i++) {
      const a = oldPrimitives[i],
        b = nextPrimitives[i]
      if (a.kind !== 'text' || b.kind !== 'text' || a.text === b.text) continue
      const key = JSON.stringify([old.id, a.partId, a.text])
      const prior = replacements.get(key)
      if (prior && prior.next !== b.text)
        return result([
          'Nhãn trùng nhưng nội dung mới khác nhau; cần chọn đúng đối tượng để sửa.'
        ])
      replacements.set(key, {
        old: a.text,
        next: b.text,
        expected: (prior?.expected ?? 0) + 1
      })
    }
  }
  const patches = new Map<string, string>()
  for (const [key, replacement] of replacements) {
    const found = entities.filter(e => {
      const tag = readSemanticTag(e)
      return (
        e instanceof AcDbText &&
        JSON.stringify([tag?.params?.sheet, tag?.partId, e.textString]) === key
      )
    })
    if (found.length !== replacement.expected)
      return result([
        'Có ghi chú đã sửa tay hoặc bị xóa; giữ nguyên bản vẽ. Dùng tx.setText với đúng đối tượng hiện tại để tránh ghi đè nội dung đã chỉnh.'
      ])
    found.forEach(e => patches.set(e.objectId, replacement.next))
  }
  // The frame is generated layout, not engineering detail, so a changed frame
  // is redrawn — but only if the drawing still shows exactly the frame this
  // run generated. A title block edited by hand is not overwritten.
  const frameEntities = entities.filter(e =>
    FRAME_ROLES.has(readSemanticTag(e)?.role ?? '')
  )
  if (redrawFrame) {
    const expected = frameOf(before)
    const actualTexts = before.sheets.map(sheet =>
      frameEntities
        .filter(
          e =>
            readSemanticTag(e)?.params?.sheet === sheet.id &&
            e instanceof AcDbText
        )
        .map(e => (e as AcDbText).textString)
        .sort()
    )
    if (
      frameEntities.length !== expected.flat().length ||
      JSON.stringify(actualTexts) !== JSON.stringify(frameTexts(expected))
    )
      return result([
        'Khung tên trong bản vẽ đã được sửa tay hoặc bị xóa; giữ nguyên, không dựng lại khung. Sửa trực tiếp chữ trong khung tên bằng tx.setText.'
      ])
  }
  if (entities.some(e => db.tables.layerTable.getAt(e.layer)?.isLocked))
    return result(['Hồ sơ có layer bị khóa; chưa sửa đối tượng nào.'])
  const dx = Number(values.x) - Number(run.values.x)
  const dy = Number(values.y) - Number(run.values.y)
  let removed = 0
  let drawn = 0
  await acapRunGroupedEdit(
    db,
    'Sửa nhãn/vị trí hồ sơ, giữ chi tiết',
    async () => {
      for (const original of entities) {
        if (
          redrawFrame &&
          FRAME_ROLES.has(readSemanticTag(original)?.role ?? '')
        ) {
          if (original.erase()) removed += 1
          continue
        }
        const entity = db.openEntityForWrite(original)!
        const text = patches.get(entity.objectId)
        if (text !== undefined && entity instanceof AcDbText)
          entity.textString = text
        if (dx || dy)
          entity.transformBy(new AcGeMatrix3d().makeTranslation(dx, dy, 0))
        const tag = readSemanticTag(entity)!
        writeSemanticTag(entity, {
          ...tag,
          run: {
            ...tag.run!,
            values: values as Record<string, number | string | boolean>
          }
        })
      }
      if (redrawFrame) {
        // Drawn at the new placement: `after` already carries the new x, y.
        const ctx = createDrawContext(
          db,
          DOSSIER_ID,
          roleLayers(),
          {
            id: run.id,
            version: run.version,
            values: values as Record<string, number | string | boolean>
          },
          layerStyles(),
          { legacyLayers: legacyLayers() }
        )
        drawDossierScene(ctx, {
          ...after,
          sheets: after.sheets.map(sheet => ({
            ...sheet,
            primitives: sheet.primitives.filter(isFrame)
          }))
        })
        drawn = ctx.drawn.length
      }
    }
  )
  return {
    ...result([]),
    removed,
    entityCount: entities.length - removed + drawn
  }
}

/** What a drawn entity looks like, for telling generated from hand-edited. */
function entityKey(e: AcDbEntity): string {
  const r = (v: number) => Math.round(v)
  let box = ''
  try {
    const b = e.geometricExtents
    if (Number.isFinite(b.min.x))
      box = [b.min.x, b.min.y, b.max.x, b.max.y].map(r).join(',')
  } catch {
    box = '?'
  }
  const text = e instanceof AcDbText ? e.textString : ''
  return `${e.dxfTypeName}|${e.layer}|${e.color.colorIndex ?? ''}|${box}|${text}`
}

/**
 * 0.3.0: a dimension change regenerates the run (decision Q6), but only if
 * the drawing still is exactly what the run's recorded values produce. The
 * run is drawn again from those values into a scratch database and compared
 * entity by entity (type, layer, colour, extents, text); any difference —
 * an entity moved, edited, added to the run or erased — means hand edits,
 * and the change is refused so nothing the engineer did is lost.
 */
async function regenerateRun(
  db: AcDbDatabase,
  run: ReturnType<typeof listRuns>[number],
  values: AcTpParamValues,
  entities: AcDbEntity[],
  result: (errors: string[]) => AcApRunEditResult
): Promise<AcApRunEditResult> {
  if (entities.some(e => db.tables.layerTable.getAt(e.layer)?.isLocked))
    return result(['Hồ sơ có layer bị khóa; chưa sửa đối tượng nào.'])
  let after: DossierScene
  try {
    after = buildDossierScene(buildDossierModel(values), run.version)
  } catch (error) {
    return result([error instanceof Error ? error.message : String(error)])
  }
  const identity = (v: AcTpParamValues) => ({
    id: run.id,
    version: run.version,
    values: v as Record<string, number | string | boolean>
  })
  const scratch = new AcDbDatabase()
  scratch.createDefaultData()
  drawDossierScene(
    createDrawContext(
      scratch,
      DOSSIER_ID,
      roleLayers(),
      identity({ ...run.values }),
      layerStyles(),
      { legacyLayers: legacyLayers() }
    ),
    buildDossierScene(buildDossierModel({ ...run.values }), run.version)
  )
  const expected = entitiesOfRun(scratch, run.id).map(entityKey).sort()
  const actual = entities.map(entityKey).sort()
  if (JSON.stringify(expected) !== JSON.stringify(actual)) {
    const missing = expected.filter(k => !actual.includes(k)).length
    const extra = actual.filter(k => !expected.includes(k)).length
    return result([
      `Hồ sơ ${run.id} đã được sửa tay (${missing} đối tượng khác hoặc thiếu, ${extra} đối tượng lạ so với bản dựng từ thông số); không dựng lại để giữ phần đã sửa. Sửa trực tiếp bằng execute_cad_script.`
    ])
  }
  let removed = 0
  let drawn = 0
  await acapRunGroupedEdit(db, 'Dựng lại hồ sơ theo thông số mới', async () => {
    for (const entity of entities) if (entity.erase()) removed += 1
    const ctx = createDrawContext(
      db,
      DOSSIER_ID,
      roleLayers(),
      identity(values),
      layerStyles(),
      { legacyLayers: legacyLayers() }
    )
    drawDossierScene(ctx, after)
    drawn = ctx.drawn.length
  })
  // Sheets that could not follow the values say so on the sheet; the tool
  // reports them too.
  const warnings = after.sheets.flatMap(s =>
    s.primitives
      .filter(
        p =>
          p.kind === 'text' &&
          /^(CHƯA|BẢNG .*CHƯA)/.test(p.text) &&
          p.role === 'ghi_chu'
      )
      .map(p => `${s.id}: ${(p as { text: string }).text}`)
  )
  return {
    ...result([]),
    removed,
    entityCount: drawn,
    ...(warnings.length ? { warnings } : {})
  }
}
