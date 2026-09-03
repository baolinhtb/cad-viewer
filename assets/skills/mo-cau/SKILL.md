---
name: mo-cau
description: Dựng và sửa bản vẽ MỐ CẦU (mặt chính) bằng template của thư viện — bê tông lót, bệ móng, cọc khoan nhồi, tường thân, tường đầu, tường tai, lớp phủ, lan can — rồi kiểm theo TCVN 11823 sau khi dựng. Dùng khi người dùng muốn tạo mố mới (M1, M2…), đổi bề rộng, chiều cao, cao độ hay độ dốc ngang của mố đang có, hoặc hỏi ràng buộc tiêu chuẩn cho mố. Từ khoá — mố cầu, mố M1, bệ mố, bệ móng, tường thân, tường đầu, tường tai, cọc khoan nhồi, độ dốc ngang, siêu cao, cao độ đáy bệ, dựng mố.
---

# Dựng & sửa bản vẽ mố cầu bằng template

Mọi hình học của mố đã nằm trong template đo từ bản vẽ thật của kỹ sư. Việc
của trợ lý là chọn đúng lệnh, đổi đúng tham số, và kiểm sau khi dựng — không
vẽ mố bằng nét.

## Việc nào, lệnh nào

| Việc | Lệnh |
|---|---|
| Dựng cả mố | `ghep_bo_phan` với mã `mo_cau_hoan_chinh`. Một lệnh, đủ 5 cấu kiện và 2 lan can, cao độ nối nhau, dốc ngang chạy suốt từ đỉnh bệ trở lên. **Ưu tiên tuyệt đối**; đừng chạy 5 template lẻ rồi tự cộng cao độ. |
| Một cấu kiện | `chay_template` với `mo_be_mong`, `mo_coc_khoan_nhoi`, `mo_tuong_than`, `mo_tuong_dau`, `tuong_phong_ho_btct`. |
| Sửa mố đã dựng | `mo_ta_ban_ve` lấy run id, rồi `sua_lan_chay` với **chỉ** các giá trị thay đổi. Không gọi lại `ghep_bo_phan` hay `chay_template`: sẽ vẽ chồng bản thứ hai. |
| Vị trí | `x` là tim mố, `y` là **đáy bê tông lót** (không phải đáy bệ). Bản vẽ theo lý trình thì đặt `moc_toa_do` trước. |

## Tham số: lời kỹ sư → khoá template

| Kỹ sư nói | Khoá | Mặc định | Ghi chú |
|---|---|---:|---|
| bề rộng mố, bề rộng bệ | `B` | 7700 | quyết định luôn bề rộng tường thân, tường đầu |
| chiều cao bệ | `hBe` | 2000 | |
| dày bê tông lót | `hLot` | 100 | lót thò mỗi bên `phuLot` = 100 |
| chiều cao tường thân | `hThan` | 4716 | **tại tim**, đo từ đỉnh bệ; mép cao hơn tim `doDocNgang % × B/2` |
| chiều cao tường đầu | `hDau` | 1805 | từ đáy đến mặt đỉnh ngoài |
| vệt mép, vai kê | `bVaiKe` | 350 | bề rộng lớp phủ = `B − 2·bVaiKe`; lan can đứng trên dải này |
| độ hạ vai kê | `hVaiKe` | 7 | không phải dày lớp phủ, hai số rất dễ lẫn |
| dày lớp phủ, bê tông nhựa | `tLopPhu` | 70 | |
| tường tai: dày | `bTai` | 150 | template `mo_tuong_dau` |
| tường tai: đỉnh thấp hơn đỉnh tường đầu | `haTai` | 594 | tường tai cao 1200 tính từ đáy tường đầu |
| chiều cao tường phòng hộ | `hLanCan` | 1090 | lan can thép đứng thêm 588 trên đó |
| cọc khoan nhồi | `D`, `soCoc`, `khoangCach` | 1200, 2, 5300 | cự ly tim cọc = `B − 2·D` |
| cao độ đáy bệ | `y` | | `y = cao độ đáy bệ − hLot` |
| độ dốc ngang | `doDocNgang` | 2 (%) | xem quy ước dưới |

