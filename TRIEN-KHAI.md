# TRIỂN KHAI — mentor_club_threads

## A. Chạy trên GitHub Actions (khuyên dùng — không cần máy bật)

### 1) Đặt Variables (Settings → Secrets and variables → Actions → Variables)
| Tên | Ví dụ |
|---|---|
| `LARK_APP_ID` | `cli_a921617592b8de1b` |
| `LARK_BASE_ID` | `DrG5bhJFBaXWzWsAfoxjmaHRpOV` (app_token của Base) |
| `LARK_DOMAIN` | `https://open.larksuite.com` |
| `THREADS_TABLE_NAME` | `14.7 Đăng Threads (Meta)` |
| `THREADS_TABLE_ID` | (tuỳ chọn) `tblwbYZjSS3P1aj4` |
| `THREADS_USER_ID` | (tuỳ chọn) tự lấy qua /me nếu trống |
| `THREADS_MEDIA_BASE_URL` | `https://hangchina.net` |

### 2) Đặt Secrets (… → Secrets)
| Tên | Nội dung |
|---|---|
| `LARK_APP_SECRET` | secret app Lark |
| `THREADS_ACCESS_TOKEN` | token dài hạn 60 ngày (lấy bằng `src/get-token.js`) |
| `HANGCHINA_FTP_HOST` / `HANGCHINA_FTP_USER` / `HANGCHINA_FTP_PASS` | FTP để host ảnh/video (bỏ qua nếu chỉ đăng text/URL) |

### 3) Tạo bảng
Actions → **init-tables** → Run workflow. (Idempotent: có rồi thì chỉ bổ sung cột.)

### 4) Đăng
Actions → **dang-threads** → Run workflow (tick `dry_run` để thử trước).

---

## B. Lấy TOKEN Threads (làm 1 lần)

1. Tạo app Meta với use case **"Truy cập API Threads"**; bật quyền `threads_basic` + `threads_content_publish`; thêm Redirect `https://<domain>/`; add tài khoản làm **Người kiểm thử Threads** rồi Accept trong app Threads.
2. Lấy **Threads App ID** + **App Secret** (App settings → Basic → *ID ứng dụng Threads*, **khác** App ID Facebook).
3. Mở link (miền **threads.com**, thay client_id):
   `https://www.threads.com/oauth/authorize?client_id=<THREADS_APP_ID>&redirect_uri=https://<domain>/&scope=threads_basic,threads_content_publish&response_type=code`
4. Bấm Cho phép → copy `code` ở URL nhảy về → chạy:
   `node src/get-token.js <THREADS_APP_ID> <THREADS_APP_SECRET> https://<domain>/ <code>`
   → in ra token dài hạn (đặt vào Secret `THREADS_ACCESS_TOKEN`) + `THREADS_USER_ID`.

> Token sống ~60 ngày. Gia hạn: `GET https://graph.threads.net/v1.0/refresh_access_token?grant_type=th_refresh_token&access_token=<token>`.

### 2 cái bẫy
- `client_id` phải là **Threads App ID** (không phải App ID Facebook tổng) — nhầm → lỗi 4476002 "không có ID ứng dụng".
- `user_id` trả từ OAuth **không đăng được** — engine luôn lấy id qua `/me`.

---

## C. ⭐ URL ACTION — cấu hình nút "Đăng" trong Lark Base

Threads đăng bằng **repository_dispatch** của GitHub. Trong Lark tạo **Automation** (hoặc nút Button gọi "Send request") với:

**Đăng ngay (bài đang "Chờ đăng"):**
```
POST  https://api.github.com/repos/hangchinaaibusiness-svg/mentor_club_threads/dispatches
Headers:
  Authorization: Bearer <PAT_scope_repo>
  Accept: application/vnd.github+json
  X-GitHub-Api-Version: 2022-11-28
Body (JSON):
  {"event_type":"dang-threads"}
```

**Tạo/đồng bộ bảng:**
```
POST  https://api.github.com/repos/hangchinaaibusiness-svg/mentor_club_threads/dispatches
Body: {"event_type":"init-tables"}
```

**Cách khác — gọi thẳng 1 workflow (workflow_dispatch), cần `ref`:**
```
POST  https://api.github.com/repos/hangchinaaibusiness-svg/mentor_club_threads/actions/workflows/dang-threads.yml/dispatches
Body: {"ref":"main"}

POST  https://api.github.com/repos/hangchinaaibusiness-svg/mentor_club_threads/actions/workflows/init-tables.yml/dispatches
Body: {"ref":"main"}
```

> `<PAT_scope_repo>` = GitHub Personal Access Token có scope **repo** (classic) hoặc quyền `actions:write` (fine-grained). Đặt token này trong phần cấu hình Automation của Lark, **không** ghi vào đây.
> Bấm nút → GitHub chạy `dang-threads` → đăng các dòng "Chờ đăng" → ghi Trạng thái/Link về bảng. Xem tiến trình ở tab **Actions**.

---

## D. Chạy máy cá nhân (thay cloud)
```bash
cp .env.example .env   # điền giá trị
node src/init-tables.js
node src/post-threads.js --dry-run   # thử
node src/post-threads.js             # đăng thật
```
