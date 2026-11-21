import { acapRunGroupedEdit } from '@mlightcad/cad-simple-viewer'
import type { AcTpParamValues } from '@mlightcad/cad-template-sdk'
import {
  acTpWithWorkingDatabaseSync,
  createDrawContext,
  formatDimensionText,
  readSemanticTag,
  writeSemanticTag
} from '@mlightcad/cad-template-sdk'
import {
  AcDbAlignedDimension,
  AcDbBlockReference,
  AcDbDatabase,
  AcDbEntity,
  AcDbMText,
  AcDbText,
  AcGeMatrix3d
} from '@mlightcad/data-model'

import type { AcApRunEditResult } from '../editRun'
import { entitiesOfRun, listRuns } from '../runIdentity'
import { layerStyles, legacyLayers, roleLayers } from '../templateRegistry'
import {
  buildDossierModel,
  DOSSIER_A3_VERSION,
  DOSSIER_ID,
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

/** Options of {@link acapEditDossierRun}. */
export interface AcApDossierEditOptions {
  /**
   * The user agreed to a regeneration that leaves the dossier with far fewer
   * entities (see {@link DOSSIER_LOSS_THRESHOLD}). Without it such an edit is
   * refused with the numbers, so the agent can ask first.
   */
  confirmLoss?: boolean
}

/**
 * A regeneration dropping more than this share of the dossier's entities
 * (and at least {@link DOSSIER_LOSS_MIN} of them) needs `confirmLoss`.
 */
export const DOSSIER_LOSS_THRESHOLD = 0.1
export const DOSSIER_LOSS_MIN = 100

/** Patch dossier labels/placement without regenerating any existing geometry.
 * Geometry parameters require native, scoped edits until a detail-preserving
 * dependency model exists; replacing source linework with a schematic is refused. */
export async function acapEditDossierRun(
  db: AcDbDatabase,
  run: ReturnType<typeof listRuns>[number],
  values: AcTpParamValues,
  options: AcApDossierEditOptions = {}
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
  // lCoc is not drawn (the piles are shown broken off): giving it only
  // records the value on the run for the take-off, keeping every entity.
  const labelKeys = [
    'tenMo',
    'congTrinh',
    'x',
    'y',
    'lCoc',
    ...DOSSIER_TITLE_KEYS
  ]
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
  // 0.3.0 (plan P0–P1 2.7): the elevation datum and the label mode only
  // change what texts, dimension texts and elevation tags say — patched in
  // place too, keeping every handle, when nothing else moves.
  const a3 = run.version === DOSSIER_A3_VERSION
  const wording = changed.some(k => WORDING_KEYS.includes(k))
  const patchable = a3 ? [...labelKeys, ...WORDING_KEYS] : labelKeys
  const regenerate = () =>
    regenerateRun(db, run, values, entities, result, options)
  if (
    a3 &&
    (changed.some(k => !patchable.includes(k)) ||
      (wording && (changed.includes('x') || changed.includes('y'))))
  )
    return regenerate()
  if (changed.some(k => !patchable.includes(k)))
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
  // Dimension texts and block attributes, by sheet and source handle.
  const dimPatches = new Map<string, { old?: string; next?: string }>()
  const attrPatches = new Map<string, { old: string; next: string }>()
  let moved = false
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
      if (wording) {
        if (JSON.stringify(bare(a)) !== JSON.stringify(bare(b))) moved = true
        if (
          a.kind === 'dimension' &&
          b.kind === 'dimension' &&
          a.text !== b.text
        ) {
          if (!a.sourceHandle) moved = true
          dimPatches.set(JSON.stringify([old.id, a.sourceHandle]), {
            old: a.text,
            next: b.text
          })
        }
        if (a.kind === 'insert' && b.kind === 'insert')
          for (const tag of Object.keys(a.attributes)) {
            const was = attributeValue(a.attributes[tag])
            const now = attributeValue(b.attributes[tag])
            if (was === now) continue
            if (!a.sourceHandle) moved = true
            attrPatches.set(JSON.stringify([old.id, a.sourceHandle, tag]), {
              old: was,
              next: now
            })
          }
      }
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
  // Something besides wording moved: not a label edit after all.
  if (moved) return a3 ? regenerate() : result(['Cấu trúc hồ sơ đã khác mẫu.'])
  const patches = new Map<string, string>()
  const dimTexts = new Map<string, { old: string; next: string }>()
  const attrTexts = new Map<
    string,
    { tag: string; old: string; next: string }
  >()
  const handled = new Set<string>()
  for (const e of entities) {
    const tag = readSemanticTag(e)
    const sheet = tag?.params?.sheet
    const source = tag?.params?.sourceHandle
    const dim = dimPatches.get(JSON.stringify([sheet, source]))
    if (dim && e instanceof AcDbAlignedDimension) {
      const measured = dimensionValue(db, e)
      const resolve = (t?: string) =>
        t === undefined ? measured : t.replace(/<>/g, measured)
      // The text the run drew, or the drawing was edited by hand.
      if (e.dimensionText !== resolve(dim.old))
        return result([HAND_EDITED_LABEL])
      dimTexts.set(e.objectId, {
        old: e.dimensionText,
        next: resolve(dim.next)
      })
      handled.add(JSON.stringify([sheet, source]))
    }
    if (e instanceof AcDbBlockReference)
      for (const a of e.attributeIterator()) {
        const key = JSON.stringify([sheet, source, a.tag])
        const attr = attrPatches.get(key)
        if (!attr) continue
        if (a.textString !== attr.old) return result([HAND_EDITED_LABEL])
        attrTexts.set(a.objectId, { tag: a.tag, ...attr })
        handled.add(key)
      }
  }
  // Every planned patch found its entity, exactly as drawn.
  if ([...dimPatches.keys(), ...attrPatches.keys()].some(k => !handled.has(k)))
    return result([HAND_EDITED_LABEL])
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
        const dim = dimTexts.get(entity.objectId)
        if (dim && entity instanceof AcDbAlignedDimension)
          patchDimensionText(db, entity, dim.old, dim.next)
        if (entity instanceof AcDbBlockReference)
          for (const a of entity.attributeIterator()) {
            const attr = attrTexts.get(a.objectId)
            if (attr)
              (db.openEntityForWrite(a) as AcDbText).textString = attr.next
          }
        if (dx || dy)
          entity.transformBy(new AcGeMatrix3d().makeTranslation(dx, dy, 0))
        const tag = readSemanticTag(entity)!
        // Part fields that carry a changed value (the piles' lCoc) follow it.
        const stale = changed.filter(k => tag.params && k in tag.params)
        writeSemanticTag(entity, {
          ...tag,
          ...(stale.length
            ? {
                params: {
                  ...tag.params,
                  ...Object.fromEntries(
                    stale.map(k => [k, values[k] as number | string | boolean])
                  )
                }
              }
            : {}),
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

/** Parameters that only change wording on a 0.3.0 dossier (plan 2.7). */
const WORDING_KEYS = ['caoDoDayBe', 'nhanKichThuoc']
const HAND_EDITED_LABEL =
  'Có chữ, kích thước hoặc thẻ cao độ đã sửa tay hoặc bị xóa; giữ nguyên bản vẽ, chưa sửa gì. Dùng tx.setText với đúng đối tượng hiện tại.'

const attributeValue = (a: string | { value: string } | undefined) =>
  a === undefined ? '' : typeof a === 'string' ? a : a.value

/** A primitive without its wording: what must not change in a label edit. */
function bare(p: DossierPrimitive): unknown {
  if (p.kind === 'text') return { ...p, text: '' }
  if (p.kind === 'dimension') return { ...p, text: '' }
  if (p.kind === 'insert')
    return {
      ...p,
      attributes: Object.fromEntries(
        Object.entries(p.attributes).map(([k, a]) => [
          k,
          typeof a === 'string' ? '' : { ...a, value: '' }
        ])
      )
    }
  return p
}

/**
 * The measurement a dimension shows, formatted by its style — as the draw
 * context wrote it (along the dimension's axis).
 */
function dimensionValue(db: AcDbDatabase, d: AcDbAlignedDimension): string {
  const a = d.xLine1Point
  const b = d.xLine2Point
  const along = Math.abs(
    (b.x - a.x) * Math.cos(d.rotation) + (b.y - a.y) * Math.sin(d.rotation)
  )
  const style = db.tables.dimStyleTable.getAt(d.dimensionStyleName ?? '')
  return style ? formatDimensionText(along, style) : String(Math.round(along))
}

/**
 * A dimension's text replaced where it is drawn: the override and the text
 * of its block, which the data model built from it — nothing else moves.
 */
function patchDimensionText(
  db: AcDbDatabase,
  d: AcDbAlignedDimension,
  old: string,
  next: string
) {
  d.dimensionText = next
  const block = d.dimBlockId
    ? db.tables.blockTable.getAt(d.dimBlockId)
    : undefined
  for (const e of block?.newIterator() ?? [])
    if (e instanceof AcDbMText && e.contents === old)
      (db.openEntityForWrite(e) as AcDbMText).contents = next
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
  result: (errors: string[]) => AcApRunEditResult,
  options: AcApDossierEditOptions
): Promise<AcApRunEditResult> {
  if (entities.some(e => db.tables.layerTable.getAt(e.layer)?.isLocked))
    return result(['Hồ sơ có layer bị khóa; chưa sửa đối tượng nào.'])
  let after: DossierScene
  try {
    after = buildDossierScene(buildDossierModel(values), run.version)
  } catch (error) {
    return result([error instanceof Error ? error.message : String(error)])
  }
  // The general-arrangement sheets must follow the values; if one cannot
  // (a layout change, a view leaving the A3 sheet), nothing is changed —
  // regenerating would replace the detailed drawing with a notice.
  for (const sheet of after.sheets) {
    const notice = sheet.primitives.findIndex(
      p =>
        p.kind === 'text' &&
        p.text === 'CHƯA DỰNG ĐƯỢC HÌNH CHO BỘ THÔNG SỐ NÀY'
    )
    if (notice < 0) continue
    const why = sheet.primitives[notice + 1]
    return result([
      `${sheet.id}: hình chiếu không theo được thông số mới — ${why?.kind === 'text' ? why.text : ''} Chưa sửa gì.`
    ])
  }
  const identity = (v: AcTpParamValues) => ({
    id: run.id,
    version: run.version,
    values: v as Record<string, number | string | boolean>
  })
  const before = buildDossierScene(
    buildDossierModel({ ...run.values }),
    run.version
  )
  // Say it before doing it: on 17/11/2026 hLot +50 mm silently took the
  // dossier from 2890 to 829 entities. Counted on the scenes, sheet by sheet.
  const counts = (scene: DossierScene) =>
    new Map(scene.sheets.map(s => [s.id, s.primitives.length]))
  const was = counts(before)
  const now = counts(after)
  const total = (m: Map<string, number>) =>
    [...m.values()].reduce((a, b) => a + b, 0)
  const lost = total(was) - total(now)
  if (
    !options.confirmLoss &&
    lost >= DOSSIER_LOSS_MIN &&
    lost > total(was) * DOSSIER_LOSS_THRESHOLD
  ) {
    const bySheet = [...was]
      .filter(([id, n]) => (now.get(id) ?? 0) < n)
      .map(([id, n]) => `${id} ${n} → ${now.get(id) ?? 0}`)
      .join(', ')
    return result([
      `Thao tác này sẽ bỏ ${lost}/${total(was)} đối tượng của hồ sơ ${run.id} (${bySheet}). Chưa sửa gì. Hỏi người dùng; chỉ khi họ đồng ý mới gọi lại sua_ho_so_mo với xac_nhan_bo_doi_tuong: true.`
    ])
  }
  const scratch = new AcDbDatabase()
  scratch.createDefaultData()
  // The scratch copy draws with its own id counter, not the drawing's.
  acTpWithWorkingDatabaseSync(scratch, () =>
    drawDossierScene(
      createDrawContext(
        scratch,
        DOSSIER_ID,
        roleLayers(),
        identity({ ...run.values }),
        layerStyles(),
        { legacyLayers: legacyLayers() }
      ),
      before
    )
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
          /^(CHƯA|BẢNG .*CHƯA|THÉP THEO M1 GỐC)/.test(p.text) &&
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
