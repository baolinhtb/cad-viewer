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
  AcGeMatrix3d,
  AcGePoint3d
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
import type { DossierPrimitive, DossierScene, XY } from './scene'
import { buildDossierScene, drawDossierScene } from './scene'
import { acapDossierTableValues } from './scene030'

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
  /**
   * The user chose to put the hand-edited texts, elevation tags and
   * dimensions back to what the generator writes, in the same call as the
   * change (`dua_ve_so_bo_sinh`). They are redrawn by the tool as generated —
   * entity type, font, colour, layer — never by a script.
   */
  revertHandEdits?: boolean
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
      `Hồ sơ ${run.id} dựng bằng bộ sinh ${run.version}: công cụ chưa đổi được ${changed.filter(k => !patchable.includes(k)).join(', ')} cho phiên bản này, và không xóa để dựng lại từ template/sơ đồ. Chưa thay đổi gì. Báo người dùng và hỏi hướng xử lý.`
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
    {
      old: string
      next: string
      expected: number
      // A text fitted to its cell (the SUB-020 name) is narrowed with it.
      fit?: { widthFactor: number; height: number }
      // Where the run drew it (sheet, point, height): to say what is there.
      places: {
        sheet: string
        at: XY
        height: number
        /** What the generator draws there now (to redraw the cell). */
        next: DossierPrimitive
      }[]
    }
  >()
  // Dimension texts and block attributes, by sheet and source handle.
  const dimPatches = new Map<
    string,
    { old?: string; next?: string; prim: DossierPrimitive }
  >()
  const attrPatches = new Map<
    string,
    {
      old: string
      next: string
      place?: { at: XY; align: number }
      prim: DossierPrimitive
    }
  >()
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
        'Cấu trúc hồ sơ đã khác mẫu; chưa sửa gì. Báo người dùng và hỏi hướng xử lý.'
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
            next: b.text,
            prim: b
          })
        }
        if (a.kind === 'insert' && b.kind === 'insert')
          for (const tag of Object.keys(a.attributes)) {
            const was = attributeValue(a.attributes[tag])
            const now = attributeValue(b.attributes[tag])
            // A longer value may have moved its text clear of the parts
            // around it (placeElevationTags in scene030): move it too.
            const from = attributePlace(a.attributes[tag])
            const to = attributePlace(b.attributes[tag])
            const shifted = JSON.stringify(from) !== JSON.stringify(to)
            if (was === now && !shifted) continue
            if (!a.sourceHandle) moved = true
            attrPatches.set(JSON.stringify([old.id, a.sourceHandle, tag]), {
              old: was,
              next: now,
              ...(shifted && to ? { place: to } : {}),
              prim: b
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
        expected: (prior?.expected ?? 0) + 1,
        places: [
          ...(prior?.places ?? []),
          // Drawn at the sheet's origin plus the primitive's point.
          {
            sheet: old.id,
            at: [old.origin[0] + a.at[0], old.origin[1] + a.at[1]] as XY,
            height: a.height,
            next: b
          }
        ],
        ...(a.widthFactor !== b.widthFactor || a.height !== b.height
          ? { fit: { widthFactor: b.widthFactor ?? 1, height: b.height } }
          : {})
      })
    }
  }
  // Something besides wording moved: not a label edit after all.
  if (moved) return a3 ? regenerate() : result(['Cấu trúc hồ sơ đã khác mẫu.'])
  const patches = new Map<string, string>()
  const fits = new Map<string, { widthFactor: number; height: number }>()
  const dimTexts = new Map<string, { old: string; next: string }>()
  const attrTexts = new Map<
    string,
    {
      tag: string
      old: string
      next: string
      place?: { at: XY; align: number }
    }
  >()
  const handled = new Set<string>()
  // What differs from what the run drew: named in the refusal — or, when the
  // user chose to put it back (revertHandEdits), listed as put back.
  const edited: string[] = []
  const reverted: string[] = []
  const revert = options.revertHandEdits === true
  const differs = (what: string) => (revert ? reverted : edited).push(what)
  // Cells to draw again from the generator: the run's text holds the right
  // value in another entity (an MText, a text put in its stead), or a hand
  // edit is being put back.
  const redraws: {
    sheet: string
    erase?: AcDbEntity
    prim: DossierPrimitive
  }[] = []
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
      if (!sameLabel(e.dimensionText ?? '', resolve(dim.old))) {
        differs(
          `kích thước trên ${sheet} đang ghi «${e.dimensionText}», bộ sinh ghi «${resolve(dim.old)}»`
        )
        handled.add(JSON.stringify([sheet, source]))
        if (revert)
          dimTexts.set(e.objectId, {
            old: e.dimensionText ?? '',
            next: resolve(dim.next)
          })
        continue
      }
      dimTexts.set(e.objectId, {
        old: e.dimensionText ?? '',
        next: resolve(dim.next)
      })
      handled.add(JSON.stringify([sheet, source]))
    }
    if (e instanceof AcDbBlockReference)
      for (const a of e.attributeIterator()) {
        const key = JSON.stringify([sheet, source, a.tag])
        const attr = attrPatches.get(key)
        if (!attr) continue
        if (!sameLabel(a.textString, attr.old)) {
          differs(
            `thẻ cao độ trên ${sheet} đang ghi «${a.textString}», bộ sinh ghi «${attr.old}»`
          )
          handled.add(key)
          if (revert) attrTexts.set(a.objectId, { tag: a.tag, ...attr })
          continue
        }
        attrTexts.set(a.objectId, { tag: a.tag, ...attr })
        handled.add(key)
      }
  }
  // Every planned patch found its entity, exactly as drawn.
  for (const [k, d] of dimPatches)
    if (!handled.has(k)) {
      differs(
        `kích thước «${d.old ?? 'số đo'}» trên ${JSON.parse(k)[0]} không còn (đã xóa hoặc thay)`
      )
      if (revert) redraws.push({ sheet: JSON.parse(k)[0], prim: d.prim })
    }
  for (const [k, a] of attrPatches)
    if (!handled.has(k)) {
      differs(
        `thẻ cao độ «${a.old}» trên ${JSON.parse(k)[0]} không còn (đã xóa hoặc thay)`
      )
      // The tag's block is drawn again, once for all its attributes.
      if (revert && !redraws.some(r => r.prim === a.prim))
        redraws.push({ sheet: JSON.parse(k)[0], prim: a.prim })
    }
  const cells = acapDossierTableValues({ ...run.values })
  const inRun = new Set(entities.map(e => e.objectId))
  for (const [key, replacement] of replacements) {
    const [sheetId, partId] = JSON.parse(key) as [string, string, string]
    const mine = entities.filter(e => {
      const tag = readSemanticTag(e)
      return (
        tag?.params?.sheet === sheetId &&
        tag?.partId === partId &&
        (e instanceof AcDbText || e instanceof AcDbMText) &&
        sameLabel(plainOf(e), replacement.old)
      )
    })
    if (
      mine.length === replacement.expected &&
      mine.every(e => e instanceof AcDbText)
    ) {
      mine.forEach(e => {
        patches.set(e.objectId, replacement.next)
        if (replacement.fit) fits.set(e.objectId, replacement.fit)
      })
      continue
    }
    // Place by place: the run's own Text, the right value in another
    // entity (redrawn), or a hand edit (named).
    const cell = [...cells].find(([, x]) => x === replacement.old)?.[0]
    for (const place of replacement.places) {
      const own = mine.find(e => near(positionOf(e), place, 1.5))
      if (own instanceof AcDbText) {
        patches.set(own.objectId, replacement.next)
        if (replacement.fit) fits.set(own.objectId, replacement.fit)
        continue
      }
      const stand =
        own ??
        textEntityAt(db, place, e => !inRun.has(e.objectId), replacement.old)
      if (stand) {
        redraws.push({ sheet: place.sheet, erase: stand, prim: place.next })
        continue
      }
      const now = textAt(db, place)
      differs(
        `${cell ? `ô ${cell}` : `chữ «${replacement.old}»`} trên ${place.sheet} ${now === undefined ? 'đã bị xóa' : `đang là «${now}»`}, khác số bộ sinh «${replacement.old}»`
      )
      if (revert)
        redraws.push({
          sheet: place.sheet,
          // Whatever holds the cell now — the run's own text, or a text put
          // in its stead — gives way to the generator's.
          erase:
            entities.find(e => {
              const tag = readSemanticTag(e)
              return (
                tag?.params?.sheet === sheetId &&
                tag?.partId === partId &&
                (e instanceof AcDbText || e instanceof AcDbMText) &&
                near(positionOf(e), place, 1.5)
              )
            }) ?? textEntityAt(db, place, () => true),
          prim: place.next
        })
    }
  }
  if (edited.length) return result([handEdited(run.id, edited)])
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
      // Cells drawn again: what stands there goes (the run's MText, or a
      // text put in its stead), the generator's own text comes back.
      const redrawn = new Set(redraws.flatMap(r => r.erase?.objectId ?? []))
      for (const r of redraws)
        if (
          r.erase &&
          db.openEntityForWrite(r.erase)?.erase() &&
          inRun.has(r.erase.objectId)
        )
          removed += 1
      for (const original of entities) {
        if (redrawn.has(original.objectId)) continue
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
        const fit = fits.get(entity.objectId)
        if (fit && entity instanceof AcDbText) {
          entity.widthFactor = fit.widthFactor
          entity.height = fit.height
        }
        const dim = dimTexts.get(entity.objectId)
        if (dim && entity instanceof AcDbAlignedDimension)
          patchDimensionText(db, entity, dim.old, dim.next)
        if (entity instanceof AcDbBlockReference)
          for (const a of entity.attributeIterator()) {
            const attr = attrTexts.get(a.objectId)
            if (!attr) continue
            const w = db.openEntityForWrite(a) as AcDbText
            w.textString = attr.next
            if (attr.place) {
              const at = new AcGePoint3d(attr.place.at[0], attr.place.at[1], 0)
              w.position = at
              w.horizontalMode = attr.place.align as 0 | 1 | 2
              if (attr.place.align) w.alignmentPoint = at.clone()
            }
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
      if (redrawFrame || redraws.length) {
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
            primitives: [
              ...(redrawFrame ? sheet.primitives.filter(isFrame) : []),
              ...redraws.filter(r => r.sheet === sheet.id).map(r => r.prim)
            ]
          }))
        })
        drawn = ctx.drawn.length
      }
    }
  )
  return {
    ...result([]),
    removed,
    entityCount: entities.length - removed + drawn,
    ...(reverted.length
      ? {
          warnings: [
            `Đã đưa về số bộ sinh (theo lựa chọn của người dùng): ${reverted.join('; ')}.`
          ]
        }
      : {})
  }
}

