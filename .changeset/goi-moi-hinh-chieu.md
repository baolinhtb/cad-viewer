---
'@mlightcad/cad-template-plugin': patch
'@mlightcad/cad-template-sdk': patch
---

Hồ sơ mố: mọi hình chiếu có gối theo `soGoi`/`aGoi` — mặt bằng (gối, nhãn G1…Gn, ụ chống xô) và mặt chính (gối, ụ dạng nét nổ, dim `@B(G)`), theo khoảng cách thật từ tim gối. Ụ chống xô: một ụ giữa mỗi cặp gối (`⌊soGoi/2⌋`), không đè gối (khe hẹp thì vẽ hẹp lại, có cảnh báo); BTKL `0,152 × ⌊soGoi/2⌋`. Chữ luôn đọc được: kích thước vẽ phải→trái và TEXT/ATTRIB xoay 180° được dựng đứng. Thông báo công cụ nêu «N vị trí gối cách nhau … mm», giá trị tự suy, và nhắc hỏi chiều dài cọc khi chưa có `lCoc`.
