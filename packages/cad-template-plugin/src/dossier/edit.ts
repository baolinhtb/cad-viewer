import { acapRunGroupedEdit } from '@mlightcad/cad-simple-viewer'
import type { AcTpParamValues } from '@mlightcad/cad-template-sdk'
import {
  ACTP_GHI_CHU_TITLE,
  acTpWithWorkingDatabaseSync,
  createDrawContext,
  formatDimensionText,
  readSemanticTag,
  writeSemanticTag
} from '@mlightcad/cad-template-sdk'
import {
  AcDb3PointAngularDimension,
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
import { acTpWithLegacyDossierGeometry, acTpWithPreP3Steel } from './grid030'
import {
  acapIsA3Version,
  buildDossierModel,
  DOSSIER_ID,
  DOSSIER_TITLE_KEYS,
  DOSSIER_VERSION,
  dossierParamLabel
} from './model'
import type { DossierPrimitive, DossierScene, XY } from './scene'
import { buildDossierScene, drawDossierScene } from './scene'
import {
  acapDossierNoteAfter,
  acapDossierSheetNotes,
  acapDossierTableValues
} from './scene030'

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
  /**
   * The user confirmed rebuilding an older dossier (0.3.0) whose drawing no
   * longer matches today's generator with generator 0.3.1, from its stored
   * values, and applying the change in the same call (`mo_khoa_031`).
   * Anything drawn by hand on it is lost.
   */
  unlock031?: boolean
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
      `Hồ sơ ${run.id} dựng bằng phiên bản 0.1.0, chưa có khung tên nên không ghi được ${changed
        .filter(k => DOSSIER_TITLE_KEYS.includes(k))
        .join(
          ', '
        )}. Dựng hồ sơ mới (phiên bản hiện hành) để có khung tên; chưa sửa gì.`
    ])
  // 0.3.0 (plan P0–P1 2.7): the elevation datum and the label mode only
  // change what texts, dimension texts and elevation tags say — patched in
  // place too, keeping every handle, when nothing else moves.
  const a3 = acapIsA3Version(run.version)
  const wording = changed.some(k => WORDING_KEYS.includes(k))
  const patchable = a3 ? [...labelKeys, ...WORDING_KEYS] : labelKeys
  const regenerate = () =>
    regenerateRun(db, run, values, entities, result, options)
  // An older A3 dossier (0.3.0, drawn before M2–M5b changed the generator)
  // is edited like a current one only while its drawing is what today's
  // generator draws from its values. Otherwise the user unlocks it: rebuilt
  // as 0.3.1 from its stored values with the change, in one call — never
  // silently, and never mistaken for a hand-edited number.
  if (a3 && options.unlock031) return regenerate()
  if (a3 && run.version !== DOSSIER_VERSION) {
    const drift = compareWithGenerator(db, run, entities)
    if (drift.drift > 0) return result([unlockMessage(run, drift)])
  }
  if (
    a3 &&
    (changed.some(k => !patchable.includes(k)) ||
      (wording && (changed.includes('x') || changed.includes('y'))))
  )
    return regenerate()
  if (changed.some(k => !patchable.includes(k)))
    return result([
      `Hồ sơ ${run.id} dựng bằng phiên bản ${run.version}: công cụ chưa đổi được ${changed
        .filter(k => !patchable.includes(k))
        .map(dossierParamLabel)
        .join(
          ', '
        )} cho phiên bản này, và không xóa để dựng lại từ template/sơ đồ. Chưa thay đổi gì. Báo người dùng và hỏi hướng xử lý.`
    ])

  // Plan label changes before opening the transaction. An edited label must
  // not be silently overwritten by a value reconstructed from the template.
  // Both scenes with the run's own generator: a 0.1.0 dossier keeps its
  // border, a 0.2.0 one its title block.
  // A dossier drawn before P2-M6 (or before P3-M1) keeps that drawing while
  // only its labels change: both scenes as it was drawn, so nothing reads
  // as a hand edit.
  const asDrawn = acapDossierRevisionFor(run, entities)
  const before = asDrawn(() =>
    buildDossierScene(buildDossierModel({ ...run.values }), run.version)
  )
  const after = asDrawn(() =>
    buildDossierScene(buildDossierModel(values), run.version)
  )
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
          `kích thước trên ${sheet} đang ghi «${e.dimensionText}», thiết kế gốc ghi «${resolve(dim.old)}»`
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
            `thẻ cao độ trên ${sheet} đang ghi «${a.textString}», thiết kế gốc ghi «${attr.old}»`
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
        `${cell ? `ô ${cell}` : `chữ «${replacement.old}»`} trên ${place.sheet} ${now === undefined ? 'đã bị xóa' : `đang là «${now}»`}, khác số thiết kế gốc «${replacement.old}»`
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
            // A matching 0.3.0 dossier is a 0.3.1 one from now on.
            version: a3 ? DOSSIER_VERSION : tag.run!.version,
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
            version: a3 ? DOSSIER_VERSION : run.version,
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
    ...(reverted.length || (a3 && run.version !== DOSSIER_VERSION)
      ? {
          warnings: [
            ...(reverted.length
              ? [
                  `Đã đưa về thiết kế gốc (theo lựa chọn của người dùng): ${reverted.join('; ')}.`
                ]
              : []),
            ...(a3 && run.version !== DOSSIER_VERSION
              ? [upgraded(run.version)]
              : [])
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
    'Dừng lại, báo đúng các chỗ này và hỏi người dùng MỘT lần, chọn: (1) đưa các chỗ đó về thiết kế gốc rồi làm tiếp — khi đó gọi lại sua_ho_so_mo MỘT lần với cùng thông số và dua_ve_so_bo_sinh: true, công cụ tự viết lại các chỗ đó đúng kiểu ban đầu và áp thay đổi; (2) giữ số đã sửa và không đổi thông số này; (3) hủy. ' +
    'Không tự viết lại hay sửa từng chữ cao độ, kích thước của hồ sơ bằng script, kể cả để đưa về thiết kế gốc.' +
    ' Tên công cụ và cờ ở trên chỉ để gọi công cụ; khi nói với người dùng, mô tả việc sẽ làm với bản vẽ.'
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

/**
 * Two entity keys alike but for their extents, each within one unit
 * (rounding on either side of .5 after a DXF round trip).
 */
function sameLook(a: string, b: string): boolean {
  const pa = a.split('|')
  const pb = b.split('|')
  if (pa.length !== pb.length || pa[3] === pb[3]) return false
  if (pa.some((x, i) => i !== 3 && x !== pb[i])) return false
  const ba = pa[3].split(',').map(Number)
  const bb = pb[3].split(',').map(Number)
  return (
    ba.length >= 4 &&
    ba.length === bb.length &&
    ba.every((v, i) => Number.isFinite(v) && Math.abs(v - bb[i]) <= 1)
  )
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
 * {@link entityKey} for comparing by region (P2-M5), a dimension keyed by
 * its definition points, style and text instead of its extents: drawn into
 * a drawing read back from a DXF file, the same dimension measures other
 * extents than in a new database (its style's extension-line settings come
 * from the file), and would be taken for a hand edit on the next change.
 */
function regionKey(e: AcDbEntity): string {
  const r = (v: number) => Math.round(v)
  const at = (...ps: { x: number; y: number }[]) =>
    ps.flatMap(p => [r(p.x), r(p.y)]).join(',')
  if (e instanceof AcDbAlignedDimension)
    return `${e.dxfTypeName}|${e.layer}|${e.color.colorIndex ?? ''}|${at(e.xLine1Point, e.xLine2Point, e.dimLinePoint)}|${e.dimensionStyleName ?? ''}:${e.dimensionText ?? ''}`
  if (e instanceof AcDb3PointAngularDimension)
    return `${e.dxfTypeName}|${e.layer}|${e.color.colorIndex ?? ''}|${at(e.centerPoint, e.xLine1Point, e.xLine2Point, e.arcPoint)}|${e.dimensionStyleName ?? ''}:${e.dimensionText ?? ''}`
  return entityKey(e)
}

/**
 * Wording of a warning the generator writes on a sheet: `THÉP THEO M1 GỐC…`,
 * `CHƯA DỰNG ĐƯỢC…`, `BẢNG … CHƯA…`, the M1 tables caveat of SUB-100. Before
 * FIX-NOTE each was a loose red TEXT where the sheet had room (over the
 * drawing at times); a dossier drawn then still has them there.
 */
const GENERATOR_WARNING =
  /^(?:THÉP THEO M1 GỐC|CHƯA |BẢNG .*CHƯA|BẢNG THỐNG KÊ THÉP VÀ KHỐI LƯỢNG BÊN PHẢI LÀ CỦA M1 GỐC)/

/**
 * Whether an entity of a run is a warning the generator wrote (FIX-NOTE):
 * a line of a sheet's GHI CHÚ block (tagged with the block), or — drawn
 * before the block — a `ghi_chu` text reading one of the sheet's warnings
 * whole (`notes`, from the run's values) or worded as one, numbered or not.
 * Never a hand edit: such text is redrawn as the sheet's GHI CHÚ block.
 */
function isGeneratorNote(
  e: AcDbEntity,
  notes: (sheet: string) => ReadonlySet<string>
): boolean {
  const tag = readSemanticTag(e)
  if (tag?.params?.khoi === ACTP_GHI_CHU_TITLE) return true
  if (!(e instanceof AcDbText || e instanceof AcDbMText)) return false
  if (tag?.role !== 'ghi_chu') return false
  const text = plainOf(e).replace(/^\d+[.)]\s+/, '')
  return (
    notes(String(tag.params?.sheet ?? '')).has(text) ||
    GENERATOR_WARNING.test(text)
  )
}

/** Part id of the take-off of the current parameters on SUB-100. */
const TAKE_OFF_PART = /^ghi_chu_btkl_/
const isTakeOffPart = (p: { partId: string }) => TAKE_OFF_PART.test(p.partId)

/** The take-off's one-line footer as drawn before it was laid out bottom-up. */
const LEGACY_TAKE_OFF_FOOTER =
  'Đỏ: không tính (thiếu dữ liệu). Vàng: có cờ — xem diễn giải trên tờ BTKL. Không dùng để thi công.'

/**
 * Whether an entity of a run is a text of the generator's take-off table
 * (SUB-100, `ghi_chu_btkl_*`) reading what the run's values gave it
 * (`texts`), or its old one-line footer. The table follows the values and
 * the sheet's layout — it moved above the title strip (FIX-NOTE QA) — so it
 * is redrawn whole, like the GHI CHÚ block; a text of it reading anything
 * else was edited by hand.
 */
function isGeneratorTakeOff(
  e: AcDbEntity,
  texts: (sheet: string) => ReadonlySet<string>
): boolean {
  const tag = readSemanticTag(e)
  if (!tag || !TAKE_OFF_PART.test(tag.partId)) return false
  if (!(e instanceof AcDbText || e instanceof AcDbMText)) return false
  const text = plainOf(e)
  return (
    texts(String(tag.params?.sheet ?? '')).has(text) ||
    text === LEGACY_TAKE_OFF_FOOTER
  )
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
    const why = acapDossierNoteAfter(
      sheet,
      'CHƯA DỰNG ĐƯỢC HÌNH CHO BỘ THÔNG SỐ NÀY'
    )
    if (why === undefined) continue
    return result([
      `${sheet.id}: hình chiếu không theo được thông số mới — ${why} Chưa sửa gì.`
    ])
  }
  const identity = (v: AcTpParamValues) => ({
    id: run.id,
    // An A3 dossier rebuilt is a 0.3.1 one.
    version: acapIsA3Version(run.version) ? DOSSIER_VERSION : run.version,
    values: v as Record<string, number | string | boolean>
  })
  // What the run's values drew: as before P2-M6 for a dossier drawn then
  // (front pile pair 5300 apart on L1, the source fall stretched, the hDau
  // band) — so the corrections are what this change redraws, never taken
  // for hand edits; they come with it.
  // Likewise the steel of a dossier drawn before P3-M1 (the M1 steel kept
  // at the M1 size): the steel sheets this change redraws on its geometry.
  const before = acapDossierRevisionFor(
    run,
    entities
  )(() => buildDossierScene(buildDossierModel({ ...run.values }), run.version))
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
  // P2-M5: a primitive the change leaves exactly as it was (same sheet, same
  // geometry and wording) is not redrawn. Matched as a multiset, sheet by
  // sheet: what is left over on either side is what the change redraws.
  const keptBefore = new Set<string>()
  const keptAfter = new Set<string>()
  for (const sheet of before.sheets) {
    const next = after.sheets.find(s => s.id === sheet.id)
    if (!next) continue
    const pool = new Map<string, number[]>()
    next.primitives.forEach((p, i) => {
      const k = JSON.stringify(p)
      pool.set(k, [...(pool.get(k) ?? []), i])
    })
    sheet.primitives.forEach((p, i) => {
      const twin = pool.get(JSON.stringify(p))?.shift()
      if (twin === undefined) return
      keptBefore.add(`${sheet.id}#${i}`)
      keptAfter.add(`${sheet.id}#${twin}`)
    })
  }
  // FIX-NOTE: the generator's warnings — a GHI CHÚ block, or loose texts
  // in a dossier drawn before it — are always erased and drawn anew as the
  // block of the new values, whatever the change: never taken for hand
  // edits, never kept over the drawing. A note the user added is not the
  // run's and stays.
  const beforeNotes = new Map(
    before.sheets.map(s => [s.id, new Set(acapDossierSheetNotes(s))])
  )
  const noNotes: ReadonlySet<string> = new Set()
  const generatorNotes = entities.filter(e =>
    isGeneratorNote(e, sheet => beforeNotes.get(sheet) ?? noNotes)
  )
  // The take-off table of SUB-100 likewise: erased and drawn anew whole.
  const beforeTakeOff = new Map(
    before.sheets.map(s => [
      s.id,
      new Set(
        s.primitives.flatMap(p =>
          p.kind === 'text' && TAKE_OFF_PART.test(p.partId) ? [p.text] : []
        )
      )
    ])
  )
  const generatorTakeOff = entities.filter(e =>
    isGeneratorTakeOff(e, sheet => beforeTakeOff.get(sheet) ?? noNotes)
  )
  const noteSet = new Set([...generatorNotes, ...generatorTakeOff])
  // A text of the table that reads otherwise was edited by hand (before
  // FIX-NOTE the M1 tables caveat was drawn with the table: a note, above).
  const editedTakeOff = entities.filter(
    e => TAKE_OFF_PART.test(readSemanticTag(e)?.partId ?? '') && !noteSet.has(e)
  ).length
  const body = entities.filter(e => !noteSet.has(e))
  const isBlockLine = (scene: DossierScene, sheet: string, i: number) => {
    const p = scene.sheets.find(s => s.id === sheet)?.primitives[i]
    return p !== undefined && (p.note !== undefined || isTakeOffPart(p))
  }
  const scratch = new AcDbDatabase()
  scratch.createDefaultData()
  // What the run's values draw, split into what the change redraws and what
  // it keeps — each entity keyed by what it looks like.
  const redrawnKeys: string[] = []
  const keptKeys: string[] = []
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
      before,
      (sheet, i, drawn) => {
        // The GHI CHÚ block and the take-off are matched apart
        // (generatorNotes, generatorTakeOff).
        if (isBlockLine(before, sheet, i)) return
        ;(keptBefore.has(`${sheet}#${i}`) ? keptKeys : redrawnKeys).push(
          ...drawn
            .filter(e => readSemanticTag(e)?.run?.id === run.id)
            .map(regionKey)
        )
      }
    )
  )
  const expected = entitiesOfRun(scratch, run.id)
    .filter(
      e =>
        readSemanticTag(e)?.params?.khoi !== ACTP_GHI_CHU_TITLE &&
        !TAKE_OFF_PART.test(readSemanticTag(e)?.partId ?? '')
    )
    .map(entityKey)
    .sort()
  const actual = body.map(entityKey).sort()
  const full =
    // The user chose to drop the hand edits, or to unlock an older
    // dossier: the run is drawn again from its values, as a whole.
    options.revertHandEdits ||
    options.unlock031 ||
    // An older generator's drawing, or one the per-primitive split cannot
    // account for, is only rebuilt whole — and only when untouched.
    run.version !== DOSSIER_VERSION ||
    redrawnKeys.length + keptKeys.length !== expected.length
  if (full) {
    if (
      JSON.stringify(expected) !== JSON.stringify(actual) &&
      !options.revertHandEdits &&
      !options.unlock031
    ) {
      const missing = expected.filter(k => !actual.includes(k)).length
      const extra = actual.filter(k => !expected.includes(k)).length
      return result([
        handEditedRun(
          run.id,
          `${missing} đối tượng khác hoặc thiếu, ${extra} đối tượng lạ so với bản dựng từ thông số`
        )
      ])
    }
    let removed = 0
    let drawn = 0
    await acapRunGroupedEdit(
      db,
      'Dựng lại hồ sơ theo thông số mới',
      async () => {
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
      }
    )
    return finish(removed, drawn, [])
  }
  // Each entity of the run: one the change redraws (erased, drawn anew), one
  // it keeps (left where it is, whether or not it was moved by hand), or one
  // the generator never drew there — moved, edited or copied by hand: kept.
  const pool = (keys: string[]) => {
    const m = new Map<string, number>()
    for (const k of keys) m.set(k, (m.get(k) ?? 0) + 1)
    return m
  }
  const take = (m: Map<string, number>, k: string) => {
    const left = m.get(k) ?? 0
    if (left) m.set(k, left - 1)
    return left > 0
  }
  const toRedraw = pool(redrawnKeys)
  const toKeep = pool(keptKeys)
  const erase: AcDbEntity[] = []
  const keep: AcDbEntity[] = []
  const extra: AcDbEntity[] = []
  const odd: AcDbEntity[] = []
  for (const e of body) {
    const k = regionKey(e)
    if (take(toRedraw, k)) erase.push(e)
    else if (take(toKeep, k)) keep.push(e)
    else odd.push(e)
  }
  // Read back from a DXF file, a box on a .5 boundary rounds the other way:
  // the same entity, one unit off — not a hand edit.
  for (const e of odd) {
    const k = regionKey(e)
    const twin = (m: Map<string, number>) =>
      [...m].find(([c, n]) => n > 0 && sameLook(c, k))?.[0]
    const r = twin(toRedraw)
    const kk = r === undefined ? twin(toKeep) : undefined
    if (r !== undefined && take(toRedraw, r)) erase.push(e)
    else if (kk !== undefined && take(toKeep, kk)) keep.push(e)
    else extra.push(e)
  }
  const sum = (m: Map<string, number>) =>
    [...m.values()].reduce((a, b) => a + b, 0)
  const redrawnSet = new Set(redrawnKeys)
  // Gone from where the generator drew it and the change would redraw it —
  // or could be (the same look among what is redrawn): a hand edit in the
  // region of the change. Refused, as before P2-M5.
  const inRegion =
    sum(toRedraw) +
    [...toKeep].filter(([k, n]) => n > 0 && redrawnSet.has(k)).length +
    editedTakeOff
  // A generated text now reading another value in its place is an edited
  // label: never kept silently under a change (the label rule), wherever it is.
  const labels: string[] = []
  for (const [k, n] of toKeep) {
    if (!n || !k.startsWith('TEXT|')) continue
    const box = k.split('|')[3]?.split(',').map(Number)
    if (!box || box.length !== 4) continue
    const said = k.slice(k.lastIndexOf('|') + 1)
    // Read back from a file, a text may key differently and say the same.
    const edited = extra.find(e => {
      if (!(e instanceof AcDbText || e instanceof AcDbMText)) return false
      if (sameLabel(plainOf(e), said)) return false
      const p = positionOf(e)
      return (
        p.x >= box[0] - 1 &&
        p.x <= box[2] + 1 &&
        p.y >= box[1] - 1 &&
        p.y <= box[3] + 1
      )
    })
    if (edited)
      labels.push(
        `chữ trên ${String(readSemanticTag(edited)?.params?.sheet ?? '')} đang là «${plainOf(edited)}», thiết kế gốc ghi «${said}»`
      )
  }
  if (inRegion || labels.length)
    return result([
      handEditedRun(
        run.id,
        [
          ...(inRegion
            ? [
                `${inRegion} đối tượng do công cụ vẽ đã dời, sửa hoặc xóa trong vùng mà lần sửa này vẽ lại`
              ]
            : []),
          ...labels.slice(0, 6)
        ].join('; ')
      )
    ])
  const changed = Object.keys(values).filter(k => values[k] !== run.values[k])
  let removed = 0
  let drawn = 0
  let added: AcDbEntity[] = []
  await acapRunGroupedEdit(
    db,
    'Sửa hồ sơ theo thông số mới, giữ phần không đổi',
    async () => {
      for (const entity of [...erase, ...noteSet])
        if (entity.erase()) removed += 1
      // What stays carries the new values, as if drawn with them.
      for (const original of [...keep, ...extra]) {
        const entity = db.openEntityForWrite(original)!
        const tag = readSemanticTag(entity)!
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
            version: DOSSIER_VERSION,
            values: values as Record<string, number | string | boolean>
          }
        })
      }
      const ctx = createDrawContext(
        db,
        DOSSIER_ID,
        roleLayers(),
        identity(values),
        layerStyles(),
        { legacyLayers: legacyLayers() }
      )
      drawDossierScene(ctx, {
        ...after,
        sheets: after.sheets.map(sheet => ({
          ...sheet,
          primitives: sheet.primitives.filter(
            (p, i) =>
              p.note !== undefined ||
              isTakeOffPart(p) ||
              !keptAfter.has(`${sheet.id}#${i}`)
          )
        }))
      })
      drawn = ctx.drawn.length
      added = [...ctx.drawn]
    }
  )
  const notes: string[] = []
  const handMoved = sum(toKeep)
  if (handMoved || extra.length)
    notes.push(
      `Giữ nguyên phần đã sửa tay ngoài vùng đổi (${handMoved ? `${handMoved} đối tượng do công cụ vẽ đã dời/xóa` : ''}${handMoved && extra.length ? ', ' : ''}${extra.length ? `${extra.length} đối tượng ở chỗ mới hoặc thêm` : ''}); chỉ vẽ lại phần thông số làm đổi.`
    )
  const crowded = userEntitiesOver(db, added)
  if (crowded)
    notes.push(
      `${crowded} đối tượng người dùng thêm (không thuộc hồ sơ) nằm chồng lên phần vừa vẽ lại; giữ nguyên, không xóa — nhờ người dùng xem lại chỗ đó.`
    )
  return finish(removed, entities.length - removed + drawn, notes)

  function finish(
    removed: number,
    entityCount: number,
    notes: string[]
  ): AcApRunEditResult {
    // Sheets that could not follow the values say so on the sheet; the tool
    // reports them too.
    // Static steel / M1-schedule caveats stay on the sheet and are said
    // on create or describe, not after every edit (P2-M6c). Still report
    // sheets that could not be drawn, and a table of elevations that
    // could not be computed.
    // Read from the sheet's GHI CHÚ block, each note whole however wrapped.
    const warnings = after.sheets.flatMap(s =>
      acapDossierSheetNotes(s)
        .filter(
          t =>
            /^(CHƯA|BẢNG .*CHƯA|THÉP THEO M1 GỐC)/.test(t) &&
            !/THÉP THEO M1 GỐC|BẢNG THỐNG KÊ THÉP VÀ KHỐI LƯỢNG/.test(t)
        )
        .map(t => `${s.id}: ${t}`)
    )
    warnings.push(...notes)
    if (acapIsA3Version(run.version) && run.version !== DOSSIER_VERSION)
      warnings.push(upgraded(run.version))
    return {
      ...result([]),
      removed,
      entityCount,
      ...(warnings.length ? { warnings } : {})
    }
  }
}

