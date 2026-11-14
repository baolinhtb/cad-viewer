---
name: tru-cau
description: Dựng và sửa bản vẽ TRỤ CẦU (mặt chính, mặt bên) bằng template của thư viện — bê tông lót, bệ, cọc khoan nhồi, thân tường đặc hoặc thân cột, xà mũ có đầu hẫng, đá kê gối — rồi kiểm theo TCVN 11823 sau khi dựng. Dùng khi người dùng muốn tạo trụ mới (T1, T2…), đổi kích thước bệ, thân, xà mũ, số cọc, số gối, hoặc hỏi ràng buộc tiêu chuẩn cho trụ. Từ khoá — trụ cầu, trụ T1, xà mũ, thân trụ, trụ thân cột, trụ nạng chống, bệ trụ, cọc khoan nhồi trụ, đá kê gối, mặt chính trụ, mặt bên trụ, dựng trụ.
---

# Dựng & sửa bản vẽ trụ cầu bằng template

**Đây là bố cục sơ bộ, chưa đối chiếu bản vẽ văn phòng.** Khác template mố
(đo từ bản vẽ của kỹ sư), template trụ dựng theo cấu tạo thông dụng vì chưa có
bản vẽ trụ nào của văn phòng. Nói rõ điều đó với người dùng mỗi khi dựng, và
không bao giờ trình bày kích thước mặc định như trị số của tiêu chuẩn.

## Việc nào, lệnh nào

| Việc | Lệnh |
|---|---|
| Dựng cả trụ (mặt chính + mặt bên) | `ghep_bo_phan` với mã `tru_cau_hoan_chinh`. **Ưu tiên**: hai hình dùng chung một bộ số và một chuỗi cao độ. `soCot = 0` là thân tường đặc; `soCot` 1–6 là thân cột. |
| Một hình chiếu | `chay_template` với `tru_mat_chinh` hoặc `tru_mat_ben` (cùng tham số; `loaiThan` = `tuong` hoặc `cot`). |
| Sửa trụ đã dựng | `mo_ta_ban_ve` lấy mã lần chạy, rồi `sua_lan_chay` cho **từng** lần chạy (mặt chính và mặt bên là hai lần chạy) với **chỉ** các giá trị đổi. Không chạy lại `ghep_bo_phan`: sẽ vẽ chồng. |
| Thêm khung tên | `chay_template` với `khung_ban_ve` (A3/A1, `tiLe`). |
| Vị trí | `x` là tim trụ trên hình đó, `y` là **đáy bê tông lót**. Trong cách ghép, mặt bên đặt tại `x + kcHinh`. |

## Tham số: lời kỹ sư → khoá template

| Kỹ sư nói | Khoá | Mặc định |
|---|---|---:|
| chiều dài xà mũ (ngang cầu) | `bXaMu` | 12000 |
| bề rộng xà mũ (dọc cầu) | `lXaMu` | 2000 |
| chiều cao xà mũ tại thân / đầu hẫng | `hXaMu` / `hXaMuDau` | 1500 / 800 |
| đoạn vát đầu hẫng | `lHang` | 2000 |
| số gối một hàng, tim gối | `soGoi`, `aGoi` | 5, 2400 |
| số hàng gối, tim hàng gối → tim trụ | `soHangGoi`, `eGoi` | 2, 500 |
| đá kê gối ngang × dọc × cao | `bDaKe`, `lDaKe`, `hDaKe` | 800 × 600 × 200 |
| thân tường rộng × dày | `bThan`, `tThan` | 6000 × 1400 |
| số cột, cạnh/đường kính cột, tim cột | `soCot`, `dCot`, `aCot` | 2, 1200, 6000 |
| chiều cao thân (đỉnh bệ → đáy xà mũ) | `hThan` | 6000 |
| bệ ngang × dọc × cao | `bBe`, `lBe`, `hBe` | 9500 × 6000 × 2000 |
| bê tông lót dày, phủ mỗi bên | `hLot`, `phuLot` | 100, 100 |
| cọc khoan nhồi: đường kính | `D` | 1200 |
| số cọc ngang / dọc, tim–tim ngang / dọc | `soCocNgang`, `soCocDoc`, `aCocNgang`, `aCocDoc` | 3, 2, 3600, 3600 |
| chiều dài cọc | `lCoc` | 0 = **chưa biết**, không tự đoán |

