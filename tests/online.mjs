/**
 * Bản online trên máy chủ ván cờ (Durable Object) — ba tab trình duyệt thật.
 *
 * Mỗi người một browser context, như ba máy riêng. Luật chạy trên
 * server, nên bài này không kiểm luật (bộ một máy và tests/engine.mjs lo) mà
 * kiểm phần chỉ bản online mới có: phòng chờ, nhiều máy cùng thấy một ván,
 * câu hỏi gửi nhiều người cùng lúc, chat, F5 giữa ván, hết giờ, bỏ bàn.
 *
 * Chạy: cần cả hai máy chủ
 *   npm run server:test                 # wrangler dev, cổng 8787, TEST_TIMING=1
 *   npx vite --port 5179 --strictPort   # bàn cờ
 *   node tests/online.mjs
 */
import { launchChrome } from './launch.mjs';
import { playRollOff, orderOf } from './rolloff.mjs';

const SERVER = process.env.GAME_SERVER ?? 'ws://localhost:8787';
const BASE = `http://localhost:5179/?server=${encodeURIComponent(SERVER)}`;

const errors = [];
const fails = [];
const ok = (cond, label, extra = '') => {
  console.log(`  ${cond ? '✓' : '✗'} ${label}${extra ? ` — ${extra}` : ''}`);
  if (!cond) fails.push(label);
};

async function until(fn, ms = 12000, step = 200) {
  const t0 = Date.now();
  for (;;) {
    if (await fn().catch(() => false)) return true;
    if (Date.now() - t0 > ms) return false;
    await new Promise((r) => setTimeout(r, step));
  }
}

const browser = await launchChrome();
/* Mỗi người một context: mỗi context là một cửa sổ riêng nên tab nào cũng được
   cấp khung hình (tab nền thì Phaser đứng), và mỗi người có kho lưu trữ riêng
   như ba máy thật. */
const newPage = async () => (await browser.newContext({ viewport: { width: 1280, height: 860 } })).newPage();

