# Chơi online nhiều máy — kiến trúc và hiện trạng

Bản này sao chép từ [`../monopoly-base`](../monopoly-base) rồi bọc thêm lớp mạng ở
`src/net/`. Luật chơi, mỹ thuật, âm thanh giữ nguyên.

## Vào phòng thế nào

1. Mở trang → chọn **Mở phòng online**. Phòng sinh mã 4 ký tự (`?room=K7QM`) và
   hiện **đường mời** để chép đi.
2. Ai bấm đường mời thì vào thẳng phòng chờ. Phòng nhận tối đa **6 người** — đủ
   rồi thì ghi *"Phòng đã đầy"*, người vào muộn nhận hộp thoại báo đầy kèm nút
   **Thử lại**.
3. Có người rời (đóng tab, mất mạng) thì ghế được bỏ, người khác vào được, và
   màu quân của ghế ấy dùng lại cho người vào sau.
4. **Màu quân do phòng chỉ định** theo thứ tự vào — không có chỗ nào cho chọn màu.
5. Mỗi người gõ tên rồi bấm **Sẵn sàng**. Trong lúc gõ, tên nằm yên trên máy
   người ấy; máy khác chỉ thấy *"đang nhập tên…"*. Bấm **Sửa lại** thì mở ô nhập
   ra gõ tên khác.
6. **Cả phòng sẵn sàng** thì nút **Khai cuộc** của chủ phòng mới mở khoá.

## Ai quyết định cái gì

**Trong phòng chờ, chủ phòng giữ sổ ghế.** Chỉ máy chủ phòng thêm ghế, bỏ ghế,
ghi tên, mời ra; xong việc thì phát lại toàn bộ sổ. Máy khác không tự sửa sổ bao
giờ. Cần một nguồn sự thật duy nhất vì `player.id` **chính là số thứ tự ghế**:
hai người bấm đường mời cùng lúc mà mỗi máy chốt một danh sách thì từ đó mọi ảnh
chụp ván đều gán đất nhầm chủ. Chuyện này không tránh được bằng seed hay bằng
luật tất định — bất đồng nằm ngay ở *đầu vào*, mà không máy nào biết được mình
đã nhận đủ mọi lời xin ghế hay chưa.

**Vào ván rồi thì chủ phòng hết vai.** Sổ ghế đóng lại; lượt chơi không đi qua ai
cả — máy nào tới lượt thì chạy luật rồi phát **ảnh chụp trạng thái**, các máy còn
lại áp ảnh chụp và ngồi xem (thanh nút ghi *"Tới lượt …"*). Chủ phòng thoát giữa
ván cũng không sao. Cách này tránh phải viết lại ~700 dòng luật trong
`controller.js` cho phía mạng, và xí ngầu chỉ lăn ở đúng một chỗ.

**Trọng tài** lo những việc không thuộc lượt của ai: bỏ qua lượt của người vừa
rớt mạng, và tịch thu tài sản của người đi quá lâu. Trọng tài là **ghế còn nối mạng
có số nhỏ nhất** — một *luật*, không phải một *chức vụ*: mọi máy có cùng sổ ghế
nên cùng tính ra một người, không cần bầu bán; trọng tài rớt thì ghế kế tiếp tự
lên thay.

## Rời bàn giữa ván

Không ai mời ai ra được nữa — vào ván rồi thì không còn quản trị. Thay vào đó:

| Tình huống | Chuyện gì xảy ra |
|---|---|
| Vừa rớt mạng | Danh sách bên cột trái đổi ngay thành **mất kết nối**; lượt của họ bị **bỏ qua** để ván khỏi đứng, tài sản vẫn nguyên |
| Máy **mình** rớt mạng | Dải đỏ *"Mất kết nối — đang nối lại…"* hiện giữa bàn, **thanh nút cất đi**; nối lại được thì máy tự xin ván hiện tại và bày nút ra lại |
| Quay lại trong **45 giây** | Bấm lại đường mời là về đúng ghế cũ, đất nhà nguyên vẹn — trọng tài gửi ngay ảnh chụp ván hiện tại |
| Quá 45 giây | Toàn bộ đất và nhà **trả về ngân hàng**, thành đất trống ai cũng mua lại được (đúng đường `GameState.bankrupt()` mà luật phá sản vẫn dùng) |
| Ngồi im hết **1 phút** trong lượt của mình | Cũng trả hết về ngân hàng, cùng một đường — xem *Đồng hồ lượt* bên dưới |
| Để hết **45 giây** không trả lời đề nghị giao dịch | Như trên |

