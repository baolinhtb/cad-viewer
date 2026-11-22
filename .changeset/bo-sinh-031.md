---
'@mlightcad/cad-template-plugin': patch
'@mlightcad/cad-agent-plugin': patch
---

Hồ sơ mố: bộ sinh 0.3.1. Hồ sơ mới ghi 0.3.1; hồ sơ 0.3.0 vẫn khớp bộ sinh thì sửa như thường và chuyển lên 0.3.1. Hồ sơ 0.3.0 không còn khớp (dựng trước các thay đổi M2–M5b, hoặc khoá kiểu tờ thông báo) thì `sua_ho_so_mo` từ chối kèm đường mở khóa; sau khi người dùng xác nhận, một lần gọi với `mo_khoa_031: true` dựng lại theo 0.3.1 từ thông số đã lưu và áp thay đổi.
