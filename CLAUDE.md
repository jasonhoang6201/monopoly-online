# CLAUDE.md

Hướng dẫn cho Claude Code khi làm việc trong repo này.

## Dự án

Cờ Tỷ Phú Sài Gòn · Gia Định, bản nhiều máy chạy trên Supabase Realtime (vẫn
giữ chế độ chơi chung một máy). Đây là một dự án npm duy nhất; `npm` chạy
thẳng ở gốc repo.

| Lệnh | Việc | Cổng |
|---|---|---|
| `npm run dev` | máy chủ phát triển | 5174 |
| `npm test` | bộ kiểm thử một máy | cần dev server ở **5178** |
| `npm run test:online` | bộ kiểm thử nhiều máy | cần dev server ở **5179** |
| `npm run sim:skills` | cân bằng kỹ năng: bot chơi trọn ván, báo tối thượng lệch | không cần |

## Quy ước sửa mã

- Ghi chú và tên biến trong mã dùng **tiếng Việt**, theo đúng giọng văn sẵn có —
  giải thích *vì sao*, không mô tả lại điều mã đã nói.
- Trả lời Jason bằng tiếng Việt.

## Bố cục mã nguồn

```
src/
  data/                  dữ liệu tĩnh: 40 ô, thẻ Cơ Hội/Khí Vận, thẻ Thời Cuộc,
                         kỹ năng, meme, chủ đề
  core/state.js          GameState + luật gốc — thuần dữ liệu, không đụng Phaser/DOM
  core/serialize.js      GameState ↔ ảnh chụp JSON phát cho các máy khác
  core/events.js         luật thẻ Thời Cuộc: thanh áp lực, kế hoạch sự kiện, cấn nợ
  core/skills.js         luật học kỹ năng
  core/cards.js          luật thẻ giữ trong túi
  core/raisePlan.js      gợi ý xoay tiền khi thiếu nợ
  game/controller.js     điều phối lượt chơi, nối luật ↔ hình ảnh ↔ giao diện
  game/eventRunner.js    thi hành thẻ Thời Cuộc, hỏi nhiều người cùng lúc
  game/skillPlay.js      phần kỹ năng phải hỏi người chơi hoặc có hoạt cảnh
  scenes/BoardScene.js   Phaser: bàn cờ, quân, xí ngầu
  render/                hình học bàn cờ, hoa văn, biểu tượng, quân cờ, trang trí theo mùa
  ui/                    HUD, hộp thoại, bảng xem nhanh, cây kỹ năng (HTML phủ lên canvas)
  theme/                 đổi chủ đề (Halloween, Giáng sinh): biến CSS + báo dựng lại hình
  audio/                 nhạc và hiệu ứng tổng hợp bằng Web Audio, kèm bộ theo mùa
  net/                   Supabase Realtime: phòng, phiên, đường truyền, danh tính
```

Mọi thứ trong `core/` không phụ thuộc UI — `serialize.js` tuần tự hoá trạng
thái để phát cho các máy khác, và cả thư mục chạy được dưới Node trong các bài
kiểm thử.

## Ràng buộc

- **Không dùng dịch vụ tính phí** mà không hỏi trước. Ưu tiên thư viện mã nguồn
  mở cài local, tài nguyên sinh bằng code (canvas 2D, Web Audio) thay vì tải file
  hay gọi API trả tiền. Supabase dùng ở **gói free**.
- Không đưa `service_role` key của Supabase vào mã client — chỉ dùng `anon` key
  qua biến môi trường `VITE_*`.
- Kiểm thử chạy bằng Playwright trên Chrome thật, **cần dev server đang chạy trước**.