/**
 * Entities drawn by the user, outside every run, whose extents overlap what
 * was just drawn (frame lines aside): kept, but worth a look.
 */
function userEntitiesOver(db: AcDbDatabase, drawn: AcDbEntity[]): number {
  const boxes = drawn
    .filter(e => !FRAME_ROLES.has(readSemanticTag(e)?.role ?? ''))
    .flatMap(e => {
      const b = extentsOf(e)
      return b ? [b] : []
    })
  if (!boxes.length) return 0
  let count = 0
  for (const e of db.tables.blockTable.modelSpace.newIterator()) {
    if (readSemanticTag(e)?.run) continue
    const b = extentsOf(e)
    if (
      b &&
      boxes.some(
        o => b[0] <= o[2] && b[2] >= o[0] && b[1] <= o[3] && b[3] >= o[1]
      )
    )
      count += 1
  }
  return count
}

function extentsOf(
  e: AcDbEntity
): [number, number, number, number] | undefined {
  try {
    const b = e.geometricExtents
    return Number.isFinite(b.min.x)
      ? [b.min.x, b.min.y, b.max.x, b.max.y]
      : undefined
  } catch {
    return undefined
  }
}

/**
 * The refusal when the change would redraw what was edited by hand: nothing
 * changes, the user is asked once (keep, put back with dua_ve_so_bo_sinh,
 * cancel). Outside that region hand edits are kept (P2-M5).
 */
