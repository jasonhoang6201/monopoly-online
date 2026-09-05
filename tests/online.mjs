/**
 * Phòng chơi online — kiểm thử bằng nhiều tab trong **cùng một browser context**.
 *
 * Cùng context là điều kiện bắt buộc: chưa cắm khoá Supabase thì đường truyền
 * chạy qua BroadcastChannel, mà BroadcastChannel chỉ nối được các tab dùng
 * chung một kho lưu trữ. Mỗi tab có sessionStorage riêng nên vẫn là một người
 * chơi riêng — đúng thứ ta cần để giả lập nhiều máy.
 *
 * Mặc định chạy **ba tab**: mỗi tab dựng một bàn cờ Phaser đầy đủ (nghìn nét vẽ
 * canvas, bốn tấm hoạ tiết), sáu tab cùng lúc thì máy nghẽn và mỗi tab mất hàng
 * phút mới xong. Phần đổ đầy phòng sáu người nằm sau cờ `--full`.
 *
 * Chạy: cần dev server ở cổng 5179
 *   npx vite --port 5179 --strictPort &
 *   node tests/online.mjs          # lõi, ~3 phút
 *   node tests/online.mjs --full   # thêm phần sức chứa, chậm
 */
import { launchChrome } from './launch.mjs';
import { playRollOff, orderOf } from './rolloff.mjs';

const SHOT = process.env.SHOT_DIR
  || '/private/tmp/claude-501/-Users-jasonhoang-Desktop-monopoly/7a09827d-43ef-49a5-9023-fcc4ac74181e/scratchpad';
const BASE = 'http://localhost:5179/';
const MAX = 6;
const FULL = process.argv.includes('--full');

const errors = [];
const fails = [];

const browser = await launchChrome();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });

