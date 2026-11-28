---
'@mlightcad/cad-template-plugin': patch
'@mlightcad/cad-agent-plugin': patch
---

Trụ cầu (bố cục sơ bộ, kích thước mặc định không đổi): `tru_mat_chinh` / `tru_mat_ben` 1.1.0 kiểm chiều rộng đỡ dầm N theo TCVN 11823-4:2017 đ.7.4.4 (Phương trình 25, Bảng 16) khi có `lNhip` và `phanTramN`, không đạt thì chặn; D < 750 mm in ghi chú điều kiện kiểm tra thủ công (TCVN 11823-10:2017 đ.8.1.3). `tru_cau_hoan_chinh` từ chối `kcHinh` làm hai hình chồng nhau (mức tối thiểu tính cả khối GHI CHÚ, mặc định 16 000 → 21 000), có tuỳ chọn `khungTen = 1` đặt mỗi hình vào một tờ A3 có khung tên và tỉ lệ 1:20…1:500. Mọi từ chối của `chay_template` / `ghep_bo_phan` khi chưa vẽ gì bắt đầu «Chưa vẽ gì:».
