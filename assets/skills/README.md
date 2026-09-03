# Hướng dẫn chuyên môn cho trợ lý (skill)

Mỗi thư mục con là một hướng dẫn: `SKILL.md` có frontmatter `name` và
`description`, kèm `references/*.md`. Trợ lý thấy dòng mô tả của mọi hướng
dẫn **đã công bố** trong khối chuẩn hoá ở mỗi lần gọi, và chỉ đọc thân bằng
tool `doc_huong_dan` khi yêu cầu khớp.

Các file ở đây **không** được đóng gói vào image. Chúng nằm trong repo để
review được và có lịch sử, rồi được tải lên máy chủ qua `POST /api/skills`
(vai trò author) hoặc qua giao diện thư viện. Một hướng dẫn mới ở trạng thái
nháp, chỉ người tải lên thấy, cho tới khi họ công bố.

Viết cho trợ lý của cad-viewer: gọi tên tool (`ghep_bo_phan`, `chay_template`,
`sua_lan_chay`, `tra_cuu_tieu_chuan`) và khoá tham số của template, không
viết lệnh của phần mềm CAD khác.
