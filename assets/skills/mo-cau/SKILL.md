---
name: mo-cau
description: Dựng và sửa bản vẽ MỐ CẦU (mặt chính) bằng template của thư viện — bê tông lót, bệ móng, cọc khoan nhồi, tường thân, tường đầu, tường tai, lớp phủ, lan can — rồi kiểm theo TCVN 11823 sau khi dựng. Dùng khi người dùng muốn tạo mố mới (M1, M2…), đổi bề rộng, chiều cao, cao độ hay độ dốc ngang của mố đang có, hoặc hỏi ràng buộc tiêu chuẩn cho mố. Từ khoá — mố cầu, mố M1, bệ mố, bệ móng, tường thân, tường đầu, tường tai, cọc khoan nhồi, độ dốc ngang, siêu cao, cao độ đáy bệ, dựng mố.
---

# Dựng & sửa bản vẽ mố cầu bằng template

Mọi hình học của mố đã nằm trong template đo từ bản vẽ thật của kỹ sư. Việc
của trợ lý là chọn đúng lệnh, đổi đúng tham số, và kiểm sau khi dựng — không
vẽ mố bằng nét.

## Việc nào, lệnh nào

### Hồ sơ nhiều tờ — ưu tiên khi yêu cầu bản vẽ đầy đủ

Khi người dùng muốn **hồ sơ mố**, **bản vẽ mố đầy đủ**, mặt bằng + mặt cắt +
thống kê, dùng `tao_ho_so_mo`, không dùng cách ghép cũ ở bảng dưới.
Mẫu `ho_so_mo_m1` **0.3.0** dựng lại `02. BTC- mo_2.dwg`: 6 tờ **A3 1:100**
đánh số như bản gốc — SUB-010 (bố trí chung 1/2), SUB-020 (MC C–C, bảng cao
độ, bảng thông số), SUB-070/080/090 (cốt thép), SUB-100 (bảng hình dạng thanh,
thống kê thép, khối lượng). Hình là **đối tượng CAD thật**: dim đúng kiểu
`_33_`, hatch, block có attribute (thẻ cao độ `cd11`, gối, cọc), leader. Khung
tên A3 điền `duAn`, `donVi`, `nguoiChuTri`, `nguoiThietKe`, `nguoiKiemTra`,
`nguoiDuyet`, `ngay` (để trống được). Mọi tờ vẫn là **bản nháp**.
Chiều dài tính mm, cao độ `caoDoDayBe` tính m, dốc tính %. `Lc` trong bản
mẫu là chiều dài **tường cánh**, không phải chiều dài cọc (`lCoc`).

**Đổi kích thước — cái gì theo được, cái gì bị từ chối**

| Thông số                                                                                                                                                | Kết quả                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hBe`, `hLot`, `lBe`, `muiBe`, `tThan`, `hThan`, `hDau`, `lCanh`, `D`                                                                                   | Co giãn: hình, dim, thẻ cao độ, bảng cao độ/thông số SUB-020 đổi theo; các hình chiếu tự dời để giữ khoảng hở như bản gốc                                      |
| `bBe`                                                                                                                                                   | Co giãn, nhưng phải đổi kèm `bThan = bBe`, `aCocNgang = bBe − 2·D`; đổi `D`/`lBe` thì kèm `aCocDoc = lBe − 2·D` (bản gốc vẽ thân rộng bằng bệ, cọc sát mép bệ) |
| `caoDoDayBe`, `lCoc`, tên, công trình, khung tên, `x`/`y`                                                                                               | Không đổi hình; cao độ trong bảng dời theo `caoDoDayBe`                                                                                                        |
| Số/bố trí cọc (`soCotCoc`, `soHangCoc`, tim cọc khác quy tắc trên), `bThan ≠ bBe`, `phuLot`, `tCanh`, `docNgang`, `docDoc`, `bMatDuong`, `hLanCan`, gối | **Từ chối** — hồ sơ giữ nguyên, nêu lý do                                                                                                                      |
| Hình chiếu tràn khung A3 sau khi dời                                                                                                                    | **Từ chối**, nêu hình chiếu và lượng tràn                                                                                                                      |
| Bất kỳ thay đổi hình học nào                                                                                                                            | Tờ thép SUB-070/080/090 và bảng thống kê SUB-100 ghi **chưa có phương án thép** — tuyệt đối không kéo giãn thép hay giữ khối lượng thép cũ                     |

- Sửa: `sua_ho_so_mo` + mã lần dựng từ `mo_ta_ban_ve`; chỉ truyền phần đổi.
  Hồ sơ 0.3.0 được dựng lại **chỉ khi chưa bị sửa tay**; có sửa tay thì công
  cụ từ chối, khi đó sửa trực tiếp bằng `execute_cad_script`. Đọc `canhBao`
  trong kết quả để báo các tờ không áp dụng (thép).
- Kiểm: `kiem_tra_ho_so`; đọc và báo các mục chưa chốt, không nói đạt thiết kế.
- Xuất: `xuat_ho_so_mo` dạng `pdf` (6 trang A3), `html` (tự chứa, in được),
  `dxf`, hoặc `json`. Xuất tái sinh từ mô hình, không chứa sửa tay trên canvas.
- Cọc mặc định **2 hàng × 2 cọc D1200**; tim ngang 5300, tim dọc 3600.
- Dốc ngang dương: **trái tuyến cao**. Trên mặt chính trái tuyến nằm bên phải ảnh.
- Chưa có chiều dài cọc thì để `lCoc=0`, không tự đoán.
- Các mâu thuẫn nguồn C8/C10, F3 D22/D25, W16 D14/D16 chưa được tự chốt.
- Hồ sơ dựng bằng 0.1.0 (khung cũ) và 0.2.0 (khung tên A1) vẫn dựng lại và
  xuất đúng như lúc tạo; với chúng `sua_ho_so_mo` chỉ sửa nhãn/vị trí/khung tên.

### Một mặt chính hoặc từng cấu kiện — luồng cũ

`mo_mat_chinh` 2.0.0 là mặt chính nhiều tham số độc lập, khác mô hình hồ sơ
ở trên; `iTrai`/`iPhai` hỗ trợ hai mái. Các giới hạn và bảng tham số sau đây
chỉ áp dụng cách ghép cũ `mo_cau_hoan_chinh`, không áp dụng hồ sơ nhiều tờ.

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
| đường kính cọc khoan `D` | ≥ 750 mm **nếu hố khoan được kiểm tra bằng thủ công** — hỏi người dùng | TCVN 11823-10 đ.8.1.3 |
| cự ly tim cọc `B − 2·D` | không có ngưỡng cấm: < 4·D (khoan **không ống vách**) phải đánh giá ảnh hưởng tương tác giữa các cọc; < 6·D phải nêu trình tự khoan trong hồ sơ | 11823-10 đ.8.1.2 |
| mặt bên cọc → mép bệ | ≥ 300 mm; với bố trí này luôn = `D/2` ⇒ `D` ≥ 600 | 11823-10 đ.8.1.2 |
| bề rộng `B` | ≤ 9000 mm mới khỏi cần khe phòng nứt | 11823-11 đ.6.1.6 |
| `doDocNgang` mặt BTN | 1,5 – 2,0 % (TCVN 4054 Bảng 9) · 1,5 – 2,5 % (TCVN 13592 Bảng 12) | |
| `doDocNgang` là siêu cao | ≥ 2 %, ≤ 8 % đường ô tô | TCVN 4054 đ.5.5.1 |
| … đường đô thị | theo tốc độ và bán kính (i_sc 0,02 – 0,08) | TCVN 13592 Bảng 20 |

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
