# CLAUDE.md

Hướng dẫn cho Claude Code khi làm việc trong repo này.

## Dự án

`/Users/jasonhoang/Desktop/monopoly-online` — Cờ Tỷ Phú Sài Gòn · Gia Định, bản
nhiều máy chạy trên Supabase Realtime. Đây là một dự án npm duy nhất; `npm` chạy
thẳng ở gốc repo.

| Lệnh | Việc | Cổng |
|---|---|---|
| `npm run dev` | máy chủ phát triển | 5174 |
| `npm test` | bộ kiểm thử một máy | cần dev server ở **5178** |
| `npm run test:online` | bộ kiểm thử nhiều máy | cần dev server ở **5179** |

Trước đây repo này nằm ở `Desktop/monopoly/monopoly-online`, cạnh một bản offline
`monopoly-base`. Ngày 2026-09-13 bản offline bị xoá và repo dời lên thẳng
`Desktop/`. Ghi chú hay tài liệu nào còn nhắc tới `monopoly-base` hoặc đường dẫn
cũ là đã lỗi thời.

## Quy ước sửa mã

- Ghi chú và tên biến trong mã dùng **tiếng Việt**, theo đúng giọng văn sẵn có —
  giải thích *vì sao*, không mô tả lại điều mã đã nói.
- Trả lời Jason bằng tiếng Việt.

## Bố cục mã nguồn

```
src/
  data/board.js          40 ô, giá thuê, giá thế chấp
  data/cards.js          bộ thẻ Cơ Hội + Khí Vận
  core/state.js          GameState + toàn bộ luật — thuần dữ liệu, không đụng Phaser/DOM
  game/controller.js     điều phối lượt chơi, nối luật ↔ hình ảnh ↔ giao diện
  scenes/BoardScene.js   Phaser: bàn cờ, quân, xí ngầu
  render/                hình học bàn cờ, hoa văn, biểu tượng, quân cờ
  ui/                    HUD, hộp thoại, bảng xem nhanh (HTML phủ lên canvas)
  audio/audio.js         nhạc và hiệu ứng tổng hợp bằng Web Audio
  net/                   Supabase Realtime: phòng, phiên, đường truyền
```

`core/state.js` không phụ thuộc UI — đây là chỗ tuần tự hoá trạng thái để phát
cho các máy khác, và cũng là chỗ chạy được dưới Node trong các bài kiểm thử.

## Ràng buộc

- **Không dùng dịch vụ tính phí** mà không hỏi trước. Ưu tiên thư viện mã nguồn
  mở cài local, tài nguyên sinh bằng code (canvas 2D, Web Audio) thay vì tải file
  hay gọi API trả tiền. Supabase dùng ở **gói free**.
- Không đưa `service_role` key của Supabase vào mã client — chỉ dùng `anon` key
  qua biến môi trường `VITE_*`.
- Kiểm thử chạy bằng Playwright trên Chrome thật, **cần dev server đang chạy trước**.
