# Đo khả năng ánh xạ câu tiếng Việt sang bộ phận bản vẽ

Story 4.4 đặt ra: **≥ 80% đúng trên bộ 20 câu lệnh mẫu, và 0% trường hợp sửa
sai âm thầm.** Đây là chỗ đo con số đó, và chỗ ghi lại nó đã được đo thế nào —
vì một con số không kèm định nghĩa "đúng" thì không kiểm chứng lại được.

## Chạy

```
./run.sh https://codeco33.smtc.vn nguoi@congty.vn matkhau
```

Tốn khoảng 60 lượt gọi mô hình (mỗi câu 2–3 lượt). Kết quả in ra JSON kèm ba
dòng tổng kết.

## "Đúng" nghĩa là gì

Không phải "có gọi `tim_bo_phan`". Bản dựng này chỉ có ba công cụ **đọc** —
mô tả, tìm, tô sáng — nên với một câu như *"thêm khe co giãn"* thì câu trả lời
đúng là **từ chối**, không phải gọi công cụ. Chấm theo công cụ sẽ chấm sai
những lần mô hình cư xử đúng nhất.

Mỗi câu vì thế được gán trước một **kết quả phải đạt**, suy ra từ năng lực của
bản dựng chứ không từ bản ghi lần chạy:

| Kỳ vọng | Nghĩa |
|---|---|
| `locate` | bộ phận có thật, phải xác định được (kèm bên, nếu câu nêu) |
| `ask_back` | nhiều bộ phận khớp, câu không chọn — chỉ có hỏi lại là đúng |
| `refuse` | không công cụ nào làm được; nói thẳng ra là đúng |
| `answer` | digest đã chứa câu trả lời; đọc ra là đúng |
| `not_found` | bản vẽ thật sự không có; nói "không có" là đúng |

Chỉ định kỳ vọng theo hợp đồng năng lực là cách duy nhất để con số có nghĩa.
Chấm ngược lại — nhìn mô hình làm gì rồi gọi đó là chuẩn — chỉ là chép đáp án.

Việc phân giải cụm từ dùng chính `resolveTerm` của SDK, esbuild đóng gói thẳng
từ mã nguồn; viết lại phần bỏ dấu trong harness sẽ biến harness thành thứ được
đo. Từ điển lấy từ `/api/standards/terms` của chính deployment.

## Kết quả (2026-08-16, `claude-opus-5`)

```
Đúng: 18/20 = 90%
Chỉ sai bộ phận: 0
Bị cắt vì hết token: 0
```

Chi tiết từng câu trong `result-2026-08-16.json`. Hai lần chạy độc lập đều cho
18/20; **các câu trượt khác nhau giữa hai lần**, và khi đọc kỹ thì đều là chỗ
harness chưa lường (mô hình tô sáng trước rồi mới trả lời, hoặc cần thêm một
lượt mô tả). Chúng được giữ nguyên là "trượt" thay vì nới thước đo — nới đến
khi số đẹp thì số không còn là số đo nữa.

### Về vế "0% sửa sai âm thầm"

Bản dựng này chưa có công cụ nào sửa bản vẽ, nên vế đó đúng một cách tầm
thường và không nói lên điều gì. Thứ đáng đếm là tiền đề của nó — **chỉ nhầm
bộ phận** — vì đó chính là phán đoán mà công cụ sửa sau này sẽ thừa hưởng.
Con số đó là 0/20.

Vế này phải được đo lại khi Story 4.5 thêm công cụ sửa. Đến lúc đó "sửa sai âm
thầm" mới có nghĩa đen, và ngưỡng phải là 0 tuyệt đối.

## Những gì phép đo này *không* nói

- Không chạy trên bản vẽ thật: `mo_ta_ban_ve` trả về một digest cố định trong
  `run.mjs`. Đo phần suy luận, không đo phần đọc XData.
- Không đo bản vẽ nhập từ DWG (không mang nhãn). Nhánh đó có test riêng trong
  `AcTpSemanticQuery.spec.ts`.
- Hai mươi câu là bộ nháp của Story 1.1, chưa có kỹ sư thật rà lại. Ba điểm
  thuật ngữ còn treo (mốc đo cao lan can, định nghĩa "bề rộng cầu", cách gọi
  mố) có thể làm đổi cả kỳ vọng lẫn kết quả.
