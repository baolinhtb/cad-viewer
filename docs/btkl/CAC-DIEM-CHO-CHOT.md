# BTKL kết cấu — các điểm chờ chốt

Bóc tách khối lượng (BTKL) phần kết cấu cầu trong Cadview — mố
`ho_so_mo_m1` và trụ `tru_mat_chinh` / `tru_mat_ben` (`tru_cau_hoan_chinh`) —
đang chạy với một số **giả định tạm**. Tài liệu này liệt kê từng câu hỏi còn
mở. Mỗi câu ghi giả định đang cài và chỗ cần sửa trong code hoặc tham số khi
chủ dự án chốt.

Mọi dòng khối lượng chịu ảnh hưởng của một giả định đều mang **cờ** trên tờ
A3 và trong xlsx (chữ đỏ `[!]` trên tờ, `⚑` trong xlsx). Xem
[Hướng dẫn sử dụng](./HUONG-DAN-SU-DUNG.md).

Mã nguồn BTKL nằm ở `packages/cad-template-plugin/src/btkl/`. Các tên dưới
đây là tên hằng, hàm và tham số trong mã; tài liệu không ghi số dòng vì số
dòng thay đổi theo thời gian.

---

## Câu hỏi mở

### 1. Văn bản hướng dẫn đo bóc khối lượng của Bộ Xây dựng

- **Câu hỏi:** áp dụng văn bản nào (số hiệu, năm)? Văn bản đó quy định mặt
  nào tính ván khuôn và chỗ giao nhau trừ ra sao?
- **Đang cài:**
  - **Ván khuôn mố** tính diện tích mặt tiếp xúc lớn, theo cách bản gốc M1
    tính: 4 mặt bên bệ, 2 mặt lớn của tường thân, tường đỉnh và mỗi tường
    cánh. Ở M1 ra 267,146 m², bảng gốc ghi 266,600 m² (chênh +0,546). Tôi
    không tìm được cách đo nào ra đúng số của bảng gốc.
  - **Ván khuôn trụ** dùng cùng quy tắc: 4 mặt bên bệ, 2 mặt lớn thân, 2 mặt
    chính xà mũ; cột tròn tính theo chu vi. Mặt đầu và mặt đáy xà mũ cùng đá
    kê được liệt kê riêng, không cộng tổng.
  - **Trừ cọc:** bệ trừ phần đầu cọc ngàm 150 mm; lớp bê tông lót/đệm trừ
    tiết diện cọc xuyên qua. Hai quy tắc này đọc ra từ chính số liệu bản gốc
    và khớp đúng ở M1.
  - Cờ: `van_khuon_cho_dinh_muc` (mố và trụ), `lech_ban_goc_van_khuon` (mố
    M1).
- **Chỗ sửa khi chốt:**
  - `src/btkl/mo.ts`: mảng `formFaces` (mục 5) và cờ `van_khuon_cho_dinh_muc`;
    hằng `BTKL_PILE_EMBED` (150 mm) cùng công thức dòng `be` và `lot`.
  - `src/btkl/tru.ts`: mục 4 (ván khuôn), mục 6 (phần liệt kê riêng),
    `FORMWORK_FLAG`.
  - Test khoá số: `__tests__/btklMo.spec.ts`, `__tests__/btklTru.spec.ts`.

### 2. Định mức, đơn giá và vùng

- **Câu hỏi:** chỉ cần khối lượng hay cần cả dự toán? Nếu cần dự toán thì
  dùng bộ định mức nào, đơn giá vùng nào?
- **Đang cài:** chỉ tính khối lượng. Không có mã hiệu định mức, đơn giá hay
  thành tiền. Dòng thép có tách nhóm đường kính ≤ 10, 10–18 và > 18 mm
  (dòng 6.9–6.11, không cộng tổng) để sau này ghép định mức gia công.
- **Chỗ sửa khi chốt:**
  - thêm mã định mức vào kiểu dòng khối lượng `AcTpBtklItem`
    (`src/btkl/types.ts`) hoặc dùng một bảng tra riêng;
  - thêm cột vào `src/btkl/workbook.ts` (sheet "BTKL");
  - tờ A3 hiện là 5 cột, khai báo ở `FIXED` và `HEADERS` trong
    `src/btkl/sheets.ts`.

### 3. Mẫu xlsx của văn phòng

- **Câu hỏi:** văn phòng có mẫu biểu riêng không (tên sheet, tiêu đề, ô chữ
  ký, cột)?
- **Đang cài:**
  - sheet **BTKL** có 5 cột STT · Hạng mục · Đơn vị · Khối lượng · Diễn giải
    công thức; các thông tin so với bản gốc, cờ và lý do từ chối ghi trong
    cột Diễn giải;
  - mỗi đối tượng có một **sheet thép chi tiết**. Mố M1 có 69 dòng thanh,
    tổng dài, kg/m, khối lượng tính bằng công thức Excel và dòng tổng `SUM`.
