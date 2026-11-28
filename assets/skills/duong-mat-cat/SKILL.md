---
name: duong-mat-cat
description: Vẽ bản vẽ cấu tạo MẶT CẮT NGANG ĐƯỜNG (trắc ngang điển hình) theo thông số — làn xe, lề gia cố, lề đất, dải phân cách giữa, bó vỉa và hè đô thị, mái ta luy đắp/đào, dốc ngang hai mái/một mái, các lớp kết cấu áo đường — một tờ A3, tỉ lệ tự chọn, kiểm dải giá trị theo TCVN 4054:2005 và TCVN 13592:2022. Dùng khi người dùng muốn vẽ mặt cắt ngang đường ô tô hoặc đường đô thị. Từ khoá — mặt cắt ngang đường, trắc ngang điển hình, mặt cắt ngang điển hình, bề rộng nền đường, làn xe, lề gia cố, lề đất, dải phân cách, bó vỉa, vỉa hè, hè đường, dốc ngang, mái ta luy, nền đắp, nền đào, kết cấu áo đường, lớp áo đường.
---

# Vẽ mặt cắt ngang đường

**Bản vẽ cấu tạo theo thông số, không phải thiết kế.** Công cụ không kiểm
cường độ kết cấu áo đường, không tính khối lượng đào đắp, không chọn cấp
đường. Kỹ sư cho bề rộng, dốc, lớp; công cụ kiểm các dải mà hai tiêu chuẩn đã
nạp quy định và từ chối khi sai.

## Việc nào, lệnh nào

| Việc | Lệnh |
|---|---|
| Vẽ mặt cắt ngang (một tờ A3) | `tao_mat_cat_duong` với `thong_so` chỉ gồm những gì người dùng nói. Gọi ngay, không hỏi trước các thông số chưa nói. |
| Vẽ mặt cắt thứ hai | Gọi lại `tao_mat_cat_duong`; tờ mới tự đặt cạnh tờ trước. |
| Xem đã vẽ gì | `mo_ta_ban_ve` (lần chạy mang template `duong_mat_cat_ngang`). |

Không dựng mặt cắt đường bằng `execute_cad_script`, `chay_template` của bộ
phận cầu hay `ghep_bo_phan`. Không gọi `tao_btkl` sau mặt cắt đường: BTKL chỉ
cho mố/trụ.

## Đổi lời kỹ sư sang thông số

| Lời kỹ sư | Thông số |
|---|---|
| «2 làn xe, mặt đường 7 m» | `soLan` 2, `bLan` 3500 (mặt đường ÷ số làn, mm) |
| «lề gia cố mỗi bên 1,5 m» | `bLeGiaCo` 1500 |
| «lề đất 0,5 m» | `bLeDat` 500 |
| «dốc ngang 2 %» | `iMat` 2 |
| «dốc một mái» | `kieuDoc` "mot_mai" |
| «dải phân cách giữa 3 m» (≥ 4 làn) | `bPhanCach` 3000 |
| «đường đô thị, vỉa hè 4 m» | `loaiDuong` "do_thi", `coBoVia` true, `bLeDat` 0, `bHe` 4000 (kể cả bó vỉa) |
| «nền đắp cao 2 m, mái 1:1,5» | `hNen` 2000, `mMai` 1.5 |
| «nền đào sâu 3 m, mái 1:1» | `hNen` −3000, `mMai` 1 |
| «mặt đường láng nhựa / đá dăm» | `loaiMat` "nhua_khac" / "da_dam" (đổi dải dốc ngang cho phép) |
| «kết cấu: BTNC 12,5 dày 5 cm; CPĐD loại I 15 cm» | `lopAoDuong` "BTNC 12,5|50; CPĐD loại I|150" (trên xuống, mm) |

Mặc định khi người dùng không nói: làn 3 500, lề gia cố 2 000, lề đất 500
(dốc 4 %), dốc ngang 2 % hai mái, nền đắp 1 500 mái 1:1,5, áo đường 4 lớp
(BTNC 12,5 50; BTNC 19 70; CPĐD loại I 150; CPĐD loại II 300 = 570 mm).
Công cụ trả `data.macDinh`: **nêu lại cho người dùng mọi giá trị lấy mặc
định** bằng tên tiếng Việt, cùng tổng bề rộng nền, bề dày áo đường và tỉ lệ.

Ví dụ: «Vẽ mặt cắt ngang đường 2 làn xe, mặt đường 7 m, lề gia cố mỗi bên
1,5 m, dốc ngang 2 %» → bề rộng nền 7 000 + 2 × 1 500 + 2 × 500 = 11 000 mm;
áo đường 570 mm; mặt cắt 1:100, cột kết cấu áo đường 1:10.

## Khi bị từ chối

Công cụ không vẽ gì và trả lời nêu ràng buộc, giá trị cho phép và điều khoản.
Nhắc lại nguyên văn, không tự sửa số, không vẽ bằng cách khác. Các ràng buộc
và điều khoản: `references/tcvn-check.md`.

## Giới hạn

- Tầng móng vẽ cùng bề rộng tầng mặt (chưa mở rộng theo TCVN 4054 đ.8.3.6).
- Chưa vẽ rãnh dọc, gia cố mái, siêu cao, mặt đất tự nhiên dốc.
- Bảng `_33_` không có role riêng cho đường: lớp áo đường và hè dùng
  `lop_phu` (`_33_Matduong_BTN`), nền và mái dùng `ghi_chu`.
