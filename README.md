# Cờ Tỷ Phú — Sài Gòn · Gia Định (bản online)

> Bản **nhiều máy**, sao chép từ [`../monopoly-base`](../monopoly-base) và đang thêm lớp mạng
> Supabase Realtime. Kiến trúc mạng cùng lộ trình: [`ONLINE.md`](ONLINE.md).
> Cần bản offline một máy đã ổn định thì dùng `monopoly-base`.

Monopoly phiên bản Việt Nam, chạy hoàn toàn **local** bằng thư viện [Phaser 3](https://phaser.io)
(mã nguồn mở, giấy phép MIT — **không tốn phí**). Bàn cờ lấy tên đường Sài Gòn thời Pháp thuộc
kèm tên hiện nay: *Rue Catinat → Đồng Khởi*, *Boulevard Charner → Nguyễn Huệ*,
*Palais du Gouverneur → Dinh Độc Lập*, nhà tù là *Khám Lớn Sài Gòn*.

Mỹ thuật: sơn mài đỏ, vàng hoàng cung Huế, ngọc bích, giấy dó — hoa văn **trống đồng Đông Sơn**
và **chim Lạc**, hồi văn kiểu cung đình, **mái đình cong đầu đao** trên đầu mỗi ô đất, **rồng**
và **phụng** ở ô Khí Vận / Cơ Hội.

## Chạy game

```bash
npm install
cp .env.example .env    # điền khoá Supabase, xem ONLINE.md
npm run dev             # mở http://localhost:5174
```

Cổng 5174 để mở song song với `monopoly-base` (cổng 5173) mà không đụng nhau.

Build bản tĩnh:

```bash
npm run build        # xuất ra dist/
npm run preview
```

Muốn bạn bè ở máy khác vào chơi thật thì phải đưa lên mạng — đường mời sinh từ
địa chỉ đang mở, nên chạy `npm run dev` thì nó là `localhost`, gửi đi vô dụng.
Cấu hình sẵn cho Vercel ở `vercel.json`; các bước và hai cái bẫy hay vấp nằm ở
mục **Đưa lên mạng** trong [`ONLINE.md`](ONLINE.md).

## Cách chơi

**2–6 người** luân phiên trên **cùng một máy** (hot-seat). Mỗi người khởi đầu 1.500$.

### Điều khiển

| Thao tác | Kết quả |
|---|---|
| **Rê chuột** lên một ô | Ô sáng lên, đồng thời cột trái hiện **bảng xem nhanh**: thẻ ô, chủ sở hữu, số nhà, **mức thuê đang áp dụng**, giá mua và giá thế chấp. Ô nào đã xây thì có thêm **bảng nhà trồi lên** từ mép trong của ô, ghi rõ mấy căn hay khách sạn |
| Bấm vào **ô bất kỳ trên bàn cờ** | Hiện chi tiết ô: chủ sở hữu, bảng giá thuê đầy đủ có đánh dấu mức đang áp dụng, giá thế chấp và giá chuộc |
| Bấm vào **thẻ người chơi** ở cột trái | Bảng tài sản: tiền mặt, tổng giá trị, các ô đất dạng thẻ bài xếp **hai cột theo nhóm màu / loại đất**, số nhà, ô đang thế chấp. Bấm tiếp một thẻ để xem chi tiết ô đó |
| Nút **⛶** cuối cột trái | Toàn màn hình (phím **F**) — bàn cờ tự dựng lại bố cục cho kín màn hình |
| Nút **♪** / **🔔** | Bật tắt riêng nhạc nền (phím **M**) và hiệu ứng âm thanh |

**Nút hành động nằm giữa lòng bàn cờ** — ngay chỗ mắt đang nhìn, trên một tấm bảng sơn mài
viền vàng: nút chính chiếm trọn hàng đầu, các nút phụ chia hàng dưới. Hết việc (lúc quân đang
đi, xí ngầu đang lăn) là bảng tự lui, để lộ lại biển tên trên mặt bàn.

### Phím tắt

Mỗi nút hành động đeo sẵn con dấu phím tắt ở góc phải, khỏi phải nhớ:

| Phím | Hành động |
|---|---|
| **R** | Lắc xí ngầu (trong tù thì là cầu đôi) |
| **E** | Kết thúc lượt |
| **T** | Giao dịch |
| **Q** | Quản lý tài sản (xây nhà, bán nhà, thế chấp, chuộc) |
| **N** | Nộp tiền ra tù |
| **P** | Phá sản (vẫn hỏi lại một lần trước khi chốt) |
| **F** · **M** | Toàn màn hình · bật tắt nhạc nền |
| **Space** (giữ) | Tạm ẩn hộp thoại để ngó bàn cờ |

Phím tắt chỉ ăn khi thanh nút đang hiện: đang gõ tên, đang mở hộp thoại, hay đang chạy hiệu ứng
thì bàn phím im — không sợ lỡ tay đá nhầm một lượt. Nút mờ (như *Nộp tiền ra tù* lúc hết tiền)
cũng không nhận phím.

**Cột trái** giữ phần tra cứu: hiệu bài, danh sách người chơi (người đang tới lượt được tô sáng
kèm nhãn *ĐANG ĐI* — không còn thanh lượt chơi riêng), **bảng xem nhanh ô đang rê chuột**,
kho nhà của ngân hàng và ba nút tiện ích. Không rê ô nào thì bảng xem nhanh nói về ô mà người
đang tới lượt đứng. Bàn đông 5–6 người thì thẻ người chơi tự bóp gọn cho cả bàn nằm trong tầm mắt.

## Luật đã cài đặt

| Luật | Chi tiết |
|---|---|
| **Xí ngầu** | Lắc 2 viên, đi theo tổng số. Đổ đôi được đi tiếp; **đổ đôi 3 lần liên tiếp thì vào tù** |
| **Vào tù** | Đáp xuống ô *Vào Tù* là **hết lượt ngay**, kể cả khi vừa đổ đôi |
| **Ở tù** | Mỗi lượt **chỉ được cầu đôi một lần** — trượt thì hết lượt, chờ vòng sau. Ra đôi thì được tha nhưng không có lượt lắc thêm |
| **Ra tù** | Nộp 50$, hoặc lắc ra đôi. Cầu đôi hụt tới **lần thứ 3** thì buộc nộp 50$ rồi đi theo số vừa lắc |
| **Cơ Hội / Khí Vận** | Hơn 20 thẻ mỗi bộ, bóc ngẫu nhiên. Ngoài thẻ cộng/trừ tiền còn có: **tiền mừng** (chia đều thu từ những người chơi khác), **thuế nhà cửa** (tính đầu nhà, đầu khách sạn), và bảy loại thẻ **giữ được trong túi** — xem hai dòng dưới |
| **Túi thẻ** | Sáu loại thẻ (vé ra tù, phát mãi, dỡ nhà, cưỡng chiếm, giải toả, giải toả bốc thăm) **không nổ ngay lúc bóc** mà cất vào túi, khi nào thấy đúng lúc thì mở nút **Túi thẻ** ra dùng. Bảng túi thẻ ghi rõ thẻ làm gì và *lúc này* dùng được chưa. Thẻ đang trong túi ai thì **rời khỏi bộ bài**, xài xong mới trả về; vỡ nợ cũng trả về |
| **Vé ra tù** | **Bốn tấm, chia đều hai bộ**. Đang ngồi tù thì chìa ra là được thả miễn phí, rồi lắc đi như thường |
| **Thẻ nhắm vào nhà đất** | Người dùng thẻ tự chọn mục tiêu, chỉ nhắm được vào **người khác** (riêng giải toả chọn được cả đất mình), và không đụng ô đang thế chấp. Ép bán: dỡ sạch nhà một ô, chủ nhận nửa giá xây · Dỡ nhà: mất **1 cấp** (Khí Vận) hoặc **2 cấp** (Cơ Hội), không đền · Cưỡng chiếm: lô đất trống sang tên, đền bằng giá thế chấp |
| **Giải toả** | Chủ lô lãnh **giá gốc +20%**, lô đất đem **đấu giá kín**. Hai kiểu: *chỉ định* (tự chọn lô) và *bốc thăm* — bàn cờ sáng chạy lần lượt qua từng lô đất trống, chậm dần rồi dừng ở lô trúng. Cả hai chỉ nhắm được lô **chưa xây nhà** |
| **Mua đất** | Dừng ở ô trống và còn tiền thì hiện popup hỏi mua. Không mua thì thôi — **không có luật đấu giá** |
| **Xây nhà** | Phải đủ bộ màu. Cả bàn chỉ có **32 căn nhà**; hết nhà thì người khác không xây được nữa |
| **Khách sạn** | Đủ 4 nhà mới lên khách sạn, và **trả lại 4 căn nhà** vào kho ngân hàng |
| **Giao dịch** | Chọn đối tác → hai bên hiện tiền mặt + đất đang sở hữu → gửi đề nghị → **cả hai đồng ý** mới thành. Cả bàn đều thấy nội dung đề nghị và kết quả ở giữa màn hình |
| **Thế chấp** | Lấy tiền mặt = ½ giá đất. Chuộc lại trả **thêm lãi 10%** (mọi trường hợp) |
| **Đất thế chấp** | Người khác **không mua được** nhưng **trao đổi được**. Chủ mới được mời chuộc lại với phí thế chấp + 10% |
| **Thiếu tiền** | Còn xoay đủ (tiền mặt + bán nhà + thế chấp) thì được mời bán nhà / thế chấp. **Xoay hết vẫn không đủ → vỡ nợ ngay**, khỏi hỏi han |
| **Phá sản** | Tự nguyện hoặc khi hết khả năng chi trả. Toàn bộ tài sản **trả về ngân hàng**, nhà cửa nhập lại kho chung |

## Thẻ Thời Cuộc — sự kiện toàn bàn

Bật/tắt ngay ở màn bày bàn cờ (bản một máy) hoặc trong phòng chờ (chủ phòng
chốt cho cả phòng): **Tắt · Nhẹ · Chuẩn · Hỗn loạn**.

Sinh ra để chữa đúng một cái bệnh của ván ít người: đất bán hết, không ai chịu
đổi chác, mỗi lượt chỉ còn lắc xí ngầu đi vòng vòng và tiền đứng yên.

**Thanh áp lực** bên cột trái (`#fate-meter`) đầy dần theo những gì xảy ra trên
bàn — mỗi lần ai đó qua ô Bắt Đầu (+1), **một lượt trôi qua mà không đồng nào
đổi chủ (+2)**, một đề nghị giao dịch bị từ chối (+1), một người phải cắm đất
(+3). Đầy tới ngưỡng thì nổ một thẻ. Ngưỡng **hạ dần** sau mỗi lần nổ, nên càng
về cuối ván sự kiện càng dày và ván buộc phải ngã ngũ.

Thanh chỉ bắt đầu tính khi bàn đã **bán gần hết đất** (hoặc đã đi đủ 8 vòng) —
nổ sự kiện lúc đất còn ế là phá ván. Gần đầy thì thanh đổi sang màu son và ghi
*SẮP CÓ BIẾN*: báo trước để người chơi kịp tính, chứ không phải ập xuống bất ngờ.

| Kỳ | Mở khi nào | Thẻ |
|---|---|---|
| **Kỳ 1** — tiền và luật tạm thời | ngay từ lần nổ đầu | Sưu cao thuế nặng (tiền vào **Quỹ Công**, ai ghé Bến Đậu thì ẵm trọn) · Giá gạo leo thang (thuê +25%) · Mất mùa (lương qua ô Bắt Đầu còn một nửa) · Bão giá vật liệu · Ngân hàng siết tín dụng · Giới nghiêm (cấm xây) · Hội chợ Đấu Xảo · Ân xá · Quỹ Công phát chẩn |
| **Kỳ 2** — nhà cửa và quyền sở hữu | sau vài lần nổ (nấc *Hỗn loạn* mở ngay) | **Động đất** (cả khu sập một tầng, bỏ tiền chống đỡ thì giữ được) · **Hoả hoạn** · **Mất giấy tờ** (mỗi người chọn một ô ngưng thu tiền thuê) · **Trưng thu quy hoạch** · **Sang nhượng bắt buộc** · **Hoán đổi địa bạ** · Mở đường lớn · Đại hạ giá |

Ba thẻ *Trưng thu*, *Sang nhượng bắt buộc* và *Đại hạ giá* đem đất ra **đấu giá
kín**: mọi người ghi một con số cùng lúc, cao nhất lấy đất, hoà thì người đi
trước trong vòng lượt thắng. Đây là đường duy nhất khiến đất đổi chủ **mà không
cần đối phương gật đầu**.

Thẻ nào cũng có một quyết định để ra, và thiệt hại luôn nhắm theo tiêu chí công
khai (khu nào, ô đông nhà nhất, người giàu nhất) chứ không bốc thăm xem ai xui.
Khoản thu tự động thì máy **cấn nợ hộ** — thế chấp ô rẻ nhất trước, hết đường
mới hạ nhà — vì hỏi bốn người cùng lúc "bán nhà đi" là treo cả bàn.

## Hiệu ứng

- Lắc xí ngầu: hai khối lập phương 3D thật rơi từ trên cao, nảy trên mặt bàn, lăn qua
  cạnh rồi mới nằm im ngửa đúng mặt số (chớp vàng khi ra đôi)
- Quân cờ nhảy từng ô một theo vòng cung trên bàn cờ; xoay tròn khi bị giải vào tù
- Modal mua/bán, giao dịch, bóc thẻ: mờ nền + trượt lên + bung nhẹ; thẻ Cơ Hội lật 3D
- Tiền: đồng xu cổ lỗ vuông bay theo vòng cung — ngân hàng → ví khi qua ô Bắt Đầu / rút thẻ,
  ví → ví khi trả tiền thuê, ví → ngân hàng khi mua đất và nộp thuế
- Phá sản: quân cờ đổ, bốc khói, rung màn hình; pháo hoa tiễn người thua
- Pháo hoa liên hồi mừng người thắng

## Âm thanh

Tổng hợp trực tiếp bằng **Web Audio API**, không dùng file nhạc ngoài.

**Nhạc nền chỉ chạy ở màn hình chờ.** Khai cuộc xong là nhạc nhỏ dần rồi tắt hẳn,
mặt bàn chỉ còn tiếng xí ngầu và tiếng quân cờ. Hạ màn một ván thì nhạc nổi lại.

Chất nhạc: **valse chậm** kiểu phòng trà Sài Gòn – Chợ Lớn những năm 60, cũng chính là
nét nhạc phim Hong Kong cũ — contrebasse gảy nhịp *bùm–chát–chát*, đàn dây kéo vĩ ngân
dài (hai bè răng cưa lệch nhau, lọc mở dần theo cú vĩ, vibrato vào muộn), vibraphone
điểm xuyết, chổi quét trên mặt trống. Giai điệu đi trên thang **rê thứ hoà thanh**
(rê mi fa sol la si♭ đô♯) — vừa hợp tai ngũ cung Việt, vừa ra cái day dứt cổ kính của
nhạc Hoa xưa. Hoà thanh Rê thứ → Sol thứ → La bảy, đoạn B chuyển sang Fa – Si giáng.

Bản nhạc **dựng theo đoạn** chứ không lặp một vòng ngắn — sáu đoạn
*Dạo · A · B · Ngâm · A' · Lắng*, tổng 42 ô nhịp valse. Mỗi ô nhịp rút một câu trong kho
16 câu rồi biến tấu (dịch bậc, đổi quãng tám, xê dịch phách, nhịp trôi nhẹ); nốt ngân dài
được **nắn về nốt trong hợp âm** đang chạy nên câu nhạc không bao giờ chỏi.

**Hiệu ứng** — xí ngầu lắc trong ống rồi *từng cú chạm bàn kêu đúng lúc nảy* (âm lượng theo
vận tốc va chạm), tiếng gõ gỗ mỗi nhịp quân cờ nhảy sang ô kế, xu leng keng, mõ gỗ khi mua
đất/xây nhà, tiếng giấy khi bóc thẻ, chuông chùa khi vào tù, quãng trượt ảm đạm khi phá sản,
tiếng nổ pháo hoa.

Bản online có thêm **một tiếng chuông nhỏ khi tới lượt mình** — ngân dài và trong, khác hẳn
tiếng mõ gỗ khô của mọi hiệu ứng còn lại, để nghe một cái là biết đang gọi mình. Nhận được
một đề nghị giao dịch cũng reo tiếng ấy, vì cũng là lúc cả bàn đang chờ mình bấm.

Nhạc và hiệu ứng bật tắt **độc lập** bằng hai nút **♪** và **🔔**.

## Chữ và độ nét

**Chữ** — ba họ chữ tự lưu trữ trong `public/fonts` (giấy phép SIL OFL, không gọi mạng lúc chạy),
đều có bộ ký tự tiếng Việt đầy đủ nên dấu thanh không bị vỡ hay lệch:

| Họ chữ | Dùng cho |
|---|---|
| **Playfair Display** | Tiêu đề, biển hiệu giữa bàn cờ, nhãn ô góc |
| **Noto Serif** | Tên ô đất, thẻ bài, bảng giá thuê |
| **Be Vietnam Pro** | Nút bấm, HUD, chữ phụ (thiết kế riêng cho tiếng Việt) |

**Độ nét** — Phaser ở chế độ `Scale.RESIZE` đặt `canvas.width` bằng số điểm ảnh CSS,
nên trên màn Retina hình bị trình duyệt phóng to và mờ. Game tự quản lý kích thước:
khung vẽ đúng bằng **số điểm ảnh vật lý** (`window.devicePixelRatio`, chặn ở 3) rồi thu
nhỏ lại bằng CSS. Texture bàn cờ cũng được sinh theo cạnh ngắn của màn hình
(1600–3200 px) nên vẫn sắc khi bật toàn màn hình.

## Mỹ thuật

Hầu hết hình ảnh được **vẽ bằng code** (canvas 2D) lúc khởi động; chỉ chim Lạc và bốn hoạ
tiết trang trí là ảnh có sẵn (xem hai mục cuối):

- `src/render/motifs.js` — chim Lạc, mặt trống đồng Ngọc Lũ, hồi văn, mây cuộn, lá đề, mái đình, vân giấy dó
- `src/render/icons.js` — biểu tượng vector cho ô đặc biệt (rồng, phụng, đầu máy xe lửa, mỏ neo, cân, tia sét…)
- `src/render/boardArt.js` — mặt bàn cờ (1600–3200 px tuỳ màn hình)
- `src/render/pieces.js` — quân cờ (đổ bóng + bắt sáng cho có khối) và đồng xu
- `src/render/glyphs.js` — hình nhà / khách sạn và ánh đèn hắt ra từ chân ô; dùng chung cho canvas lẫn HTML
- `src/render/dice3d.js` — xí ngầu: khối lập phương dựng bằng quaternion, chiếu phối cảnh từng khung hình
- `src/render/artwork.js` — nạp và nhuộm màu bốn tấm hoạ tiết vẽ tay (mái đình, mây, rồng, phụng)

Ngoại lệ duy nhất là **hình nhà và khách sạn**: lấy từ bộ icon mã nguồn mở
[Phosphor Icons](https://github.com/phosphor-icons/core) (giấy phép MIT), giữ bản gốc ở
`assets/icons/` và chép dữ liệu đường vẽ vào `src/render/glyphs.js`. Nhờ vậy cùng một hình
dùng được cho cả hai nơi — nhúng thẳng vào HTML, và vẽ ra canvas bằng `Path2D` cho bàn cờ —
thay cho ký tự `⌂` trước đây (mỗi máy một dáng, có máy còn không có sẵn).

### Bốn tấm hoạ tiết vẽ tay

Ngoại lệ thứ hai — bốn hoạ tiết trang trí là **ảnh vẽ tay**, để trong `assets/`:

| Tệp | Dùng ở đâu |
|---|---|
| `gate.png` | **Cổng** phủ kín đầu mỗi ô đất — mái cong đầu đao chạm hồi văn, mây và một bông sen ở giữa, hai cột chạm hồi văn đứng trên đài sen |
| `dragon.png` | **Rồng** ở ô Khí Vận |
| `phoenix.png` | **Phụng** ở ô Cơ Hội |
| `cloud.png` | **Mây cuộn** ở mép trên hai ô Khí Vận / Cơ Hội — rồng bay trong mây, phụng múa trong mây |

Bản gốc (mực đen trên nền trắng, 2048–3584 px) nằm trong `assets/raw/` — trong đó `gate.png` là
bản chỉ có mái, `gate-2.png` là bản cổng đủ bộ đang dùng. Bản đang dùng đã được xử lý sẵn: xoá
bóng đổ bệt sẵn trong ảnh và dấu chìm nằm lọt trong mảng mực, **tách nền trắng thành kênh
alpha** theo độ sáng nên mép nét vẫn mượt, đổi mực về đen tuyền, cắt sát viền rồi thu nhỏ —
bốn tệp cộng lại chưa tới 400 KB.

**Nhuộm màu** (`src/render/artwork.js`) — vì mực đã là đen tuyền trên nền trong suốt nên tô lại
màu chỉ là phủ một mảng màu qua đúng hình mực bằng `source-in`. Nhờ vậy mái đình **ăn theo màu
nhóm đất** (tám nhóm, tám sắc), rồng lấy màu ngọc bích, phụng lấy màu sơn mài đỏ — hoạ tiết
hoà vào bảng màu của bàn cờ chứ không phải ảnh đen trắng dán lên. Bản đã nhuộm được giữ lại
theo cặp (hoạ tiết, màu).

Nếu tệp ảnh hỏng hoặc chưa nạp kịp, `drawArt` trả về `false` và mặt bàn tự rơi về **bản dựng
bằng code** vẫn còn nguyên trong `motifs.js` / `icons.js` (`curvedRoof`, `bodhiLeaf`,
`cloudScroll`, và hai hình rồng / phụng dựng từ `ribbon` — hàm tô một dải thon dọc theo đường
tâm). Cùng cách làm với ảnh chim Lạc.

**Dựng đầu ô** — cổng **phủ kín bề ngang ô**, hai cột chạy sát hai mép, chân cột đài sen đỗ
ngay trên gạch chỉ chân đầu ô. Không còn khoang màu bao quanh: chiều cao đầu ô chính là chiều
cao ảnh cổng khi kéo hết bề ngang (1 / 3,0118 của bề ngang ô, tức 22% chiều cao ô), nên đầu ô
mỏng hẳn và thân ô rộng ra. Sắc nhóm đất nằm trong **nét cổng** và trong **tấm biển tên tiếng
Pháp** treo giữa hai cột — biển chỉ một đường viền mảnh, chữ nét 600. Tên đường hiện nay ở thân
ô được phóng to lên bù lại, vì đó mới là dòng người chơi thật sự đọc.

**Ô Khí Vận / Cơ Hội** không có tên nay lẫn giá tiền, nên hình rồng / phụng được vẽ to hơn hẳn
và cả cụm dồn xuống lấp chỗ trống ấy; tên ô lấy đúng màu của linh vật (ngọc bích / sơn mài đỏ)
thay vì màu mực như các ô khác.

Mỗi ô đất còn được vẽ lại thành **thẻ bài chữ nhật** riêng (`paintTileCard`) dùng chung
một mã vẽ với mặt bàn cờ, nên thẻ trong các hộp thoại trông y hệt ô thật — cùng dải màu,
cùng kiểu chữ, cùng biểu tượng. Khác một điểm: thẻ **không kẻ viền** — không viền mực bo góc
quanh thẻ, cũng không gạch chỉ chân cổng. Thẻ đứng riêng trên nền tối của hộp thoại nên tự nó
đã tách bạch; trên mặt bàn thì ngược lại, các ô nằm liền nhau nên vẫn cần cả hai đường kẻ.

**Đánh dấu chủ đất** — ô đã có chủ được **phủ kín mặt ô bằng đúng màu người đó**, chỉ một
nước màu chứ không thêm gờ hay viền gì: cả mảng màu thì liếc một cái là thấy ai đang giữ
đâu, rõ hơn hẳn một cái gờ mỏng ở rìa ô. Độ dày nước màu nương theo **độ nổi của sắc đó trên
nền giấy** — sắc nào chìm vào tông giấy thì phủ dày tay hơn, nhưng có chặn trên để tên ô và
giá tiền in trên mặt ô vẫn đọc được. Riêng **Hoàng kim** vốn sát tông giấy thì còn được dìm
sáng xuống thành hổ phách, không thì phủ dày cỡ nào ô cũng chỉ ra một sắc ngà ngà y như ô
chưa ai mua. Ô đang thế chấp thì nước màu nhạt đi một nửa và mang thêm dấu **✕** đỏ.

**Đất đã xây nhà** — mặt ô **không dựng nóc nhà lên nữa**. Ô cờ vốn đã chật: tên đất, giá
tiền, quân cờ của tối đa sáu người; nhét thêm bốn nóc nhà vào dải màu thì mọi thứ chen nhau
mà vẫn phải nheo mắt đếm. Thay vào đó **mép trong của ô sáng lên một vệt đèn mang màu chủ
đất**, kèm một vũng tối hắt ngược vào lòng ô làm chân đèn, và cả dãy cùng thở một nhịp rất
chậm. Nhà càng nhiều đèn càng tỏ (khách sạn tỏ nhất), nên liếc cả bàn là đọc ngay được dãy
nào đang được đầu tư nặng tay — mà không có khối hình nào che mất chữ.

Đèn hắt **một chiều, từ chân ô đi ra**: sáng nhất ngay sát mép ô rồi loang vào lòng bàn cờ
và mờ dần, càng xa gốc càng xoè rộng — như có ngọn đèn giấu dưới gờ ô. Ảnh đèn vẽ sẵn thành
một dải chuyển sắc lệch hẳn về một phía (`paintEdgeSpill`), đặt gốc ảnh đúng vào mép ô rồi
xoay cho trục của nó chỉ vào giữa bàn. Mỗi ô hai lớp: một quầng dài cho cảm giác có ánh
sáng toả, và một **vệt ngắn đậm ngay chân ô** — sắc của người chơi đọc ở vệt này. Vệt sáng
đối xứng kiểu cũ nằm đè lên mép trông như dán vào, còn đèn hắt một chiều thì mới ra ánh sáng.

Muốn biết chính xác mấy căn thì **rê chuột vào ô**: một **ngăn nhà trượt ra từ dưới mặt ô**,
bày đúng bấy nhiêu hình nhà (hoặc một khách sạn) — đếm hình là biết, khỏi cần chú thích chữ.
Ngăn này cố ý dựng bằng **đúng vật liệu của mặt bàn** — nền giấy dó chuyển sắc y như mặt ô,
nước màu chủ đất theo cùng công thức, nét viền cùng tông với lưới ô, cạnh giáp ô để vuông
còn hai góc ngoài mới bo — nên nó đọc ra là **phần đất nới thêm của ô**, không phải một tấm
thẻ nổi lên đè lên bàn cờ. Nửa còn nằm trong ô bị che bằng mặt nạ hình học, vì vậy ngăn
*trượt ra từ dưới bàn cờ* chứ không hiện dần ra giữa không trung.

Ngăn **xoay theo ô**, và từng hình nhà cũng quay đúng chiều ấy — hệt như tên đất in trên
mặt ô. Ô ở cột trái thì ngăn nằm dọc và mấy căn nhà cũng nghiêng theo cột trái, xếp thành
hàng dọc y như trên bàn cờ thật. Bề ngang ngăn đóng cứng
**bằng bề ngang ô**, hình nhà tự co cho vừa: ngăn rộng hơn ô thì trông như của ô bên cạnh,
mà rê dọc một dãy đất cũng thấy nó giật qua giật lại.

**Bảng quản lý tài sản** xếp mỗi ô đất thành **một thẻ mang đúng màu của ô**, rải hai cột,
tiêu đề nhóm màu chiếm trọn bề ngang. Nút thao tác chỉ mang **hình, không mang chữ**
(nhà `+`, nhà `−`, ngân hàng, chìa khoá) — bốn nút với đủ chữ thì thẻ nào cũng dài thượt;
tên đầy đủ và số tiền nằm ở `title`, rê chuột vào là đọc được.

**Bảng tài sản của một người** gom đất theo **nhóm màu / loại**, mỗi nhóm một khoang riêng và
**hai khoang một hàng** — bảng vốn thừa bề ngang, xếp một cột thì phải cuộn mới xem hết.

Giao diện **không kẻ vạch màu ở mép trái** ở bất cứ đâu: thẻ đất bỏ vạch chủ sở hữu (đã có
dòng "Chủ sở hữu" và màu phủ trên ô cờ), ô chi phí bỏ vạch phân loại (đã phân biệt bằng màu
chữ số). Một cái vạch mỏng nằm sát rìa vừa khó bắt mắt vừa làm thẻ trông như bị xén.

**Lời thông báo chỉ gọi tên tiếng Việt** — "mua **Đồng Khởi**", không phải "mua *Rue Catinat
(Đồng Khởi)*". Tên Pháp vẫn in trên mặt bàn cờ và trên thẻ đất cho ra chất Sài Gòn xưa, nhưng
đó là phần trang trí; câu thông báo chạy ngang màn hình thì phải đọc lướt một cái là hiểu.

Sáu quân cờ chỉ phân biệt bằng **màu** — không đeo biểu tượng gì cho đỡ rối mắt:
**Son đỏ**, **Hoàng kim**, **Ngọc bích**, **Men lam**, **Chàm lam**, **Tím Huế**.
Sáu sắc rải đều vòng sắc độ nên không hai quân nào lẫn nhau, kể cả lúc màu ấy bị pha loãng
thành nước phủ trên ô. Mỗi ô có **lưới 3 × 2 chỗ đứng** nên cả sáu quân cùng dừng một ô vẫn
nhìn ra ai với ai; bàn từ 5 người trở lên thì quân tự thu nhỏ để hàng ba quân nằm lọt trong
bề ngang ô, không thò sang ô bên cạnh.

## Cấu trúc

```
assets/board-info.json     dữ liệu 40 ô (có sẵn từ trước)
src/
  data/board.js            bảng giá thuê đầy đủ, giá thế chấp, nhãn hiển thị
  data/cards.js            bộ thẻ Cơ Hội + Khí Vận
  core/state.js            trạng thái ván + toàn bộ luật (thuần dữ liệu, không phụ thuộc UI)
  render/                  hình hoạ: hình học bàn cờ, hoa văn, biểu tượng, quân cờ
  scenes/BoardScene.js     Phaser: bàn cờ, quân, xí ngầu, hiệu ứng
  ui/hud.js                thẻ người chơi, thông báo giữa bàn
  ui/quickview.js          bảng xem nhanh ô đang rê chuột
  ui/modals.js             các hộp thoại (mua, quản lý, giao dịch, chi tiết ô…)
  game/controller.js       điều phối lượt chơi, nối luật ↔ hình ảnh ↔ giao diện
  audio/audio.js           nhạc và âm thanh tổng hợp
  net/supabase.js          nối Supabase Realtime (chỉ có ở bản online)
  net/room.js              phòng chơi: presence, ý định ↔ trạng thái
```

Bàn cờ và quân cờ vẽ bằng Phaser (canvas); HUD và các hộp thoại là HTML phủ lên trên
để form giao dịch và bảng tài sản dễ thao tác.

Lớp phủ `#board-hud` được `BoardScene.layout()` dán **trùng khít ô vuông bàn cờ** sau mỗi
lần dựng bố cục, nên thanh nút và bảng thông báo neo theo **phần trăm cạnh bàn cờ** — đổi cỡ
cửa sổ hay bật toàn màn hình thì chúng tự chạy theo bàn, không cần tính lại chỗ nào.

## Kiểm thử

Tự động hoá bằng Playwright, chạy trên Chrome thật. **Cần dev server đang chạy** ở cổng 5178:

```bash
npx vite --port 5178 --strictPort &
npm test
```

Riêng bộ kiểm thử phòng online chạy ở **cổng 5179** vì nó mở nhiều tab cùng lúc:

```bash
npx vite --port 5179 --strictPort &
npm run test:online              # lõi, 3 tab
node tests/online.mjs --full     # thêm phần đổ đầy phòng 6 người, chậm
```

| Tệp | Kiểm tra |
|---|---|
| `tests/online.mjs` | Phòng online đa-tab: đường mời, màu do phòng chỉ định, tên chỉ hiện sau khi bấm Sẵn sàng, Khai cuộc khoá tới khi cả phòng sẵn sàng, có người rời thì ghế và màu mở lại, mời ra khỏi phòng chờ, khoá lượt theo người, trạng thái lan giữa các máy, giao dịch giữa hai máy, đứt mạng giữa ván rồi tự nối lại, rớt mạng rồi vào lại đúng ghế, đi luôn quá hạn thì đất về ngân hàng, hết giờ đi và hết giờ trả lời giao dịch. Cờ `--full` thêm phần sức chứa 6 người |
| `tests/play-through.mjs` | Chơi tự động 22 lượt với 4 người, bắt lỗi JS |
| `tests/features.mjs` | Xây nhà đều tay, giới hạn 32 căn, lên khách sạn trả lại 4 nhà, thế chấp/chuộc lãi 10%, giao dịch hai chiều kèm đất thế chấp |
| `tests/endgame.mjs` | Đổ đôi 3 lần vào tù, các cách ra tù, phá sản trả tài sản về ngân hàng, thắng cuộc |
| `tests/jail-debt.mjs` | Đáp xuống ô Vào Tù là hết lượt, ở tù cầu đôi từng lượt một (hụt lần 3 nộp 50$), vỡ nợ ngay khi tổng tài sản không đủ trả |
| `tests/audio.mjs` | Đo biên độ RMS thật: nhạc có tiếng ở màn hình chờ, **im hẳn sau khi khai cuộc**, 11 hiệu ứng đều kêu; kiểm tra hai công tắc độc lập |
| `tests/events.mjs` | Thẻ Thời Cuộc: thanh áp lực chỉ chạy khi bàn đã bão hoà, ngưỡng hạ dần, hệ số tiền thuê / giá xây / lương, ô mất giấy tờ, cấn nợ tự động, ảnh chụp mang đủ phần mới (kể cả ảnh chụp cũ thiếu trường), và **cả tám thẻ Kỳ 2 chạy thật từ đầu tới cuối** |
| `tests/events-online.mjs` | Nấc luật đồng bộ trong phòng chờ, thẻ hiện ở mọi máy, và một **phiên đấu giá kín hai máy** chạy trọn: ai trả cao thì lấy đất, tiền trừ đúng, sổ chủ đất khớp nhau |
| `tests/ui-v2.mjs` | Độ nét theo DPR, bàn cờ chiếm hết khoảng trống và dựng lại khi đổi cỡ cửa sổ, bảng tài sản người chơi, chi tiết ô khi bấm vào bàn cờ, thẻ đất trong danh sách |
| `tests/visual.mjs` | Chụp ảnh & quay video: vệt đèn báo đất có nhà ở cả bốn cạnh bàn cờ, ngăn nhà trượt ra khi rê chuột (hàng ngang & cột dọc), bảng quản lý tài sản dạng thẻ hai cột, **đất đang thế chấp và thao tác chuộc lại**. Kết quả ra thư mục `test-result/` |
