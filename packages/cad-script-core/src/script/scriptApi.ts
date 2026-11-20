/**
 * Window key holding DXF payloads for the MCP Node host to write.
 * Lives here so Node hosts can import it from `script-api` without loading data-model.
 */
export const CAD_MCP_DXF_OUTBOX_KEY = '__cadMcpDxfOutbox'

/**
 * Host member tree enforced by the script validator and the runtime proxy.
 *
 * A value of `true` is a callable method or a data leaf. Nested objects are
 * namespaces. Access past a data leaf is ordinary JavaScript on the returned
 * value (array `.map`, snapshot fields, and so on).
 */
export const CAD_SCRIPT_API_TREE = {
  drawing: {
    title: true,
    currentLayer: true,
    units: true,
    layers: true,
    extents: true
  },
  entities: {
    where: true,
    byId: true,
    grips: true,
    inBox: true
  },
  tables: {
    appIdTable: true,
    blockTable: true,
    dimStyleTable: true,
    linetypeTable: true,
    textStyleTable: true,
    ucsTable: true,
    viewTable: true,
    layerTable: true,
    viewportTable: true
  },
  blocks: true,
  selection: {
    ids: true,
    entities: true,
    replace: true,
    add: true,
    remove: true,
    clear: true
  },
  view: {
    zoomExtents: true,
    capturePreview: true
  },
  file: {
    saveDxf: true
  },
  measure: {
    distance: true,
    angleDeg: true,
    deltaAngleDeg: true,
    center: true,
    radius: true,
    length: true,
    check: true,
    report: true
  },
  edit: {
    transaction: true
  },
  log: true,
  __tick: true
} as const

/**
 * Methods available on the object passed to `cad.edit.transaction`.
 */
export const CAD_EDIT_TX_METHODS = [
  'drawLine',
  'drawCircle',
  'drawArc',
  'drawRectangle',
  'drawPolyline',
  'drawEllipse',
  'drawHatch',
  'drawPoint',
  'drawRay',
  'drawXline',
  'drawSpline',
  'drawText',
  'erase',
  'setLayer',
  'setStyle',
  'setText',
  'moveGrips',
  'move',
  'rotate',
  'createLayer',
  'setCurrentLayer'
] as const

/**
 * Compact API reference shared by the chat system prompt and the script tool.
 *
 * Adapters must embed this string instead of maintaining a second copy.
 */
