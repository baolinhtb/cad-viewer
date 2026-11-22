---
'@mlightcad/cad-template-plugin': patch
'@mlightcad/cad-agent-plugin': patch
---

Trợ lý CAD: hồ sơ mố do bộ sinh dựng chỉ đổi cao độ, kích thước, nhãn kích thước bằng công cụ hồ sơ. Khi `sua_ho_so_mo` từ chối vì có chữ đã sửa tay, trợ lý dừng, nêu đúng các chỗ và hỏi người dùng — không dùng `tx.setText` / `execute_cad_script` để tự sửa từng chữ cho đi tiếp. Bản vẽ DWG/DXF nhập vào vẫn sửa trực tiếp như trước.