function handEditedRun(runId: string, what: string): string {
  return `Hồ sơ ${runId} đã được sửa tay (${what}); không dựng lại để giữ phần đã sửa, chưa sửa gì. Dừng lại và hỏi người dùng MỘT lần: giữ bản vẽ đã sửa (không đổi thông số), hay bỏ các sửa tay để dựng lại — khi đó gọi lại sua_ho_so_mo MỘT lần với cùng thông số và dua_ve_so_bo_sinh: true. Không tự sửa từng chữ cao độ hay kích thước bằng script. Tên công cụ và cờ ở trên chỉ để gọi công cụ; khi nói với người dùng, mô tả việc sẽ làm với bản vẽ.`
}

const upgraded = (version: string) =>
  `Hồ sơ dựng bằng phiên bản ${version} đã chuyển lên phiên bản ${DOSSIER_VERSION}.`

/** Key of a drawn entity, its text read without formatting. */
function plainKey(e: AcDbEntity): string {
  const key = entityKey(e)
  return e instanceof AcDbText
    ? key.slice(0, key.lastIndexOf('|') + 1) + acapPlainLabel(e.textString)
    : key
}

/**
 * How an older dossier's drawing differs from what today's generator draws
 * from its stored values. A text at a generated place reading another value
 * is a hand edit (`valueEdits`); a text holding the right value in another
 * entity is neither; everything else — colours, layers, entities missing or
 * added, a notice sheet instead of the drawing — is generator drift.
 */