Ghế của người bị tịch thu **không bị xoá** khỏi sổ — số thứ tự người chơi phải
nguyên vẹn, xoá đi thì tài sản trên bàn cờ trỏ nhầm chủ.

Hạn 45 giây nằm ở `controller.awayGraceMs`; bộ kiểm thử hạ xuống vài giây cho đỡ
phải ngồi chờ.

### Đồng hồ lượt

Mất kết nối không phải cách duy nhất treo bàn — **ngồi im cũng treo y hệt**, mà
lại không rớt presence nên `checkAbsent` không bao giờ động tới. Nên có thêm một
vòng đếm ngược giữa lòng bàn cờ, cả bàn cùng nhìn:

| Việc | Hạn | Hằng số |
|---|---|---|
| Đi một nước (lắc, hay kết thúc lượt) | 60 giây | `controller.turnMs` |
| Trả lời một đề nghị giao dịch | 45 giây | `controller.tradeMs` |
| Làm nốt một hộp thoại đang mở dở | 120 giây | `controller.busyMs` |

Hạn nới rộng cho người **đang mở hộp thoại** vì họ thao tác thật — chọn đất để
đổi, tính toán xây nhà. Nhưng vẫn phải có đáy: mở hộp thoại rồi bỏ đi cũng làm
cả bàn đứng hệt như ngồi im.

Đồng hồ **không nằm trong ảnh chụp ván**. Người cầm lái phát tin `clock` kèm
*khoảng còn lại*, mỗi máy tự cộng vào giờ máy mình. Gửi khoảng chứ không gửi mốc
hết hạn, vì đồng hồ máy mỗi người lệch nhau vài giây là chuyện thường — mà chừng
ấy đủ để một máy tưởng đã hết giờ trong khi máy kia còn thấy nửa phút.

Lên dây lại ở `setTurnActions()`: thanh nút bày ra lại nghĩa là người ấy vừa làm
xong một việc. Đặt ở đúng một chỗ nên lắc xong, đóng hộp thoại xong, đổi lượt…
đều tự tính là còn sống. Cùng người cùng việc thì **không vặn lại kim** — nếu
không, người ngồi im chỉ cần ai đó vào ra phòng (mỗi lần như thế `beginTurn()`
chạy lại) là được tha mãi.

Ai ra tay gạch tên thì tuỳ loại hạn, và **không phải lúc nào cũng là trọng tài**:

- **Hết giờ đi**: ghế còn nối mạng nhỏ nhất **không phải kẻ hết giờ**
  (`judgeSeat`). Trọng tài thường chính là ghế nhỏ nhất, mà kẻ đang treo bàn rất
  có thể là họ — trông vào máy ấy thì chẳng bao giờ có ai bấm cả.
- **Hết giờ trả lời giao dịch**: **người gửi đề nghị**. Họ đang đứng chờ ngay đó
  và là máy duy nhất nhận được lời `'timeout'` của bên kia, nên không sợ hai máy
  cùng gạch một tên. Vì thế `tradeReviewModal` trả về `'timeout'` chứ không trả
  `false` — từ chối đàng hoàng và bỏ bàn là hai chuyện khác nhau.

Đứt đường truyền thì **quên đồng hồ đi**, cả lúc đứt lẫn lúc nối lại. Nó vẫn
chạy suốt quãng mình không nghe thấy gì, nên tới lúc thông trở lại kim đã cạn từ
đời nào, trong khi bàn kia có thể đã gia hạn mấy lượt. Không quên thì máy vừa
nối lại sẽ lập tức đòi gạch tên người đang đi — **đứt mạng của mình mà người
khác chịu phạt**.

### Đứt rồi nối lại

Wifi chớp một cái là kênh đứt, và tự nó nối lại sau vài giây — nhưng **nối lại
không phải là xong**. Trong lúc đứt, ván vẫn chạy trên các máy khác; `sync` là
tin phát một lần, không có kho lưu để gửi bù. Kênh thông trở lại mà ngồi im thì
người ấy nhìn một bàn cờ đã cũ.

Nên `Room` làm hai việc mỗi khi đường truyền trở lại (`Room.#onLink`):

1. **Khai lại mình có mặt.** Presence sống trong bộ nhớ máy chủ theo từng kết
   nối — đứt là máy chủ quên. Không `track` lại thì cả phòng vẫn coi mình đã đi.
