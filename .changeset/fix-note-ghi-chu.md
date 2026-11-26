---
'@mlightcad/cad-template-sdk': patch
'@mlightcad/cad-template-plugin': patch
---

FIX-NOTE: cảnh báo và ghi chú do bộ sinh chèn (tim–tim cọc < 4D / < 6D theo TCVN 11823-10:2017 §8.1.2 trên mặt chính mố M1, template cọc khoan nhồi và trụ; «THÉP THEO M1 GỐC…», «CHƯA DỰNG ĐƯỢC…», bảng chưa tính/chưa áp dụng trên hồ sơ mố) gom vào một khối GHI CHÚ màu đỏ, có dấu tiếng Việt, tự xuống dòng và đặt ở chỗ trống cạnh tiêu đề / khung tên — không còn đè lên hình, chuỗi kích thước hay ký hiệu mặt cắt. SDK có thêm `acTpLayoutGhiChuBlock` / `acTpPlaceGhiChuBlock` để template dùng chung.
