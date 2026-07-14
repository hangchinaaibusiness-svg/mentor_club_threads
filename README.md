# mentor_club_threads — Đăng Threads (Meta) từ Lark Base

Cỗ máy đăng bài lên **Threads** (app của Meta) điều khiển từ một **bảng Lark Base**, chạy trên **GitHub Actions** (không cần server). Có thể bấm **nút "Đăng" trong Lark** để gọi đăng ngay (qua HTTP), hoặc chạy theo lịch.

- Đăng được **Text / Ảnh / Video**. Ảnh–video Threads bắt buộc URL công khai → cỗ máy tự **host file đính kèm Lark** lên một tên miền công khai (mặc định hangchina.net qua FTP).
- **Tự tạo bảng mẫu** cho máy/base mới bằng `init-tables`.
- Engine zero-dep Node 20. Bí mật để trong GitHub Secrets, không nằm trong code.

## Cài nhanh cho máy/base mới (chỉ từ link git này)

```bash
git clone https://github.com/hangchinaaibusiness-svg/mentor_club_threads.git
cd mentor_club_threads
cp .env.example .env      # điền LARK_* + THREADS_* (xem .env.example)
node src/init-tables.js   # tạo bảng "14.7 Đăng Threads (Meta)" trong Base
node src/post-threads.js  # đăng các dòng "Chờ đăng"
```

Chạy **cloud** thì không cần máy: chỉ đặt Vars/Secrets rồi bấm workflow (xem [TRIEN-KHAI.md](TRIEN-KHAI.md)).

## Bảng 14.7 — schema (sắp theo cấu trúc bảng 14.3, xem `schema/table.json`)

| Cột | Kiểu | Ý nghĩa |
|---|---|---|
| STT | Text (primary) | Số thứ tự — cột khoá đầu (giống 14.3) |
| Loại | Single select | Text / Ảnh / Video (trống = tự đoán) |
| Nội dung | Text | Nội dung bài, ≤ 500 ký tự |
| Comment ebook | Text | Comment đầu tự động (reply vào bài). ⚠️ PHẢI khác nhau từng dòng — tránh Threads chặn spam |
| Ảnh/video | Attachment | **Thả file thẳng vào đây** — tự host ra URL công khai |
| Ảnh URL (công khai) | URL | Hoặc dán sẵn link công khai |
| Lịch đăng bài | DateTime | Trống hoặc tới giờ mới đăng |
| **Đăng** | **Button** | Nút bấm 1 dòng — thêm TAY trong UI (API không tạo được), trỏ automation gọi dispatch với `record_id` |
| Trạng thái | Single select | Chờ đăng / Thành công / Thất bại |
| Link bài đăng | URL | Permalink (tự ghi) |
| Threads post ID | Text | ID bài (tự ghi) |
| Log | Text | Nhật ký (tự ghi) |
| Đăng lúc | DateTime | Thời điểm đăng (tự ghi) |
| Record ID | Formula `RECORD_ID()` | Giống 14.3 — cấp record_id cho nút Đăng |

> `init-tables` tạo mọi cột trừ nút **Đăng** (Button không tạo được qua API) — thêm nút này TAY trong UI.

## ⚙️ Quyền Base (Advanced Permission) — ĐỌC KỸ

Cỗ máy đọc/ghi bảng và **tải file đính kèm** trong Base, nên app Lark cần đủ quyền:

1. **App là cộng tác viên Base với quyền "Có thể chỉnh sửa" (Can edit).** Mở Base → nút chia sẻ → thêm app (theo App ID) quyền Edit. Cấp quyền tạo bảng + ghi record.
2. **Nếu bảng bật "Quyền nâng cao" (Advanced Permissions) riêng ở cấp BẢNG:** cấp quyền toàn Base **KHÔNG đủ** — phải vào đúng bảng đó → Quyền nâng cao → thêm app với quyền chỉnh sửa. (Bảng do `init-tables` tạo mới thì app đã là chủ, không vướng; chỉ vướng khi bạn tự bật Advanced Permissions sau này.)
3. **Tải file đính kèm khi bảng có Advanced Permissions:** API tải media (`/drive/v1/medias/{token}/download`) phải kèm tham số **`extra={"bitablePerm":{"tableId":"<table_id>"}}`**. Cỗ máy đã tự gắn `extra` này (xem `src/lark.js` → `downloadMedia`), nên đọc được file trong bảng có quyền nâng cao. Nếu bỏ `extra`, API trả lỗi quyền và không tải được ảnh/video.
4. **Scope app tối thiểu:** `bitable:app` (đọc/ghi Base) + `drive:drive` hoặc `drive:file` (tải media đính kèm). Thiếu drive scope → không tải được file thả trong bảng.

## Trigger đăng qua HTTP (nút Đăng trong Lark)

Xem phần "URL action" trong [TRIEN-KHAI.md](TRIEN-KHAI.md).