function compareWithGenerator(
  db: AcDbDatabase,
  run: ReturnType<typeof listRuns>[number],
  entities: AcDbEntity[]
): { drift: number; valueEdits: string[] } {
  let best = driftFrom(db, run, entities, REVISIONS[0])
  // Drawn before P3-M1 or P2-M6 and untouched since: no drift either.
  for (const revision of REVISIONS.slice(1)) {
    if (!best.drift) break
    const old = driftFrom(db, run, entities, revision)
    if (old.drift < best.drift) best = old
  }
  return best
}

/** {@link compareWithGenerator} against one generator revision. */
function driftFrom(
  db: AcDbDatabase,
  run: ReturnType<typeof listRuns>[number],
  entities: AcDbEntity[],
  revision: Revision
): { drift: number; valueEdits: string[] } {
  const scene = revision(() =>
    buildDossierScene(buildDossierModel({ ...run.values }), DOSSIER_VERSION)
  )
  const scratch = new AcDbDatabase()
  scratch.createDefaultData()
  acTpWithWorkingDatabaseSync(scratch, () =>
    drawDossierScene(
      createDrawContext(
        scratch,
        DOSSIER_ID,
        roleLayers(),
        {
          id: run.id,
          version: DOSSIER_VERSION,
          values: run.values as Record<string, number | string | boolean>
        },
        layerStyles(),
        { legacyLayers: legacyLayers() }
      ),
      scene
    )
  )
  const left = new Map<string, AcDbEntity[]>()
  for (const e of entities) {
    const k = plainKey(e)
    left.set(k, [...(left.get(k) ?? []), e])
  }
  const missing: AcDbEntity[] = []
  for (const e of entitiesOfRun(scratch, run.id)) {
    const same = left.get(plainKey(e))
    if (same?.length) same.pop()
    else missing.push(e)
  }
  const extra = [...left.values()].flat()
  const extraTexts: AcDbEntity[] = extra.filter(
    e => e instanceof AcDbText || e instanceof AcDbMText
  )
  let drift = extra.length - extraTexts.length
  const valueEdits: string[] = []
  const inRun = new Set(entities.map(e => e.objectId))
  for (const m of missing) {
    if (!(m instanceof AcDbText)) {
      drift += 1
      continue
    }
    const place = {
      at: [m.position.x, m.position.y] as XY,
      height: m.height
    }
    const there =
      extraTexts.find(e => near(positionOf(e), place, 1.5)) ??
      textEntityAt(db, place, e => !inRun.has(e.objectId))
    if (!there) {
      drift += 1
      continue
    }
    const i = extraTexts.indexOf(there)
    if (i >= 0) extraTexts.splice(i, 1)
    if (!sameLabel(plainOf(there), m.textString))
      valueEdits.push(
        `chữ trên ${String(readSemanticTag(m)?.params?.sheet ?? '')} đang là «${plainOf(there)}», thiết kế gốc ghi «${m.textString}»`
      )
    // The right value in a Text of another colour or layer: an old style.
    else if (
      there instanceof AcDbText &&
      (there.color.colorIndex !== m.color.colorIndex || there.layer !== m.layer)
    )
      drift += 1
  }
  return { drift: drift + extraTexts.length, valueEdits }
}

