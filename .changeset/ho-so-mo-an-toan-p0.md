---
'@mlightcad/cad-template-plugin': patch
---

Safer abutment dossiers (QA 21/11/2026, milestone P0). `tao_ho_so_mo` no longer reports success when the 0.3.0 generator cannot draw the general-arrangement sheets: it refuses, draws nothing, and names each sheet with its reason — the same test `sua_ho_so_mo` already made. A stretch-grid refusal now says which values to bring back to the template to unlock a dossier (for example "đưa về giá trị mẫu: tCanh = 500"), and the tool descriptions list what the generator follows, what is text only and what it cannot follow yet, generated from the grid's own key sets. In the take-off, the bearing stops are 0.304 m³ × soGoi/4 (two stops between pairs of bearings in the source, independent of the stem width; an odd count is flagged), and the C30 concrete total is no longer blanked by one line that cannot be taken off: it sums the others, says "CHƯA GỒM …" and carries the flag `tong_thieu_dong`.
