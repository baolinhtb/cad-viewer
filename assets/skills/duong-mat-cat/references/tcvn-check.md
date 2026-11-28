# Ràng buộc mặt cắt ngang đường và điều khoản

Chỉ các điều khoản có trong `assets/tcvn` (TCVN 4054:2005 đường ô tô, TCVN
13592:2022 đường đô thị). Mỗi đoạn dưới dấu `>` là nguyên văn tệp nguồn (test
`skillCitations.spec.ts` đối chiếu). Trị số đưa vào hồ sơ phải đối chiếu bản
in chính thức.

## Làn xe

- Đường ô tô: TCVN 4054 Bảng 6, Bảng 7 — bề rộng một làn 2,75–3,75 m theo cấp
  đường. Công cụ chặn ngoài 2 750–3 750 mm.

> Phần xe chạy gồm một số nguyên các làn xe. Con số này nên là số chẵn, trừ trường hợp hai chiều xe có lưu lượng chênh lệch đáng kể hoặc có tổ chức giao thông đặc biệt.

(TCVN 4054 đ.4.2.1.) Số làn lẻ vẫn vẽ được (ví dụ 1 làn); công cụ không chặn.

- Đường đô thị: TCVN 13592 đ.9.2.3 Bảng 10. Công cụ chặn làn không phải bội
  số 250 mm.

> Chiều rộng một làn xe thay đổi trong phạm vi từ 2,75 m đến 3,75 m, là bội số 0,25 m

## Dốc ngang

- Đường ô tô: TCVN 4054 đ.4.9 Bảng 9 — BTN/BTXM 1,5–2,0 %; mặt nhựa khác,
  lát đá 2,0–3,0 %; đá dăm, cấp phối 3,0–3,5 %; lề không gia cố 4,0–6,0 %.
  Lề gia cố dốc cùng mặt đường.
- Đường đô thị: TCVN 13592 đ.9.2.5 Bảng 12 — BTN/BTXM 1,5–2,5 %; nhựa khác
  2,0–3,0 %; đá dăm 2,5–3,5 %.

> Thông thường bố trí dốc ngang hai mái từ tim đường ra mép đường.

Ngoài dải của loại mặt đường đã chọn thì công cụ từ chối (siêu cao chưa hỗ
trợ). Dốc ngang hè: không có trong tệp tiêu chuẩn đã nạp, tham số tự do 0–4 %.

## Dải phân cách giữa

- Chỉ khi số làn chẵn từ 4 trở lên (TCVN 4054 đ.4.4.1 Bảng 8).
- Tối thiểu 1,50 m đường ô tô (TCVN 4054 đ.4.4.1 Bảng 8); 1,00 m đường đô thị
  (TCVN 13592 đ.9.4.4 Bảng 14, giá trị nhỏ nhất của bảng).
- Bó vỉa dải phân cách: TCVN 13592 đ.9.7.5; TCVN 4054 đ.4.4.3 (ít nhất 18 cm).

> Chiều cao của đỉnh bó vỉa thuộc dải phân cách so với mặt đường ít nhất là 30 cm

## Bó vỉa và hè

- TCVN 13592 đ.9.7.4: công cụ chặn chiều cao bó vỉa hè dưới 125 mm.

> Cao độ của đỉnh bó vỉa thuộc hè đường, đảo giao thông phải cao hơn mép ngoài của mặt đường (tiếp giáp với đan rãnh nếu có) ít nhất là 12,5 cm.

- Bề rộng hè tối thiểu theo loại đường: TCVN 13592 đ.9.5.2 Bảng 15 (công cụ
  không chặn theo loại đường; chỉ cần có bó vỉa và rộng hơn bó vỉa 500 mm).
- Có bó vỉa thì lề đất = 0; hè chỉ khi có bó vỉa (ràng buộc của bản vẽ).

## Mái ta luy

- Mái đắp: TCVN 4054 đ.7.8.1 Bảng 25 (1:0,75–1:2); vùng ngập TCVN 4054 đ.7.8.3.
- Mái đào: TCVN 4054 đ.7.7.1 Bảng 24 (1:0,3–1:1,75).
- Công cụ nhận 1:0,3–1:3 (gộp cả hai); kỹ sư chọn đúng hàng của bảng.

## Kết cấu áo đường

Do kỹ sư thiết kế; công cụ chỉ chặn 1–8 lớp, mỗi lớp 20–1 000 mm, tổng ≤
1 500 mm (giới hạn của bản vẽ, không phải tiêu chuẩn). Tham khảo TCVN 4054
đ.8.3.1 (tầng mặt, tầng móng), đ.8.3.9 (bề dày lớp).

> Chiều rộng tầng móng nên rộng hơn bề rộng tầng mặt mỗi bên 20 cm.

(TCVN 4054 đ.8.3.6.) Bản vẽ hiện vẽ tầng móng cùng bề rộng tầng mặt — giới
hạn đã ghi trong GHI CHÚ của tờ.
