---
'@mlightcad/cad-template-plugin': minor
'@mlightcad/cad-agent-plugin': minor
---

Structural quantity take-off (BTKL) for the abutment dossier and the piers: concrete by part, blinding, piles, formwork and steel computed from the run parameters, each line with its formula, source and flags (differences from the source SUB-100 table, owner assumptions, pending measurement rules), and refused with a reason where the geometry is not the source's. New built-in template `btkl_ket_cau` draws the take-off as A3 sheets in the SUB-100 table style; the agent gains `tao_btkl`, `cap_nhat_btkl` and `xuat_btkl` (`.xlsx` download through a dependency-free writer, with a five-column sheet and a per-object bar schedule).
