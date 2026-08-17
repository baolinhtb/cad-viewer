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
