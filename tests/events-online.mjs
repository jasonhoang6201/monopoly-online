/**
 * Thẻ THỜI CUỘC trên bản online: nấc luật đồng bộ trong phòng chờ, thẻ hiện ở
 * mọi máy, và một phiên **đấu giá kín hai máy** chạy trọn vẹn.
 *
 * Đấu giá là chỗ đáng ngờ nhất của tính năng này — nó hỏi nhiều người cùng lúc,
 * việc mà cả ván cờ trước giờ chưa từng làm. Bộ kiểm này canh đúng chỗ đó.
 *
 * Chạy: cần dev server ở cổng 5179
 *   npx vite --port 5179 --strictPort &
 *   node tests/events-online.mjs
 */
import { launchChrome } from './launch.mjs';
import { playRollOff } from './rolloff.mjs';

const BASE = 'http://localhost:5179/';
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
async function until(fn, ms = 15000, step = 200) {
  const t0 = Date.now();
  for (;;) {
    if (await fn().catch(() => false)) return true;
    if (Date.now() - t0 > ms) return false;
    await new Promise((r) => setTimeout(r, step));
  }
}
async function bootToLobby(page, ms = 90000) {
  await page.bringToFront();
  const mode = page.locator('.scrim.show button.btn', { hasText: 'Mở phòng online' });
  await until(async () => (await mode.count()) > 0 || (await page.locator('#lobby-link').count()) > 0, ms);
  if (await mode.count()) await mode.click();
  await page.locator('#lobby-link').waitFor({ timeout: 30000 });
}

/* ============================================================ 1 · phòng chờ */

console.log('\n▸ 1. Chủ phòng chọn nấc, cả phòng cùng thấy');
const A = watch(await ctx.newPage(), 'A');
await A.goto(BASE, { waitUntil: 'domcontentloaded' });
await bootToLobby(A);
const link = await A.locator('#lobby-link').inputValue();
await A.locator('.lobby-seat.is-me input.lobby-name').fill('Bảy Viễn');
await A.locator('.lobby-seat.is-me .lobby-ready').click();

const B = watch(await ctx.newPage(), 'B');
await B.goto(link, { waitUntil: 'domcontentloaded' });
await bootToLobby(B);
await B.locator('.lobby-seat.is-me input.lobby-name').fill('Cô Ba');
await B.locator('.lobby-seat.is-me .lobby-ready').click();

await B.bringToFront();
ok((await B.locator('.rule-btn:disabled').count()) === 4, 'khách không chỉnh được nấc luật');

await A.bringToFront();
await A.locator('.rule-btn[data-lv="hon-loan"]').click();
ok(await until(async () => (await A.locator('.rule-btn.on').innerText()) === 'Hỗn loạn'),
  'chủ phòng đổi nấc trên máy mình');
await B.bringToFront();
ok(await until(async () => (await B.locator('.rule-btn.on').innerText()) === 'Hỗn loạn'),
  'nấc mới hiện sang máy khách');

await A.bringToFront();
await until(async () => !(await A.locator('#lobby-start').isDisabled()));
await A.locator('#lobby-start').click();

for (const p of [A, B]) {
  await p.bringToFront();
  await until(async () => p.evaluate(() => !!window.__monopoly?.controller?.state), 60000);
}
await playRollOff([A, B]);
await A.bringToFront();
ok(await until(async () => A.evaluate(() => !!window.__monopoly.controller.state.order)),
  'ván hai máy đã lắc giành quyền xong');

const level = await B.evaluate(() => window.__monopoly.controller.state.settings.events);
ok(level === 'hon-loan', 'nấc luật đi vào ván ở cả hai máy', level);
ok(await B.evaluate(() => !document.getElementById('fate-meter').hidden),
  'thanh Thời Cuộc hiện trên máy ngồi xem');

/* ==================================================== 2 · đấu giá kín hai máy */

console.log('\n▸ 2. Ép nổ thẻ "Đại hạ giá" — đấu giá kín hai máy');

