# Template thư viện

Các template ở đây **không** được biên dịch vào bản dựng. Chúng được tải lên
máy chủ và trình duyệt nạp lúc chạy, nên thêm hay sửa một cái không cần deploy.

Đó cũng là lý do mã nguồn nằm ở đây thay vì chỉ nằm trong cột `code` của bảng
`templates`: một template chỉ tồn tại trong cơ sở dữ liệu thì không ai review
được, không có lịch sử, và không có gì chạy thử nó trước khi kỹ sư dùng để dựng
bản vẽ đem đi ký.

`__tests__/uploadedComponents.spec.ts` đọc thẳng các file này — không phải bản
sao — nên hai bên không thể lệch nhau.

## Hợp đồng

Một ES module, đúng một `export default`, không `import`. Hàm trợ giúp của SDK
lấy từ `globalThis.__CAD_TEMPLATE_SDK__`, vì module được nạp qua blob URL và
không có gì để phân giải đường dẫn gói.

```js
const { formatPartId } = globalThis.__CAD_TEMPLATE_SDK__

export default {
  meta: { id, version, name, category, description },
  params: [ { key, label, type, unit, min, max, default, group, hint } ],
  generate(ctx, values) { ctx.polyline({ role, partId, layer, points }) }
}
```

## Dải giá trị phải dẫn nguồn

`hint` của tham số nào bị tiêu chuẩn quy định thì phải ghi số hiệu điều khoản.
Danh mục gửi cho trợ lý lấy chính chuỗi đó, và một dải không có xuất xứ sẽ
khiến trợ lý đi tra cứu lại — tốn nguyên một lượt để ra đúng con số đã có sẵn.

Ngược lại, dải nào **không** phải do tiêu chuẩn quy định thì đừng viết TCVN vào
`hint`. Mượn uy tín của tiêu chuẩn cho một con số không có nguồn còn tệ hơn là
không có template.

## Tải lên

Qua `POST /api/templates`, hoặc qua giao diện thư viện template. Một template
mới ở trạng thái `draft` cho tới khi nó dựng ra hình lần đầu trong trình duyệt
— cái đó chỉ chứng minh được ở đúng nơi nó chạy.

## Trụ cầu — `tru_mat_chinh`, `tru_mat_ben` 1.0.1

**Bố cục sơ bộ, chưa đối chiếu bản vẽ văn phòng** — khác các template mố, repo
chưa có bản vẽ trụ để đo. Hai tệp dùng chung một khối tham số và kiểm tra
(giữa hai dấu `// ---- DÙNG CHUNG` / `// ---- HẾT PHẦN DÙNG CHUNG ----`, chép
nguyên văn vì hợp đồng không cho `import`; `truComponents.spec.ts` so hai bản
từng ký tự). Cách ghép `tru_cau_hoan_chinh` (trong `src/assembly.ts`) dựng cả
hai hình bằng một lệnh; hướng dẫn cho trợ lý là `assets/skills/tru-cau`.

Đăng ký giống hệt template mố — không có bước riêng:

1. Tác giả tải `tru_mat_chinh.js` và `tru_mat_ben.js` lên qua giao diện thư
   viện (hoặc `POST /api/templates`); bản tải lên ở trạng thái `draft` cho tới
   lần dựng đầu trong trình duyệt.
2. Tải thư mục `assets/skills/tru-cau` qua thư viện hướng dẫn
   (`POST /api/skills`) rồi công bố.
3. Sau đó trợ lý chạy được `chay_template tru_mat_chinh` / `tru_mat_ben` và
   `ghep_bo_phan tru_cau_hoan_chinh`.

`server/auth/libraryUpload.test.mjs` chạy đúng con đường đó (tải lên, kiểm vai
trò/layer với danh mục `_33_`, công bố, khối chuẩn hoá) cho mọi tệp trong thư
mục này và mọi hướng dẫn trong `assets/skills`, trên CSDL trong bộ nhớ — không
đụng máy chủ thật.