/** Parameters that only change wording on a 0.3.0 dossier (plan 2.7). */
const WORDING_KEYS = ['caoDoDayBe', 'nhanKichThuoc']
/**
 * The refusal when a label the change would rewrite was edited by hand. It
 * names what differs and asks — it never points at editing the texts one by
 * one, which on 22/11/2026 led the agent to shift 23 elevations by script
 * past the refusal, leaving the dossier out of step with its drawing.
 */
function handEdited(runId: string, edited: string[]): string {
  const shown = edited.slice(0, 6).join('; ')
  const more = edited.length > 6 ? ` và ${edited.length - 6} chỗ khác` : ''
  return (
    `Hồ sơ ${runId} có chữ đã sửa tay: ${shown}${more}. Chưa sửa gì: bản vẽ và thông số hồ sơ giữ nguyên. ` +
    'Dừng lại, báo đúng các chỗ này và hỏi người dùng MỘT lần, chọn: (1) đưa các chỗ đó về đúng số bộ sinh rồi làm tiếp — khi đó gọi lại sua_ho_so_mo MỘT lần với cùng thông số và dua_ve_so_bo_sinh: true, công cụ tự viết lại các chỗ đó đúng kiểu bộ sinh và áp thay đổi; (2) giữ số đã sửa và không đổi thông số này; (3) hủy. ' +
    'Không tự viết lại hay sửa từng chữ cao độ, kích thước của hồ sơ bằng script, kể cả để đưa về số bộ sinh.'
  )
}

