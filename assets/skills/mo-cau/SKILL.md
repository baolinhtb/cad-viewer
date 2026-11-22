---
name: mo-cau
description: Dựng và sửa bản vẽ MỐ CẦU (mặt chính) bằng template của thư viện — bê tông lót, bệ móng, cọc khoan nhồi, tường thân, tường đầu, tường tai, lớp phủ, lan can — rồi kiểm theo TCVN 11823 sau khi dựng. Dùng khi người dùng muốn tạo mố mới (M1, M2…), đổi bề rộng, chiều cao, cao độ hay độ dốc ngang của mố đang có, hoặc hỏi ràng buộc tiêu chuẩn cho mố. Từ khoá — mố cầu, mố M1, bệ mố, bệ móng, tường thân, tường đầu, tường tai, cọc khoan nhồi, độ dốc ngang, siêu cao, cao độ đáy bệ, dựng mố, khối lượng mố, bóc tách khối lượng, BTKL, bảng khối lượng, xuất xlsx khối lượng.
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

| Thông số                                                                                                                              | Kết quả                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hBe`, `hLot`, `lBe`, `muiBe`, `tThan`, `hThan`, `hDau`, `lCanh`, `D`                                                                 | Co giãn: hình, dim, thẻ cao độ, bảng cao độ/thông số SUB-020 đổi theo; các hình chiếu tự dời để giữ khoảng hở như bản gốc                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `bBe`                                                                                                                                 | Co giãn, nhưng phải đổi kèm `bThan = bBe`, `aCocNgang = bBe − 2·D`; đổi `D`/`lBe` thì kèm `aCocDoc = lBe − 2·D` (bản gốc vẽ thân rộng bằng bệ, cọc sát mép bệ). Không truyền `aCocNgang`/`aCocDoc` thì công cụ tự suy theo quy tắc này                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `bMatDuong`                                                                                                                           | Co giãn: hai mép mặt đường ở mặt chính dời đều quanh tim. Chỉ cho `bMatDuong` (không cho `bBe`/`bThan`) thì công cụ **tự suy** `bBe = bThan = bMatDuong + 2 × 350` (lề mép đường 350 mm mỗi bên, cố định như M1 — không lấy lề khác) và `aCocNgang = bBe − 2·D`; ví dụ mặt đường 8000, D1000 → `bBe = bThan = 8700`, `aCocNgang = 6700`. Giá trị suy ra nằm trong `data.suyRa`: **phải báo lại** cho người dùng. Lề nhỏ hơn 350 thì `kiemTra` cảnh báo và nêu `bBe` đề xuất; mặt đường vượt thân quá 300 mm thì từ chối                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `caoDoDayBe`, `nhanKichThuoc`, `lCoc`, tên, công trình, khung tên, `x`/`y`                                                            | Không đổi hình. **Vá tại chỗ, giữ nguyên mọi đối tượng (handle)**: `caoDoDayBe` đổi chữ cao độ trong bảng SUB-020 và thẻ cao độ; `nhanKichThuoc` đổi chữ kích thước và thẻ cao độ. Chữ/kích thước/thẻ cao độ cần đổi mà đã bị sửa tay thì từ chối, không ghi đè; chữ đã sửa tay mà lần sửa không đụng tới thì giữ nguyên. Đổi kèm kích thước khác (ví dụ cùng `hThan`) hay kèm `x`/`y` thì dựng lại như đổi kích thước                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `soGoi`, `aGoi`                                                                                                                       | Đổi được, **mọi hình chiếu theo**: mặt bằng (block gối, nhãn `G1`…`Gn` — G1 bên phải — và ụ chống xô) và mặt chính (gối, ụ, nhãn G1…Gn trên đỉnh gối, dim `@B(G)` giữa hai gối biên), gối cách đều `aGoi` quanh tim gối bản gốc, theo dốc ngang của bệ kê gối. Mặc định 4 gối × 2000 giữ nguyên bản gốc. Đổi `soGoi` mà không cho `aGoi` và gối không còn lọt thân (`(soGoi − 1) × aGoi + 500 > bThan`) thì công cụ **tự suy** `aGoi = (bThan − 500 − 2 × 600) / (soGoi − 1)` làm tròn **xuống** bội 50 mm (lề mép 600 mm như M1); ví dụ 6 gối trên thân 8700 → 1400, trên thân 7700 → 1200. Giá trị nằm trong `data.suyRa` và trong thông báo («Đã tự suy…»): **luôn báo lại** cho người dùng, kèm «N vị trí gối cách nhau … mm». Ụ chống xô: **một ụ giữa mỗi cặp gối**, `floor(soGoi/2)` ụ, cặp lấy từ ngoài vào xen kẽ hai bên (số gối lẻ: gối giữa không có ụ); khe hẹp thì ụ vẽ hẹp lại, chừa 100 mm mỗi bên, có cảnh báo `u_chong_xo_thu_hep` |
| Số/bố trí cọc (`soCotCoc`, `soHangCoc`, tim cọc khác quy tắc trên), `bThan ≠ bBe`, `phuLot`, `tCanh`, `docNgang`, `docDoc`, `hLanCan` | **Từ chối** — tạo mới thì không vẽ gì; sửa thì hồ sơ giữ nguyên. Thông báo nêu giá trị mẫu cần đưa về. Nói với người dùng là chưa làm được **trước khi** gọi, không tự đổi sang thông số khác                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Hình chiếu tràn khung A3 sau khi dời                                                                                                  | **Từ chối**, nêu hình chiếu và lượng tràn                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Bất kỳ thay đổi hình học nào                                                                                                          | Tờ thép SUB-070/080/090 giữ hình thép M1 **không kéo giãn**, ghi «THÉP THEO M1 GỐC, CHƯA CẬP NHẬT»; SUB-100 giữ bảng M1 có cảnh báo và thêm bảng khối lượng theo thông số — phải nói rõ hồ sơ chưa có thép cho kích thước mới                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

**Nâng cao độ: xà mũ mố, bệ kê gối, đỉnh thân, đỉnh mố**

- Từ vựng trên **mố** (khác «xà mũ» của **trụ**, thuộc hướng dẫn `tru-cau`):
  - «xà mũ mố», «bệ kê gối», «đỉnh thân» → cao độ kê gối
    `seat = caoDoDayBe + hBe + hThan` (`caoDoDayBe` tính m, `hBe`/`hThan`
    tính mm: `seat = caoDoDayBe + (hBe + hThan)/1000`);
  - «đỉnh tường đỉnh», «đỉnh mố» → `seat + hDau`.
- Người dùng muốn **nâng (hạ) cao độ** một trong các chỗ trên thêm Δ mà chưa
  nói cách: **bắt buộc hỏi đúng một câu, hai lựa chọn**, không tự chọn, không
  mặc định:
  - (a) **nâng cả mố** → `caoDoDayBe += Δ` (m): mọi cao độ dời cùng Δ, kể cả
    đáy/đỉnh bệ; hình không đổi (hThan, hBe giữ), khối lượng không đổi;
  - (b) **giữ móng, kéo dài thân** → `hThan += Δ` (mm): đáy và đỉnh bệ giữ
    nguyên; bệ kê gối và mọi cao độ phía trên tăng Δ — **kể cả FG và FE**
    (cao độ mặt đường / hoàn thiện), vì mặt đường nằm trên kết cấu kê lên
    gối; thân cao hơn, khối lượng thân tăng. Khi hỏi (a)/(b) và khi báo xong
    (b), nói rõ: FG, FE tăng cùng Δ; đáy bệ, đỉnh bệ không đổi.
- **Cách nói với người dùng:** chỉ dùng tên tiếng Việt («cao độ đáy bệ», «chiều
  cao thân», «số gối», «khoảng cách gối», «bề rộng mặt đường», «tim cọc
  ngang»…). **Không** nói khóa nội bộ (`caoDoDayBe`, `hThan`, `soGoi`,
  `aCocNgang`…) — kể cả trong ngoặc, kể cả «tham số hThan» hay trong công thức
  (nói «tim cọc ngang = bề rộng bệ − 2 × đường kính cọc»). **Không** nói tên
  công cụ hay cờ (`sua_ho_so_mo`, `cap_nhat_btkl`, `mo_khoa_031`…); nói việc sẽ
  làm với bản vẽ. Các khóa, tên công cụ, cờ trong skill này chỉ để gọi công
  cụ. Trước khi gọi công cụ chỉ nói ý định («Tôi sẽ sửa hồ sơ mố…») hoặc im; nói «Đã…» và nêu số mới chỉ sau khi công cụ thành công;
  bị từ chối thì nói chưa sửa gì.
- Ví dụ câu hỏi: «Nâng xà mũ mố thêm 0,3 m theo cách nào: (a) nâng cả mố
  (đáy bệ cũng lên 0,3 m) hay (b) giữ móng, kéo dài thân thêm 300 mm?»
- Sau khi người dùng chọn: một lần `sua_ho_so_mo` với đúng một tham số đó;
  mọi hình chiếu, bảng cao độ SUB-020, thẻ cao độ và BTKL đổi theo. Báo lại
  cao độ kê gối mới.
- **Số cao độ báo người dùng lấy từ `data.caoDo`** (`keGoiTim` EL3,
  `keGoiTrai` EL4.L, `keGoiPhai` EL4.R, `dayBe`, `dinhBe`, `bang`): đó là
  chính bảng SUB-020 đã vẽ, trùng thẻ cao độ. Không tự tính lại bằng công
  thức dốc ngang — trên thân rộng hơn mẫu, số đã vẽ có thể lệch công thức
  tới 10 mm ở mép; nếu người dùng hỏi thì nói rõ.

- Hồ sơ cũ có tờ hình ghi «CHƯA DỰNG ĐƯỢC HÌNH…» (dựng trước khi có kiểm
  tra lúc tạo) bị khoá: mọi sửa kích thước bị từ chối cho tới khi đưa thông
  số ngoài lưới về giá trị mẫu **trong cùng lần gọi** `sua_ho_so_mo`, ví dụ
  `{tCanh: 500, tThan: 1800}`. Hỏi người dùng trước khi đưa về.
- Sửa: `sua_ho_so_mo` + mã lần dựng từ `mo_ta_ban_ve`; chỉ truyền phần đổi.
  Hồ sơ 0.3.0 được dựng lại **chỉ khi chưa bị sửa tay**. Đọc `canhBao`
  trong kết quả để báo các tờ không áp dụng (thép).
- **Bị từ chối vì sửa tay: dừng và hỏi, không lách.** Hồ sơ do
  `tao_ho_so_mo` / `sua_ho_so_mo` dựng chỉ đổi cao độ, kích thước, nhãn
  kích thước bằng chính các công cụ hồ sơ. Khi công cụ từ chối vì có chữ /
  thẻ cao độ / kích thước đã sửa tay: không sửa gì thêm, nêu đúng các chỗ
  công cụ liệt kê (ví dụ «ô EL6 trên SUB-020 đang là 228.900, khác số bộ sinh
  228.837») và hỏi người dùng **một lần**, chọn: đưa các chỗ đó về số bộ sinh
  rồi làm tiếp / giữ số đã sửa, không đổi thông số / hủy. Chọn đưa về số bộ
  sinh: gọi lại `sua_ho_so_mo` **một lần** với cùng thông số và
  `dua_ve_so_bo_sinh: true` — công cụ tự viết lại các chỗ đó đúng kiểu bộ sinh
  (Text, font, màu, layer) và áp thay đổi trong cùng lần gọi. **Cấm** dùng `tx.setText`,
  `execute_cad_script` hay công cụ sửa chữ khác để tăng/giảm hàng loạt chữ cao
  độ hoặc kích thước nhằm đi tiếp sau lời từ chối, để tự đưa về số bộ sinh, hoặc để hồ sơ lệch bản vẽ.
  Bản vẽ DWG/DXF nhập vào (không phải hồ sơ bộ sinh) vẫn sửa trực tiếp như
  thường.
- **Hồ sơ bộ sinh cũ (0.3.0) — mở khóa.** Hồ sơ mới là **0.3.1**. Hồ sơ 0.3.0
  mà bản vẽ vẫn khớp bộ sinh hiện tại thì sửa như thường (và thành 0.3.1).
  Bản vẽ không còn khớp (ô số màu cũ, tiêu đề «M1», thiếu nhãn gối, tờ
  «CHƯA DỰNG ĐƯỢC» của hồ sơ khoá trước M2…) thì công cụ từ chối với
  **đường mở khóa**: giải thích cho người dùng rằng hồ sơ sẽ được dựng lại
  theo 0.3.1 từ đúng thông số đã lưu (chữ/hình vẽ thêm và số sửa tay sẽ mất),
  hỏi xác nhận; đồng ý thì gọi lại `sua_ho_so_mo` **một lần** với cùng thông
  số và `mo_khoa_031: true` — dựng lại và áp thay đổi trong cùng lần. Không
  lách bằng script, không dùng `tao_ho_so_mo` thay thế. Nếu thông báo nêu cả
  chữ sửa tay thì nói rõ mở khóa sẽ mất các số đó.
- Kiểm: `kiem_tra_ho_so`; đọc và báo các mục chưa chốt, không nói đạt thiết kế.
- Xuất: `xuat_ho_so_mo` dạng `pdf` (6 trang A3), `html` (tự chứa, in được),
  `dxf`, hoặc `json`. Xuất tái sinh từ mô hình, không chứa sửa tay trên canvas.
- Cọc mặc định **2 hàng × 2 cọc D1200**; tim ngang 5300, tim dọc 3600.
- Dốc ngang dương: **trái tuyến cao**. Trên mặt chính trái tuyến nằm bên phải ảnh.
- Chưa có chiều dài cọc thì để `lCoc=0`, không tự đoán: cọc vẽ ngắt đoạn, chưa tính khối lượng cọc. Thông báo công cụ nhắc việc này — **hỏi người dùng chiều dài cọc thực** rồi sửa bằng `sua_ho_so_mo` `{lCoc: …}`.
- Các mâu thuẫn nguồn C8/C10, F3 D22/D25, W16 D14/D16 chưa được tự chốt.
- Hồ sơ dựng bằng 0.1.0 (khung cũ) và 0.2.0 (khung tên A1) vẫn dựng lại và
  xuất đúng như lúc tạo; với chúng `sua_ho_so_mo` chỉ sửa nhãn/vị trí/khung tên.

### Bóc tách khối lượng (BTKL)

Khi người dùng hỏi **khối lượng**, **bóc tách khối lượng**, **bảng khối
lượng** của mố/trụ đã dựng:

- Lập: `tao_btkl` — gom mọi hồ sơ mố (`ho_so_mo_m1`) và trụ trong bản vẽ,
  vẽ tờ A3 bảng 5 cột (STT · Hạng mục · Đơn vị · Khối lượng · Diễn giải công
  thức) bên phải bản vẽ. Đã có BTKL thì không lập chồng.
- Sau khi sửa kích thước mố/trụ: `cap_nhat_btkl` + mã lần chạy BTKL. Tờ
  BTKL dựng lại tại chỗ; không đổi gì thì không sửa.
- Tải: `xuat_btkl` — `xlsx` (sheet BTKL + sheet thép chi tiết từng thanh) hoặc
  `json`. Có cảnh báo "đã đổi từ lúc lập" thì đề nghị `cap_nhat_btkl` trước.

Mố M1 ở thông số mặc định — đối chiếu bảng SUB-100 bản gốc:

| Dòng                          |    Bản gốc |         BTKL | Nguồn / cờ                                                                                                                                                                        |
| ----------------------------- | ---------: | -----------: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bệ (trừ đầu cọc ngàm 150 mm)  |     91,721 |       91,721 | tham số                                                                                                                                                                           |
| Tường thân                    |     53,667 |       54,481 | tham số; cờ `lech_ban_goc_than` (chưa giải thích được)                                                                                                                            |
| Tường đỉnh                    |      7,267 |        7,265 | tham số (làm tròn)                                                                                                                                                                |
| Tường cánh                    |     27,710 |       27,661 | tham số; cờ `lech_ban_goc_canh`                                                                                                                                                   |
| Tai, lan can, vật tư          |    như gốc |      như gốc | số bản gốc khi hình học là M1; đổi tham số của dòng thì tính theo công thức/tỉ lệ có cờ, không có công thức thì **từ chối** dòng đó                                               |
| Ụ chống xô                    |      0,304 |        0,304 | `0,152 × floor(soGoi/2)` (1 ụ giữa mỗi cặp gối, đúng số ụ đã vẽ), không đổi theo `bThan`; số gối lẻ có cờ `u_chong_xo_goi_le`; ụ vẽ hẹp vẫn tính 0,152/ụ, cờ `u_chong_xo_thu_hep` |
| Tổng bê tông C30              |    186,253 | cộng 1.1–1.7 | dòng con nào chưa tính được thì tổng vẫn cộng phần có, ghi «CHƯA GỒM …» và cờ `tong_thieu_dong` — phải nói lại với người dùng                                                     |
| Lót C10 (trừ tiết diện cọc)   |      4,446 |        4,446 | tham số; cờ C8/C10                                                                                                                                                                |
| Ván khuôn (mặt tiếp xúc lớn)  |      266,6 |      267,146 | tham số; cờ lệch và cờ `van_khuon_cho_dinh_muc`                                                                                                                                   |
| Thép 69 thanh (kg/m bảng gốc) | 14 058,319 |   14 058,319 | đổi hình học thì **từ chối**                                                                                                                                                      |

- Vai kê bản quá độ và vút thân–cánh có trên hình nhưng bảng gốc không tính:
  BTKL liệt kê riêng (bê tông và ván khuôn), **không cộng tổng**.
- Cọc chỉ tính khi có `lCoc`; không tự đoán chiều dài.
- Mọi cờ (lệch bản gốc, mâu thuẫn chưa chốt, chờ định mức) và mọi dòng từ
  chối phải nói lại với người dùng; BTKL là bản nháp, chưa áp định mức/đơn
  giá.

### Một mặt chính hoặc từng cấu kiện — luồng cũ

`mo_mat_chinh` 2.0.0 là mặt chính nhiều tham số độc lập, khác mô hình hồ sơ
ở trên; `iTrai`/`iPhai` hỗ trợ hai mái. Các giới hạn và bảng tham số sau đây
chỉ áp dụng cách ghép cũ `mo_cau_hoan_chinh`, không áp dụng hồ sơ nhiều tờ.

**Nói rõ khi dùng luồng cũ.** Mỗi khi dựng/sửa bằng template khác hồ sơ
0.3.0 (`mo_mat_chinh`, `mo_cau_hoan_chinh`, `mo_tuong_dau`…), câu trả lời
**phải nêu tên template và tham số đã ánh xạ**, ví dụ «đang dựng template
`mo_mat_chinh` (một mặt chính, không phải hồ sơ 6 tờ), tường cánh dày 600 →
`bTai = 600`». Đây là bản vẽ khác hồ sơ: không gọi nó là hồ sơ mố, không nói
hồ sơ đã nhận thông số mà `tao_ho_so_mo` từ chối (ví dụ `tCanh = 600` vẫn bị
hồ sơ từ chối).

| Việc           | Lệnh                                                                                                                                                                                                         |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Dựng cả mố     | `ghep_bo_phan` với mã `mo_cau_hoan_chinh`. Một lệnh, đủ 5 cấu kiện và 2 lan can, cao độ nối nhau, dốc ngang chạy suốt từ đỉnh bệ trở lên. **Ưu tiên tuyệt đối**; đừng chạy 5 template lẻ rồi tự cộng cao độ. |
| Một cấu kiện   | `chay_template` với `mo_be_mong`, `mo_coc_khoan_nhoi`, `mo_tuong_than`, `mo_tuong_dau`, `tuong_phong_ho_btct`.                                                                                               |
| Sửa mố đã dựng | `mo_ta_ban_ve` lấy run id, rồi `sua_lan_chay` với **chỉ** các giá trị thay đổi. Không gọi lại `ghep_bo_phan` hay `chay_template`: sẽ vẽ chồng bản thứ hai.                                                   |
| Vị trí         | `x` là tim mố, `y` là **đáy bê tông lót** (không phải đáy bệ). Bản vẽ theo lý trình thì đặt `moc_toa_do` trước.                                                                                              |

## Tham số: lời kỹ sư → khoá template

| Kỹ sư nói                               | Khoá                       |      Mặc định | Ghi chú                                                          |
| --------------------------------------- | -------------------------- | ------------: | ---------------------------------------------------------------- |
| bề rộng mố, bề rộng bệ                  | `B`                        |          7700 | quyết định luôn bề rộng tường thân, tường đầu                    |
| chiều cao bệ                            | `hBe`                      |          2000 |                                                                  |
| dày bê tông lót                         | `hLot`                     |           100 | lót thò mỗi bên `phuLot` = 100                                   |
| chiều cao tường thân                    | `hThan`                    |          4716 | **tại tim**, đo từ đỉnh bệ; mép cao hơn tim `doDocNgang % × B/2` |
| chiều cao tường đầu                     | `hDau`                     |          1805 | từ đáy đến mặt đỉnh ngoài                                        |
| vệt mép, vai kê                         | `bVaiKe`                   |           350 | bề rộng lớp phủ = `B − 2·bVaiKe`; lan can đứng trên dải này      |
| độ hạ vai kê                            | `hVaiKe`                   |             7 | không phải dày lớp phủ, hai số rất dễ lẫn                        |
| dày lớp phủ, bê tông nhựa               | `tLopPhu`                  |            70 |                                                                  |
| tường tai: dày                          | `bTai`                     |           150 | template `mo_tuong_dau`                                          |
| tường tai: đỉnh thấp hơn đỉnh tường đầu | `haTai`                    |           594 | tường tai cao 1200 tính từ đáy tường đầu                         |
| chiều cao tường phòng hộ                | `hLanCan`                  |          1090 | lan can thép đứng thêm 588 trên đó                               |
| cọc khoan nhồi                          | `D`, `soCoc`, `khoangCach` | 1200, 2, 5300 | cự ly tim cọc = `B − 2·D`                                        |
| cao độ đáy bệ                           | `y`                        |               | `y = cao độ đáy bệ − hLot`                                       |
| độ dốc ngang                            | `doDocNgang`               |         2 (%) | xem quy ước dưới                                                 |

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

| Kiểm                     | Ngưỡng                                                                                                                                          | Rule                  |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| đường kính cọc khoan `D` | ≥ 750 mm **nếu hố khoan được kiểm tra bằng thủ công** — hỏi người dùng                                                                          | TCVN 11823-10 đ.8.1.3 |
| cự ly tim cọc `B − 2·D`  | không có ngưỡng cấm: < 4·D (khoan **không ống vách**) phải đánh giá ảnh hưởng tương tác giữa các cọc; < 6·D phải nêu trình tự khoan trong hồ sơ | 11823-10 đ.8.1.2      |
| mặt bên cọc → mép bệ     | ≥ 300 mm; với bố trí này luôn = `D/2` ⇒ `D` ≥ 600                                                                                               | 11823-10 đ.8.1.2      |
| bề rộng `B`              | ≤ 9000 mm mới khỏi cần khe phòng nứt                                                                                                            | 11823-11 đ.6.1.6      |
| `doDocNgang` mặt BTN     | 1,5 – 2,0 % (TCVN 4054 Bảng 9) · 1,5 – 2,5 % (TCVN 13592 Bảng 12)                                                                               |                       |
| `doDocNgang` là siêu cao | ≥ 2 %, ≤ 8 % đường ô tô                                                                                                                         | TCVN 4054 đ.5.5.1     |
| … đường đô thị           | theo tốc độ và bán kính (i_sc 0,02 – 0,08)                                                                                                      | TCVN 13592 Bảng 20    |

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
