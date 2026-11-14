# Hồ sơ mố từ prompt

`ho_so_mo_m1` 0.3.0 is a **draft dossier generator** that rebuilds
`assets/02. BTC- mo_2.dwg`: six A3 sheets at 1:100, numbered as the source
(SUB-010 … SUB-100), drawn with real CAD entities. It is available in the `template` dialog without
uploading a library module. Existing office templates remain available.

The CAD agent exposes four tools:

| Tool | Behavior |
| --- | --- |
| `tao_ho_so_mo` | Build six sheets from validated design parameters. Refuse a second dossier with the same abutment name. |
| `sua_ho_so_mo` | Labels/placement/title block are patched in place. For a 0.3.0 run, dimension changes regenerate the run through the stretch grid — only if the drawing has no hand edits and the general arrangement can follow; otherwise refused with nothing changed. |
| `kiem_tra_ho_so` | Report elevations, pile/bearing counts, source conflicts and missing design information. |
| `xuat_ho_so_mo` | Download draft PDF, self-contained HTML, DXF, or a JSON scene. |

Example prompts:

> Dựng bộ hồ sơ mố M1 theo mẫu BTC mo_2, bệ 7700 × 6000 × 2000 mm,
> bốn cọc D1200, dốc ngang 2%, cao độ đáy bệ 228,837 m.

> Đổi rộng bệ M1 thành 8500 mm, giữ rộng thân và khoảng cách cọc.

> Kiểm tra các mục còn thiếu của M1 rồi xuất PDF và DXF bản nháp.

Lengths are **mm**, elevations **m**, slopes **percent**. Positive cross slope
raises the left chainage side, which appears on the right in the front view.
`lCanh`/the reference's `Lc` is wing-wall length; `lCoc` is actual pile length.
`lCoc=0` means unknown, not a zero-length designed pile.

## 0.3.0: A3 sheets as the source, stretch grid

- **Sheets.** SUB-010 (general arrangement 1/2), SUB-020 (section C–C,
  elevation and dimension tables), SUB-070/080/090 (reinforcement),
  SUB-100 (bar shapes, bar schedule, quantities). Each viewport drawing is
  the source's own entities (`reference/layout-mo2.json`, extracted by
  `tools/fidelity/extract-layout.mjs`): dimensions in `_33_` styles, hatches,
  blocks with attributes, leaders. The OLE tables are redrawn as lines and
  texts from their presentation picture (`tools/fidelity/ole.mjs`).
- **Parameters** (`src/dossier/grid030.ts`). Grid lines tied to the design
  (footing edges, stem faces, pile edges, footing top, wall top, wing end)
  move with `hBe`, `hLot`, `lBe`, `muiBe`, `tThan`, `hThan`, `hDau`,
  `lCanh`, `D` and `bBe` (with `bThan = bBe`, `aCocNgang = bBe − 2D`,
  `aCocDoc = lBe − 2D`, as the source draws them). Points are interpolated
  between lines; at the defaults nothing moves. Views that grow push their
  neighbours to keep the source gaps; a sheet that would leave the A3 frame
  is refused. The SUB-020 tables follow the dimensions and elevation tags
  they name. Pile layout, `bThan ≠ bBe`, `phuLot`, `tCanh`, slopes, railing
  and bearings are refused.
- **Steel.** Reinforcement sheets and the bar schedule apply only to the
  source abutment: any geometric change shows "chưa có phương án thép".
  `caoDoDayBe` changes elevations only.
- **Edits** (decision Q6). A dimension change redraws the run into a scratch
  database from its recorded values and compares entity by entity; any
  difference means hand edits and the change is refused.

## Title block (0.2.0) and older runs

Every sheet carries the office title block (`khung tên` A1, from
`acTpBuildDrawingFrame` in the template SDK): project, structure, sheet title,
sheet number (`M1-BC01`), sheet n/6, scale, date, stage, design office and
the four signature rows. The title-block parameters (`duAn`, `donVi`,
`nguoiChuTri`, `nguoiThietKe`, `nguoiKiemTra`, `nguoiDuyet`, `ngay`) may be
blank, are not design parameters, and never switch the dossier off its
source drawing. Editing them with `sua_ho_so_mo` patches the frame text in
place, or redraws only the frame when its layout changes (a blank cell filled,
a title wrapping); a frame edited by hand is never overwritten.