2. **Gửi lại `hello`** — đúng lời mà người bấm F5 vẫn gửi. Người đang giữ sổ
   (chủ phòng lúc chờ, trọng tài lúc chơi) ghi lại mình là có mặt, phát lại sổ
   ghế, và nếu đang giữa ván thì gửi kèm cả ván hiện tại.

Lúc đang đứt thì **thanh nút bị cất đi** (`Game.onLink`, và `beginTurn()` không
bày nút khi `room.linkLost`). Máy này vẫn chạy luật được, nhưng ảnh chụp phát ra
không tới được ai, mà lúc nối lại sẽ bị ảnh chụp của bàn đè lên — nước vừa đi
coi như chưa từng có. Thà không cho bấm còn hơn cho bấm rồi nuốt mất.

Biết mình đứt bằng ba nguồn, vì kênh tự nó biết quá muộn (phải chờ hết hạn tim
đập, cỡ vài chục giây): sự kiện `offline` của trình duyệt, socket đóng/lỗi, và
sau cùng mới tới `CHANNEL_ERROR` của kênh.

```
        khách A ──ý định──┐
                          ├──▶ người tới lượt ── GameState ──┬──ảnh chụp──▶ A
        khách B ──ý định──┘        (chạy luật)               └──ảnh chụp──▶ B
```

Có vài chỗ cần hỏi–đáp hai chiều, đều đi qua `room.ask()`: bên hỏi dựng nội
dung trên máy mình rồi **chờ bên kia bấm**, bên kia rớt mạng thì `ask` trả về
câu mặc định chứ không treo lượt của ai.

Giao dịch là ví dụ quen nhất (A dựng đề nghị, B duyệt). Cùng một cách ấy có
**xoay tiền** (`Game.ensureFundsRemote` ↔ câu hỏi `'raise'`): thẻ "mỗi người góp
tiền mừng", phiên đấu giá hay nước cưỡng chiếm đều bắt một người *không phải*
người đang đi móc ví, mà bán nhà hay cầm đất là tiêu vào cơ nghiệp của họ. Nên
bảng quản lý tài sản mở ở **máy con nợ**, trên đúng đất mang tên họ; máy ấy chỉ
gửi về danh sách thao tác đã bấm, còn ván gốc thì người cầm lái làm lại từng
thao tác qua đúng cửa luật của `GameState` (`applyRaiseActs`). Hết giờ hay rớt
mạng thì ngân hàng cấn nợ hộ (`autoCover`), y như nấc cấn nợ của thẻ Thời Cuộc.

## Hai đường truyền

| | Nối được gì | Khi nào dùng |
|---|---|---|
| `SupabaseTransport` | **nhiều máy tính** qua Supabase Realtime | có `.env` (hay `.env.local`) |
| `LocalTransport` | các **tab trên cùng máy** qua BroadcastChannel | chưa cắm khoá |

Không cắm khoá thì game vẫn chơi thử được qua hai cửa sổ trình duyệt, và bộ
kiểm thử chạy trọn luồng phòng chờ mà không cần tài khoản hay mạng. Phòng chờ có
dòng cảnh báo rõ khi đang chạy đường nội bộ.

## Bố cục mã

| Tệp | Việc |
|---|---|
| `src/net/transport.js` | Hai đường truyền cùng một giao diện; `makeTransport()` tự chọn. |
| `src/net/room.js` | Sổ ghế, sức chứa, sẵn sàng, mời ra (phòng chờ), trọng tài, hỏi–đáp. `makeRoomCode()`, `inviteLink()`. |
| `src/net/session.js` | Chọn chế độ → mở/vào phòng → phòng chờ → trao ván cho controller; cả đường vào lại giữa ván. |
| `src/net/identity.js` | `id` theo tab (sessionStorage) nên hai tab là hai người chơi; `name` theo máy. |
| `src/core/serialize.js` | `GameState` ↔ JSON: `Map`, `Set`, `Deck` không tự qua được `JSON.stringify`. |
| `src/ui/lobby.js` | Phòng chờ, chọn nấc thẻ Thời Cuộc, các hộp thoại bị mời ra / phòng đầy. |
| `src/core/events.js` | Luật thẻ Thời Cuộc: thanh áp lực, rút thẻ, **kế hoạch** của mỗi sự kiện, cấn nợ tự động. Thuần dữ liệu như `state.js`. |
| `src/game/eventRunner.js` | Thi hành một sự kiện: bày thẻ cho cả bàn, hỏi nhiều người **cùng lúc**, đấu giá kín. |