- **Chỗ sửa khi chốt:**
  - `src/btkl/workbook.ts`: các hàm `btklSheet` và `steelSheet`, hằng
    `STEEL_HEAD`;
  - kiểu chữ, viền và định dạng số: `STYLES` trong `src/btkl/xlsx.ts`.

### 4. Khối lượng đơn vị thép

- **Câu hỏi:** dùng kg/m làm tròn của bảng gốc hay công thức d² × 0,00617?
- **Đang cài:**
  - M1 dùng **kg/m của bảng gốc**, ghi rõ nguồn, nên tổng 14 058,319 kg khớp
    tuyệt đối;
  - thanh nào không có kg/m trong bảng gốc thì dùng d² × 0,00617 (hàm
    `acTpSteelKgPerM`);
  - nếu dùng công thức cho cả M1, tổng sẽ là 14 058,388 kg (+0,07 kg).
- **Chỗ sửa khi chốt:**
  - `src/btkl/mo.ts`: dòng `const kgPerM = b.kgPerM ?? acTpSteelKgPerM(...)`;
  - `src/btkl/sourceM1.ts`: hàm `acTpSteelKgPerM`;
  - dữ liệu thanh: `src/dossier/reference/bars.json`.

### 5. Mâu thuẫn hình và bảng trong bản gốc

- **Câu hỏi:** kỹ sư chốt giá trị nào?
  - thanh **F3**: hình ghi D22 và D25, bảng ghi D22;
  - thanh **W16 / W16′**: hình ghi D14, bảng ghi D16;
  - **bê tông lót**: hình ghi C8, bảng ghi C10.
- **Đang cài:**
  - theo bảng gốc, gắn cờ `mau_thuan_f3`, `mau_thuan_w16`, `mau_thuan_lot`;
  - dòng lót ghi "Bê tông đệm C10".
- **Chỗ sửa khi chốt:**
  - đặt tham số hồ sơ mố `thepF3`, `thepW16`, `beTongLot` (khai báo trong
    `src/dossier/model.ts`) bằng `sua_ho_so_mo`, rồi chạy `cap_nhat_btkl`;
  - chọn `thepF3 = D25` hoặc `thepW16 = D14` có nghĩa là cần phương án thép
    mới, nên dòng thép sẽ bị từ chối;
  - các cờ nằm trong `src/btkl/mo.ts`.

### 6. Tường thân lệch +0,814 m³ so với bản gốc

- **Câu hỏi:** bảng SUB-100 ghi 53,667 m³, còn hình học 7,7 × 1,5 × 4,717 =
  54,481 m³. Kỹ sư đã tính tường thân bằng chiều cao và bề rộng nào?
- **Đã loại trừ:**
  - lấy chiều cao mép thấp H2A: ra 53,592;
  - trừ phần cánh chồng lên thân: ra 52,122;
  - vai kê và vút: chỉ làm tăng khối lượng;
  - tổng thân + đỉnh + cánh của bảng gốc (88,644) nhỏ hơn khối hình học hợp
    lại (90,792), nên chênh lệch không phải do chia ranh giới giữa các dòng
    khác đi.
- **Đang cài:** tính theo hình học và gắn cờ `lech_ban_goc_than`. Tường cánh
  cũng lệch −0,049 m³ và mang cờ `lech_ban_goc_canh`.
- **Chỗ sửa khi chốt:**
  - dòng `than` trong `src/btkl/mo.ts`;
  - số bản gốc ở `BTKL_M1_SOURCE` (`src/btkl/sourceM1.ts`);
  - số đo lại được bằng `node tools/fidelity/btkl-do.mjs`.

### 7. Các tờ SUB-030 … SUB-060 đang ở đâu

- **Câu hỏi:** DWG gốc chỉ có SUB-010, 020, 070, 080, 090 và 100. Chi tiết
  tường tai, ụ chống xô, lan can, gối và 17 số hiệu thép (C1–C2, G1–G2,
  S1–S6, N1–N3, T1–T2) có ở tệp nào khác không?
- **Đang cài:**
  - tường tai, ụ chống xô, lan can và vật tư (vữa, ống PVC, bọt xốp, hộp
    chốt, BT nhựa) **lấy số bản gốc** khi hình học là M1 và **bị từ chối**
    khi hình học đổi;
  - tường tai tính lại được: 2 × 0,15 × 1,2 × N = 0,360. Công thức đã ghi
    trong cột diễn giải nhưng chưa dùng khi hình học đổi.
- **Chỗ sửa khi có tờ:**
  - hàm `fromSource` và các dòng `tai`, `u_chong_xo`, `lan_can`, `vua`,
    `ong_pvc`, `bot_xop`, `hop_chot`, `bt_nhua` trong `src/btkl/mo.ts`;
  - hằng `EAR` (tường tai).

### 8. Khối lượng tuyến (đường)