function watch(page, tag) {
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${tag}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[${tag}] ${e.message}`));
  return page;
}

const ok = (cond, label, extra = '') => {
  console.log(`  ${cond ? '✓' : '✗'} ${label}${extra ? ` — ${extra}` : ''}`);
  if (!cond) fails.push(label);
};

/** Chờ tới khi hàm trả về true, hoặc hết giờ. */
async function until(fn, ms = 12000, step = 200) {
  const t0 = Date.now();
  for (;;) {
    if (await fn().catch(() => false)) return true;
    if (Date.now() - t0 > ms) return false;
    await new Promise((r) => setTimeout(r, step));
  }
}

const title = (page) => page.locator('.scrim.show .modal-title').first().textContent().catch(() => '');
const seatCount = (page) => page.locator('.lobby-seat').count();

/**
 * Chờ tab khởi động xong tới phòng chờ.
 *
 * Phải `bringToFront()` trước: Phaser dựng scene bằng `requestAnimationFrame`,
 * mà tab đang ẩn thì trình duyệt ngừng cấp khung hình — để nguyên thì tab mở
 * sau nằm im mãi ở màn hình đen.
 */
async function bootToLobby(page, ms = 90000) {
  await page.bringToFront();
  const mode = page.locator('.scrim.show button.btn', { hasText: 'Mở phòng online' });
  await until(async () => (await mode.count()) > 0 || (await page.locator('#lobby-link').count()) > 0, ms);
  // Tab mở phòng phải chọn chế độ trước; tab vào bằng đường mời thì không.
  if (await mode.count()) await mode.click();
  await page.locator('#lobby-link').waitFor({ timeout: 30000 });
}

/** Mở một tab, vào phòng, gõ tên rồi bấm Sẵn sàng. */
async function enter(url, name, tag, { ready = true } = {}) {
  const page = watch(await ctx.newPage(), tag);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await bootToLobby(page);
  await page.locator('.lobby-seat.is-me input.lobby-name').fill(name);
  if (ready) await page.locator('.lobby-seat.is-me .lobby-ready').click();
  return page;
}

/**
 * Trả lời mọi hộp thoại cho tới khi thanh nút hành động hiện lại.
 *
 * Không chờ cứng theo thời gian được: một cú lắc ra 11 ô thì quân nhảy từng ô
 * một, hộp thoại mua đất mãi mới mở.
 */
async function settleTurn(page, ms = 30000) {
  const t0 = Date.now();
  const order = ['Mua ', 'Nhận tiền', 'Đành chịu', 'Bỏ qua', 'Tiếp tục', 'Chấp nhận',
                 'Xong', 'Đóng', 'Để sau', 'Thôi'];
  while (Date.now() - t0 < ms) {
    if (await page.locator('#modal-root .scrim.show').count()) {
      let clicked = false;
      for (const label of order) {
        const b = page.locator('.scrim.show button.btn', { hasText: label }).first();
        if (await b.count() && !(await b.isDisabled())) { await b.click(); clicked = true; break; }
      }
      if (!clicked) {
        const any = page.locator('.scrim.show button.btn:not([disabled])').first();
        if (await any.count()) await any.click();
      }
      await page.waitForTimeout(400);
      continue;
    }
    if (await page.locator('#actions button:not([disabled])').count()) return true;
    await page.waitForTimeout(300);
  }
  return false;
}

/* ================================================================ 1 · mở phòng */

console.log('\n▸ 1. Chủ phòng mở phòng, lấy đường mời');
const A = watch(await ctx.newPage(), 'A');
await A.goto(BASE, { waitUntil: 'domcontentloaded' });
await bootToLobby(A);
const link = await A.locator('#lobby-link').inputValue();
const code = new URL(link).searchParams.get('room');
ok(/^[A-Z2-9]{4}$/.test(code ?? ''), 'mã phòng 4 ký tự trong đường mời', code);
ok(await A.locator('#lobby-start').isDisabled(), 'chưa ai sẵn sàng thì Khai cuộc bị khoá');

await A.locator('.lobby-seat.is-me input.lobby-name').fill('Bảy Viễn');
await A.locator('.lobby-seat.is-me .lobby-ready').click();
ok(await until(async () => (await A.locator('.lobby-seat').first().innerText()).includes('Bảy Viễn')),
  'bấm Sẵn sàng thì tên mới lên sổ');
ok(await A.locator('#lobby-start').isDisabled(), 'một mình sẵn sàng vẫn chưa khai cuộc được');
await A.screenshot({ path: `${SHOT}/on-01-lobby-host.png` });

/* ====================================== 2 · tên chỉ hiện khi bấm Sẵn sàng */

console.log('\n▸ 2. Người thứ hai vào — tên giấu tới khi bấm Sẵn sàng');
const B = await enter(link, 'Cô Ba', 'B', { ready: false });
ok(await until(async () => (await seatCount(A)) === 2), 'chủ phòng thấy 2 ghế');

await A.bringToFront();
const beforeReady = await A.locator('.lobby-seat').nth(1).innerText();
ok(!beforeReady.includes('Cô Ba'), 'chưa sẵn sàng thì máy khác không thấy tên', beforeReady.replace(/\s+/g, ' ').trim());
ok((await A.locator('.lobby-name-wait').count()) === 1, 'chỗ tên hiện "đang nhập tên…"');
ok(await A.locator('#lobby-start').isDisabled(), 'còn người chưa sẵn sàng thì chưa khai cuộc được');
await A.screenshot({ path: `${SHOT}/on-02-lobby-waiting.png` });

await B.bringToFront();
await B.locator('.lobby-seat.is-me .lobby-ready').click();
await A.bringToFront();
ok(await until(async () => (await A.locator('.lobby-seat').nth(1).innerText()).includes('Cô Ba')),
  'bấm Sẵn sàng xong thì tên hiện ra cho cả phòng');
ok(await until(async () => !(await A.locator('#lobby-start').isDisabled())),
  'cả phòng sẵn sàng thì Khai cuộc mở khoá');

const colors = await A.locator('.lobby-seat .dot').evaluateAll((els) => els.map((e) => e.style.background));
ok(new Set(colors).size === 2, 'phòng chỉ định hai màu khác nhau', colors.join(' · '));
/* Tab B vừa bị đẩy xuống nền nên nhịp vẽ lại của nó bị bóp — chờ chứ đừng
   đọc ngay, không thì bắt đúng lúc ghế còn đang giữ ô nhập tên cũ. */
ok(await until(async () => (await B.locator('.lobby-seat input.lobby-name').count()) === 0),
  'đã sẵn sàng thì ô nhập tên đóng lại');
ok((await B.locator('.lobby-seat select, .lobby-seat [data-token]').count()) === 0,
  'không có chỗ nào cho tự chọn màu');
await A.screenshot({ path: `${SHOT}/on-03-lobby-ready.png` });

/* ================================================ 3 · rời phòng → ghế mở lại */

console.log('\n▸ 3. Người thứ ba vào rồi rời — ghế phải mở lại');
const C = await enter(link, 'Chú Hoả', 'C');
ok(await until(async () => (await seatCount(A)) === 3, 25000), 'phòng lên 3 ghế');
const tokensBefore = await A.locator('.lobby-seat .dot').evaluateAll((e) => e.map((x) => x.style.background));
await C.close();
await A.bringToFront();
ok(await until(async () => (await seatCount(A)) === 2, 25000),
  'người rời phòng bị bỏ ghế, chỗ ấy trống lại');

const D = await enter(link, 'Bà Từ', 'D');
ok(await until(async () => (await seatCount(A)) === 3, 25000), 'người mới lấp được chỗ vừa trống');
const tokensAfter = await A.locator('.lobby-seat .dot').evaluateAll((e) => e.map((x) => x.style.background));
ok(tokensAfter[2] === tokensBefore[2], 'màu của ghế vừa trống được dùng lại',
  `${tokensBefore[2]} → ${tokensAfter[2]}`);

/* ============================================= 4 · mời ra khỏi phòng chờ */

console.log('\n▸ 4. Chủ phòng mời một người ra khỏi phòng chờ');
await A.bringToFront();
ok((await D.locator('.lobby-kick').count()) === 0, 'người thường không có nút mời ai ra');
/* Ghế hiện ra trước, cái tên tới sau: số ghế đi đường presence, còn tên chỉ
   được công bố lúc bấm Sẵn sàng nên đi đường broadcast. Chờ đúng cái tên rồi
   mới tìm nút mời ra, không thì bắt nhằm lúc ghế còn ghi "đang nhập tên…". */
ok(await until(async () => (await A.locator('.lobby-seat:has-text("Bà Từ")').count()) === 1, 15000),
  'tên người mới vào đã lên ghế bên máy chủ phòng');
const kickBtn = A.locator('.lobby-seat:has-text("Bà Từ") .lobby-kick').first();
ok((await kickBtn.count()) === 1, 'chủ phòng có nút mời Bà Từ ra');
await kickBtn.click();
ok(await until(async () => (await title(D)).includes('bị mời ra'), 20000),
  'người bị mời nhận được thông báo');
ok(await until(async () => (await seatCount(A)) === 2, 15000), 'ghế người bị mời được giải phóng');
await D.close();

/* ==================================================== 5 · khai cuộc, khoá lượt */

console.log('\n▸ 5. Chủ phòng khai cuộc');
await A.bringToFront();
await A.locator('#lobby-start').click();
ok(await until(async () => (await A.locator('.pcard').count()) === 2, 30000),
  'bàn cờ dựng đủ 2 người trên máy chủ phòng');
ok(await until(async () => (await B.locator('.pcard').count()) === 2, 30000),
  'máy khách cũng vào ván cùng lúc');

/* Mở màn là vòng lắc giành quyền đi trước: hộp thoại "Lắc xí ngầu" phải hiện ở
   **máy của từng người**, và thứ tự chốt được phải giống nhau ở mọi máy. Lắc
   xong thì kéo thứ tự về đúng thứ tự ghế cho các phần sau chạy trên nền cố
   định (phần bốc thăm có bài kiểm riêng ngay dưới đây). */
const rollOrder = await playRollOff([A, B], { normalize: false });
ok(Array.isArray(rollOrder) && rollOrder.length === 2, 'lắc xong thì có thứ tự đi',
  JSON.stringify(rollOrder));
ok(JSON.stringify(rollOrder) === JSON.stringify(await orderOf(B)),
  'hai máy cùng một thứ tự đi');
ok([...(rollOrder ?? [])].sort().join() === '0,1', 'thứ tự đi là hoán vị đủ mọi ghế');
const firstSeat = rollOrder?.[0];
ok(await until(async () => (await B.evaluate(() => window.__monopoly.controller.state.turn)) === firstSeat, 15000),
  'người đầu bảng được trao lượt trên cả hai máy', `ghế ${firstSeat}`);

// Về thứ tự ghế để phần sau vẫn kiểm được đúng cảnh "chủ phòng đi trước"
await A.evaluate(() => {
  const c = window.__monopoly.controller;
  c.state.setOrder(c.state.players.map((_, i) => i));
  c.sync();
  c.beginTurn();
});
await A.waitForTimeout(3800);

const aBtns = await A.locator('#actions button:not([disabled])').count();
const bBtns = await B.locator('#actions button:not([disabled])').count();
const bBar = (await B.locator('#actions').innerText()).replace(/\s+/g, ' ').trim();
ok(aBtns > 0, 'chủ phòng đi trước nên có nút bấm', `${aBtns} nút`);
ok(bBtns === 0 && bBar.includes('Tới lượt'), 'máy chưa tới lượt chỉ hiện "Tới lượt …"', bBar);
ok((await A.locator('#room-toggle').count()) === 0, 'không còn nút quản trị phòng giữa ván');
await A.screenshot({ path: `${SHOT}/on-04-game-host.png` });

/* ============================================== 6 · lắc — trạng thái lan sang */

console.log('\n▸ 6. Lắc xí ngầu — trạng thái lan sang máy kia');
await B.evaluate(() => {
  window.__bcSeen = 0;
  const room = window.__monopoly.controller.net;
  const prev = room.on.bc;
  room.on.bc = (m) => { window.__bcSeen += 1; prev(m); };
});
await A.bringToFront();
await A.locator('#actions button[data-key="r"]').click();
ok(await settleTurn(A), 'lượt chạy xong, thanh nút hiện lại');
await A.waitForTimeout(1200);

const posA = await A.evaluate(() => window.__monopoly.controller.state.players.map((p) => p.pos));
const posB = await B.evaluate(() => window.__monopoly.controller.state.players.map((p) => p.pos));
ok(posA[0] !== 0, 'quân của người đi đã rời ô Bắt Đầu', `ô ${posA[0]}`);
ok(JSON.stringify(posA) === JSON.stringify(posB), 'vị trí quân giống nhau ở hai máy',
  `${posA} vs ${posB}`);
const bcSeen = await B.evaluate(() => window.__bcSeen);
ok(bcSeen > 0, 'máy ngồi xem cũng nhận được diễn biến', `${bcSeen} dòng`);

/* ============================================ 7 · giao dịch giữa hai máy */

/* Đường hỏi–đáp **hai chiều** duy nhất trong cả hệ thống: mọi thứ khác chỉ là
   phát một chiều rồi thôi. Bên A dựng đề nghị trên máy mình, nhưng người bấm
   đồng ý phải là B ngồi máy khác — và A đứng chờ tới khi B bấm. */

console.log('\n▸ 7. Giao dịch giữa hai máy');
const seatA = await A.evaluate(() => window.__monopoly.controller.net.mySeat);
const seatB = await B.evaluate(() => window.__monopoly.controller.net.mySeat);
// Hai ô nằm quá tầm một cú lắc (xa nhất 12 ô) nên chắc chắn chưa ai mua mất.
const GIVE = 16;
const GET = 18;
await A.evaluate(({ a, b, give, get }) => {
  const c = window.__monopoly.controller;
  c.state.buy(a, give);
  c.state.buy(b, get);
  // Ô A đem đổi đang thế chấp: dùng để kiểm xem **ai** được hỏi có chuộc không
  c.state.mortgage(a, give);
  c.sync();
}, { a: seatA, b: seatB, give: GIVE, get: GET });
await A.waitForTimeout(700);

await A.bringToFront();
await A.locator('#actions button[data-key="t"]').click();
await A.locator(`.scrim.show .pick[data-id="${seatB}"]`).click();
await A.locator(`.scrim.show .arow.selectable[data-side="mine"][data-tile="${GIVE}"]`).click();
await A.locator(`.scrim.show .arow.selectable[data-side="theirs"][data-tile="${GET}"]`).click();
await A.locator('.scrim.show button.btn', { hasText: 'Gửi đề nghị' }).click();

const review = B.locator('.scrim.show button.btn', { hasText: 'Đồng ý giao dịch' });
ok(await until(async () => (await review.count()) > 0, 30000),
  'đề nghị bay sang máy kia, hộp xét duyệt mở ở đó');
ok((await A.locator('.scrim.show button.btn', { hasText: 'Đồng ý giao dịch' }).count()) === 0,
  'bên gửi không tự duyệt được đề nghị của mình');
ok((await A.locator('#broadcast').innerText()).includes('CHỜ TRẢ LỜI'),
  'bên gửi thấy rõ mình đang chờ chứ không phải treo máy');
await B.screenshot({ path: `${SHOT}/on-05-trade-review.png` });

await B.bringToFront();
await review.click();

const swapped = (page) => page.evaluate(({ a, b, give, get }) => {
  const st = window.__monopoly.controller.state;
  return st.owner.get(give) === b && st.owner.get(get) === a;
}, { a: seatA, b: seatB, give: GIVE, get: GET });

ok(await until(async () => swapped(B), 30000), 'đất đổi chủ trên máy vừa bấm đồng ý');
ok(await until(async () => swapped(A), 30000), 'và trên cả máy bên kia — hai bàn khớp nhau');

/* Ô vừa sang tay B đang thế chấp. Tiền chuộc lấy từ túi B nên câu hỏi "có
   chuộc không" phải hiện ở **máy B**, chứ không phải ở máy A — người dựng giao
   dịch không được tiêu tiền của người khác. */
const money = (page, seat) => page.evaluate(
  (s) => window.__monopoly.controller.state.players[s].money, seat);
const redeemBtn = B.locator('.scrim.show button.btn', { hasText: 'Chuộc hết' });
ok(await until(async () => (await redeemBtn.count()) > 0, 30000),
  'lời mời chuộc hiện ở máy chủ mới');
ok((await A.locator('.scrim.show button.btn', { hasText: 'Chuộc hết' }).count()) === 0,
  'máy người dựng giao dịch không bị hỏi thay');
const aCash = await money(A, seatA);
const bCash = await money(A, seatB);
await B.bringToFront();
await redeemBtn.click();
ok(await until(async () => A.evaluate(
  (t) => !window.__monopoly.controller.state.mortgaged.has(t), GIVE), 30000),
  'B bấm chuộc thì ô hết thế chấp trên cả hai bàn');
ok((await money(A, seatA)) === aCash, 'tiền chuộc không trừ vào túi người bán',
  `${aCash} → ${await money(A, seatA)}`);
ok((await money(A, seatB)) < bCash, 'mà trừ đúng vào túi người mua',
  `${bCash} → ${await money(A, seatB)}`);

await A.bringToFront();
ok(await until(async () => (await A.locator('#actions button:not([disabled])').count()) > 0, 20000),
  'xong giao dịch thì bên gửi được trả lại thanh nút');

/* ======================================= 8 · đứt đường truyền rồi nối lại */

console.log('\n▸ 8. Đứt đường truyền giữa ván rồi tự nối lại');
const linkKind = await B.evaluate(() => window.__monopoly.controller.net.tp.kind);
if (linkKind !== 'supabase') {
  console.log('  … bỏ qua: đang chạy LocalTransport, BroadcastChannel không đứt được');
} else {
  const MARK = 24;
  /* Ngắt mạng thật ở tầng trình duyệt. `setOffline` ngắt cả browser context —
     mọi tab ở đây dùng chung một context nên A cũng mất mạng theo, không tách
     riêng một máy được. Không sao: điều cần kiểm là **chuỗi hồi phục**, mà A đi
     một nước trong lúc đứt rồi B có bắt kịp hay không thì kiểm được đủ. */
  await ctx.setOffline(true);

  await B.bringToFront();
  ok(await until(async () => (await B.locator('#link-warn.show').count()) === 1, 20000),
    'mất mạng thì dải "Mất kết nối" hiện ngay');
  ok(await until(async () => (await B.locator('#actions button').count()) === 0, 20000),
    'thanh nút bị cất đi — bấm lúc này thì nước đi sẽ bị nuốt mất');
  await B.screenshot({ path: `${SHOT}/on-06-link-lost.png` });

  // Bàn vẫn nhúc nhích trong lúc đứt — nước này không tới được máy kia
  await A.bringToFront();
  await A.evaluate(({ a, id }) => {
    const c = window.__monopoly.controller;
    c.state.buy(a, id);
    c.sync();
  }, { a: seatA, id: MARK });
  await A.waitForTimeout(800);
  ok(!(await B.evaluate((id) => window.__monopoly.controller.state.owner.get(id) !== undefined, MARK)),
    'máy đang đứt quả nhiên không nhận được nước vừa đi');

  await ctx.setOffline(false);
  await B.bringToFront();
  ok(await until(async () => (await B.locator('#link-warn.show').count()) === 0, 60000),
    'đường truyền tự nối lại, dải cảnh báo tắt');
  ok(await until(async () => B.evaluate(
    (id) => window.__monopoly.controller.state.owner.get(id) !== undefined, MARK), 30000),
    'nối lại xong tự xin ván hiện tại, bắt kịp nước đã bỏ lỡ');
  ok(await until(async () => A.evaluate(
    (s) => window.__monopoly.controller.net.isSeatLive(s), seatB), 30000),
    'bàn bên kia thấy mình có mặt trở lại (đã khai lại presence)');
  ok(await until(async () => (await B.locator('#actions').innerText()).includes('Tới lượt'), 20000),
    'thanh nút bày lại đúng trạng thái đang ngồi xem');
  await B.screenshot({ path: `${SHOT}/on-07-relinked.png` });
}

/* ================================================= 9 · rớt mạng rồi vào lại */

console.log('\n▸ 9. Rớt mạng rồi vào lại — về đúng ghế cũ, tài sản nguyên vẹn');
// Cho người sắp rớt giữ hai ô đất ở dãy cuối (một cú lắc xa nhất 12 ô nên
// người vừa đi chắc chắn chưa mua mất)
const LOTS = [31, 34];
await A.evaluate(({ s, lots }) => {
  const st = window.__monopoly.controller.state;
  for (const id of lots) st.buy(s, id);
  window.__monopoly.controller.sync();
}, { s: seatB, lots: LOTS });
await A.waitForTimeout(700);
const lotsB = await A.evaluate((s) => window.__monopoly.controller.state.propertiesOf(s).length, seatB);
ok(lotsB >= 2, 'người chơi đang giữ đất trước khi rớt mạng', `${lotsB} ô`);

await B.reload({ waitUntil: 'domcontentloaded' });
await B.bringToFront();
ok(await until(async () => B.evaluate(() => !!window.__monopoly?.controller?.net), 45000),
  'máy vào lại được phòng');
ok(await until(async () => B.evaluate((s) => window.__monopoly.controller.net.mySeat === s, seatB), 20000),
  'về đúng ghế cũ');
ok(await until(async () => B.evaluate(
  (l) => { const st = window.__monopoly.controller?.state; return !!st && l.every((id) => st.owner.get(id) !== undefined); },
  LOTS), 20000), 'ván cờ dựng lại đủ, đất vẫn thuộc về mình');
ok(!(await A.evaluate((s) => window.__monopoly.controller.state.players[s].bankrupt, seatB)),
  'vào lại trong hạn ân thì không bị tịch thu');
await B.screenshot({ path: `${SHOT}/on-08-rejoined.png` });

/* ========================================= 10 · đi luôn → tài sản về ngân hàng */

console.log('\n▸ 10. Đi luôn quá hạn — tài sản trả về ngân hàng');
await A.bringToFront();
await A.evaluate(() => { window.__monopoly.controller.awayGraceMs = 8000; });
await B.close();

/* Không "ngay" như tên gọi: sau khi B vào lại, presence của B chưa hề tới máy
   A, nên A giữ B ở trạng thái còn sống hoàn toàn bằng cầu `hello` — mà cầu ấy
   hết hạn đúng `HELLO_GRACE_MS` (6 giây). Đo được ~6,4 giây, nên hạn chờ phải
   rộng gấp ba chứ đừng để sát 12 giây. */
ok(await until(async () => (await A.locator('.rchip.is-away').count()) === 1, 20000),
  'danh sách bên cột trái báo "mất kết nối"');
ok((await A.locator('#players .pcard-off, #roster .rchip.is-away').count()) > 0,
  'không cần mở bảng nào cũng thấy ai đang rớt');
await A.screenshot({ path: `${SHOT}/on-09-away.png` });

ok(await until(async () => A.evaluate((s) => window.__monopoly.controller.state.players[s].bankrupt, seatB), 30000),
  'quá hạn ân thì bị gạch khỏi bàn');
ok((await A.evaluate((s) => window.__monopoly.controller.state.propertiesOf(s).length, seatB)) === 0,
  'toàn bộ đất đã trả về ngân hàng');
ok(await A.evaluate((lots) => {
  const st = window.__monopoly.controller.state;
  return lots.every((id) => st.owner.get(id) === undefined);
}, LOTS), 'hai ô ấy thành đất trống, ai cũng mua lại được');
await A.waitForTimeout(1200);
await A.screenshot({ path: `${SHOT}/on-10-evicted.png` });

/* ================================================ 11 · đồng hồ lượt hết giờ */

/* Phải là **ván ba người** riêng, không dùng lại ván cũ: gạch một người trong
   ván hai người là hạ màn ngay, mà điều đáng kiểm nhất lại là "gạch xong ván có
   chạy tiếp không". Đóng tab cũ trước — mỗi tab giữ một ngữ cảnh WebGL và Chrome
   chỉ cho một số lượng nhất định. */

console.log('\n▸ 11. Hết giờ thì bị mời khỏi bàn');
await A.close();

const H = watch(await ctx.newPage(), 'H');
await H.goto(BASE, { waitUntil: 'domcontentloaded' });
await bootToLobby(H);
const link3 = await H.locator('#lobby-link').inputValue();
await H.locator('.lobby-seat.is-me input.lobby-name').fill('Chủ ván');
await H.locator('.lobby-seat.is-me .lobby-ready').click();
const P2 = await enter(link3, 'Người hai', 'P2');
const P3 = await enter(link3, 'Người ba', 'P3');

await H.bringToFront();
await until(async () => (await seatCount(H)) === 3, 60000);
await H.locator('#lobby-start').click();
ok(await until(async () => (await P3.locator('.pcard').count()) === 3, 45000),
  'ván ba người dựng xong trên mọi máy');
// Lắc giành quyền đi trước rồi kéo về thứ tự ghế: phần này kiểm đồng hồ lượt,
// cần biết chắc ai đang đi.
ok(!!(await playRollOff([H, P2, P3])), 'ván ba người lắc giành quyền xong');
await H.waitForTimeout(3800);

const turnNow = (page) => page.evaluate(() => window.__monopoly.controller.state.turn);
const turn0 = await turnNow(H);

// -- vòng đếm ngược: cả bàn cùng thấy, cùng chỉ một người
for (const [page, tag] of [[H, 'người đang đi'], [P2, 'người ngồi xem']]) {
  await page.bringToFront();
  ok(await until(async () => (await page.locator('#turn-clock.show').count()) === 1, 20000),
    `vòng đếm ngược hiện ở máy ${tag}`);
  // `innerText` trả về chữ **đã dựng hình**, mà CSS viết hoa nhãn ấy — so thường hoá
  ok((await page.locator('#turn-clock .tc-who').innerText()).toLowerCase().includes('chủ ván'),
    `vòng ấy ghi rõ đang đếm cho ai (${tag})`);
}
await P2.bringToFront();
const num1 = Number(await P2.locator('#turn-clock .tc-num').innerText());
await P2.waitForTimeout(2200);
const num2 = Number(await P2.locator('#turn-clock .tc-num').innerText());
ok(num1 > 0 && num2 < num1, 'kim chạy thật ở máy ngồi xem', `${num1}s → ${num2}s`);
await P2.screenshot({ path: `${SHOT}/on-11-turn-clock.png` });

/* Rút hạn xuống vài giây rồi lên dây lại. Chỉ đổi ở máy người đang đi là đủ:
   hạn đi kèm trong tin lên dây, các máy khác cứ thế mà đếm. */
await H.bringToFront();
await H.evaluate(() => {
  const c = window.__monopoly.controller;
  c.turnMs = 6000;
  c.clock = null;              // ép lên dây lại, khỏi bị chặn vì "vẫn việc cũ"
  c.beginTurn();
});
/* Người ra tay là ghế sống nhỏ nhất **không phải** kẻ hết giờ, ở đây là P2 —
   nên tab ấy phải nổi lên trước: tab ẩn bị Chrome bóp nhịp hẹn giờ. */
await P2.bringToFront();
ok(await until(async () => P2.evaluate(
  (s) => window.__monopoly.controller.state.players[s].bankrupt, turn0), 40000),
  'ngồi im hết giờ thì bị gạch khỏi bàn');
ok(await until(async () => H.evaluate(
  (s) => window.__monopoly.controller.state.players[s].bankrupt, turn0), 20000),
  'chính máy người ấy cũng nhận được tin mình bị gạch');
ok(!(await P2.evaluate(() => window.__monopoly.controller.state.over)),
  'còn hai người nên ván vẫn chạy tiếp');
ok(await until(async () => (await turnNow(P2)) !== turn0, 20000),
  'lượt đi tiếp sang người kế');
await P2.screenshot({ path: `${SHOT}/on-12-timed-out.png` });

/* ============================= 12 · hết giờ trả lời giao dịch cũng bị mời ra */

console.log('\n▸ 12. Để hết giờ trả lời giao dịch');
const asker = (await turnNow(P2)) === (await P2.evaluate(() => window.__monopoly.controller.net.mySeat))
  ? P2 : P3;
const target = asker === P2 ? P3 : P2;
const askSeat = await asker.evaluate(() => window.__monopoly.controller.net.mySeat);
const tgtSeat = await target.evaluate(() => window.__monopoly.controller.net.mySeat);
const T_GIVE = 16;
const T_GET = 18;

// Rút hạn trả lời ở cả hai máy: bên nhận để hộp thoại tự đóng, bên gửi để
// vòng đếm ngược trên bàn khớp với con số hộp thoại đang đếm cho họ xem.
for (const page of [asker, target]) {
  await page.evaluate(() => { window.__monopoly.controller.tradeMs = 6000; });
}
await asker.bringToFront();
await asker.evaluate(({ a, b, give, get }) => {
  const c = window.__monopoly.controller;
  c.state.buy(a, give);
  c.state.buy(b, get);
  c.sync();
}, { a: askSeat, b: tgtSeat, give: T_GIVE, get: T_GET });
await asker.waitForTimeout(700);

await asker.locator('#actions button[data-key="t"]').click();
await asker.locator(`.scrim.show .pick[data-id="${tgtSeat}"]`).click();
await asker.locator(`.scrim.show .arow.selectable[data-side="mine"][data-tile="${T_GIVE}"]`).click();
await asker.locator(`.scrim.show .arow.selectable[data-side="theirs"][data-tile="${T_GET}"]`).click();
await asker.locator('.scrim.show button.btn', { hasText: 'Gửi đề nghị' }).click();

await target.bringToFront();
ok(await until(async () => (await target.locator('.scrim.show .trade-timer').count()) > 0, 30000),
  'hộp xét duyệt kèm dòng đếm ngược để bên nhận biết mình có hạn');
await target.screenshot({ path: `${SHOT}/on-13-trade-timer.png` });

// Không bấm gì cả — đúng cái tình huống muốn kiểm
ok(await until(async () => (await target.locator('.scrim.show button.btn')
  .filter({ hasText: 'Đồng ý giao dịch' }).count()) === 0, 25000),
  'hết giờ thì hộp thoại tự đóng, bên gửi không phải chờ mãi');
ok(await until(async () => asker.evaluate(
  (s) => window.__monopoly.controller.state.players[s].bankrupt, tgtSeat), 30000),
  'để hết giờ trả lời cũng bị mời khỏi bàn');
ok((await asker.locator('#broadcast').innerText()).includes('HẾT GIỜ')
  || await until(async () => (await asker.locator('#broadcast').innerText()).includes('HẠ MÀN'), 15000),
  'cả bàn đọc được lý do');

/* ======================================= 13 · sức chứa (chậm, sau cờ --full) */

if (FULL) {
  console.log('\n▸ 13. Đổ đầy phòng và chặn người thứ 7 (--full)');
  /* Đóng ván cũ trước. Mỗi tab giữ một ngữ cảnh WebGL, mà Chrome chỉ cho một số
     lượng nhất định — để tab cũ sống thì tab thứ tám không dựng nổi Phaser. */
  for (const page of [H, P2, P3]) await page.close();
  const E = watch(await ctx.newPage(), 'E');
  await E.goto(BASE, { waitUntil: 'domcontentloaded' });
  await bootToLobby(E);
  const link2 = await E.locator('#lobby-link').inputValue();
  await E.locator('.lobby-seat.is-me input.lobby-name').fill('Chủ mới');
  await E.locator('.lobby-seat.is-me .lobby-ready').click();

  const crowd = [];
  for (const n of ['Hai', 'Ba', 'Tư', 'Năm', 'Sáu']) crowd.push(await enter(link2, n, n));
  await E.bringToFront();
  ok(await until(async () => (await seatCount(E)) === MAX, 60000), `phòng nhận đủ ${MAX} người`);
  ok((await E.locator('.lobby-count').innerText()).includes('đã đầy'), 'phòng chờ báo "Phòng đã đầy"');
  await E.screenshot({ path: `${SHOT}/on-14-lobby-full.png` });

  /* Người thứ 7 được kiểm ngay tại chỗ có luật, không mở thêm tab.
     Sáu bàn cờ Phaser đã chiếm hết ngữ cảnh WebGL mà Chrome cấp cho một tiến
     trình; tab thứ bảy nằm im ở màn hình đen, chờ bao lâu cũng không dựng nổi
     scene — nên chờ hộp thoại của nó là chờ một thứ không bao giờ tới.
     Ở đây bơm thẳng một lời xin ghế vào phòng và xem phòng trả lời gì. */
  const reply = await E.evaluate(() => new Promise((resolve) => {
    const room = window.__room;
    const send = room.tp.send.bind(room.tp);
    room.tp.send = (event, data) => {
      if (event === 'full') resolve(data.to);
      return send(event, data);
    };
    room.tp._deliver('hello', { id: 'ke-den-muon' });
    setTimeout(() => resolve(null), 3000);
  }));
  ok(reply === 'ke-den-muon', 'phòng đầy thì từ chối thẳng người xin ghế mới', String(reply));
  ok((await seatCount(E)) === MAX, 'và không nhét thêm ghế nào');

  await crowd.pop().close();
  await E.bringToFront();
  ok(await until(async () => (await seatCount(E)) === MAX - 1, 30000),
    'có người rời thì phòng hết đầy');

  const reply2 = await E.evaluate(() => new Promise((resolve) => {
    const room = window.__room;
    const send = room.tp.send.bind(room.tp);
    let full = false;
    room.tp.send = (event, data) => {
      if (event === 'full') full = true;
      return send(event, data);
    };
    room.tp._deliver('hello', { id: 'ke-den-muon' });
    setTimeout(() => resolve(full ? 'từ chối' : room.seats.length), 1500);
  }));
  ok(reply2 === MAX, 'chỗ vừa trống nhận được người mới', String(reply2));
}

/* ---------------------------------------------------------------- kết quả */

console.log('\n──────────────────────────────────────────');
if (errors.length) {
  console.log(`\n⚠ ${errors.length} lỗi console/trang:`);
  for (const e of [...new Set(errors)].slice(0, 12)) console.log('   ', e.slice(0, 200));
}
if (fails.length) {
  console.log(`\n✗ HỎNG ${fails.length} mục:`);
  for (const f of fails) console.log('   ·', f);
} else {
  console.log(`\n✓ Tất cả kiểm tra đều đạt${FULL ? '' : '  (thêm --full để kiểm tra sức chứa)'}`);
}

await browser.close();
process.exit(fails.length || errors.length ? 1 : 0);