Trong `controller.js`, phần online gói gọn ở `startOnline()`, `isDriver()`,
`sync()`, `onSync()`, `onEvent()`, `onAsk()`, `onLink()`, `onRoomChange()`,
`checkAbsent()`, `skipAbandonedTurn()`, `evictPlayer()`, và khối đồng hồ lượt
(`armClock()`, `clearClock()`, `applyClock()`, `checkClock()`, `judgeSeat()`). Các chỗ còn lại chỉ thêm một dòng
`this.sync()` sau khi đổi trạng thái.

Thẻ Thời Cuộc theo đúng luật ấy, chỉ khác ở chỗ nó hỏi **nhiều người một lúc**:
máy cầm lái lập kế hoạch (gieo hết phần ngẫu nhiên ở một chỗ), gửi câu hỏi đi
bằng `ask` rồi `Promise.all` chờ cả bàn, mỗi câu có hạn và **câu trả lời mặc
định lúc hết giờ** — người bỏ đi giữa phiên đấu giá coi như bỏ qua, không treo
bàn. Vì một sự kiện dài hơn hạn một nước đi, `EventRunner.bumpClock()` vặn lại
đồng hồ sau mỗi chặng, kẻo mấy máy ngồi xem lại gạch tên chính người đang chạy
sự kiện. Nấc luật đi kèm sổ ghế (`room.options`) và nằm trong ảnh chụp
(`snapshot.settings`), nên người vào lại giữa ván chơi đúng bộ luật của bàn.

Vì `id` nằm trong sessionStorage nên **bấm F5 hay rớt mạng rồi vào lại thì về
đúng ghế cũ**, còn đóng hẳn tab rồi mở tab mới thì thành người lạ — coi như bỏ ván.

## Dựng dự án Supabase