export const CAD_SCRIPT_API_SUMMARY = `execute_cad_script({ code, intent? }) is the only chat tool.
- code (required): JavaScript function body with one argument, cad. Must be non-empty.
- intent (optional): short label only. Never call with intent alone — that draws nothing.
Emit the code field first in the tool arguments JSON (before intent). Keep each script
modest in size; for complex / figurative drawings, use successive short calls (body parts,
clothes, hair, details) instead of one huge script.
Prefer it for ALL drawing, queries, statistics, batch edits, selection highlighting, and
reading drawing context (cad.drawing). Do not expect draw_* or get_drawing_context tools.
The body may return JSON. Do not import modules or touch the page.

cad.drawing -> { title, currentLayer, units, layers: [{ name, isOn, isFrozen, isLocked }], extents }
cad.entities lists every entity in the database (model space, paper space, and block definitions, plus attributes on inserts).
cad.entities.where(predicate) -> snapshots { id, ownerId, type, layer, style: { color, lineType, linetypeScale }, extents, geometry }
cad.entities.byId(id) -> snapshot or undefined
cad.entities.grips(id) -> native editable grip points [{x,y,z}], indexed from 0.
cad.entities.inBox(min, max) -> snapshots whose extents hit a WCS box
cad.tables mirrors AcDbDatabase.tables: appIdTable, blockTable, dimStyleTable, linetypeTable, textStyleTable, ucsTable, viewTable, layerTable, viewportTable.
Each table is { id, records: [{ id, name, ...fields }] }.
cad.blocks -> block definitions like a DXF BLOCKS section: { id, name, origin, isModelSpace, isPaperSpace, flags, pathName, isXref, entities }.
ownerId on an entity snapshot is the owning block id, or the insert id for an attribute.
cad.selection.ids -> selected entity ids
cad.selection.entities -> snapshots of the current selection
cad.selection.replace(ids) / add(ids) / remove(ids) / clear()
cad.view.zoomExtents()
cad.file.saveDxf(path?) writes the current drawing as DXF after the script succeeds.
Pass a path string or { path?, fileName? }. .dxf is appended when missing.
In the in-app agent this downloads the file. In cad-mcp-server it writes path
on disk (relative paths use the server process cwd). The DXF text is not
returned to the model. Returns { queued: true, index, fileName }.
The tool result then includes savedFiles: [{ path, fileName, bytes, delivery }].
cad.view.capturePreview({ longSide? }) queues a PNG of drawing extents after the script
finishes. Returns { queued: true, index }. Images are attached to the tool result for the
model (not returned as JSON). Capture frames model space (temporarily switches away from
paper space if needed). Only for High inference / when screenshots are enabled — prefer
cad.measure for self-check; do not use capturePreview in Simple mode.
cad.measure — prefer for numeric self-check (saves tokens vs hand-rolled Math):
  distance(a, b) -> number
  angleDeg(a, b) -> bearing a→b deg (-180,180]; angleDeg(a, b, c) -> interior angle at b [0,180]
  deltaAngleDeg(fromDeg, toDeg) -> smallest |Δ| in [0,180]
  center(id) / radius(id) / length(id) -> from entity geometry, or undefined
  check(name, expected, actual, tolerance=1e-3) -> { name, expected, actual, pass }
  report(checks) -> { ok, checks }  (ok iff every pass)
After non-trivial draws, return measure.report([...]) (optionally spread with entityIds).
Example:
const o = { x: 0, y: 0 }
const id = /* from tx.drawCircle */
const c = cad.measure.center(id)
return cad.measure.report([
  cad.measure.check('r', 10, cad.measure.radius(id)),
  cad.measure.check('pcd', 57, cad.measure.distance(o, c), 0.01)
])
cad.log(...values)
cad.edit.transaction(label, tx => { ... }) performs one undo group.
tx draw methods: drawLine, drawCircle, drawArc, drawRectangle, drawPolyline, drawEllipse,
drawHatch, drawPoint, drawRay, drawXline, drawSpline, drawText.
tx edit methods: erase(ids), setLayer(ids, layer), move(ids, dx, dy), rotate(ids, center, angleDeg),
createLayer(name), setCurrentLayer(name).
tx.setStyle(ids, { color?, lineType?, linetypeScale? }) changes presentation.
color: ACI 1–255, 256=ByLayer. lineType: existing table name or CENTER, DASHED,
HIDDEN, DASHDOT (created if absent). Continuous and ByLayer use existing table names.
linetypeScale: positive scale multiplying the pattern in drawing units and global LTSCALE.
Choose scale to make dashes readable at drawing extents/print scale. Locked layers are skipped.
Example: tx.setStyle([leaderId, noteId], { color: 3 });
tx.setStyle([axisId], { color: 1, lineType: 'CENTER', linetypeScale: 100 });
tx.setText(id, text) updates Text, MText or Attribute content in place. It preserves
the handle, layer, font, alignment, rotation, width and all unrelated geometry.
tx.moveGrips(id, indices, dx, dy) moves native grip points in WCS, preserving curves,
hatch loops, block identity and other entity properties. Read cad.entities.grips(id)
first; grip meaning depends on entity type. Locked/missing/unsupported entities and
invalid indices are refused. Use tx.move for moving a whole entity.
For edits, inspect the selection/current drawing and update exact entity ids.
Preserve existing detail: do not erase a whole drawing or recreate it from templates
for a local change. tx.erase refuses entities of a template run (dossier sheets, generated
parts) and rolls the transaction back; change a run with its own tool, and pass
choPhepXoaHoSo: true only when the user explicitly asked to delete those entities.
The result's audit counts what was erased/changed and which runs were touched.
Scope model-space edits by ownerId; block-definition edits affect
all inserts. Check connected geometry, hatches and dimensions after a grip change.
Do not replace measured dimension labels with made-up text or report a global design
change after only editing one view. cad.file.saveDxf exports the actual edited database.
tx draw methods return the new entity id. Prefer one transaction for related geometry.
Snapshots cover every data-model entity type. Common geometry:
Circle { center, radius }, Line { start, end }, Arc { center, radius, startAngle, endAngle } in radians,
Ellipse { center, majorRadius, minorRadius }, Polyline / 2dPolyline / 3dPolyline { points, closed },
Spline { points, closed }, Text / MText / Attribute { position, text, height },
Insert { name, position, rotation, scale }, Hatch { patternName, patternScale, boundary },
Dimension { text, measurement, textPosition, styleName } plus definition points.

Example: draw a circle, zoom, and verify with measure (preferred in Simple mode).
let circleId
cad.edit.transaction('draw circle', tx => {
  circleId = tx.drawCircle({ center: { x: 0, y: 0 }, radius: 100 })
})
cad.view.zoomExtents()
return cad.measure.report([
  cad.measure.check('r', 100, cad.measure.radius(circleId))
])

Example: count circles per layer and highlight every entity on the busiest layer.
const counts = {}
for (const e of cad.entities.where(e => e.type === 'Circle')) {
  counts[e.layer] = (counts[e.layer] || 0) + 1
}
let top = ''
let max = -1
for (const [layer, count] of Object.entries(counts)) {
  if (count > max) { max = count; top = layer }
}
const ids = cad.entities.where(e => e.layer === top).map(e => e.id)
cad.selection.replace(ids)
return { counts, highlightLayer: top, count: max }`