Mọi mặc định là **thông dụng, do tính toán quyết định**. Cao độ: đỉnh bệ =
`y + hLot + hBe`; đáy xà mũ = đỉnh bệ + `hThan`; đỉnh xà mũ = đáy xà mũ +
`hXaMu`; đỉnh đá kê = đỉnh xà mũ + `hDaKe`. Chi tiết: `references/tham-so.md`.

## Template tự chặn trước khi vẽ

- Mặt bên cọc ngoài cùng đến mép bệ < 300 mm, theo ngang hoặc dọc cầu —
  **TCVN 11823-10:2017 đ.8.1.2**.
- Các lỗi hình học không phải điều khoản: đầu hẫng cao hơn xà mũ tại thân,
  đoạn vát chạy vào thân, thân rộng hơn bệ hoặc xà mũ, hàng đá kê dài hơn xà
  mũ, cột/cọc/đá kê chồng nhau.

Khi bị chặn, đọc nguyên văn thông báo cho người dùng và hỏi trị số thay thế;
đừng tự nới bệ hay đổi cọc.

## Kiểm TCVN ngay sau khi dựng

Chỉ các mục dưới đây có điều khoản thật trong `assets/tcvn`. Nguyên văn và
công thức: `references/tcvn-check.md`.

| Kiểm | Ngưỡng / yêu cầu | Điều khoản |
|---|---|---|
| mặt bên cọc → mép bệ | ≥ 300 mm (template đã chặn) | TCVN 11823-10:2017 đ.8.1.2 |
| tim–tim cọc khoan < 4D | khi khoan **không ống vách**: phải đánh giá ảnh hưởng tương tác giữa các cọc liền kề | TCVN 11823-10:2017 đ.8.1.2 |
| tim–tim cọc khoan < 6D | trình tự khoan phải được nêu rõ trong hồ sơ thiết kế | TCVN 11823-10:2017 đ.8.1.2 |
| đường kính cọc khoan | ≥ 750 mm **nếu hố khoan được kiểm tra bằng thủ công** — hỏi người dùng | TCVN 11823-10:2017 đ.8.1.3 |
| thân trụ đặt thẳng lên cọc khoan (không bệ) | đường kính thân ≤ đường kính cọc — template luôn có bệ, chỉ nêu khi người dùng hỏi dạng cột trên cọc | TCVN 11823-10:2017 đ.8.1.3 |
| chiều rộng đỡ dầm tối thiểu | N = (200 + 0,0017·L + 0,0067·H)(1 + 0,000125·S²), nhân % theo vùng động đất | TCVN 11823-4:2017 đ.7.4.4, Phương trình 25, Bảng 16 |
| trụ gần đường sắt | trong phạm vi 7,5 m tính từ đường sắt **nên** xây tường chắn chống va chạm | TCVN 11823-11:2017 đ.7.2.2 |
| va xô, xói, mũi vát thân trụ | định tính — nêu là chưa kiểm tự động | TCVN 11823-11:2017 đ.7.2.1, đ.7.2.3, đ.7.2.4 |

Với mặc định (D 1200, tim–tim 3600 = 3D): dưới cả 4D và 6D, nên bản vẽ có
sẵn ghi chú hai yêu cầu của TCVN 11823-10:2017 đ.8.1.2. Báo cho người dùng: cần nói rõ có ống
vách hay không, và hồ sơ phải nêu trình tự khoan.

Chiều rộng đỡ dầm cần **L, H, S**: hỏi người dùng L (chiều dài mặt cầu tới khe
co giãn kế bên) và S (độ chéo); H lấy là chiều cao trụ. **Không tự chọn vùng
động đất** cho TCVN 11823-4:2017 Bảng 16 — hỏi, hoặc báo N ở 100 %.

**Không kiểm được ở đây**: sức kháng, tải trọng (TCVN 11823-11:2017 đ.7.1 dẫn
sang Phần 3, 5, 6), cốt thép, chiều dài cọc, sức kháng cọc. Nói rõ như vậy;
đừng im lặng bỏ qua, và đừng nói "đạt tiêu chuẩn".

Cần nguyên văn điều khoản thì `tra_cuu_tieu_chuan`.

## Tệp kèm theo — chỉ đọc khi cần

- `references/tham-so.md`: hình học hai hình chiếu, quan hệ dẫn xuất, những
  gì template **không** vẽ.
- `references/tcvn-check.md`: nguyên văn các điều khoản trên và công thức
  tính từ tham số.