1. Tạo project miễn phí ở [supabase.com](https://supabase.com).
2. **Project Settings → API**, chép `Project URL` và `anon public` key.
3. `cp .env.example .env` rồi dán hai giá trị vào.
4. `npm install && npm run dev` → http://localhost:5174

Realtime broadcast và presence bật sẵn, không phải tạo bảng nào. Chỉ dùng `anon`
key — `service_role` key mà lọt vào bundle client là mở toang cả database.

## Đưa lên mạng

Chạy `npm run dev` thì đường mời là `http://localhost:5174/?room=K7QM` — gửi cho
bạn bè là vô dụng. Phải có một địa chỉ thật thì mới gọi là chơi online được.

Bản này là **trang tĩnh thuần**: Supabase lo hết phần máy chủ, nên không cần
Node chạy nền, không cần container — chỗ nào phục vụ tệp tĩnh cũng chạy được.
Chọn **Vercel**, cấu hình ở `vercel.json`.

```bash
cd monopoly-online
npx vercel link                              # lần đầu
npx vercel env add VITE_SUPABASE_URL production
npx vercel env add VITE_SUPABASE_ANON_KEY production
npx vercel --prod
```

Hai điều dễ vấp:

- **Chạy lệnh ngay trong `monopoly-online/`**, đừng chạy ở thư mục cha — thư
  mục cha chứa hai dự án và không có `package.json`. (Nếu sau này đẩy cả thư
  mục cha lên GitHub rồi nối vào Vercel thì phải khai ô *Root Directory* là
  `monopoly-online`.)
- **Khoá phải khai lại trên Vercel.** `.env` nằm trong `.gitignore` nên nó
  không đi theo mã nguồn — đó là hai lệnh `vercel env add` ở trên. Thiếu khoá
  thì bản đã lên mạng **tụt về `LocalTransport`**, tức là chỉ nối được các tab
  trên cùng một máy, đúng cái mà lên mạng là để tránh. Tệ ở chỗ nó không báo
  lỗi gì cả, chỉ hiện dòng cảnh báo nhỏ trong hộp thoại chọn chế độ.

`VITE_*` được **nhúng thẳng vào bundle** lúc dựng chứ không đọc lúc chạy, nên
kiểm bằng `npm run build && grep -l 'supabase.co' dist/assets/*.js` — không ra
gì là biết ngay khoá chưa vào.

Bundle tách làm ba (`vite.config.js`): mã ván cờ ~58 kB gzip, Supabase ~55 kB,
Phaser ~340 kB. Tên tệp có băm nội dung nên Phaser tải đúng một lần rồi nằm lại
trong cache — sửa mã game rồi deploy lại, người chơi chỉ tải phần 58 kB.

## Kiểm thử

```bash
npx vite --port 5179 --strictPort &
npm run test:online
```

Các tab chạy trong **cùng một browser context** (bắt buộc, vì BroadcastChannel
chỉ nối các tab dùng chung kho lưu trữ). Bộ lõi chạy: mở phòng, vào bằng đường
mời, tên chỉ hiện sau khi bấm Sẵn sàng, Khai cuộc khoá tới khi cả phòng sẵn
sàng, có người rời thì ghế và màu mở lại, mời ra khỏi phòng chờ, khoá lượt theo
người, trạng thái lan giữa các máy, **giao dịch giữa hai máy**, **đứt mạng giữa
ván rồi tự nối lại**, rớt mạng rồi vào lại đúng ghế, đi luôn quá hạn thì đất về
ngân hàng, và **hai kiểu hết giờ**. Cờ `--full` thêm phần đổ đầy 6 người.

Hai mục đáng nói:

- **Giao dịch** (§7) là đường hỏi–đáp hai chiều duy nhất trong cả hệ thống, nên
  cũng là chỗ duy nhất một máy phải *đứng chờ* máy khác. Bài kiểm dựng đề nghị
  trên máy A, xác nhận hộp xét duyệt mở ở máy B chứ không phải máy A, rồi kiểm
  đất đổi chủ khớp nhau trên cả hai bàn.
- **Đứt rồi nối lại** (§8) ngắt mạng bằng `context.setOffline(true)`. Nó ngắt cả
  browser context nên A cũng mất mạng theo — không tách riêng một tab được. Vẫn
  đủ dùng: A đi một nước trong lúc đứt, và điều cần kiểm là B có bắt kịp nước ấy
  sau khi nối lại hay không.
- **Đồng hồ lượt** (§11) phải dựng hẳn một **ván ba người** riêng chứ không dùng
  lại ván cũ: gạch một người trong ván hai người là hạ màn ngay, mà điều đáng
  kiểm nhất lại là *"gạch xong ván có chạy tiếp không"*. Tab của người ra tay
  phải `bringToFront()` — tab ẩn bị Chrome bóp nhịp hẹn giờ, mà mọi việc gạch
  tên đều chạy bằng nhịp.
- **Hết giờ trả lời giao dịch** (§12) gửi một đề nghị rồi *không bấm gì cả*:
  kiểm hộp thoại tự đóng, bên gửi không treo, và bên nhận bị mời khỏi bàn.

Cả bộ chạy trên **Supabase thật** khi có `.env`; thiếu khoá thì tụt về
`LocalTransport` và §8 tự bỏ qua (BroadcastChannel không đứt được).

Một giới hạn của máy chứ không phải của mã: **sáu bàn cờ Phaser đã chiếm hết
ngữ cảnh WebGL** mà Chrome cấp cho một tiến trình, tab thứ bảy nằm im ở màn hình
đen không dựng nổi scene. Nên phần "người thứ 7 bị chặn" được kiểm ngay tại
`Room` (bơm một lời xin ghế vào phòng đã đầy rồi xem phòng trả lời `full`) thay
vì mở thêm một tab thật. Hộp thoại `fullModal` vì thế chưa được kiểm đầu-cuối.

## Còn thiếu

- **Ván sống lại sau khi tắt hết máy.** Trạng thái chỉ nằm trong bộ nhớ các máy
  đang mở; người cuối cùng đóng tab là ván mất. Muốn giữ thì cần bảng Postgres
  `rooms(code, snapshot jsonb, updated_at)`, trọng tài ghi sau mỗi lượt.
- **Đóng hẳn tab rồi quay lại.** `id` nằm trong sessionStorage nên tab mới là
  người lạ, không nhận lại ghế cũ. Muốn chữa thì phải cấp thêm một vé đổi ghế
  lưu ở localStorage theo mã phòng — nhưng như thế hai tab trên cùng một máy sẽ
  giành nhau một ghế, nên chưa làm.
- **Chống gian lận.** Máy nào tới lượt thì tự gieo xí ngầu, nên người sửa mã
  trong trình duyệt có thể ăn gian. Đủ cho ván chơi giữa bạn bè; muốn chặt thì
  phải đưa luật lên Edge Function. Lưu ý: seed xí ngầu **không** chữa được —
  seed lộ thì đoán trước được nước sau, phải cam kết hash trước rồi lộ seed sau.
