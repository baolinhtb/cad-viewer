# Kiểm bản vẽ trụ theo TCVN

Chỉ các điều khoản có trong `assets/tcvn`. Mỗi đoạn trích dưới dấu `>` là
nguyên văn tệp nguồn (test `skillCitations.spec.ts` đối chiếu từng đoạn). Trị
số đưa vào hồ sơ phải đối chiếu bản in chính thức.

## Cọc khoan nhồi — TCVN 11823-10:2017 đ.8.1.2

Tệp `TCVN_11823-10_2017_Phan-10_Nen-mong.md`, mục 8.1.2.

> Khi khoan cọc không có ống vách bảo vệ thành lỗ khoan, khoảng cách từ tim đến tim cọc khoan nhỏ hơn 4 lần đường kính, phải đánh giá ảnh hưởng tương tác giữa các cọc khoan liền kề.

> Nếu khoảng cách từ tim đến tim cọc khoan nhỏ hơn 6 lần đường kính, trình tự khoan cọc phải được nêu rõ trong hồ sơ thiết kế.

> Cọc khoan sử dụng cho nhóm cọc phải được đặt tại vị trí sao cho khoảng cách từ mặt bên của bất kỳ cọc khoan đến mặt gần nhất của bệ cọc cũng không được nhỏ hơn 300 mm.

Ba mức khác nhau: **300 mm là cấm** (template chặn); **4D và 6D chỉ phát sinh
yêu cầu** (template in ghi chú, vẫn dựng). Điều kiện 4D chỉ áp khi khoan
**không** có ống vách — hỏi người dùng.

```
mep_ngang = (bBe − (soCocNgang − 1)·aCocNgang)/2 − D/2   ≥ 300
mep_doc   = (lBe − (soCocDoc   − 1)·aCocDoc)/2   − D/2   ≥ 300
aCoc < 4·D  → (không ống vách) đánh giá tương tác
aCoc < 6·D  → nêu trình tự khoan
```

Mặc định: 550 / 600 mm ✓; 3600 < 4800 (4D) và < 7200 (6D) → cả hai yêu cầu.

## Đường kính cọc — TCVN 11823-10:2017 đ.8.1.3

> Nếu hố cọc khoan được kiểm tra bằng thủ công, thì đường kính không được nhỏ hơn 750mm.

> Đường kính thân trụ được đỡ bởi cọc khoan phải nhỏ hơn hoặc bằng đường kính cọc khoan.

Ngưỡng 750 mm **có điều kiện**: chỉ khi hố khoan được kiểm tra bằng thủ công.
Template không chặn D < 750 mm mà in ghi chú trên cả hai hình: «D = … mm <
750 mm: hố khoan không được kiểm tra thủ công (TCVN 11823-10:2017 đ.8.1.3) —
nếu kiểm tra thủ công cần D ≥ 750 mm». Câu thứ hai áp cho thân trụ đặt thẳng
lên cọc; template luôn có bệ.

## Chiều rộng đỡ dầm — TCVN 11823-4:2017 đ.7.4.4, Phương trình 25, Bảng 16

Tệp `TCVN_11823-4_2017_Phan-4_Phan-tich-va-Danh-gia-ket-cau.md`.

> Bề rộng đỡ dầm, theo kinh nghiệm phải lấy như sau:

```
N = (200 + 0,0017·L + 0,0067·H)·(1 + 0,000125·S²)        (mm)   — Phương trình 25
```

> - N = chiều dài đỡ dầm tối thiểu được đo vuông góc với đường trục của gối (mm)

- `L` → `lNhip`: chiều dài mặt cầu tới khe co giãn kế bên, hoặc tới cuối mặt
  cầu (mm) — hỏi người dùng.
- `H`: với trụ, chiều cao của cột hoặc trụ (mm) — template lấy `hThan + hXaMu`.
- `S` → `gocXien`: độ chéo mặt đỡ (độ) — hỏi người dùng; 0 nếu cầu thẳng góc.
- Bảng 16 → `phanTramN`: phần trăm của N theo vùng động đất (50, 100, 150).
  **Không tự chọn vùng** — hỏi người dùng.

> Bề rộng đỡ dầm (chiều dài chồng lấn giữa mặt mố trụ và dầm cầu) tại vị trí gối di động mà không có thiết bị truyền động, STUs, hoặc bộ giảm chấn phải lấy lớn hơn chuyển vị cực đại tính theo các quy định của Điều 7.4.3 trừ các cầu ở Vùng động đất 1,hoặc phần trăm của bề rộng lấy theo kinh nghiệm, N, như cho trong Phương trình 25, hoặc phải đặt các neo giữ chiều dọc theo Điều 9.9.5 Phần 3 bộ tiêu chuẩn này.

Bề rộng đỡ là phần **dầm chồng lên mặt trụ**. Template không có đầu dầm, nên
so N với cận trên: hai hàng gối (hai nhịp giản đơn) thì mỗi nhịp tựa nhiều
nhất trên nửa xà mũ, `lXaMu/2`; một hàng thì `lXaMu`. Khe đầu dầm chưa trừ —
"đạt" ở đây chỉ là đạt cận trên, nói rõ với người dùng; "không đạt" là chắc
chắn không đạt.

**Template kiểm khi có cả `lNhip` và `phanTramN`** (cả `chay_template` lẫn
`ghep_bo_phan`): không đạt thì **chặn** — PT 25 là yêu cầu tối thiểu — và
thông báo nêu N, H, bề rộng có sẵn và `lXaMu` cần. Thiếu một trong hai thì
không kiểm; `ghep_bo_phan` báo «Chưa kiểm chiều rộng đỡ dầm N (TCVN 11823-4
đ.7.4.4)». Phần "chuyển vị cực đại theo Điều 7.4.3" và "neo giữ" trong đoạn
trên không kiểm ở đây.

Số tay (mặc định: H = 6000 + 1500 = 7500, hai hàng gối → có sẵn 1000):

| L | S | % | N | Kết quả |
|---:|---:|---:|---:|---|
| 33 000 | 0 | 100 | 200 + 56,1 + 50,25 = 306,35 | đạt (cận trên) |
| 300 000 | 0 | 100 | 760,25 | đạt (cận trên) |
| 300 000 | 0 | 150 | 1140,4 | **chặn**: cần `lXaMu` ≥ 2282 |

## Bảo vệ trụ — TCVN 11823-11:2017 đ.7.2

> Nếu vị trí trụ cầu nằm trong phạm vi cách đường sắt 7,5m, nên xây tường chắn chống va chạm.

(đ.7.2.2 — "nên", không phải "phải". Hỏi khoảng cách tới đường sắt nếu có.)

> Phải thiết kế trụ cầu chịu được các tác động do xói gây ra theo quy định về xói tại Điều 6.4.4.2 Phần 2 bộ tiêu chuẩn này.

(đ.7.2.3 — định tính, không kiểm từ bản vẽ.)

> Ở nơi cần thiết, phải thiết kế mặt cắt trụ có hình mũi vát để có thể làm chệch hướng di chuyển của các vật trôi hoặc cây trôi.

(đ.7.2.4 — template không vẽ mũi vát; nêu khi trụ đứng trong dòng chảy.)

đ.7.2.1 (va chạm phương tiện) dẫn sang Phần 3: không kiểm ở đây.

## Không kiểm

TCVN 11823-11:2017 đ.7.1 dẫn tải trọng sang Phần 3 và thiết kế kết cấu sang
Phần 5, 6: sức kháng, cốt thép, tải trọng, chiều dài và sức kháng cọc đều
ngoài phạm vi skill này. Báo rõ, không im lặng bỏ qua.