function watch(page, tag) {
  page.on('console', (m) => {
    // Đóng tab / F5 làm socket đứt giữa chừng: trình duyệt ghi lỗi WebSocket, không phải lỗi mã
    if (m.type() === 'error' && !/WebSocket/.test(m.text())) errors.push(`[${tag}] ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`[${tag}] ${e.message}`));
  return page;
}

async function bootToLobby(page, ms = 90000) {
  await page.bringToFront();
  const mode = page.locator('.scrim.show button.btn', { hasText: 'Mở phòng online' });
  await until(async () => (await mode.count()) > 0 || (await page.locator('#lobby-link').count()) > 0, ms);
  if (await mode.count()) await mode.click();
  await page.locator('#lobby-link').waitFor({ timeout: 30000 });
}

async function enter(url, name, tag, { ready = true } = {}) {
  const page = watch(await newPage(), tag);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await bootToLobby(page);
  await page.locator('.lobby-seat.is-me input.lobby-name').fill(name);
  if (ready) await page.locator('.lobby-seat.is-me .lobby-ready').click();
  return page;
}

const seatCount = (page) => page.locator('.lobby-seat').count();
const title = (page) => page.locator('.scrim.show .modal-title').first().textContent().catch(() => '');

/** Đọc controller của một tab. */
const c = (page, fn, arg) => page.evaluate(
  ([src, a]) => (0, eval)(src)(window.__monopoly.controller, a), [fn.toString(), arg],
);

/** Phần ván mà mọi máy phải thấy giống nhau. */
const view = (page) => c(page, (g) => g.state && JSON.stringify({
  turn: g.state.turn,
  money: g.state.players.map((p) => p.money),
  pos: g.state.players.map((p) => p.pos),
  owner: [...g.state.owner.entries()].sort((a, b) => a[0] - b[0]),
}));

/** Chờ mọi tab diễn xong hàng sự kiện rồi so ván. */
async function sameBoard(pages, ms = 20000) {
  let last = [];
  const same = await until(async () => {
    const busy = await Promise.all(pages.map((p) => c(p, (g) => g.busy)));
    if (busy.some(Boolean)) return false;
    last = await Promise.all(pages.map(view));
    return last.every((v) => v && v === last[0]);
  }, ms, 300);
  return { same, last };
}

/** Bấm các hộp thoại của lượt cho tới khi thanh nút hiện lại. */
async function settle(page, ms = 40000) {
  const t0 = Date.now();
  const order = ['Bỏ qua', 'Đành chịu', 'Nhận tiền', 'Tiếp tục', 'Không cược', 'Xong', 'Đóng', 'Để sau', 'Thôi', 'Chưa đạp', 'Mua '];
  while (Date.now() - t0 < ms) {
    if (await page.locator('#modal-root .scrim.show').count()) {
      let clicked = false;
      for (const label of order) {
        const b = page.locator('.scrim.show button.btn', { hasText: label }).first();
        if (await b.count() && !(await b.isDisabled())) { await b.click().catch(() => {}); clicked = true; break; }
      }
      if (!clicked) {
        const any = page.locator('.scrim.show button.btn:not([disabled])').first();
        if (await any.count()) await any.click().catch(() => {});
      }
      await page.waitForTimeout(300);
      continue;
    }
    if (await page.locator('#actions button:not([disabled])').count()) return true;
    await page.waitForTimeout(250);
  }
  return false;
}

/** Tab đang giữ ghế tới lượt. */
async function driver(pages) {
  for (const p of pages) {
    if (await c(p, (g) => g.state && g.net.mySeat === g.state.turn)) return p;
  }
  return null;
}

/** Đi trọn một lượt bằng thanh nút của tab đang tới lượt: lắc (kể cả cầu đôi) rồi kết thúc. */
async function playTurn(pages) {
  const p = await driver(pages);
  if (!p) return false;
  const turn0 = await c(p, (g) => g.state.turnNo);
  for (let i = 0; i < 12; i++) {
    await settle(p);
    if (await c(p, (g, t) => g.state.turnNo !== t, turn0)) return true;
    const roll = p.locator('#actions button', { hasText: 'Lắc xí ngầu' }).first();
    const end = p.locator('#actions button', { hasText: 'Kết thúc lượt' }).first();
    const fine = p.locator('#actions button', { hasText: 'ra tù' }).first();
    if (await end.count()) await end.click().catch(() => {});
    else if (await roll.count()) await roll.click().catch(() => {});
    else if (await fine.count()) await fine.click().catch(() => {});
    await until(() => c(p, (g, t) => g.state.turnNo !== t || !g.busy, turn0), 20000, 250);
    if (await c(p, (g, t) => g.state.turnNo !== t, turn0)) return true;
  }
  return false;
}

/* ================================================================ 1 · phòng chờ */

console.log('\n▸ 1. Phòng chờ trên server');
const A = watch(await newPage(), 'A');
await A.goto(BASE, { waitUntil: 'domcontentloaded' });
await bootToLobby(A);
const link = await A.locator('#lobby-link').inputValue();
const code = new URL(link).searchParams.get('room');
ok(/^[A-Z0-9]{4}$/.test(code ?? ''), 'mở phòng có mã 4 ký tự', link);
ok(new URL(link).searchParams.get('server') === SERVER, 'đường mời giữ tham số ?server=');
await A.locator('.lobby-seat.is-me input.lobby-name').fill('Bảy Viễn');

const B = await enter(link, 'Cô Ba Trà', 'B');
const X = await enter(link, 'Khách Lạ', 'X', { ready: false });
ok(await until(async () => (await seatCount(A)) === 3), 'chủ phòng thấy 3 ghế');
const tokens = await A.evaluate(() => window.__room.seats.map((s) => s.token));
ok(new Set(tokens).size === 3, 'ba ghế ba màu khác nhau', tokens.join(','));

// Chủ phòng mời người thứ ba ra
await A.bringToFront();
const xId = await X.evaluate(() => window.__room.me.id);
await A.locator(`[data-kick="${xId}"]`).click();
// Tab nền không được cấp khung hình: hộp thoại chưa hiện hẳn nếu không đưa tab lên trước
await X.bringToFront();
ok(await until(async () => (await title(X)) === 'Bạn đã bị mời ra khỏi phòng', 8000), 'người bị mời ra thấy thông báo');
await A.bringToFront();
ok(await until(async () => (await seatCount(A)) === 2), 'phòng còn 2 ghế');
await X.close();

const C = await enter(link, 'Năm Cam', 'C', { ready: false });
ok(await until(async () => (await seatCount(A)) === 3), 'người mới vào chỗ trống');
ok(await A.locator('#lobby-start').isDisabled(), 'chưa ai đủ Sẵn sàng thì nút Khai cuộc tắt');
await C.locator('.lobby-seat.is-me .lobby-ready').click();
await A.locator('.lobby-seat.is-me .lobby-ready').click();
ok(await until(() => A.locator('#lobby-start').isEnabled(), 8000), 'đủ Sẵn sàng thì nút Khai cuộc bật');

// Hạn chờ dài trong lúc bài kiểm bấm tay; phần 6 mới hạ xuống
await A.evaluate(() => window.__room.setOptions({ timing: { turnMs: 60000, awayMs: 60000, skipMs: 60000 } }));
await A.waitForTimeout(400);
await A.locator('#lobby-start').click();

const pages = [A, B, C];
let booted = true;
for (const p of pages) {
  await p.bringToFront();
  booted = await until(() => c(p, (g) => !!g.state), 30000) && booted;
}
ok(booted, 'cả ba máy vào bàn cờ');
const names = await c(B, (g) => g.state.players.map((p) => p.name));
ok(names.join('|') === 'Bảy Viễn|Cô Ba Trà|Năm Cam', 'tên theo đúng thứ tự ghế', names.join(', '));
const seats = await Promise.all(pages.map((p) => c(p, (g) => g.net.mySeat)));
ok(seats.join(',') === '0,1,2', 'mỗi máy ngồi đúng ghế của mình', seats.join(','));

/* ================================================================ 2 · lắc giành quyền + vài lượt */

console.log('\n▸ 2. Ba máy cùng một ván');
const order = await playRollOff(pages, { normalize: false });
ok(Array.isArray(order) && order.length === 3, 'lắc giành quyền xong', JSON.stringify(order));
const orders = await Promise.all(pages.map(orderOf));
ok(orders.every((o) => JSON.stringify(o) === JSON.stringify(orders[0])), 'ba máy cùng một thứ tự đi');

let played = 0;
for (let i = 0; i < 6; i++) if (await playTurn(pages)) played += 1;
ok(played === 6, 'đi được 6 lượt bằng thanh nút', `${played}/6`);
const s2 = await sameBoard(pages);
ok(s2.same, 'ván ở ba máy khớp nhau (tiền, vị trí, chủ đất)', s2.same ? '' : s2.last.join('\n'));

/* ================================================================ 3 · chat */

console.log('\n▸ 3. Chat đi qua server');
await A.bringToFront();
await A.locator('#chat-btn').click();
await A.locator('.chat-input').fill('xin chào cả bàn');
await A.locator('.chat-input').press('Enter');
const heard = async (p) => p.locator('#chat-dock .chat-msg').evaluateAll(
  (els) => els.map((e) => e.textContent).join('\n'),
).catch(() => '');
ok(await until(async () => (await heard(B)).includes('xin chào cả bàn'), 8000), 'máy B nhận tin');
ok(await until(async () => (await heard(C)).includes('xin chào cả bàn'), 8000), 'máy C nhận tin');
ok((await heard(B)).includes('Bảy Viễn'), 'tin mang tên người nói, lấy theo ghế');
const echo = (await heard(A)).split('xin chào cả bàn').length - 1;
ok(echo === 1, 'máy gửi không hiện tin của mình hai lần', `${echo} lần`);
await A.keyboard.press('Escape');

/* ================================================================ 4 · hỏi nhiều người cùng lúc */

console.log('\n▸ 4. Đấu giá: server hỏi ba máy cùng lúc');
await sameBoard(pages);
const free = await A.evaluate(async () => {
  const { BOARD } = await import('/src/data/board.js');
  const st = window.__monopoly.controller.state;
  return BOARD.find((t) => t.type === 'property' && !st.owner.has(t.id))?.id;
});
await A.evaluate(([tileId]) => window.__room.post({
  t: 'test', inject: { path: 'events.auction', args: [tileId, { seller: null, reason: 'Bài kiểm thử' }] },
}), [free]);
const bidOpen = (p) => p.locator('.scrim.show .bid-box').count().then((n) => n > 0);
ok(await until(async () => (await Promise.all(pages.map(bidOpen))).every(Boolean), 15000),
  'ba máy cùng mở hộp ghi giá');
// A trả cao nhất, hai người kia trả mức thấp nhất
for (const [p, pick] of [[A, 'last'], [B, 'first'], [C, 'first']]) {
  await p.bringToFront();
  const q = p.locator('.scrim.show .bid-q');
  if (await q.count()) await (pick === 'last' ? q.last() : q.first()).click();
  await p.locator('.scrim.show button.btn', { hasText: 'Chốt giá' }).click();
}
ok(await until(() => c(A, (g, id) => g.state.owner.has(id), free), 20000), 'phiên đấu giá chốt chủ');
const owners = await Promise.all(pages.map((p) => c(p, (g, id) => g.state.owner.get(id), free)));
ok(owners.every((o) => o === 0), 'người trả cao nhất (A) thắng, ba máy cùng thấy', owners.join(','));
for (const p of pages) await settle(p, 8000).catch(() => {});

/* ================================================================ 5 · F5 giữa ván */

console.log('\n▸ 5. F5 giữa ván về đúng ghế');
await sameBoard(pages);
await B.reload({ waitUntil: 'domcontentloaded' });
await B.bringToFront();
ok(await until(() => c(B, (g) => !!g.state && g.net?.mySeat === 1), 60000), 'máy B vào lại đúng ghế 1');
const s5 = await sameBoard(pages, 30000);
ok(s5.same, 'ván sau F5 khớp với hai máy kia');
ok(await until(() => c(A, (g) => g.hud.seatStatus[1] === 'live'), 10000), 'máy A thấy B có mặt lại');

/* ================================================================ 6 · hết giờ */

console.log('\n▸ 6. Ngồi im hết giờ thì server đi hộ');
await A.evaluate(() => window.__room.post({ t: 'test', timing: { turnMs: 2500, skipMs: 1500 } }));
// Hạn mới áp từ câu hỏi kế tiếp: đi một lượt tay để mở câu hỏi mới
await playTurn(pages);
const t6 = await c(A, (g) => g.state.turnNo);
ok(await until(() => c(A, (g, t) => g.state.turnNo > t, t6), 20000), 'không ai bấm, lượt vẫn qua');
await A.evaluate(() => window.__room.post({ t: 'test', timing: { turnMs: 60000, skipMs: 60000 } }));
await playTurn(pages);

/* ================================================================ 7 · bỏ bàn */

console.log('\n▸ 7. Đóng tab quá hạn thì bị gạch tên');
await A.evaluate(() => window.__room.post({ t: 'test', timing: { awayMs: 3000, skipMs: 1500 } }));
await C.close();
ok(await until(() => c(A, (g) => g.hud.seatStatus[2] === 'away'), 10000), 'máy A thấy C mất kết nối');
ok(await until(() => c(A, (g) => g.state.players[2].bankrupt), 20000), 'quá hạn: ghế C phá sản');
ok(await until(() => c(B, (g) => g.state.players[2].bankrupt), 10000), 'máy B cũng thấy');

/* ================================================================ */

ok(errors.length === 0, 'không có lỗi console', errors.slice(0, 5).join(' | '));
await browser.close();
console.log(fails.length ? `\nFAIL ${fails.length}: ${fails.join('; ')}` : '\n✓ bản online ổn');
process.exit(fails.length ? 1 : 0);
