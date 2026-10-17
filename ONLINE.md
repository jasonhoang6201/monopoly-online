# Chơi online nhiều máy — kiến trúc và hiện trạng

Luật chạy trên **máy chủ ván cờ**: một Cloudflare Worker trước cửa, mỗi phòng
một **Durable Object** (`server/src/index.js`, lớp `GameRoom`). Trình duyệt chỉ
diễn sự kiện và gửi câu trả lời. Bản một máy chạy đúng bộ luật ấy (`src/engine/`)
ngay trong trình duyệt qua `game/localHost.js`.

Supabase còn lại một việc: nhận số liệu cân bằng kỹ năng (`net/analytics.js`,
trang `/stats.html`). Phòng, ván và chat không đi qua Supabase nữa.

## Vào phòng thế nào

1. Mở trang → **Mở phòng online**. Máy khách sinh mã 4 ký tự (`?room=K7QM`), nối
   WebSocket tới `<server>/room/K7QM`; object của phòng ấy sinh ra ở lần nối đầu.
2. Ai bấm đường mời thì vào thẳng phòng chờ. Tối đa **6 người**; đủ rồi hoặc ván
   đã khai cuộc thì server trả `full` và đóng kết nối.
3. Người vào đầu tiên là chủ phòng. Chủ phòng rời phòng chờ thì ghế đầu nhận vai.
4. Server giao màu trống đầu tiên; mỗi người đổi được sang màu chưa ai giữ cho tới
   lúc bấm Sẵn sàng.
5. Gõ tên rồi bấm **Sẵn sàng**. Đủ 2 người trở lên và cả phòng sẵn sàng thì nút
   **Khai cuộc** của chủ phòng mở khoá.
6. Đóng tab ở phòng chờ: server giữ ghế 8 giây (`LOBBY_GRACE_MS`) cho F5, quá hạn
   thì bỏ ghế. Bấm **Rời phòng** thì bỏ ngay.

## Ai quyết định cái gì

Server quyết hết: sổ ghế, khai cuộc, mọi nước đi. Máy khách gửi `{t:'act', a}`;
server lấy **số ghế theo kết nối**, không theo tin, nên máy nào cũng chỉ nói thay
được cho ghế của mình. Server chỉ nhận năm loại action: `answer`, `hold`, `seen`,
`learn`, `ghost-vote`.

**Danh tính.** Mỗi tab có `id` (sessionStorage) và một **khoá giữ ghế**
(`mySecret()` trong `net/identity.js`, localStorage theo id). Lần đầu vào phòng,
server lưu băm SHA-256 của khoá; vào lại phải khớp. Sổ ghế phát cho cả phòng có
`id` của mọi người, nên chỉ biết `id` thì không ngồi được vào ghế người khác.

## Engine và lưu ván

`src/engine/engine.js` giữ ván và một generator luật. `dispatch(action)` chạy
generator tới câu hỏi kế tiếp, trả về dãy sự kiện (`dice`, `move`, `say`, `sync`,
`ask`…). Engine không đọc đồng hồ: mỗi action mang mốc giờ `t` của server, nên
hạn chót tính lại ra đúng số cũ.

Ván lưu thành `doc = { base: ảnh chụp đầu ván, log: [action…] }` trong storage
của object, ghi sau mỗi tin. Object ngủ (WebSocket Hibernation: không có tin thì
không tính giờ chạy) rồi thức dậy thì `Engine.restore(doc)` chạy lại log ra đúng
ván cũ. `tests/engine.mjs` kiểm chuyện này trên 30 ván có ghế người, sau từng action.

## Hẹn giờ

Một `alarm` duy nhất cho mỗi phòng, đặt vào mốc sớm nhất trong ba loại hạn:

| Hạn | Mặc định | Hết hạn thì |
|---|---|---|
| Câu hỏi đang treo (`deadline` của engine) | lượt đi 60 s, đấu giá / thẻ Thời Cuộc 30 s, giao dịch 45 s | server gửi `timeout`, engine chọn câu trả lời mặc định |
| Người tới lượt đang rớt mạng (`skipMs`) | 12 s | rút hạn câu hỏi còn chừng ấy |
| Vắng mặt giữa ván (`AWAY_MS`) | 120 s | `evict`: ghế ấy phá sản, tài sản về ngân hàng |
| Ghế bỏ trống ở phòng chờ | 8 s | bỏ ghế |

Bấm nút hay gõ phím gửi `seen` (tối đa 5 giây một lần) để engine xoá chuỗi
"để hết giờ" của ghế mình.

## Đứt rồi nối lại

`net/gameServer.js` nối lại sau 0,3 / 0,8 / 1,5 / 3 / 5 giây, rồi giữ 5 giây.
Mã đóng 4000–4099 (sai khoá, phòng đầy, bị mời ra) thì không nối lại. Mỗi lần nối
lại, server trả `welcome` (kèm `phase`) rồi `game` (ảnh chụp + câu hỏi đang treo);
`controller.resume()` bỏ hàng sự kiện cũ, áp ảnh chụp và dựng lại câu hỏi. Sự
kiện lỡ trong lúc đứt không gửi bù, chỉ còn trạng thái cuối.

F5 hay đóng tab rồi mở lại: `reclaimSeat()` nhận lại `id` cũ từ phiếu giữ ghế
trong localStorage (chỉ khi ván đã khai cuộc và không tab nào khác đang cầm id ấy),
khoá giữ ghế đi theo id.

## Chat