/** Builds as one revision of the generator (see {@link REVISIONS}). */
type Revision = <T>(build: () => T) => T

/**
 * Revisions of the 0.3.1 drawing, newest first: today's; the steel before
 * P3-M1 (`acTpWithPreP3Steel`: the M1 steel kept at the M1 size for a
 * changed geometry); the geometry before P2-M6 (`legacy` in grid030, with
 * that steel too).
 */
const REVISIONS: Revision[] = [
  build => build(),
  acTpWithPreP3Steel,
  acTpWithLegacyDossierGeometry
]

/**
 * The generator revision an A3 dossier's drawing was built with: its values
 * draw differently then and now (an L1 road, a flush 2 × 2 off the source
 * spacing, hDau changed; any changed geometry for the steel before P3-M1),
 * and more of its entities match that drawing. Untouched or hand-edited
 * alike, the closest drawing is the one it was built with; ties go to the
 * newer revision.
 */
function acapDossierRevisionFor(
  run: ReturnType<typeof listRuns>[number],
  entities: AcDbEntity[]
): Revision {
  if (!acapIsA3Version(run.version)) return REVISIONS[0]
  const build = () =>
    buildDossierScene(buildDossierModel({ ...run.values }), run.version)
  const scenes: { revision: Revision; scene: DossierScene }[] = []
  for (const revision of REVISIONS) {
    let scene: DossierScene
    try {
      scene = revision(build)
    } catch {
      continue
    }
    const key = JSON.stringify(scene)
    if (!scenes.some(x => JSON.stringify(x.scene) === key))
      scenes.push({ revision, scene })
  }
  if (scenes.length < 2) return REVISIONS[0]
  const actual = new Map<string, number>()
  for (const e of entities) {
    const k = regionKey(e)
    actual.set(k, (actual.get(k) ?? 0) + 1)
  }
  const matches = (scene: DossierScene) => {
    const scratch = new AcDbDatabase()
    scratch.createDefaultData()
    acTpWithWorkingDatabaseSync(scratch, () =>
      drawDossierScene(
        createDrawContext(
          scratch,
          DOSSIER_ID,
          roleLayers(),
          {
            id: run.id,
            version: DOSSIER_VERSION,
            values: run.values as Record<string, number | string | boolean>
          },
          layerStyles(),
          { legacyLayers: legacyLayers() }
        ),
        scene
      )
    )
    const left = new Map(actual)
    let hits = 0
    for (const e of entitiesOfRun(scratch, run.id)) {
      const k = regionKey(e)
      const n = left.get(k) ?? 0
      if (n > 0) {
        left.set(k, n - 1)
        hits += 1
      }
    }
    return hits
  }
  let best = scenes[0]
  let most = matches(best.scene)
  for (const x of scenes.slice(1)) {
    const hits = matches(x.scene)
    if (hits > most) {
      best = x
      most = hits
    }
  }
  return best.revision
}

