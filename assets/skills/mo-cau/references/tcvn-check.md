# Kiểm bản vẽ mố theo TCVN

Bảng tra nhanh cho tham số mố. Nguyên văn điều khoản: `tra_cuu_tieu_chuan`
với câu hỏi cụ thể, ví dụ "cự ly tim cọc khoan nhồi tối thiểu". Trị số đưa
vào hồ sơ phải đối chiếu bản in chính thức.

## Cọc

| Kiểm | Ngưỡng | Điều khoản | Với mặc định |
|---|---|---|---|
| đường kính cọc khoan | ≥ 750 mm **nếu hố khoan được kiểm tra bằng thủ công** | TCVN 11823-10:2017 đ.8.1.3 | 1200 ✓ |
| cự ly tim – tim, cọc khoan | < 4·D khi khoan **không ống vách** ⇒ phải đánh giá ảnh hưởng tương tác giữa các cọc liền kề (không phải ngưỡng cấm) | 11823-10 đ.8.1.2 | 5300 ≥ 4800 → không phát sinh |
| cự ly tim – tim, cọc khoan | < 6·D ⇒ trình tự khoan phải được nêu rõ trong hồ sơ thiết kế (không phải ngưỡng cấm) | 11823-10 đ.8.1.2 | 5300 < 7200 → **phải nêu trình tự khoan** |
| cự ly tim – tim, cọc đóng | ≥ 750 mm và ≥ 2,5·D | 11823-10 đ.7.1.2 | — |
| mặt bên cọc → mép bệ, cọc khoan | ≥ 300 mm | 11823-10 đ.8.1.2 | 600 ✓ |
| mặt ngoài cọc → mép bệ, cọc đóng | ≥ 225 mm | 11823-10 đ.7.1.2 | — |
| đầu cọc ngàm vào bệ | ≥ 300 mm | 11823-10 đ.7.1.2 | template ngàm 150 trên mặt đáy bệ; **không kiểm được trên mặt chính** |

Công thức từ tham số:

```
cu_ly_tim_coc       = B − 2·D            (= khoangCach)
mat_ben_coc_den_mep = D/2                (bố trí hiện tại, với mọi D)
```

⇒ ràng buộc ẩn của bố trí hiện tại: **`D` ≥ 600** mới đủ 300 mm tới mép bệ.

Nguyên văn đ.8.1.2 và đ.8.1.3 (tệp `TCVN_11823-10_2017_Phan-10_Nen-mong.md`):

> Khi khoan cọc không có ống vách bảo vệ thành lỗ khoan, khoảng cách từ tim đến tim cọc khoan nhỏ hơn 4 lần đường kính, phải đánh giá ảnh hưởng tương tác giữa các cọc khoan liền kề.

> Nếu hố cọc khoan được kiểm tra bằng thủ công, thì đường kính không được nhỏ hơn 750mm.

## Thân mố, tường

| Kiểm | Ngưỡng | Điều khoản |
|---|---|---|
| khoảng cách khe phòng nứt | ≤ 9000 mm | TCVN 11823-11:2017 đ.6.1.6 |
| khoảng cách khe co giãn | ≤ 27000 mm | 11823-11 đ.6.1.6 |
| chiều dài tường cánh | đủ chắn đất và chống xói theo mái dốc nền đầu cầu | 11823-11 đ.6.1.4 (định tính) |

`B` = 7700 < 9000 → một đốt mố không cần khe phòng nứt.

## Độ dốc ngang mặt đường

| Nguồn | Mặt BTN, BTXM |
|---|---|
| TCVN 4054:2005, Bảng 9 | **1,5 – 2,0 %** |
| TCVN 13592:2022, Bảng 12 | **1,5 – 2,5 %** |

Siêu cao (TCVN 4054:2005 đ.5.5.1): lớn nhất **8 %**, nhỏ nhất **2 %** cho
đường ô tô. Đường đô thị: TCVN 13592:2022 Bảng 20 cho i_sc theo tốc độ thiết
kế và bán kính (0,02 – 0,08); không có một ngưỡng chung.

Yêu cầu dốc trên 2,5 % ⇒ chỉ hợp lệ khi mố nằm trong đường cong có siêu cao.
Hỏi xác nhận, nêu hai ngưỡng, rồi mới dựng. Dốc **một mái** (một trị số qua
tim) là dạng của đoạn siêu cao; dốc **hai mái** là đoạn thẳng thông thường
và template hiện chưa dựng được.

## Ghi vào báo cáo

Kèm số điều khoản để người dùng truy ngược. Nói rõ mục nào **không kiểm
được tự động** (định tính, hoặc không thể hiện trên mặt chính) thay vì im
lặng bỏ qua.
