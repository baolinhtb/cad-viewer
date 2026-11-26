---
'@mlightcad/cad-template-plugin': patch
---

FIX-NOTE (sau QA): khối GHI CHÚ trên tờ SUB-100 không còn nằm trong bảng khối lượng theo thông số hiện tại, và bảng đó được dựng từ dưới lên trên khung tên nên không xuyên mép khung. `chay_template` lấy bản publish mới nhất trong thư viện (auth DB): `mo_mat_chinh` 2.0.1, `mo_coc_khoan_nhoi` / `tru_mat_chinh` / `tru_mat_ben` 1.0.1 — cùng khối GHI CHÚ đã có từ PR #79. `sua_ho_so_mo` vẽ lại bảng take-off của bộ sinh (không coi là sửa tay), vẫn từ chối ô đã sửa tay.