/** Same place: within `heights` text heights (half by default). */
const near = (
  p: { x: number; y: number },
  place: { at: XY; height: number },
  heights = 0.5
) => Math.hypot(p.x - place.at[0], p.y - place.at[1]) <= place.height * heights

/**
 * A label as it reads, without MText or inline formatting: `{\A1;\c16777215;
 * \farial|b0|i0;\H161.4;228.837}` reads `228.837` (UI acceptance P1/M5b:
 * a cell rewritten through a script kept its codes and was taken for a hand
 * edit).
 */
export function acapPlainLabel(text: string): string {
  return text
    .replace(/\\[ACcFfHhWwQqTtp][^;]*;/g, '')
    .replace(/\\[LlOoKkNX]/g, '')
    .replace(/\\P/g, ' ')
    .replace(/\\~/g, ' ')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const NUMBER = /^[-+]?\d+(?:[.,]\d+)?$/
/**
 * Two labels say the same: equal once formatting is gone, or the same number
 * (228.837, 228,837 and 228.8370 alike).
 */
export function acapSameLabel(a: string, b: string): boolean {
  const x = acapPlainLabel(a)
  const y = acapPlainLabel(b)
  if (x === y) return true
  if (NUMBER.test(x) && NUMBER.test(y))
    return Number(x.replace(',', '.')) === Number(y.replace(',', '.'))
  return false
}
const sameLabel = acapSameLabel

/** The text an entity shows, Text or MText, without its formatting. */
const plainOf = (e: AcDbEntity) =>
  acapPlainLabel(
    e instanceof AcDbMText
      ? e.contents
      : e instanceof AcDbText
        ? e.textString
        : ''
  )
const positionOf = (e: AcDbEntity) =>
  e instanceof AcDbMText ? e.location : (e as AcDbText).position

/**
 * The Text or MText at a place that `pick` accepts and that reads `value`
 * (any value when undefined).
 */
function textEntityAt(
  db: AcDbDatabase,
  place: { at: XY; height: number },
  pick: (e: AcDbEntity) => boolean,
  value?: string
): AcDbEntity | undefined {
  for (const e of db.tables.blockTable.modelSpace.newIterator())
    if (
      (e instanceof AcDbText || e instanceof AcDbMText) &&
      pick(e) &&
      near(positionOf(e), place) &&
      (value === undefined || sameLabel(plainOf(e), value))
    )
      return e
  return undefined
}

/**
 * The text standing at a place of a sheet now, whatever entity holds it — a
 * Text, or an MText put there instead — or undefined when there is none.
 */
function textAt(
  db: AcDbDatabase,
  place: { at: XY; height: number }
): string | undefined {
  const e = textEntityAt(db, place, () => true)
  return e ? plainOf(e) : undefined
}

const attributeValue = (a: string | { value: string } | undefined) =>
  a === undefined ? '' : typeof a === 'string' ? a : a.value
const attributePlace = (
  a: string | { at: XY; align?: number } | undefined
): { at: XY; align: number } | undefined =>
  a === undefined || typeof a === 'string'
    ? undefined
    : { at: a.at, align: a.align ?? 0 }

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
          typeof a === 'string' ? '' : { ...a, value: '', at: [0, 0], align: 0 }
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
    if (e instanceof AcDbMText && sameLabel(e.contents, old))
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
  if (
    JSON.stringify(expected) !== JSON.stringify(actual) &&
    // The user chose to drop the hand edits: the run is drawn again from
    // its values, which puts every text back as generated.
    !options.revertHandEdits
  ) {
    const missing = expected.filter(k => !actual.includes(k)).length
    const extra = actual.filter(k => !expected.includes(k)).length
    return result([
      `Hồ sơ ${run.id} đã được sửa tay (${missing} đối tượng khác hoặc thiếu, ${extra} đối tượng lạ so với bản dựng từ thông số); không dựng lại để giữ phần đã sửa, chưa sửa gì. Dừng lại và hỏi người dùng MỘT lần: giữ bản vẽ đã sửa (không đổi thông số), hay bỏ các sửa tay để dựng lại — khi đó gọi lại sua_ho_so_mo MỘT lần với cùng thông số và dua_ve_so_bo_sinh: true. Không tự sửa từng chữ cao độ hay kích thước bằng script.`
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
