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

### Backend Claude CLI (mặc định) và rollback về Codex

Bridge chọn backend bằng `CAD_AGENT_BACKEND`: `claude` (mặc định) hoặc `codex`. `/health` báo `provider` là `claude-cli` hoặc `codex-cli`. Giá trị mô hình phía app vẫn là `codex-cli` để tương thích; giao diện hiển thị "Claude CLI (server)".

Backend Claude (`claude-step.mjs`) chạy mỗi bước một lần `claude -p` với: stream-json vào/ra (`--input-format stream-json --output-format stream-json --verbose`), `--tools ""` (không công cụ dựng sẵn của Claude Code), `--no-session-persistence`, `--setting-sources ""`, `--strict-mcp-config`, `--json-schema` cho đầu ra `{ text, tool }`, `--model $CAD_AGENT_CLAUDE_MODEL` nếu đặt. Thư mục làm việc tạm, xoá sau mỗi bước. Env con chỉ gồm `PATH`, `HOME`, `LANG`/`LC_ALL`/`TMPDIR`, `CLAUDE_CODE_OAUTH_TOKEN`/`ANTHROPIC_API_KEY`, các biến proxy/CA, cùng `DISABLE_AUTOUPDATER=1`, `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`, `DISABLE_TELEMETRY=1`, `DISABLE_ERROR_REPORTING=1`. stderr của CLI không được ghi log; lỗi trả về tiếng Việt, không chứa token. Trình duyệt vẫn là nơi duy nhất chạy công cụ CAD.

Biến môi trường:

| Biến                          | Mặc định           | Ý nghĩa                                              |
| ----------------------------- | ------------------ | ---------------------------------------------------- |
| `CAD_AGENT_BACKEND`           | `claude`           | `claude` hoặc `codex`                                |
| `CLAUDE_COMMAND`              | `claude`           | đường dẫn CLI, trên server `/root/.local/bin/claude` |
| `CLAUDE_CODE_OAUTH_TOKEN`     | —                  | token đăng nhập, nạp từ `/etc/cad-agent/claude.env`  |
| `CAD_AGENT_CLAUDE_MODEL`      | (mặc định của CLI) | ví dụ `claude-opus-5-5`                              |
| `CAD_AGENT_CLAUDE_TIMEOUT_MS` | `600000`           | quá hạn thì huỷ tiến trình và báo lỗi                |
| `CAD_AGENT_CLAUDE_MAX_TURNS`  | `4`                | trần số lượt của một lần chạy CLI (`--max-turns`)    |

Mỗi bước ghi một dòng chẩn đoán ra stdout của service (xem bằng `journalctl -u cad-codex-bridge -f`):

```
{"tag":"cad-agent-step","luot":2,"ket_qua":"ok","cong_cu":"tao_ho_so_mo",
 "buoc":[{"luot":1,"turns":4,"ms":8100,"tu_choi":[{"ten":"tao_ho_so_mo","goc":true,"ly_do":"cong_cu_khong_co"}],"dap_an":"ok","chon":"chay_template","bo_cong_cu":["tao_ho_so_mo"]},
         {"luot":2,"turns":2,"ms":6400,"dap_an":"ok","chon":"tao_ho_so_mo"}],
 "tong":{"input_tokens":100319,"output_tokens":639}}
```

Dòng này chỉ có số đếm, mã lỗi và tên công cụ do trình duyệt gửi lên — không có nội dung người dùng, bản vẽ hay token; tên công cụ mô hình bịa ra ghi là `<lạ>`. `tu_choi` là những lần CLI từ chối ngay trong một lần chạy (`cong_cu_khong_co` = mô hình gọi thẳng tool gốc, `sai_schema` = structured output sai định dạng); `bo_cong_cu` là khi mô hình vì thế mà bỏ một công cụ CÓ trong danh sách — bước đó được chạy lại kèm lời nhắc rằng công cụ vẫn dùng được.

Vận hành (systemd `cad-codex-bridge`, xem `cad-codex-bridge.service`):

1. Tạo `/etc/cad-agent/claude.env` (quyền 600, chủ root) chứa một dòng `CLAUDE_CODE_OAUTH_TOKEN=…`. Không in, không commit tệp này.
2. Unit có `EnvironmentFile=/etc/cad-agent/claude.env`, `Environment=CAD_AGENT_BACKEND=claude`, `Environment=CLAUDE_COMMAND=/root/.local/bin/claude`. Cài lại unit rồi `systemctl daemon-reload && systemctl restart cad-codex-bridge`.
3. Kiểm tra: `curl -s http://172.21.0.1:4180/health` (từ máy chủ) phải trả `"provider":"claude-cli"`.

Rollback về Codex: thêm `CAD_AGENT_BACKEND=codex` vào `/etc/cad-codex-bridge.env` (tệp này ghi đè các dòng `Environment=`), rồi `systemctl restart cad-codex-bridge`; `/health` trả `"provider":"codex-cli"`. Bỏ dòng đó để quay lại Claude.

Đã kiểm thật với claude 2.1.290 và 2.1.326: `--input-format stream-json` bắt buộc đi với `--output-format stream-json`; kết quả nằm ở `structured_output` của sự kiện `result`; chưa đăng nhập thì thoát mã 1 với `is_error: true`. `--max-turns` cũng không có trong `--help` nhưng được chấp nhận (cờ lạ bị báo `unknown option`); chạm trần thì `result` có `subtype: "error_max_turns"` và bước được chạy lại một lần. System prompt lớn hơn 100 KB được ghi ra tệp và truyền bằng `--system-prompt-file` (cờ này chạy được trên 2.1.325 nhưng không có trong `--help`; kiểm lại trên bản của server nếu prompt lớn).

Kiểm thử adapter: `node --test --test-isolation=none tools/codex-cad/bridge.test.mjs server/auth/ai.test.mjs`. Riêng bridge: `node --test 'tools/codex-cad/*.test.mjs'` (Node 24 không nhận đường dẫn thư mục cho `--test`).

Triển khai đã chuẩn bị cho host hiện tại: `node tools/codex-cad/deploy-codeco33.mjs` (quyền quản trị máy chủ). Script yêu cầu các địa chỉ mạng khớp cấu hình, dùng bản frontend đã build, giữ image cũ và ghi tag quay lui ở `/tmp/cad-codex-rollback.json`, cài service rồi tái tạo hai container. Khi vận hành bằng Compose, dùng cả `docker-compose.yml` và `docker-compose.codex.yml` để giữ kết nối Codex. Không chạy lại khi chưa build các package thay đổi.

Kiểm thử website thật: `node tools/codex-cad/test-codeco33.mjs`. Script cần quyền Docker và Chromium; tạo một thành viên tạm, đăng nhập qua API thật, gửi ba prompt qua panel thật, kiểm tra dữ liệu CAD/PDF rồi xóa tài khoản, phiên và dữ liệu của riêng bài thử. Không đọc mật khẩu hay phiên đăng nhập của người dùng hiện hữu.

Sau khi nâng cấp upstream, dùng `pnpm build` và `pnpm lint` từ thư mục gốc. Có thể triển khai riêng hai ứng dụng web đã build bằng `node tools/codex-cad/deploy-codeco33.mjs --frontend-only`; chế độ này giữ backend và bridge đang chạy.
