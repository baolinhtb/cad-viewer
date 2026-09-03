# Mô hình tham số mố cầu

Đơn vị **mm**. Gốc template: `x = 0` tại tim mố, `y = 0` tại **đáy bê tông
lót**. Mọi số đo dưới đây lấy từ `Phantachcaukienmo_va_dat_ten_layer.dwg`,
bản chuẩn hoá của kỹ sư, và được test của thư viện đối chiếu từng cấu kiện.

## Quan hệ dẫn xuất

```
XL, XR       = ∓ B/2                       mép bệ, tường thân, tường đầu
XLL, XLR     = ∓ (B/2 + phuLot)            mép bê tông lót
YBT          = y + hLot + hBe              đỉnh bệ, nằm ngang
ydeck(x)     = YBT + hThan + hDau + x·doDocNgang/100
                                           mặt đỉnh ngoài tường đầu
ybot(x)      = ydeck(x) − hDau             đáy tường đầu = đỉnh tường thân
XMDL, XMDR   = ∓ (B/2 − bVaiKe)            mép lớp phủ
vai kê       = ydeck(XMD) + hVaiKe         mặt trên vai kê
mặt lớp phủ  = vai kê + tLopPhu
đỉnh tường tai = ydeck(mép) − haTai        cao 1200 tính từ ybot(mép)
điểm chèn lan can = mặt lớp phủ tại XMD    mỗi bên bám mép của chính nó
tim cọc      = ∓ (B/2 − D)                 khoangCach = B − 2·D
```

## Năm ràng buộc phải giữ

1. **Đáy tường đầu song song mặt đường**, cách nhau `hDau` theo phương đứng.
   Đây là mặt tiếp giáp với tường thân; sai là hai cấu kiện hở nhau.
2. **Bệ và bê tông lót luôn nằm ngang.** Dốc chỉ bắt đầu từ đỉnh bệ.
3. **Tường tai tựa lên `ybot(x)`**, đỉnh nằm ngang. Hai cạnh đứng lệch nhau
   `bTai × dốc` (150 × 2 % = 3 mm) — chấp nhận được.
4. **Lan can mỗi bên bám cao độ mép của chính nó**, không lấy cao độ tim.
5. **Vai kê hạ `hVaiKe`** so với mặt đỉnh ngoài — số nhỏ nhưng là chỗ lớp
   phủ gối lên; đổi `tLopPhu` không được đụng `hVaiKe`.

## Hệ quả khi đổi dốc

- Chiều cao tường thân tại mép phải = `hThan + doDocNgang % × B/2`; mép trái
  trừ đi cùng lượng. Với 2 % và B 7700: ±77 mm.
- Tường đầu cao đều `hDau` ở mọi hoành độ vì đáy song song đỉnh.
- Dốc 0 % làm các mốc cao độ hai bên trùng nhau.

## Vì sao các số mặc định lẻ

- `hThan` 4716,3 và `hDau` 1805 là **số đo** từ bản vẽ, không phải trị thiết
  kế tròn. Giữ nguyên để tái lập đúng bản gốc; nói với người dùng khi họ hỏi.
- Bản vẽ cho hai mép tường đầu **không song song** (1818,2 trái, 1792,0
  phải); template lấy trung bình 1805 và dựng cả hai mặt cùng dốc. Sai lệch
  còn lại là của bản vẽ, không phải của template.
- Có tài liệu khác ghi chiều cao tường thân 4793 "tại tim". Số ấy là **mép
  phải** (4716 + 2 % × 3850), không phải tim. Đừng dùng nó làm `hThan`.
- Chân tường thân chôn 50 mm vào bệ; phần ấy khuất nên template dựng từ
  đỉnh bệ.

## Thành phần một mố hoàn chỉnh

Bê tông lót, bệ, 2 cọc, tường thân, tường đầu kèm vai kê, 2 tường tai (tô
đặc), lớp phủ, 2 tường phòng hộ kèm lan can thép. Mỗi bộ phận mang nhãn ngữ
nghĩa (`mo_be`, `mo_be_tong_lot`, `mo_coc`, `mo_tuong_than`, `mo_tuong_dau`,
`mo_tuong_tai`, `lop_phu`, `lan_can`) nên `tim_bo_phan` gọi được theo tên.