- **Câu hỏi:** có làm khối lượng phần tuyến (nền, mặt đường, an toàn giao
  thông…) không, và phạm vi đến đâu?
- **Đang cài:** **chưa làm**. BTKL chỉ có phần kết cấu cầu.
- **Chỗ sửa:** cần một bộ tính mới đặt cạnh `src/btkl/mo.ts` và
  `src/btkl/tru.ts`, sau đó thêm loại đối tượng mới vào `AcTpBtklObject`
  (`src/btkl/template.ts`) và hàm `acapBtklObjects` (`src/btkl/tools.ts`).

### 9. Mác bê tông trụ

- **Câu hỏi:** bệ, thân, xà mũ, đá kê và lót của trụ dùng mác nào?
- **Đang cài:**
  - template trụ chưa có tham số mác, nên dòng ghi "Bê tông trụ (mác chưa
    chốt)" và "Bê tông lót (mác chưa chốt)", kèm cờ `mac_be_tong_chua_chot`;
  - khối lượng vẫn tính đủ.
- **Chỗ sửa khi chốt:**
  - thêm tham số mác vào `library/tru_mat_chinh.js` và
    `library/tru_mat_ben.js`, sửa cả hai tệp giống nhau và nâng phiên bản
    template;
  - cập nhật `BTKL_TRU_DEFAULTS` và `GRADE_FLAG` trong `src/btkl/tru.ts`.

### 10. Chiều dài cọc `lCoc = 0`

- **Câu hỏi:** chiều dài cọc thực của mố và trụ là bao nhiêu?
- **Đang cài:**
  - `lCoc = 0` nghĩa là **chưa biết**, nên dòng "Bê tông cọc khoan nhồi" bị
    từ chối với lý do "Chưa có chiều dài cọc (lCoc = 0)". Bản gốc cũng không
    thống kê cọc;
  - khi có `lCoc`, khối lượng = số cọc × π × D²/4 × lCoc.
- **Chỗ sửa:** chỉ cần nhập tham số `lCoc` (mm):
  - mố: `sua_ho_so_mo`;
  - trụ: `sua_lan_chay` trên **cả hai** lần chạy (mặt chính và mặt bên).

  Sau đó chạy `cap_nhat_btkl`. Không cần sửa code.

---

## Giới hạn đã biết

- **Vai kê bản quá độ và vút thân–cánh** (mố) có trên hình nhưng bảng gốc
  không tính. BTKL liệt kê riêng ở mục 7: bê tông 0,915 và 0,467 m³; ván
  khuôn 4,853 và 4,407 m². Các dòng này **không cộng vào tổng**.
- **Giả định trụ** do chủ dự án chốt tạm, mỗi giả định mang cờ `gia_dinh` ở
  dòng chịu ảnh hưởng:
  - thân cột (`loaiThan = cot`) là **cột tròn** đường kính `dCot`;
  - đầu cọc **ngàm 150 mm** vào bệ như mố, dù template trụ vẽ đầu cọc tại đáy
    bệ;
  - cọc **không có ống vách**.

  Vị trí trong code: `ROUND_COLUMNS`, `PILE_EMBED`, `NO_CASING` trong
  `src/btkl/tru.ts`.

- **Thép trụ luôn bị từ chối.** Template trụ là bố cục sơ bộ, không có bố
  trí thép.
- **Thép mố** chỉ có khi hình học là M1 gốc. Đổi kích thước hình học (trừ
  `lCoc` và `caoDoDayBe`), hoặc chọn `thepF3 = D25` / `thepW16 = D14`, thì
  dòng thép bị từ chối.
- **Trụ có hai lần chạy:** trụ dựng bằng `tru_cau_hoan_chinh` gồm mặt chính
  và mặt bên, và BTKL đếm một lần nhờ hai lần chạy có cùng thông số. Nếu chỉ
  sửa một lần chạy, hai hình lệch nhau và BTKL sẽ đếm thành **hai trụ**.
  Luôn sửa cả hai lần chạy.
- **Tờ BTKL là kết quả tính:** `cap_nhat_btkl` xoá và dựng lại tờ, nên mọi
  sửa tay trên tờ BTKL sẽ mất.
- **Lỗi đo bề rộng chữ có dấu (SDK):** hàm `acTpEstimateTextWidth`
  (`packages/cad-template-sdk/src/AcTpDrawingFrame.ts`) đo thấp bề rộng chữ in
  hoa có dấu. Vì vậy khung tên không tự thu nhỏ chữ dài và chữ tràn ô. Tờ
  BTKL đang tránh lỗi bằng cách ghi tên ngắn "BẢNG KHỐI LƯỢNG KẾT CẤU" trong
  khung tên (`tenBanVe` trong `src/btkl/sheets.ts`). Sửa hàm này sẽ đổi khung
  tên của mọi hồ sơ đã có, nên để thành một bước riêng.
- **Không xuất PDF trực tiếp:** `xuat_btkl` chỉ có `xlsx` và `json`.
