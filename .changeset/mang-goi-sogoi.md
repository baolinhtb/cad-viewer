---
'@mlightcad/cad-template-plugin': patch
---

Hồ sơ mố 0.3.0: `soGoi`/`aGoi` đổi được. Mặt chính vẽ lại đúng `soGoi` block gối `Goi I24` cách đều `aGoi` quanh tim gối bản gốc (mặc định 4 × 2000 giữ nguyên bản gốc). Đổi `soGoi` mà không cho `aGoi` và gối không còn lọt thân thì tự suy `aGoi = (bThan − 500 − 2 × 600) / (soGoi − 1)` làm tròn xuống bội 50 mm, trả về `data.suyRa`. Block `Goi I24` mang đúng role `goi_cau`.
