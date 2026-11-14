---
'@mlightcad/cad-template-sdk': minor
'@mlightcad/cad-template-plugin': minor
'@mlightcad/cad-agent-plugin': patch
---

The `ho_so_mo_m1` dossier moves to 0.3.0: six A3 sheets at 1:100 laid out and numbered as the source drawing (SUB-010 … SUB-100), drawn with real CAD entities — dimensions in `_33_` styles with the source's text positions, arrows and fixed-length extension lines, hatches, blocks with attributes, leaders — and the elevation, dimension, bar and quantity tables redrawn as lines and text. Dimensions follow the parameters through stretch grids (footing, stem, head wall, wing, piles); views move to keep their gaps and a sheet leaving the A3 frame is refused, as are pile-layout changes. Steel sheets and the bar schedule apply only to the source abutment. `sua_ho_so_mo` regenerates 0.3.0 runs that have no hand edits; 0.1.0 and 0.2.0 runs regenerate unchanged. The SDK gains `acTpWithWorkingDatabase` so drawing into a non-current database cannot borrow another drawing's ids (undo used to miss those entities).
