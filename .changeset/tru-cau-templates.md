---
'@mlightcad/cad-template-plugin': minor
'@mlightcad/cad-agent-plugin': patch
---

Pier templates `tru_mat_chinh` and `tru_mat_ben` 1.0.0 in the template library (front and side view: blinding, pile cap, bored piles, solid-wall or column stem, cap beam with tapered cantilevers, bearing pedestals, dimensions), drawn through roles onto the `_33_CAU_TRU_*` layers. They are a preliminary layout, not yet checked against an office drawing, and say so. The `tru_cau_hoan_chinh` assembly builds both views from one set of values. New guide `assets/skills/tru-cau` cites only clauses present in `assets/tcvn`; the `mo-cau` guide now quotes TCVN 11823-10 cl. 8.1.2/8.1.3 with their conditions, cites superelevation as TCVN 4054 cl. 5.5.1, and describes the `ho_so_mo_m1` 0.2.0 title block. A test resolves every clause cited by the guides and library templates against the standards in the repository.