/** Máy nào đang cầm lái ván. */
async function driverOf() {
  for (const [p, tag] of [[A, 'A'], [B, 'B']]) {
    if (await p.evaluate(() => window.__monopoly.controller.isDriver())) return { page: p, tag };
  }
  return null;
}
const drv = await driverOf();
ok(!!drv, 'tìm được máy đang cầm lái', drv?.tag);
const other = drv.page === A ? B : A;

// Nạp sẵn chồng bài đúng một thẻ, mở khoá bằng số vòng, rồi kết thúc lượt
await drv.page.bringToFront();
const tile = await drv.page.evaluate(() => {
  const c = window.__monopoly.controller;
  const st = c.state;
  st.eventPiles = { 1: [], 2: ['dai-ha-gia'] };
  st.eventsFired = 5;      // đã qua Kỳ 1 → bộ thẻ Kỳ 2 mở
  st.laps = 99;            // mở khoá không cần bán hết đất
  st.pressure = 999;
  c.guard(() => c.endTurn());
  return true;
});
ok(tile, 'đã ép thanh áp lực đầy ở máy cầm lái');

ok(await until(() => drv.page.locator('.event-card').isVisible()), 'thẻ hiện ở máy cầm lái');
await other.bringToFront();
ok(await until(() => other.locator('.event-card').isVisible()), 'thẻ hiện luôn ở máy ngồi xem');

await drv.page.bringToFront();
await drv.page.locator('.scrim.show button.btn').first().click();

// Cả hai máy phải nhận được hộp ghi giá
ok(await until(() => drv.page.locator('.bid-box input').isVisible(), 20000),
  'máy cầm lái nhận hộp ghi giá');
await other.bringToFront();
ok(await until(() => other.locator('.bid-box input').isVisible(), 20000),
  'máy bên kia cũng nhận hộp ghi giá');

// Bên kia trả thấp, máy cầm lái trả cao → máy cầm lái phải thắng
await other.locator('.bid-box input').fill('40');
await other.locator('.scrim.show button.btn', { hasText: 'Chốt giá' }).click();
await drv.page.bringToFront();
await drv.page.locator('.bid-box input').fill('300');
await drv.page.locator('.scrim.show button.btn', { hasText: 'Chốt giá' }).click();

const winner = await until(async () => drv.page.evaluate(() => {
  const c = window.__monopoly.controller;
  const seat = c.net.mySeat;
  return c.state.propertiesOf(seat).length > 0;
}), 25000);
ok(winner, 'người trả cao hơn lấy được lô đất');

const money = await drv.page.evaluate(() => {
  const c = window.__monopoly.controller;
  return c.state.players[c.net.mySeat].money;
});
ok(money === 1200, 'tiền trả đúng bằng giá đã ghi (1500 − 300)', String(money));

// Ảnh chụp phải sang tới máy bên kia, không để hai bàn cờ lệch nhau
await other.bringToFront();
const mirrored = await until(async () => {
  const [mine, theirs] = await Promise.all([
    drv.page.evaluate(() => JSON.stringify([...window.__monopoly.controller.state.owner])),
    other.evaluate(() => JSON.stringify([...window.__monopoly.controller.state.owner])),
  ]);
  return mine === theirs && mine !== '[]';
}, 20000);
ok(mirrored, 'sổ chủ đất khớp nhau trên cả hai máy');

const fired = await other.evaluate(() => window.__monopoly.controller.state.eventsFired);
ok(fired === 6, 'máy bên kia cũng ghi nhận sự kiện đã nổ', String(fired));

// Ván phải chạy tiếp bình thường: lượt sang người kế
ok(await until(async () => {
  const turnA = await A.evaluate(() => window.__monopoly.controller.state.turn);
  const turnB = await B.evaluate(() => window.__monopoly.controller.state.turn);
  return turnA === turnB;
}, 20000), 'sau sự kiện, hai máy vẫn cùng một lượt');

console.log(errors.length ? `\nLỖI TRANG:\n${errors.join('\n')}` : '\nKhông có lỗi trang.');
await browser.close();
if (fails.length || errors.length) {
  console.log(`\nHỎNG: ${fails.join(', ')}`);
  process.exit(1);
}
console.log('\n✓ Tất cả kiểm tra đều đạt');