A run records the generator version that made it. Runs made with 0.2.0 keep
their A1 sheets and title block, and runs made with 0.1.0 keep
their original border, on every path — regeneration, label edits, PDF/HTML/DXF
export — because the 0.1.0 generator is still bundled (found by exact
version, never offered for new dossiers). Title-block fields are refused for
those runs: they have no title block.

The same layout is available on its own as the bundled template
`khung_ban_ve` (A3/A1, any scale 1:n) for any drawing.

## Implementation

- `src/dossier/model.ts`: parameter declarations, normalization, cross-field
  constraints, common elevations, pile grid and preliminary geometric quantities.
- `src/dossier/scene.ts`: a pure six-sheet scene shared by CAD and exports.
- `src/dossier/template.ts`: existing template/parameter UI integration.
- `src/dossier/tools.ts`: agent create/edit/check/export operations.
- `src/dossier/export.ts`: SVG/HTML, isolated DXF regeneration and downloads.
- `src/dossier/reference/`: 69 extracted bar rows and three reinforcement panels.
  The linework snapshot records the source DWG SHA-256 and source entity handles.
- `@mlightcad/cad-pdf-plugin`: sequential 200 dpi SVG rasterization into a
  six-page PDF at the sheets' paper size (A3 from 0.3.0, A1 before),
  preserving Vietnamese glyphs. DXF is the editable master.

All CAD objects carry semantic XData, sheet ID, run ID, generator version and
the full input parameters. DXF round trips preserve the ability to regenerate.
Sheet origins use world coordinates, independently of the active working datum.
Creation/replacement is one undo operation; a replacement failing inside an AI
turn rolls back its transaction, preserving the preceding dossier.

Exports regenerate **only the selected dossier from its recorded parameters**.
They do not include unrelated drawings or manual canvas edits. They do not
modify the active database. HTML opens offline and prints as six pages at
the sheets' paper size.

## Applicability and outstanding engineering work

Every sheet and every output remains **BẢN NHÁP — CHƯA PHÁT HÀNH THI CÔNG**.
The template generates general-arrangement geometry from the common model;
small details such as bearing outlines and railing profiles are schematic.
It does not calculate structural capacity or design pile lengths/reinforcement.

Reference reinforcement is reused only at the reference geometry. Changing a
geometric parameter removes the reference reinforcement panels and schedule,
and replaces them with explicit requests for an applicable reinforcement design.
Names, sheet origins and a uniform elevation change do not alter applicability.
Actual pile length may be supplied for a preliminary cylinder volume; pile
reinforcement is not inferred.

The source contains unresolved discrepancies: blinding C8/C10, F3 D22/D25,
W16/W16′ D14/D16, and heights differing between views and tables. Defaults keep
these unresolved. Selecting D25 for F3 or D14 for W16 requires a new fabrication
plan; existing cut lengths are not silently reused for those choices.

The three reinforcement panels are **reference linework**, not an editable
bar-placement model. Arcs are sampled; fills and text rotations are not copied.
The bar schedule computes masses from source counts, cut lengths and kg/m; it
does not infer bending corrections from leg lengths. Source quantities are
labelled for comparison, and never presented as calculated quantities of a
changed model. Bệ/lót/thân/cọc volumes are preliminary geometric values without
intersection deductions; no complete concrete total is claimed.

Remaining milestones before construction-document release: engineer-resolved
reference conflicts; complete bearing/pile/approach-slab details; a parametric
bar placement and fabrication model for revised geometry; solid-intersection
quantity takeoff; independent drawing review and release workflow.

## Validation

Use Node 24 and pnpm 10.33.4. Build with `pnpm -r run build`; start the app with
`pnpm --filter @mlightcad/cad-viewer-example dev`. Run tests with
`pnpm test --runInBand`. The repository has a known cold-cache ts-jest memory
issue; this implementation was also checked using isolated transpilation plus
type checking of all workspace builds. Focused coverage includes geometric constraints,
source bar totals, six-page bounds, prompt-tool wiring, duplicate protection,
in-place replacement, atomic rollback inside an AI turn, and DXF reopen/edit.

`tools/extract-m1-linework.py` regenerates the linework snapshot from a
LibreDWG `convertEx` JSON dump and the original DWG. The source tables were
extracted from the four OLE presentation streams; source handles/row positions
are retained in `bars.json` for review.