Nút 💬 ở góc phải dưới, có từ lúc vào phòng chờ tới hết ván (`src/ui/chat.js`).
Tin đi qua cùng WebSocket với ván: máy gửi `{t:'chat', text}`, server gắn `id`
theo kết nối (không lấy từ tin) rồi phát cho cả phòng, kể cả máy gửi — máy gửi
đã tự vẽ tin của mình nên bỏ qua bản phát lại. Tin **không lưu ở đâu**: không
vào ván, không vào storage của Durable Object. Ai vào sau hay bấm F5 thì thấy
khung trống.

- Tên và màu người nói tra từ **sổ ghế ở máy nhận**, không lấy từ tin gửi tới,
  nên không ai mạo tên người khác được. Người ngoài sổ ghế nói thì bỏ qua.
- Nội dung luôn thoát HTML trước khi vẽ; máy khách cắt ở 200 ký tự, server cắt ở 240.
- Hạn mức 5 tin / 6 giây ở máy gửi, 8 tin / 6 giây ở máy nhận (chặn máy sửa mã).
- Khung đứng **trên** lớp hộp thoại, nên ngồi phòng chờ hay đang mở hộp mua đất
  vẫn nhắn được. Vì thế hộp thoại bỏ qua Enter/Esc gõ từ ô nhập nằm ngoài nó —
  không thì Enter gửi tin cũng bấm luôn nút "Mua".
- Enter (lúc không có hộp thoại) mở khung; Esc trong ô gõ đóng khung.
- Mọi chỗ nghe `keydown` ở **pha bắt** trên `window` (hộp thoại, cây kỹ năng,
  băng chuyền bóc thẻ, phiên chọn ô trên bàn cờ) chạy *trước* ô chat, nên
  `stopPropagation` của ô chat không chặn được chúng. Mỗi chỗ ấy phải tự bỏ qua
  phím gõ trong ô nhập bằng `isTyping()` xuất từ `src/ui/modal.js`. Thiếu dòng
  ấy thì Enter gửi tin bấm luôn nút "Học" của thẻ kỹ năng đang mở, hoặc chốt
  phiên chọn ô, còn tin nhắn thì mất (`preventDefault` chặn form gửi). Thêm
  người nghe phím ở pha bắt mới thì nhớ thêm điều kiện này.
- Khung giữ 80 tin gần nhất. Tin tới lúc khung đóng thì nút hiện số chưa đọc
  (quá 9 ghi `9+`), một dòng trích hiện 4,2 giây bên cạnh nút, kèm tiếng `click`.
- Tên và màu chốt lúc tin tới: đổi tên sau đó thì tin cũ giữ tên cũ. Màu quân
  thì đọc lại khi đổi chủ đề.
- Đổi phòng (`attach` phòng mới) thì khung trống lại. Chơi một máy không có
  phòng nên nút không hiện.

## Bố cục mã

```
server/
  wrangler.toml          binding ROOMS, migration SQLite, biến SUPABASE_*, TEST_TIMING
  src/index.js           Worker (định tuyến /room/:code) + Durable Object GameRoom
src/engine/              luật dạng generator, dùng chung cho trình duyệt và server
src/net/
  gameServer.js          GameRoom phía máy khách: WebSocket, sổ ghế, mã phòng, đường mời
  session.js             chọn chế độ, vào phòng, phòng chờ, trao ván cho controller
  identity.js            id theo tab, khoá giữ ghế, phiếu giữ ghế
  analytics.js           số liệu kỹ năng về Supabase (REST)
src/game/
  controller.js          diễn sự kiện, mở hộp thoại; `startOnline` / `resume` cho bản online
  localHost.js           chủ ván của bản một máy
```

## Địa chỉ máy chủ

`serverUrl()` lấy theo thứ tự: tham số `?server=` trên URL, biến build
`VITE_GAME_SERVER`, rồi `ws://localhost:8787`. Đường mời và URL sau khi vào phòng
giữ nguyên `?server=`, nên mở bản preview với `?server=...` thì người được mời
cũng nối vào đúng server ấy.

## Đưa lên mạng

1. `npx wrangler login` (một lần), rồi `npm run server:deploy`. Server nằm ở
   `wss://monopoly-rooms.<subdomain>.workers.dev`.
2. Vercel: đặt `VITE_GAME_SERVER=wss://monopoly-rooms.<subdomain>.workers.dev`,
   build lại.
3. `TEST_TIMING` phải là `"0"` khi deploy. Đặt `"1"` thì máy khách đổi được hạn
   chờ và gọi cổng `test` (thay ván, chạy thẳng hàm luật).

Gói free của Workers đủ dùng: Durable Object kiểu SQLite là kiểu duy nhất gói free
cho phép, và Hibernation API không tính giờ chạy lúc phòng im.

## Kiểm thử

```bash
npm run server:test &                 # wrangler dev, cổng 8787, TEST_TIMING=1
npx vite --port 5179 --strictPort &
npm run test:online
```

- `tests/server.mjs`: nói chuyện thẳng với server qua WebSocket, không mở trình duyệt.
- `tests/online.mjs`: ba browser context (mỗi context một cửa sổ, tab nào cũng được
  cấp khung hình). Dùng cổng `test` của server để dựng phiên đấu giá và hạ hạn chờ.

## Còn thiếu

- Chưa có bài kiểm thử online cho giao dịch giữa hai máy, Hội Đồng Hồn Ma và cây
  kỹ năng mở ngoài lượt. Ba việc này đi cùng đường `ask` / `learn` / `ghost-vote`
  với phần đã kiểm, luật của chúng có bài kiểm thử ở bản một máy.
- Bản online chưa có ghế bot.
- Chat không lưu lại: F5 là mất lịch sử.