**Quy ước dốc.** Một trị số, đường thẳng qua tim, áp cho đỉnh bệ trở lên;
bệ và bê tông lót luôn nằm ngang. **Dương = mép phải cao.** "Nghiêng trái",
"mép trái thấp" ⇒ dương; "mép phải thấp" ⇒ âm. Dốc hai mái (đỉnh gãy tại
tim, hai nửa cùng dốc ra ngoài) **chưa dựng được** bằng template hiện tại —
nói rõ với người dùng thay vì xấp xỉ bằng dốc một mái.

**Cọc trong cách ghép** giữ mặc định `D` 1200 và cự ly 5300. Đổi `B` khác
7700 thì cự ly cọc không tự theo: chạy thêm `mo_coc_khoan_nhoi` riêng với
`khoangCach = B − 2·D`, hoặc nói với người dùng.

## Sửa: ba bước, đúng thứ tự

1. **Đổi tham số, dựng lại cả cụm** bằng `sua_lan_chay` trên run của cách
   ghép. Các cấu kiện ràng buộc lẫn nhau — đáy tường đầu song song mặt
   đường, tường tai tựa mặt tiếp giáp, lan can bám cao độ mép của chính nó —
   nên vá lẻ một bộ phận chắc chắn hở.
2. **Đo lại mối nối**, mọi mối phải bằng 0: đỉnh bệ = đáy tường thân; đỉnh
   tường thân = đáy tường đầu tại tim **và** hai mép; vai kê = đáy lớp phủ;
   đáy tường tai chạm đáy tường đầu; chênh cao độ lan can trái/phải =
   `doDocNgang % × (B − 2·bVaiKe)`. Đọc từ `mo_ta_ban_ve` và
   `get_drawing_context`, đừng tin là lệnh đã chạy đúng.
3. **Ghi chú** sau cùng: ký hiệu cao độ và chữ `i = n %` (nếu người dùng
   cần) vẽ bằng `draw_text`, `draw_dimension` ở cao độ tính từ tham số —
   không đặt theo mắt, và dốc lấy `abs(doDocNgang)`.

## Kiểm TCVN ngay sau khi dựng

| Kiểm | Ngưỡng | Rule |
|---|---|---|
| đường kính cọc khoan `D` | ≥ 750 mm | TCVN 11823-10 đ.8.1.3 |
| cự ly tim cọc `B − 2·D` | ≥ 4·D; nếu < 6·D phải nêu trình tự khoan | 11823-10 đ.8.1.2 |
| mặt bên cọc → mép bệ | ≥ 300 mm; với bố trí này luôn = `D/2` ⇒ `D` ≥ 600 | 11823-10 đ.8.1.2 |
| bề rộng `B` | ≤ 9000 mm mới khỏi cần khe phòng nứt | 11823-11 đ.6.1.6 |
| `doDocNgang` mặt BTN | 1,5 – 2,0 % (TCVN 4054 B.9) · 1,5 – 2,5 % (TCVN 13592 B.12) | |
| `doDocNgang` là siêu cao | ≥ 2 %, ≤ 8 % đường ô tô, ≤ 6 % đô thị | TCVN 4054 đ.5.6 |

Dốc trên 2,5 % chỉ hợp lệ khi mố nằm trong đường cong có siêu cao. **Hỏi
người dùng xác nhận trước khi dựng**, nêu hai ngưỡng trên, đừng lặng lẽ vẽ.
Khi báo kết quả, kèm số điều khoản để truy ngược, và nói rõ mục nào không
kiểm tự động được. Cần nguyên văn điều khoản thì `tra_cuu_tieu_chuan`.

## Tệp kèm theo — chỉ đọc khi cần

- `references/tham-so.md`: mô hình hình học đầy đủ, quan hệ dẫn xuất, năm
  ràng buộc phải giữ, và vì sao các số mặc định lẻ. Đọc khi người dùng hỏi
  "vì sao" hoặc yêu cầu vượt ngoài bảng tham số.
- `references/tcvn-check.md`: bảng kiểm đầy đủ và công thức tính từ tham số.
- `references/sua-tai-cho.md`: chuỗi lan truyền khi đổi mặt tiếp giáp hay
  mặt đường, và checklist độ khít — dùng để đối chiếu sau `sua_lan_chay`.