/** The refusal for an older dossier that no longer matches the generator. */
function unlockMessage(
  run: ReturnType<typeof listRuns>[number],
  drift: { drift: number; valueEdits: string[] }
): string {
  const edits = drift.valueEdits.length
    ? ` Ngoài ra có chữ đã sửa tay: ${drift.valueEdits.slice(0, 6).join('; ')}${drift.valueEdits.length > 6 ? ` và ${drift.valueEdits.length - 6} chỗ khác` : ''} — mở khóa sẽ mất các số sửa tay này.`
    : ''
  return (
    `Hồ sơ ${run.id} dựng bằng phiên bản ${run.version}; bản vẽ không còn khớp phiên bản ${DOSSIER_VERSION} (khoảng ${drift.drift} đối tượng khác: màu, kiểu chữ, chỗ đặt, nhãn phiên bản mới thêm, hoặc tờ thông báo cũ), nên chưa sửa được và chưa đụng gì.${edits} ` +
    `Đường mở khóa: giải thích cho người dùng và hỏi xác nhận dựng lại hồ sơ theo phiên bản ${DOSSIER_VERSION} từ đúng thông số đã lưu (chữ, hình vẽ thêm và mọi số sửa tay trên hồ sơ sẽ mất). Người dùng đồng ý thì gọi lại sua_ho_so_mo MỘT lần với cùng thông số và mo_khoa_031: true — công cụ dựng lại và áp thay đổi trong cùng lần. ` +
    'Chưa xác nhận thì không đụng gì; không sửa bằng script, không dùng tao_ho_so_mo thay thế.' +
    ' Tên công cụ và cờ ở trên chỉ để gọi công cụ; khi nói với người dùng, mô tả việc sẽ làm với bản vẽ.'
  )
}
