---
---

Abutment quantity take-off (BTKL) no longer refuses every source-derived line after any dimension change. Each line now declares the parameters it depends on (`phuThuoc`) and is refused or uncompared only when one of those changes: ear walls follow `tThan`, the parapet `lCanh`, grout and bolt boxes `soGoi`, the PVC drain `hThan + hDau`, the foam filler `bThan`. Steel of a changed abutment is estimated from the M1 kg/m³ of each member and flagged "tạm tính theo hàm lượng mẫu M1"; the asphalt line keeps the table value with an engineer-confirmation flag; a missing pile length asks for `lCoc`, and giving `lCoc` through `sua_ho_so_mo` keeps every entity instead of regenerating the dossier.
