# Test CAD bằng Codex CLI thật

Chạy từ thư mục gốc với Node 24, pnpm và Codex CLI đã đăng nhập (`codex login status`). Các package cần được build và Playwright Chromium cần có sẵn.

```bash
pnpm test:codex
pnpm test:codex --prompt "Dựng hồ sơ mố M2 theo mẫu, bệ rộng 8,5 m rồi xuất PDF."
```

Lệnh mặc định chạy ba prompt thật: tạo M1, sửa riêng bề rộng bệ, kiểm tra và xuất PDF. Script kiểm tra dữ liệu CAD sau từng lượt và xác nhận PDF có sáu trang. Kết quả, ảnh bản vẽ và `transcript.json` được lưu trong thư mục `/tmp/cad-codex-live-*` được in ra khi chạy. Prompt tùy chọn được thực thi và ghi kết quả nhưng không áp dụng các kiểm tra thông số cố định của kịch bản mặc định.

Script mở trình duyệt headless với ứng dụng CAD thật, nối các công cụ hồ sơ với `codex app-server` qua stdio. Codex dùng đăng nhập và model mặc định của CLI; các lượt chạy sử dụng hạn mức tài khoản hiện tại. Thông tin đăng nhập không được chuyển vào trình duyệt.

Lệnh này tạo phiên Codex riêng, tạm thời, không đưa prompt vào cuộc hội thoại Codex đang điều khiển công việc. Đây là bài kiểm thử terminal độc lập với bridge website mô tả bên dưới. Phiên tắt shell và multi-agent, chỉ đăng ký các công cụ CAD cần thiết. Bản vẽ vẫn mang trạng thái bản nháp và các giới hạn thiết kế của bộ sinh hồ sơ.

Dùng `--url http://127.0.0.1:PORT` để kết nối Vite dev server đã chạy; mặc định script tự chạy Vite tại cổng 4177. `--headed` yêu cầu môi trường có màn hình và bản Chromium phù hợp; có thể chỉ định executable qua `PLAYWRIGHT_CHROME_PATH`.

Giao thức: [Codex app-server](https://learn.chatgpt.com/docs/app-server).

## Bridge cho AI Agent trên website

`bridge.mjs` cung cấp `/messages` tương thích giao thức Anthropic hiện có của giao diện. Proxy đăng nhập của ứng dụng gọi bridge khi cấu hình `CODEX_BRIDGE_URL`; khi không cấu hình, provider cũ tiếp tục hoạt động. `/api/ai/context` báo `model: codex-cli` để giao diện chọn nhãn Codex khi mở panel.

Bridge dùng phiên Codex mới cho từng bước, mang theo lịch sử và kết quả công cụ từ trình duyệt. Khi Codex yêu cầu công cụ, bridge trả yêu cầu cho trình duyệt rồi đóng phiên; bridge không thực thi lệnh vẽ trên máy chủ. Ảnh base64 được chuyển thành đầu vào ảnh của Codex. Tối đa hai bước suy luận đồng thời; kết nối đóng sẽ hủy phiên. Chỉ các IP nội bộ được cấu hình mới truy cập được bridge.

`cad-codex-bridge.service` và `docker-compose.codex.yml` là cấu hình triển khai cho mạng nội bộ hiện tại của codeco33 (gateway `172.21.0.1`, auth `172.21.0.2`). Cần cập nhật địa chỉ nếu tạo lại mạng Docker. Service dùng Codex đã đăng nhập của máy chủ; không mount thông tin đăng nhập vào container hay trình duyệt. Mức dùng thuộc tài khoản Codex; số token/chi phí Anthropic được ghi 0 vì không có số liệu tương đương, không đại diện cho mức sử dụng thực tế của Codex.

Kiểm thử adapter: `node --test --test-isolation=none tools/codex-cad/bridge.test.mjs server/auth/ai.test.mjs`.

Triển khai đã chuẩn bị cho host hiện tại: `node tools/codex-cad/deploy-codeco33.mjs` (quyền quản trị máy chủ). Script yêu cầu các địa chỉ mạng khớp cấu hình, dùng bản frontend đã build, giữ image cũ và ghi tag quay lui ở `/tmp/cad-codex-rollback.json`, cài service rồi tái tạo hai container. Khi vận hành bằng Compose, dùng cả `docker-compose.yml` và `docker-compose.codex.yml` để giữ kết nối Codex. Không chạy lại khi chưa build các package thay đổi.

Kiểm thử website thật: `node tools/codex-cad/test-codeco33.mjs`. Script cần quyền Docker và Chromium; tạo một thành viên tạm, đăng nhập qua API thật, gửi ba prompt qua panel thật, kiểm tra dữ liệu CAD/PDF rồi xóa tài khoản, phiên và dữ liệu của riêng bài thử. Không đọc mật khẩu hay phiên đăng nhập của người dùng hiện hữu.

Sau khi nâng cấp upstream, dùng `pnpm build` và `pnpm lint` từ thư mục gốc. Có thể triển khai riêng hai ứng dụng web đã build bằng `node tools/codex-cad/deploy-codeco33.mjs --frontend-only`; chế độ này giữ backend và bridge đang chạy.
