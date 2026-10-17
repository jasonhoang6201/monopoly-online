# CLAUDE.md

Hướng dẫn cho Claude Code khi làm việc trong repo này.

## Dự án

Cờ Tỷ Phú Sài Gòn · Gia Định, bản nhiều máy: luật chạy trên Cloudflare Durable
Object (`server/`), mỗi phòng một object; chế độ chơi chung một máy chạy cùng bộ
luật ấy ngay trong trình duyệt. Supabase chỉ còn nhận số liệu kỹ năng. Đây là một dự án npm duy nhất; `npm` chạy
thẳng ở gốc repo.

| Lệnh | Việc | Cổng |
|---|---|---|
| `npm run dev` | máy chủ phát triển | 5174 |
| `npm test` | bộ kiểm thử một máy | cần dev server ở **5178** |
| `npm run server` | máy chủ ván cờ trên máy (wrangler dev) | 8787 |
| `npm run server:test` | như trên, bật `TEST_TIMING=1` cho bộ kiểm thử online | 8787 |
| `npm run server:deploy` | deploy lên Cloudflare (`TEST_TIMING` phải là `"0"`) | |
| `npm run rooms -- list \| wipe [MÃ]` | liệt kê / xoá phòng trên server, cần `ADMIN_TOKEN` | |
| `npm run test:online` | bộ kiểm thử nhiều máy | cần dev server ở **5179** và `server:test` |
| `npm run sim:skills` | cân bằng kỹ năng: bot chơi trọn ván, báo tối thượng lệch | không cần |
| `npm run sim:bots` | ba cấp bot Dễ / Vừa / Khó đấu nhau, báo nếu thứ bậc lệch | không cần |
| `npm run test:telemetry` | luật ghi số liệu kỹ năng, chạy thuần Node | không cần dev server |

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
  core/botPolicy.js      luật quyết định của bot ba cấp Dễ / Vừa / Khó
  core/predict.js        dự đoán xí ngầu cho bot: ô sắp đáp, tần suất ô, ai sắp bước vào ô nào
  engine/                luật ván dạng generator: action vào, sự kiện ra; ván = ảnh chụp + log action
    game.js              vòng lượt, mua đất, tù, phá sản
    events.js            thi hành thẻ Thời Cuộc, đấu giá, hỏi nhiều người cùng lúc
    skills.js            kỹ năng phải hỏi người chơi, cây kỹ năng (học, tẩy, mua điểm)
    bot.js               nối luật bot vào ván (chỉ bản một máy)
  game/controller.js     diễn sự kiện của engine, mở hộp thoại, gửi câu trả lời
  game/localHost.js      chủ ván bản một máy: giữ engine trong trình duyệt
  game/skillUi.js        bảng chọn kỹ năng phía máy khách
  scenes/BoardScene.js   Phaser: bàn cờ, quân, xí ngầu
  render/                hình học bàn cờ, hoa văn, biểu tượng, quân cờ, trang trí theo mùa
  ui/                    HUD, hộp thoại, bảng xem nhanh, cây kỹ năng (HTML phủ lên canvas)
  theme/                 đổi chủ đề (Halloween, Giáng sinh): biến CSS + báo dựng lại hình
  audio/                 nhạc và hiệu ứng tổng hợp bằng Web Audio, kèm bộ theo mùa
  net/                   gameServer.js (WebSocket tới server), phiên, danh tính — xem ONLINE.md
  core/telemetry.js      bộ đệm sự kiện kỹ năng — luật chỉ gọi track(), không biết mạng
  net/analytics.js       gom batch, gửi REST về Supabase; tắt khi là bot/localhost
  stats/                 trang /stats.html đọc hàm stats_* (dashboard cân bằng)
server/                  Worker + Durable Object GameRoom, import thẳng src/engine
supabase/                migration SQL (bảng, RLS, view, hàm stats_*) + README
```

Số liệu cân bằng: bản online do **server** ghi, bản một máy do trình duyệt ghi; mọi
chỗ kỹ năng mang tiền về đều đi qua `credit()` — khoản thua ghi bằng `delta` âm
hoặc `tally()`. Đổi tên / thêm ô kỹ năng thì chạy lại `scripts/skill-meta-sql.mjs`.

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
