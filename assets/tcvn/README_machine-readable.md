# Bộ tài liệu TCVN dạng máy đọc được (Markdown + LaTeX)

Chuyển đổi nguyên văn 16 tài liệu PDF trong notebook "cau duong tcvn" sang Markdown, công thức biểu diễn bằng LaTeX.

## Quy ước định dạng

- **Văn bản**: nguyên văn 100%, giữ cả lỗi chính tả/lỗi in của bản gốc (vd "bổ xung", "lắp rấp"). Không tóm tắt, không cắt bớt, không giải thích thêm.
- **Cấu trúc**: frontmatter YAML ở đầu file; tiêu đề `#`/`##`/`###`/`####` theo cấp điều khoản của bản gốc.
- **Công thức đánh số**: khối `$$...\tag{N}$$`, N là số công thức đúng như bản gốc.
- **Công thức inline**: `$...$`.
- **Bảng**: bảng Markdown chuẩn; ô gộp được duỗi phẳng (lặp giá trị) kèm chú thích `<!-- ô gộp -->`.
- **Hình vẽ**: không nhúng được — thay bằng dòng in nghiêng `*(Hình N — caption — xem PDF gốc trang X)*`, kèm nhãn/chú dẫn text nếu trích được.
- **Ký hiệu**: `≥`→`\ge`, `≤`→`\le`, `φ`→`\phi`, `γ`→`\gamma`, `η`→`\eta`, `√`→`\sqrt{}`; dấu phẩy thập phân giữ nguyên như bản gốc (0,95).

## Danh mục file

| File | Tiêu chuẩn | Trang gốc | Công thức | Bảng |
|---|---|---|---|---|
| TCVN_11823-1_2017_Phan-1_Yeu-cau-chung.md | TCVN 11823-1:2017 Yêu cầu chung | 10 | 3 | 0 |
| TCVN_11823-2_2017_Phan-2_Tong-the-va-dac-diem-vi-tri-cau.md | TCVN 11823-2:2017 Tổng thể và đặc điểm vị trí | 26 | 1 | 0 |
| TCVN_11823-3_2017_Phan-3_Tai-trong-va-He-so-tai-trong.md | TCVN 11823-3:2017 Tải trọng và Hệ số tải trọng | 97 | 72 | 26 |
| TCVN_11823-4_2017_Phan-4_Phan-tich-va-Danh-gia-ket-cau.md | TCVN 11823-4:2017 Phân tích và Đánh giá kết cấu | 79 | 25 | 18 |
| TCVN_11823-5_2017_Phan-5_Ket-cau-be-tong.md | TCVN 11823-5:2017 Kết cấu bê tông | 192 | 219 | 14 |
| TCVN_11823-6_2017_Phan-6_Ket-cau-thep.md | TCVN 11823-6:2017 Kết cấu thép | 243 | 442 (363 + phụ lục A/B/D) | 41 |
| TCVN_11823-9_2017_Phan-9_Mat-cau-va-he-mat-cau.md | TCVN 11823-9:2017 Mặt cầu và Hệ mặt cầu | 29 | 1 | 0 |
| TCVN_11823-10_2017_Phan-10_Nen-mong.md | TCVN 11823-10:2017 Nền móng | 150 | 158 (117 + phụ lục A/B) | 27 |
| TCVN_11823-11_2017_Phan-11_Mo-Tru-va-Tuong-chan.md | TCVN 11823-11:2017 Mố, Trụ và Tường chắn | 71 | 38 | 4 |
| TCVN_11823-12_2017_Phan-12_Ket-cau-vui-va-Ao-ham.md | TCVN 11823-12:2017 Kết cấu vùi và Áo hầm | 83 | 87 | 41 |
| TCVN_11823-13_2017_Phan-13_Lan-can.md | TCVN 11823-13:2017 Lan can | 28 | 30 | 2 |
| TCVN_11823-14_2017_Phan-14_Khe-co-gian-va-Goi-cau.md | TCVN 11823-14:2017 Khe co giãn và Gối cầu | 64 | 84 | 8 |
| TCVN_4054-2005_Duong-o-to_Yeu-cau-thiet-ke.md | TCVN 4054:2005 Đường ô tô | 64 | (không đánh số) | 37 |
| TCVN_13592-2022_Duong-do-thi_Yeu-cau-thiet-ke.md | TCVN 13592:2022 Đường đô thị | 80 | 9 | 40 |
| AASHTO_LRFDBDS-9_Table-of-Contents.md | AASHTO LRFD BDS 9th Ed. — Mục lục + Index | 88 | 0 | 0 |
| ADOT_Section-9_Decks-and-Deck-Systems.md | ADOT Bridge Design Guidelines Section 9 | 7 | 0 | 2 |

**Tổng: 16 tài liệu, 1311 trang gốc, 1169 công thức LaTeX, ~260 bảng.**

## Lưu ý về tính nguyên bản

Các bản gốc có một số lỗi in / bất thường đã được **giữ nguyên** (không tự sửa theo AASHTO), có chú thích `<!-- ... -->` tại chỗ:

- Nhảy số bảng: Phần 10 không có Bảng 15, 16; Phần 12 không có Bảng 6; TCVN 13592 không có Bảng 32.
- Phần 11 (10.10.2): bản in ghi `4,45x10⁴10 N` (thừa "10").
- Phần 14: CT (18) mất ký tự tử số; CT (59) trống mẫu số dưới căn.
- Phần 3: CT (18) được đánh số `(18.)` có dấu chấm trong bản gốc.
- Phần 6: CT (67) bản gốc thiếu số mũ; CT (60) dùng chữ `l` thay `λ`.
- Phần 5: Bảng 9 dùng ký tự `∠` thay `≤`.

## Kiểm định

Đã kiểm tra chéo độc lập 20 công thức ngẫu nhiên (trải đều Phần 3, 5, 6, 10, 12) và 3 bảng so với ảnh trang PDF gốc: **23/23 khớp**. Kiểm tra cấu trúc tự động toàn bộ 16 file: không còn placeholder chưa giải, không lệch số công thức, không ký tự rác, bảng Markdown hợp lệ.
