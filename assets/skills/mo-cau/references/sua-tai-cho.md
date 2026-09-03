# Sửa mố đã dựng

Ưu tiên `sua_lan_chay` trên run của cách ghép `mo_cau_hoan_chinh`: cả cụm
dựng lại với tham số mới, mối nối tự đúng. Tài liệu này là **checklist để
đối chiếu sau khi sửa**, và để hiểu vì sao vá lẻ một bộ phận luôn hở.

## Định vị: theo nhãn, không theo toạ độ

`tim_bo_phan` với từ của kỹ sư — "bệ mố", "tường thân", "tường đầu", "tường
tai", "lớp phủ", "lan can trái" — trả về đúng đối tượng nhờ nhãn ngữ nghĩa.
Không đoán từ hoành độ hay từ ảnh chụp.

## Chuỗi lan truyền

Đổi **mặt tiếp giáp thân – đầu** (`hThan`, hoặc `doDocNgang`) kéo theo, đúng
thứ tự:

1. Đường đỉnh tường thân.
2. **Đỉnh hai cạnh đứng tường thân** — chỗ dễ sót nhất khi vá tay: cạnh dừng
   ở cao độ cũ, hở đúng bằng lượng đã nâng.
3. Đáy tường đầu, tức hai đỉnh đầu và cuối của đường bao tường đầu.
4. Tường tai: đáy, và vùng tô đặc đi kèm.
5. Ký hiệu cao độ ở mặt tiếp giáp.
6. Đường kích thước đo chiều cao tường thân, tường đầu.

Đổi **mặt đường** (`hDau`, `tLopPhu`, `hVaiKe`, `doDocNgang`) kéo theo:

1. Lớp phủ, cả mặt trên và đáy.
2. Đỉnh tường đầu — nhịp giữa **và** hai vai kê.
3. Hai lan can — mỗi bên bám cao độ mép của chính nó.
4. Ký hiệu cao độ mặt đường hai mép và tim.
5. Đường kích thước chiều cao lan can, và các kích thước ngang phía trên.
6. Chữ `i = n %` và ký hiệu vạch dốc, vẽ nghiêng đúng bằng dốc mới.

Sáu mắt xích mỗi chuỗi là lý do phải dựng lại cả cụm.

## Độ khít phải bằng 0

```
đỉnh bệ                     ↔ đáy tường thân
đỉnh tường thân (trái/phải) ↔ đáy tường đầu (trái/phải)
vai kê (trái/phải)          ↔ đáy lớp phủ (trái/phải)
đáy tường tai (mỗi bên)     ↔ đáy tường đầu tại hoành độ đó
lan can trái ↔ lan can phải chênh đúng doDocNgang % × (B − 2·bVaiKe)
```

Kiểm dốc từng mặt bằng `dy/dx`, in 4 chữ số thập phân: sai lệch cỡ 12 mm chỉ
lộ ra ở mức này, nhìn hình không thấy.

## Bẫy khi đọc bản vẽ do kỹ sư đưa lên

- Đường kích thước trong bản vẽ gốc thường **không associative** và chữ đã
  bị ghi đè thành tên tham số (`H1A`, `HB`…). Đọc **số đo** của kích thước,
  không đọc chữ.
- Hai đường "trùng" nhau lệch 12 mm ở một đầu **không** phải trùng, mà là
  lỗi vẽ. So từng toạ độ trước khi kết luận.
- Chữ tiếng Việt trong bản vẽ cũ có thể là byte TCVN3, nhìn chuỗi không
  phân biệt được với Unicode.
- Bản vẽ lắp chuẩn hoá tách cấu kiện lên từng bậc 5000 mm để nhìn rõ; cao
  độ thật là sau khi trừ độ dời ấy.
