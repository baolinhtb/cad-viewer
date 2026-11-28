# Mô hình hình học trụ cầu (template `tru_mat_chinh`, `tru_mat_ben` 1.1.0)

Bố cục sơ bộ, chưa đối chiếu bản vẽ văn phòng. Tài liệu này nói template vẽ
gì và vì sao; không có số nào ở đây là trị số của tiêu chuẩn.

## Chuỗi cao độ (chung cho hai hình)

```
đáy lót        = y
đáy bệ         = y + hLot
đỉnh bệ        = y + hLot + hBe
đáy xà mũ      = đỉnh bệ + hThan
đỉnh xà mũ     = đáy xà mũ + hXaMu
đỉnh đá kê     = đỉnh xà mũ + hDaKe
chiều cao trụ  = hThan + hXaMu          (dùng làm H khi tính N, xem tcvn-check)
```

Hai hình chiếu chỉ khác hướng nhìn, nên mọi cao độ trên hai hình phải bằng
nhau. `tru_cau_hoan_chinh` bảo đảm điều đó vì dựng cả hai từ một bộ số.

## Mặt chính (nhìn dọc tuyến — trục ngang là phương ngang cầu)

- Bê tông lót rộng `bBe + 2·phuLot`; bệ rộng `bBe`.
- `soCocNgang` cọc, tim–tim `aCocNgang`, đối xứng qua tim trụ.
- Thân tường: chữ nhật rộng `bThan`. Thân cột: `soCot` cột rộng `dCot`, tim
  cách nhau `aCot`.
- Xà mũ dài `bXaMu`: đỉnh phẳng; đáy phẳng trên thân, vát từ cao độ đáy tại
  thân lên tới `hXaMuDau` ở đầu hẫng trên đoạn `lHang`. `lHang = 0` là xà mũ
  chữ nhật có bậc ở đầu.
- Một hàng `soGoi` đá kê rộng `bDaKe`, tim cách nhau `aGoi` (hàng thứ hai,
  nếu có, nằm khuất sau).
- Ghi chú: lời nhắc bố cục sơ bộ, chiều dài cọc chưa biết, và các yêu cầu
  của TCVN 11823-10:2017 đ.8.1.2: tim–tim < 4D khi khoan không ống vách thì
  đánh giá tương tác giữa các cọc; < 6D thì nêu trình tự khoan; D < 750 mm
  thì nhắc điều kiện kiểm tra thủ công của TCVN 11823-10:2017 đ.8.1.3.

## Mặt bên (nhìn ngang tuyến — trục ngang là phương dọc cầu)

- Lót `lBe + 2·phuLot`; bệ `lBe`; `soCocDoc` hàng cọc, tim–tim `aCocDoc`.
- Thân dày `tThan` (tường) hoặc `dCot` (cột — các cột xếp theo ngang cầu nên
  chồng lên nhau thành một).
- Xà mũ rộng `lXaMu`, thấy đủ chiều cao `hXaMu`; nét ngang ở cao độ
  `đỉnh − hXaMuDau` là cạnh đáy của mặt đầu hẫng, nằm phía trước.
- Đá kê: một hàng ở tim (`soHangGoi = 1`) hoặc hai hàng ở `±eGoi`.
- Khối GHI CHÚ chỉ khi D < 750 mm (một dòng, như mặt chính); mặc định không có.

## Ràng buộc template tự kiểm

```
thân ngang  = bThan                      (tường)
            = (soCot − 1)·aCot + dCot    (cột)
thân dọc    = tThan | dCot

hXaMuDau ≤ hXaMu
lHang ≤ (bXaMu − thân ngang)/2           đoạn vát dừng trước thân
thân ngang ≤ bBe, ≤ bXaMu ; thân dọc ≤ lBe, ≤ lXaMu
(soGoi − 1)·aGoi + bDaKe ≤ bXaMu
2 hàng gối: 2·eGoi + lDaKe ≤ lXaMu và 2·eGoi ≥ lDaKe
mép cọc → mép bệ = (bBe − (soCocNgang − 1)·aCocNgang)/2 − D/2 ≥ 300   (TCVN 11823-10:2017 đ.8.1.2)
                 = (lBe − (soCocDoc − 1)·aCocDoc)/2 − D/2 ≥ 300
```

Với mặc định: mép cọc → mép bệ là 550 mm (ngang cầu) và 600 mm (dọc cầu).

Chiều rộng đỡ dầm N (TCVN 11823-4:2017 đ.7.4.4) — chỉ khi có cả `lNhip` và
`phanTramN`; thiếu một trong hai thì **không kiểm**, hình không đổi:

```
H     = hThan + hXaMu
N     = (200 + 0,0017·lNhip + 0,0067·H)·(1 + 0,000125·gocXien²) × phanTramN/100
có sẵn = lXaMu / soHangGoi              cận trên: khe đầu dầm chưa trừ
có sẵn < N  → chặn, nêu N và lXaMu cần (= ⌈N⌉·soHangGoi)
0 < phanTramN < 50 → chặn (Bảng 16 thấp nhất 50 %)
```

D < 750 mm không chặn: in ghi chú điều kiện kiểm tra thủ công (TCVN
11823-10:2017 đ.8.1.3) trên cả hai hình.

## Cách ghép `tru_cau_hoan_chinh`

Mặt bên đặt tại `x + kcHinh` (mặc định 21000). Khối GHI CHÚ mặt chính nằm
**bên phải** mặt chính (cách 400, rộng tới 8000), tức là giữa hai hình, nên:

```
kcHinh ≥ max(bBe/2 + phuLot, bXaMu/2) + max(lBe/2 + phuLot, lXaMu/2) + 11000
       = 6000 + 3100 + 11000 = 20100   (mặc định)
```

Nhỏ hơn thì ghép bị từ chối («Chưa vẽ gì: kcHinh = … nhỏ hơn mức tối thiểu
…»), không tự nâng. Công thức cũ `… + 4000` (kcHinh 16000) để khối GHI CHÚ đè
lên xà mũ mặt bên. `lNhip`, `gocXien`, `phanTramN` là thông số tuỳ chọn của
cách ghép: không truyền thì không đưa vào lần chạy.

`khungTen = 1` (tuỳ chọn): trước khi vẽ, cách ghép dựng thử hai hình để đo
(cả kích thước và GHI CHÚ), chọn **một** tỉ lệ cho cả hai tờ — tỉ lệ lớn nhất
trong 1:20, 1:25, 1:50, 1:100, 1:125, 1:150, 1:200, 1:250, 1:500 mà mỗi hình vừa
vùng vẽ A3 (chừa lề 8 mm và dải 15 mm cho tiêu đề hình) — rồi đặt tờ mặt chính
quanh mặt chính, tờ mặt bên sát bên phải (cách 20 mm giấy), cùng đường đáy.
Hình vẫn vẽ 1:1 ở `x`, `y` người dùng cho (mặt bên dời sang tờ thứ hai); khung
phóng 1:n quanh hình, nên kích thước đọc đúng số thật. Mặc định (bệ 9500, xà
mũ 12000, thân 6000) ra 1:100. Không vừa ở 1:500 thì từ chối «Chưa vẽ gì: …».

## Không vẽ

Gối cầu, dầm, cốt thép, ống vách, mũi vát thân trụ chống vật trôi, tường chắn
va chạm, mặt bằng trụ. Chiều dài cọc chỉ vẽ khi người dùng cho `lCoc`; `0` là
đoạn ngắn có nét lượn "còn tiếp".
